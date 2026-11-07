"""Elasticsearch-backed product catalogue search (bulk-friendly)."""

from __future__ import annotations

import logging
import re
from decimal import Decimal

from django.conf import settings
from django.db.models import Case, DecimalField, IntegerField, OuterRef, Q, Subquery, Value, When
from django.db.models.functions import Coalesce
from rest_framework.exceptions import APIException

from inventory.models import Product, ProductBarcode, StockLevel, default_branch

logger = logging.getLogger(__name__)

INDEX = 'tijori_products'
MAX_RESULTS = 200
_WILDCARD_META = re.compile(r'([\\*?])')


class SearchUnavailable(APIException):
    status_code = 503
    default_detail = 'Product search is temporarily unavailable.'
    default_code = 'search_unavailable'


def es_enabled() -> bool:
    return bool(getattr(settings, 'ELASTICSEARCH_URL', '') or '')


def index_name() -> str:
    return getattr(settings, 'ELASTICSEARCH_INDEX', INDEX) or INDEX


def _elasticsearch():
    try:
        from elasticsearch import Elasticsearch, NotFoundError
        from elasticsearch.helpers import bulk
    except ImportError as exc:
        raise SearchUnavailable('Elasticsearch client is not installed.') from exc
    return Elasticsearch, NotFoundError, bulk


def get_client():
    url = getattr(settings, 'ELASTICSEARCH_URL', '') or ''
    if not url:
        raise SearchUnavailable('Elasticsearch is not configured.')
    Elasticsearch, _, _ = _elasticsearch()
    return Elasticsearch(url, request_timeout=5)


def _doc(product: Product, extra_barcodes: list[str] | None = None) -> dict:
    extras = extra_barcodes
    if extras is None:
        extras = list(product.extra_barcodes.values_list('barcode', flat=True))
    category = product.category.name if product.category_id else ''
    return {
        'id': product.pk,
        'name': product.name,
        'barcode': product.barcode,
        'extra_barcodes': extras,
        'brand': product.brand or '',
        'category': category,
        'active': product.active,
    }


def ensure_index(client=None) -> None:
    client = client or get_client()
    name = index_name()
    if client.indices.exists(index=name):
        return
    client.indices.create(
        index=name,
        settings={
            'number_of_shards': 1,
            'number_of_replicas': 0,
            'analysis': {
                'analyzer': {
                    'product_text': {
                        'type': 'custom',
                        'tokenizer': 'standard',
                        'filter': ['lowercase', 'asciifolding'],
                    },
                },
            },
        },
        mappings={
            'properties': {
                'id': {'type': 'integer'},
                'name': {
                    'type': 'text',
                    'analyzer': 'product_text',
                    'fields': {'keyword': {'type': 'keyword'}},
                },
                'barcode': {'type': 'keyword'},
                'extra_barcodes': {'type': 'keyword'},
                'brand': {
                    'type': 'text',
                    'analyzer': 'product_text',
                    'fields': {'keyword': {'type': 'keyword'}},
                },
                'category': {'type': 'keyword'},
                'active': {'type': 'boolean'},
            },
        },
    )


def index_product(product: Product) -> None:
    if not es_enabled():
        return
    try:
        client = get_client()
        ensure_index(client)
        client.index(index=index_name(), id=str(product.pk), document=_doc(product), refresh=True)
    except Exception:
        logger.exception('Failed to index product %s', product.pk)


def delete_product(product_id: int) -> None:
    if not es_enabled():
        return
    _, NotFoundError, _ = _elasticsearch()
    try:
        client = get_client()
        client.delete(index=index_name(), id=str(product_id), refresh=True)
    except NotFoundError:
        pass
    except Exception:
        logger.exception('Failed to remove product %s from search index', product_id)


def reindex_all(*, recreate: bool = False) -> int:
    _, _, bulk = _elasticsearch()
    client = get_client()
    name = index_name()
    if recreate and client.indices.exists(index=name):
        client.indices.delete(index=name)
    ensure_index(client)
    extras = {}
    for row in ProductBarcode.objects.values_list('product_id', 'barcode'):
        extras.setdefault(row[0], []).append(row[1])

    def actions():
        for product in Product.objects.select_related('category').iterator(chunk_size=500):
            yield {
                '_op_type': 'index',
                '_index': name,
                '_id': str(product.pk),
                '_source': _doc(product, extras.get(product.pk, [])),
            }

    success, errors = bulk(client, actions(), raise_on_error=False, refresh=True)
    if errors:
        logger.error('Product reindex completed with %s errors', len(errors))
    return success


def _contains_pattern(value: str) -> str:
    return f'*{_WILDCARD_META.sub(r"\\\1", value)}*'


def database_search_ids(query: str, *, include_inactive: bool = False, limit: int = MAX_RESULTS) -> list[int]:
    """Ranked product ids straight from the database, for installs without Elasticsearch (single-shop PCs).

    Same priorities as the till: exact barcode, barcode prefix, name prefix, then anywhere in
    name, barcode, extra barcodes, brand or category."""
    q = (query or '').strip()
    if not q:
        return []
    products = Product.objects.all() if include_inactive else Product.objects.filter(active=True)
    extra = ProductBarcode.objects.filter(barcode__icontains=q).values('product_id')
    matches = products.filter(
        Q(name__icontains=q) | Q(barcode__icontains=q) | Q(brand__icontains=q)
        | Q(category__name__icontains=q) | Q(pk__in=extra),
    )
    exact_extra = ProductBarcode.objects.filter(barcode__iexact=q).values('product_id')
    ranked = matches.annotate(rank=Case(
        When(Q(barcode__iexact=q) | Q(pk__in=exact_extra), then=Value(0)),
        When(barcode__istartswith=q, then=Value(1)),
        When(name__istartswith=q, then=Value(2)),
        When(name__icontains=q, then=Value(3)),
        default=Value(4),
        output_field=IntegerField(),
    )).order_by('rank', 'name', 'pk')
    return list(ranked.values_list('pk', flat=True)[:min(max(limit, 1), MAX_RESULTS)])


def search_product_ids(query: str, *, include_inactive: bool = False, limit: int = MAX_RESULTS) -> list[int]:
    """Ranked product ids. Elasticsearch when configured, otherwise (or if it fails) the database."""
    q = (query or '').strip()
    if not q:
        return []
    if not es_enabled():
        return database_search_ids(q, include_inactive=include_inactive, limit=limit)
    try:
        return _elasticsearch_ids(q, include_inactive=include_inactive, limit=limit)
    except SearchUnavailable:
        # A till mid-sale needs an answer; the database is slower to rank but always there.
        logger.warning('Elasticsearch unavailable; product search fell back to the database')
        return database_search_ids(q, include_inactive=include_inactive, limit=limit)


def _elasticsearch_ids(q: str, *, include_inactive: bool, limit: int) -> list[int]:
    try:
        client = get_client()
        ensure_index(client)
    except SearchUnavailable:
        raise
    except Exception as exc:
        raise SearchUnavailable() from exc
    must_not = [] if include_inactive else [{'term': {'active': False}}]
    contains = _contains_pattern(q)
    # Shop tills expect substring search (like the old client filter), not only whole-token matches.
    should = [
        {'term': {'barcode': {'value': q, 'boost': 30}}},
        {'prefix': {'barcode': {'value': q, 'boost': 18}}},
        {'wildcard': {'barcode': {'value': contains, 'case_insensitive': True, 'boost': 12}}},
        {'term': {'extra_barcodes': {'value': q, 'boost': 24}}},
        {'wildcard': {'extra_barcodes': {'value': contains, 'case_insensitive': True, 'boost': 10}}},
        {'wildcard': {'name.keyword': {'value': contains, 'case_insensitive': True, 'boost': 16}}},
        {'wildcard': {'brand.keyword': {'value': contains, 'case_insensitive': True, 'boost': 8}}},
        {'wildcard': {'category': {'value': contains, 'case_insensitive': True, 'boost': 4}}},
        {'match_bool_prefix': {'name': {'query': q, 'boost': 10}}},
        {
            'multi_match': {
                'query': q,
                'fields': ['name^6', 'brand^2'],
                'type': 'best_fields',
                'fuzziness': 'AUTO' if len(q) >= 3 else 0,
                'prefix_length': 1,
                'boost': 5,
            },
        },
    ]
    body = {
        'bool': {
            'must_not': must_not,
            'should': should,
            'minimum_should_match': 1,
        },
    }
    try:
        result = client.search(
            index=index_name(),
            size=min(max(limit, 1), MAX_RESULTS),
            query=body,
        )
    except Exception as exc:
        logger.exception('Elasticsearch query failed')
        raise SearchUnavailable() from exc
    return [int(hit['_id']) for hit in result['hits']['hits']]


def products_for_ids(ids: list[int]):
    """Preserve ES ranking while attaching current stock."""
    if not ids:
        return []
    level = StockLevel.objects.filter(product=OuterRef('pk'), branch=default_branch()).values('quantity')[:1]
    queryset = Product.objects.select_related('category', 'supplier').annotate(
        stock=Coalesce(
            Subquery(level),
            Value(Decimal(0)),
            output_field=DecimalField(max_digits=12, decimal_places=3),
        ),
    ).filter(pk__in=ids)
    by_id = {product.pk: product for product in queryset}
    return [by_id[pk] for pk in ids if pk in by_id]
