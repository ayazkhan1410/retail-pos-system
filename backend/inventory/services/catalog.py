from decimal import Decimal

from django.db.models import DecimalField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce

from inventory.models import Product, StockLevel, default_branch


def products_with_stock():
    """Catalogue queryset with the current branch stock annotated."""
    level = StockLevel.objects.filter(product=OuterRef('pk'), branch=default_branch()).values('quantity')[:1]
    return Product.objects.select_related('category', 'supplier').annotate(
        stock=Coalesce(
            Subquery(level),
            Value(Decimal(0)),
            output_field=DecimalField(max_digits=12, decimal_places=3),
        ),
    ).order_by('name')
