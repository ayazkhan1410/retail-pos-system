from decimal import Decimal

from rest_framework import serializers

from inventory.models import Product
from customers.models import Customer
from sales.models import Payment, Sale, SaleLine, SaleReturn, Shift, Terminal


class TerminalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Terminal
        fields = ('id', 'code', 'name')


class ShiftSerializer(serializers.ModelSerializer):
    terminal_name = serializers.CharField(source='terminal.name', read_only=True)
    opened_by_name = serializers.CharField(source='opened_by.full_name', read_only=True)
    sales_total = serializers.SerializerMethodField()
    sales_count = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = (
            'id', 'terminal', 'terminal_name', 'opened_by_name', 'opened_at', 'closed_at',
            'opening_cash', 'expected_cash', 'counted_cash', 'sales_total', 'sales_count',
        )

    def get_sales_total(self, shift):
        return str(sum((sale.total for sale in shift.sales.all()), Decimal(0)))

    def get_sales_count(self, shift):
        return len(shift.sales.all())


class SaleLineInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal('0.001'))
    # Only honoured with offline=true: what the till charged from its cached prices.
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal(0), required=False)


class PaymentInputSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True)


class SaleInputSerializer(serializers.Serializer):
    client_uuid = serializers.UUIDField()
    terminal = serializers.PrimaryKeyRelatedField(queryset=Terminal.objects.filter(active=True))
    discount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal(0), default=Decimal(0))
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all(), required=False, allow_null=True)
    offline = serializers.BooleanField(default=False)
    sold_at = serializers.DateTimeField(required=False)
    lines = SaleLineInputSerializer(many=True, allow_empty=False)
    payments = PaymentInputSerializer(many=True)


class SaleLineSerializer(serializers.ModelSerializer):
    returned_quantity = serializers.SerializerMethodField()

    class Meta:
        model = SaleLine
        fields = (
            'id', 'name', 'barcode', 'quantity', 'unit_price', 'discount', 'tax_rate', 'tax_amount',
            'line_total', 'returned_quantity',
        )

    def get_returned_quantity(self, line):
        return str(sum((item.quantity for item in line.return_lines.all()), Decimal(0)))


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ('method', 'amount', 'reference')


class SaleSerializer(serializers.ModelSerializer):
    terminal_name = serializers.CharField(source='terminal.name')
    cashier_name = serializers.CharField(source='cashier.full_name')
    customer_name = serializers.CharField(source='customer.name', default='')
    returned_total = serializers.SerializerMethodField()
    lines = SaleLineSerializer(many=True)
    payments = PaymentSerializer(many=True)

    class Meta:
        model = Sale
        fields = (
            'id', 'invoice_no', 'terminal', 'terminal_name', 'cashier_name', 'customer', 'customer_name',
            'is_offline', 'subtotal', 'discount', 'tax', 'total', 'returned_total', 'change_due',
            'created_at', 'lines', 'payments',
        )

    def get_returned_total(self, sale):
        return str(sum((item.total for item in sale.returns.all()), Decimal(0)))


class ReturnLineInputSerializer(serializers.Serializer):
    sale_line = serializers.PrimaryKeyRelatedField(
        queryset=SaleLine.objects.select_related('product'), required=False, allow_null=True,
    )
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(active=True), required=False, allow_null=True,
    )
    unit_price = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=Decimal(0), required=False, allow_null=True,
    )
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal('0.001'))
    restock = serializers.BooleanField(default=True)

    def validate(self, attrs):
        if not attrs.get('sale_line') and not attrs.get('product'):
            raise serializers.ValidationError('Provide sale_line or product.')
        return attrs


class ReturnInputSerializer(serializers.Serializer):
    client_uuid = serializers.UUIDField()
    sale = serializers.PrimaryKeyRelatedField(queryset=Sale.objects.all(), required=False, allow_null=True)
    terminal = serializers.PrimaryKeyRelatedField(queryset=Terminal.objects.filter(active=True), required=False)
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)
    lines = ReturnLineInputSerializer(many=True, allow_empty=False)


class ReturnSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleReturn
        fields = ('id', 'number', 'sale', 'method', 'reason', 'total', 'tax', 'created_at')
