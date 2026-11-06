from decimal import Decimal

from django.db.models import DecimalField, OuterRef, Subquery, Value
import csv
import io

from django.db import IntegrityError, transaction
from django.db.models.functions import Coalesce
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response

from audit.models import log_event
from auth.permissions import requires
from inventory.models import Category, Product, StockLevel, default_branch
from inventory.serializers import AdjustStockInput, BranchSerializer, ProductSerializer
from inventory.services import set_stock, write_off_expired


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


class AdjustStockView(APIView):
    permission_classes = [requires(write='stock.adjust')]

    def post(self, request, pk):
        data = AdjustStockInput(data=request.data)
        data.is_valid(raise_exception=True)
        product = generics.get_object_or_404(Product, pk=pk)
        delta = set_stock(product, default_branch(), data.validated_data['counted'], data.validated_data['reason'], request.user)
        log_event(request.user, 'stock_adjusted', product.name, {'reason': data.validated_data['reason'], 'difference': str(delta)})
        return Response(ProductSerializer(products_with_stock().get(pk=pk), context={'request': request}).data)


class WriteOffExpiredView(APIView):
    permission_classes = [requires(write='stock.adjust')]

    def post(self, request, pk):
        product = generics.get_object_or_404(Product, pk=pk)
        quantity = write_off_expired(product, default_branch(), request.user)
        log_event(request.user, 'stock_adjusted', product.name, {'reason': 'expired', 'difference': str(-quantity)})
        return Response(ProductSerializer(products_with_stock().get(pk=pk), context={'request': request}).data)


IMPORT_LIMIT = 20000


class ImportProductsView(APIView):
    """Loads a catalogue from CSV, one product at a time, so one bad row doesn't lose the good ones."""

    permission_classes = [requires(write='products.edit')]

    def post(self, request):
        upload = request.FILES.get('file')
        if not upload:
            return Response({'detail': 'Choose a CSV file.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            text = upload.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            return Response({'detail': 'The file must be saved as UTF-8 CSV.'}, status=status.HTTP_400_BAD_REQUEST)
        rows = list(csv.DictReader(io.StringIO(text)))
        if len(rows) > IMPORT_LIMIT:
            return Response({'detail': f'Import at most {IMPORT_LIMIT} rows at a time.'}, status=status.HTTP_400_BAD_REQUEST)

        created, errors = 0, []
        for number, row in enumerate(rows, start=2):
            row = {(key or '').strip().lower(): (value or '').strip() for key, value in row.items()}
            category = row.get('category', '').upper()
            if category:
                Category.objects.get_or_create(name=category)
            payload = {key: value for key, value in row.items() if value != ''}
            payload['category'] = category
            serializer = ProductSerializer(data=payload, context={'request': request})
            if not serializer.is_valid():
                field, messages = next(iter(serializer.errors.items()))
                errors.append({'row': number, 'error': f'{field}: {messages[0]}'})
                continue
            try:
                with transaction.atomic():
                    serializer.save()
                created += 1
            except IntegrityError:
                errors.append({'row': number, 'error': 'barcode: already exists'})
        return Response({'created': created, 'errors': errors[:100], 'error_count': len(errors)})
