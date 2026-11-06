"""Elasticsearch-backed product catalogue search (bulk-friendly)."""

from __future__ import annotations

import logging
from decimal import Decimal

from django.conf import settings
from django.db.models import DecimalField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce
from rest_framework.exceptions import APIException

from inventory.models import Product, ProductBarcode, StockLevel, default_branch

logger = logging.getLogger(__name__)

INDEX = 'tijori_products'
MAX_RESULTS = 50


class SearchUnavailable(APIException):
    status_code = 503
    default_detail = 'Product search is temporarily unavailable.'
    default_code = 'search_unavailable'


def es_enabled() -> bool:
    return bool(getattr(settings, 'ELASTICSEARCH_URL', '') or '')


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
    if client.indices.exists(index=INDEX):
        return
    client.indices.create(
        index=INDEX,
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
                'brand': {'type': 'text', 'analyzer': 'product_text'},
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
        client.index(index=INDEX, id=str(product.pk), document=_doc(product), refresh=True)
    except Exception:
        logger.exception('Failed to index product %s', product.pk)


def delete_product(product_id: int) -> None:
    if not es_enabled():
        return
    _, NotFoundError, _ = _elasticsearch()
    try:
        client = get_client()
        client.delete(index=INDEX, id=str(product_id), refresh=True)
    except NotFoundError:
        pass
    except Exception:
        logger.exception('Failed to remove product %s from search index', product_id)


def reindex_all() -> int:
    _, _, bulk = _elasticsearch()
    client = get_client()
    ensure_index(client)
    extras = {}
    for row in ProductBarcode.objects.values_list('product_id', 'barcode'):
        extras.setdefault(row[0], []).append(row[1])

    def actions():
        for product in Product.objects.select_related('category').iterator(chunk_size=500):
            yield {
                '_op_type': 'index',
                '_index': INDEX,
                '_id': str(product.pk),
                '_source': _doc(product, extras.get(product.pk, [])),
            }

    success, errors = bulk(client, actions(), raise_on_error=False, refresh=True)
    if errors:
        logger.error('Product reindex completed with %s errors', len(errors))
    return success


def search_product_ids(query: str, *, include_inactive: bool = False, limit: int = MAX_RESULTS) -> list[int]:
    """Ranked product primary keys from Elasticsearch. Raises SearchUnavailable if ES is down."""
    q = (query or '').strip()
    if not q:
        return []
    client = get_client()
    ensure_index(client)
    must_not = [] if include_inactive else [{'term': {'active': False}}]
    query = {
        'bool': {
            'must_not': must_not,
            'should': [
                {'term': {'barcode': {'value': q, 'boost': 20}}},
                {'term': {'extra_barcodes': {'value': q, 'boost': 18}}},
                {
                    'multi_match': {
                        'query': q,
                        'fields': ['name^4', 'brand^2', 'category'],
                        'type': 'best_fields',
                        'fuzziness': 'AUTO',
                        'prefix_length': 1,
                    },
                },
                {'match_phrase_prefix': {'name': {'query': q, 'boost': 3}}},
            ],
            'minimum_should_match': 1,
        },
    }
    try:
        result = client.search(index=INDEX, size=min(max(limit, 1), MAX_RESULTS), query=query)
    except Exception as exc:
        logger.exception('Elasticsearch query failed')
        raise SearchUnavailable() from exc
    return [int(hit['_id']) for hit in result['hits']['hits']]


def products_for_ids(ids: list[int]):
    """Preserve ES ranking while attaching current stock."""
    if not ids:
        return Product.objects.none()
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
