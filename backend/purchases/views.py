from decimal import Decimal

from django.db import transaction
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from auth.permissions import requires
from inventory.models import Product, default_branch
from purchases.models import GRN, GRNLine, PurchaseReturn, PurchaseReturnLine
from purchases.services import calculate, post_grn, post_purchase_return, void_grn
from suppliers.models import PaymentType, Supplier

MONEY = {'max_digits': 14, 'decimal_places': 2, 'min_value': Decimal(0)}
PERCENT = {'max_digits': 5, 'decimal_places': 2, 'min_value': Decimal(0), 'max_value': Decimal(100)}


class LineInput(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    cases = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal(0), default=Decimal(0))
    qty = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal(0))
    free = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal(0), default=Decimal(0))
    rate = serializers.DecimalField(**MONEY)
    disc = serializers.DecimalField(**MONEY, default=Decimal(0))
    disc_percent = serializers.DecimalField(**PERCENT, default=Decimal(0))
    freight = serializers.DecimalField(**MONEY, default=Decimal(0))
    retail = serializers.DecimalField(**MONEY, default=Decimal(0))
    expiry_date = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs['qty'] + attrs['free'] <= 0:
            raise serializers.ValidationError(f"{attrs['product'].name}: enter a quantity.")
        return attrs


class GRNInput(serializers.Serializer):
    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.all())
    date = serializers.DateField()
    po_no = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')
    payment_type = serializers.ChoiceField(choices=PaymentType.choices, default=PaymentType.CREDIT)
    disc_percent = serializers.DecimalField(**PERCENT, default=Decimal(0))
    flat_disc = serializers.DecimalField(**MONEY, default=Decimal(0))
    freight = serializers.DecimalField(**MONEY, default=Decimal(0))
    sales_tax_percent = serializers.DecimalField(**PERCENT, default=Decimal(0))
    expense = serializers.DecimalField(**MONEY, default=Decimal(0))
    disperse_discount = serializers.BooleanField(default=True)
    disperse_freight = serializers.BooleanField(default=False)
    disperse_tax = serializers.BooleanField(default=False)
    lines = LineInput(many=True)


class GRNLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name')
    barcode = serializers.CharField(source='product.barcode')

    class Meta:
        model = GRNLine
        exclude = ('grn',)


class GRNSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name')
    lines = GRNLineSerializer(many=True)

    class Meta:
        model = GRN
        exclude = ('branch', 'created_by', 'posted_by')


def _save_lines(grn, values):
    lines = values.pop('lines')
    result = calculate(values, lines)
    for field, value in values.items():
        setattr(grn, field, value)
    grn.subtotal = result['subtotal']
    grn.total = result['total']
    grn.save()
    grn.lines.all().delete()
    GRNLine.objects.bulk_create([
        GRNLine(grn=grn, line_total=computed['line_total'], unit_cost=computed['unit_cost'], margin_percent=computed['margin_percent'], **line)
        for line, computed in zip(lines, result['lines'], strict=True)
    ])
    return grn


class GRNPagination(PageNumberPagination):
    page_size = 50


class GRNListCreateView(APIView):
    permission_classes = [requires('purchases.view', 'purchases.edit')]

    def get(self, request):
        queryset = GRN.objects.select_related('supplier').prefetch_related('lines__product')
        supplier = request.query_params.get('supplier')
        if supplier and supplier.isdigit():
            queryset = queryset.filter(supplier_id=supplier)
        paginator = GRNPagination()
        page = paginator.paginate_queryset(queryset, request)
        return paginator.get_paginated_response(GRNSerializer(page, many=True).data)

    @transaction.atomic
    def post(self, request):
        data = GRNInput(data=request.data)
        data.is_valid(raise_exception=True)
        grn = _save_lines(GRN(branch=default_branch(), created_by=request.user), dict(data.validated_data))
        return Response(GRNSerializer(grn).data, status=status.HTTP_201_CREATED)


class GRNPreviewView(APIView):
    """The live totals on the GRN screen, using the same arithmetic as posting."""

    permission_classes = [requires(write='purchases.edit')]

    def post(self, request):
        data = GRNInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        return Response(calculate(values, values['lines']))


class GRNDetailView(APIView):
    permission_classes = [requires('purchases.view', 'purchases.edit')]

    def _draft(self, pk):
        grn = GRN.objects.select_for_update().filter(pk=pk).first()
        if not grn:
            raise ValidationError({'detail': 'GRN not found.'})
        if grn.status != GRN.Status.DRAFT:
            raise ValidationError({'detail': 'A posted GRN cannot be changed.'})
        return grn

    def get(self, request, pk):
        grn = GRN.objects.select_related('supplier').prefetch_related('lines__product').filter(pk=pk).first()
        if not grn:
            return Response({'detail': 'GRN not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(GRNSerializer(grn).data)

    @transaction.atomic
    def put(self, request, pk):
        data = GRNInput(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(GRNSerializer(_save_lines(self._draft(pk), dict(data.validated_data))).data)

    @transaction.atomic
    def delete(self, request, pk):
        self._draft(pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GRNPostView(APIView):
    permission_classes = [requires(write='purchases.edit')]

    def post(self, request, pk):
        return Response(GRNSerializer(post_grn(pk, request.user)).data)


class GRNVoidView(APIView):
    permission_classes = [requires(write='purchases.edit')]

    def post(self, request, pk):
        reason = str(request.data.get('reason', ''))[:255]
        return Response(GRNSerializer(void_grn(pk, request.user, reason=reason)).data)


class PurchaseReturnLineInput(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal('0.001'))
    rate = serializers.DecimalField(**MONEY)


class PurchaseReturnInput(serializers.Serializer):
    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.all())
    grn = serializers.PrimaryKeyRelatedField(
        queryset=GRN.objects.filter(status=GRN.Status.POSTED), required=False, allow_null=True,
    )
    date = serializers.DateField()
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    lines = PurchaseReturnLineInput(many=True, allow_empty=False)

    def validate(self, attrs):
        grn = attrs.get('grn')
        if grn is not None and grn.supplier_id != attrs['supplier'].pk:
            raise serializers.ValidationError({'grn': 'That GRN belongs to a different supplier.'})
        return attrs


class PurchaseReturnLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name')
    barcode = serializers.CharField(source='product.barcode')

    class Meta:
        model = PurchaseReturnLine
        exclude = ('purchase_return',)


class PurchaseReturnSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name')
    grn_number = serializers.CharField(source='grn.number', default='', allow_null=True)
    lines = PurchaseReturnLineSerializer(many=True)

    class Meta:
        model = PurchaseReturn
        exclude = ('branch', 'created_by', 'posted_by')


def _save_purchase_return(row, values):
    lines = values.pop('lines')
    for field, value in values.items():
        setattr(row, field, value)
    row.total = sum((line['quantity'] * line['rate'] for line in lines), Decimal(0))
    row.total = Decimal(row.total).quantize(Decimal('0.01'))
    row.save()
    row.lines.all().delete()
    PurchaseReturnLine.objects.bulk_create([
        PurchaseReturnLine(
            purchase_return=row,
            product=line['product'],
            quantity=line['quantity'],
            rate=line['rate'],
            line_total=(line['quantity'] * line['rate']).quantize(Decimal('0.01')),
        )
        for line in lines
    ])
    return row


class PurchaseReturnListCreateView(APIView):
    permission_classes = [requires('purchases.view', 'purchases.edit')]

    def get(self, request):
        queryset = PurchaseReturn.objects.select_related('supplier', 'grn').prefetch_related('lines__product')
        paginator = GRNPagination()
        page = paginator.paginate_queryset(queryset, request)
        return paginator.get_paginated_response(PurchaseReturnSerializer(page, many=True).data)

    @transaction.atomic
    def post(self, request):
        data = PurchaseReturnInput(data=request.data)
        data.is_valid(raise_exception=True)
        row = _save_purchase_return(
            PurchaseReturn(branch=default_branch(), created_by=request.user),
            dict(data.validated_data),
        )
        return Response(PurchaseReturnSerializer(row).data, status=status.HTTP_201_CREATED)


class PurchaseReturnDetailView(APIView):
    permission_classes = [requires('purchases.view', 'purchases.edit')]

    def _draft(self, pk):
        row = PurchaseReturn.objects.select_for_update().filter(pk=pk).first()
        if not row:
            raise ValidationError({'detail': 'Purchase return not found.'})
        if row.status != PurchaseReturn.Status.DRAFT:
            raise ValidationError({'detail': 'A posted purchase return cannot be changed.'})
        return row

    def get(self, request, pk):
        row = (
            PurchaseReturn.objects.select_related('supplier', 'grn')
            .prefetch_related('lines__product')
            .filter(pk=pk)
            .first()
        )
        if not row:
            return Response({'detail': 'Purchase return not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(PurchaseReturnSerializer(row).data)

    @transaction.atomic
    def put(self, request, pk):
        data = PurchaseReturnInput(data=request.data)
        data.is_valid(raise_exception=True)
        row = _save_purchase_return(self._draft(pk), dict(data.validated_data))
        return Response(PurchaseReturnSerializer(row).data)

    @transaction.atomic
    def delete(self, request, pk):
        self._draft(pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PurchaseReturnPostView(APIView):
    permission_classes = [requires(write='purchases.edit')]

    def post(self, request, pk):
        return Response(PurchaseReturnSerializer(post_purchase_return(pk, request.user)).data)
