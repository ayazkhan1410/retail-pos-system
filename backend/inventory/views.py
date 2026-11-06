from decimal import Decimal

from django.db.models import DecimalField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce
from rest_framework import generics, status
from rest_framework.response import Response

from audit.models import log_event
from auth.permissions import requires
from inventory.models import Category, Product, StockLevel, default_branch
from inventory.serializers import BranchSerializer, ProductSerializer


def products_with_stock():
    level = StockLevel.objects.filter(product=OuterRef('pk'), branch=default_branch()).values('quantity')[:1]
    return Product.objects.select_related('category', 'supplier').annotate(
        stock=Coalesce(
            Subquery(level),
            Value(Decimal(0)),
            output_field=DecimalField(max_digits=12, decimal_places=3),
        ),
    ).order_by('name')


class ProductListCreateView(generics.ListCreateAPIView):
    # shortcut: returns the whole catalogue so POS scans are instant, add paging past ~50k products.
    permission_classes = [requires(write='products.edit')]
    serializer_class = ProductSerializer
    pagination_class = None

    def get_queryset(self):
        queryset = products_with_stock()
        if self.request.query_params.get('include_inactive') != '1':
            queryset = queryset.filter(active=True)
        return queryset


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [requires(write='products.edit')]
    serializer_class = ProductSerializer

    def get_queryset(self):
        return products_with_stock()

    def destroy(self, request, *args, **kwargs):
        # Sales history points at products, so "delete" only hides them.
        product = self.get_object()
        Product.objects.filter(pk=product.pk).update(active=False)
        log_event(request.user, 'product_deactivated', product.name, {'barcode': product.barcode})
        return Response(status=status.HTTP_204_NO_CONTENT)


class CategoryListView(generics.ListAPIView):
    queryset = Category.objects.all()
    pagination_class = None

    def list(self, request, *args, **kwargs):
        return Response([category.name for category in self.get_queryset()])


class CurrentBranchView(generics.RetrieveUpdateAPIView):
    permission_classes = [requires(write='settings.store')]
    serializer_class = BranchSerializer

    def get_object(self):
        return default_branch()

    def perform_update(self, serializer):
        branch = serializer.save()
        log_event(self.request.user, 'store_updated', branch.name, {'fields': sorted(serializer.validated_data)})
