from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from rest_framework import generics, serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import log_event
from auth.permissions import requires
from customers.models import Customer, CustomerLedgerEntry
from customers.services import post_customer_entry
from sales.models import Shift, Terminal


class CustomerPagination(PageNumberPagination):
    page_size = 40
    page_size_query_param = 'page_size'
    max_page_size = 200


class CustomerSerializer(serializers.ModelSerializer):
    opening_balance = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal(0), required=False, write_only=True)

    class Meta:
        model = Customer
        fields = ('id', 'name', 'phone', 'address', 'credit_limit', 'balance', 'active', 'created_at', 'opening_balance')
        read_only_fields = ('balance', 'created_at')
        extra_kwargs = {'credit_limit': {'min_value': Decimal(0)}}

    def validate_phone(self, value):
        return value.strip() or None if value else None

    @transaction.atomic
    def create(self, validated_data):
        opening = validated_data.pop('opening_balance', None)
        customer = Customer.objects.create(**validated_data)
        if opening:
            post_customer_entry(customer.pk, opening, CustomerLedgerEntry.Kind.OPENING, self.context['request'].user)
            customer.refresh_from_db()
        return customer

    def update(self, instance, validated_data):
        validated_data.pop('opening_balance', None)
        return super().update(instance, validated_data)


class LedgerSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)

    class Meta:
        model = CustomerLedgerEntry
        fields = ('id', 'delta', 'kind', 'method', 'reference', 'user_name', 'created_at')


class CustomerListCreateView(generics.ListCreateAPIView):
    permission_classes = [requires('customers.view', 'customers.edit')]
    serializer_class = CustomerSerializer
    pagination_class = CustomerPagination

    def get_queryset(self):
        queryset = Customer.objects.filter(active=True).order_by('name')
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(phone__icontains=search))
        return queryset


class CustomerDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [requires('customers.view', 'customers.edit')]
    serializer_class = CustomerSerializer
    queryset = Customer.objects.all()


class CollectInput(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    method = serializers.ChoiceField(choices=['cash', 'jazzcash', 'easypaisa', 'card', 'bank'])
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    terminal = serializers.PrimaryKeyRelatedField(queryset=Terminal.objects.all(), required=False, allow_null=True)


class CustomerLedgerView(APIView):
    permission_classes = [requires('customers.view', 'customers.collect')]

    def get(self, request, pk):
        entries = CustomerLedgerEntry.objects.filter(customer_id=pk).select_related('user')[:200]
        return Response(LedgerSerializer(entries, many=True).data)

    def post(self, request, pk):
        """Records money received against the customer's khata."""
        data = CollectInput(data=request.data)
        data.is_valid(raise_exception=True)
        customer = generics.get_object_or_404(Customer, pk=pk)
        values = data.validated_data
        shift = None
        if values['method'] == 'cash' and values.get('terminal'):
            shift = Shift.objects.filter(terminal=values['terminal'], closed_at__isnull=True).first()
        post_customer_entry(
            customer.pk, -values['amount'], CustomerLedgerEntry.Kind.PAYMENT, request.user,
            method=values['method'], reference=values['reference'], shift=shift,
        )
        log_event(request.user, 'customer_paid', customer.name, {'amount': str(values['amount']), 'method': values['method']})
        customer.refresh_from_db()
        return Response(CustomerSerializer(customer).data, status=status.HTTP_201_CREATED)
