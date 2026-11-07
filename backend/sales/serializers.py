from decimal import Decimal

from rest_framework import serializers

from customers.models import Customer
from inventory.models import Product
from sales.models import HeldBill, Payment, Sale, SaleLine, SaleReturn, Shift, Terminal

HELD_LINE_LIMIT = 200
HELD_BILL_LIMIT = 40


class TerminalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Terminal
        fields = ('id', 'code', 'name', 'active')
        extra_kwargs = {'code': {'max_length': 6}}

    def validate_code(self, value):
        value = value.strip().upper()
        if not value.isalnum():
            raise serializers.ValidationError('Use letters and numbers only, like C3.')
        if self.instance and self.instance.code != value and self.instance.last_invoice_seq:
            # Invoice numbers embed the code; changing it would break the gap-free sequence.
            raise serializers.ValidationError('This register already has invoices, so its code cannot change.')
        clash = Terminal.objects.filter(code=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError('Another register already uses this code.')
        return value

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Give the register a name.')
        return value


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
    customer_phone = serializers.CharField(source='customer.phone', default='')
    customer_balance = serializers.DecimalField(source='customer.balance', max_digits=14, decimal_places=2, default=None)
    returned_total = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    lines = SaleLineSerializer(many=True)
    payments = PaymentSerializer(many=True)

    class Meta:
        model = Sale
        fields = (
            'id', 'invoice_no', 'terminal', 'terminal_name', 'cashier_name', 'customer', 'customer_name',
            'customer_phone', 'customer_balance', 'status', 'is_offline', 'subtotal', 'discount', 'tax', 'total', 'returned_total', 'change_due',
            'created_at', 'lines', 'payments',
        )

    def get_returned_total(self, sale):
        return str(sum((item.total for item in sale.returns.all()), Decimal(0)))

    def get_status(self, sale):
        """returned | part_returned | khata | offline | paid — the badge on the Orders table."""
        returned = sum((item.total for item in sale.returns.all()), Decimal(0))
        if returned and returned >= sale.total:
            return 'returned'
        if returned:
            return 'part_returned'
        if any(payment.method == Payment.Method.CREDIT for payment in sale.payments.all()):
            return 'khata'
        if sale.is_offline:
            return 'offline'
        return 'paid'


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


class HeldLineInputSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal('0.001'))
    name = serializers.CharField(max_length=255)
    barcode = serializers.CharField(max_length=64, allow_blank=True, required=False, default='')
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal(0))


class HeldBillInputSerializer(serializers.Serializer):
    terminal = serializers.PrimaryKeyRelatedField(queryset=Terminal.objects.filter(active=True))
    label = serializers.CharField(max_length=80, required=False, allow_blank=True, default='')
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.filter(active=True), required=False, allow_null=True,
    )
    discount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal(0), default=Decimal(0))
    lines = HeldLineInputSerializer(many=True, allow_empty=False)

    def validate_lines(self, lines):
        if len(lines) > HELD_LINE_LIMIT:
            raise serializers.ValidationError(f'At most {HELD_LINE_LIMIT} lines on a held bill.')
        product_ids = [line['product_id'] for line in lines]
        if len(set(product_ids)) != len(product_ids):
            raise serializers.ValidationError('Duplicate products on a held bill.')
        existing = set(Product.objects.filter(pk__in=product_ids).values_list('pk', flat=True))
        missing = [pk for pk in product_ids if pk not in existing]
        if missing:
            raise serializers.ValidationError(f'Unknown product id: {missing[0]}')
        return lines


class HeldBillSerializer(serializers.ModelSerializer):
    held_by_name = serializers.CharField(source='held_by.full_name', read_only=True)
    terminal_name = serializers.CharField(source='terminal.name', read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True, default='')
    item_count = serializers.IntegerField(read_only=True)
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = HeldBill
        fields = (
            'id', 'terminal', 'terminal_name', 'held_by', 'held_by_name', 'label',
            'customer', 'customer_name', 'discount', 'lines', 'item_count', 'subtotal',
            'created_at', 'updated_at',
        )
        read_only_fields = ('held_by',)

    def get_subtotal(self, bill):
        return str(bill.subtotal)
