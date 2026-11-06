from decimal import Decimal

from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from audit.models import log_event
from inventory.models import Branch, Category, Product, StockMovement, default_branch
from inventory.services import set_stock

AUDITED_FIELDS = ('price', 'cost', 'sales_tax_percent', 'disc_percent', 'disc_amount', 'active')


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ('id', 'code', 'name', 'address', 'phone', 'ntn')
        read_only_fields = ('id', 'code')


class ProductSerializer(serializers.ModelSerializer):
    category = serializers.SlugRelatedField(slug_field='name', queryset=Category.objects.all())
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, default='')
    stock = serializers.DecimalField(max_digits=12, decimal_places=3, required=False, min_value=Decimal(0))
    sale_price = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Product
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def validate_barcode(self, value):
        return value.strip()

    def validate(self, attrs):
        start = attrs.get('disc_start', getattr(self.instance, 'disc_start', None))
        end = attrs.get('disc_end', getattr(self.instance, 'disc_end', None))
        if start and end and end < start:
            raise serializers.ValidationError({'disc_end': 'Discount end date is before the start date.'})
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request and not request.user.can('products.view_cost'):
            data.pop('cost', None)
        return data

    @transaction.atomic
    def create(self, validated_data):
        stock = validated_data.pop('stock', Decimal(0))
        product = Product.objects.create(**validated_data)
        user = self.context['request'].user
        set_stock(product, default_branch(), stock, StockMovement.Reason.OPENING, user)
        product.stock = stock
        log_event(user, 'product_created', product.name, {'barcode': product.barcode, 'stock': str(stock)})
        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        user = self.context['request'].user
        stock = validated_data.pop('stock', None)
        changes = {
            field: [str(getattr(instance, field)), str(validated_data[field])]
            for field in AUDITED_FIELDS
            if field in validated_data and getattr(instance, field) != validated_data[field]
        }
        if stock is not None and stock != instance.stock:
            if not user.can('stock.adjust'):
                raise PermissionDenied('You are not allowed to change stock.')
            set_stock(instance, default_branch(), stock, StockMovement.Reason.ADJUSTMENT, user)
            changes['stock'] = [str(instance.stock), str(stock)]
            instance.stock = stock
        product = super().update(instance, validated_data)
        if changes:
            log_event(user, 'product_updated', product.name, changes)
        return product
