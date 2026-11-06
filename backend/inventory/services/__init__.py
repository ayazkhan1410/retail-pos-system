"""Inventory domain services — stock movements, search, and catalogue helpers."""

from inventory.services.catalog import products_with_stock
from inventory.services.search import (
    SearchUnavailable,
    delete_product,
    es_enabled,
    index_product,
    products_for_ids,
    reindex_all,
    search_product_ids,
)
from inventory.services.stock import add_batch, move_stock, set_stock, write_off_expired

__all__ = [
    'SearchUnavailable',
    'add_batch',
    'delete_product',
    'es_enabled',
    'index_product',
    'move_stock',
    'products_for_ids',
    'products_with_stock',
    'reindex_all',
    'search_product_ids',
    'set_stock',
    'write_off_expired',
]
