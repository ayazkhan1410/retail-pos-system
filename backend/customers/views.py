from decimal import Decimal

from django.db import transaction
from django.db.models import F, Q
from rest_framework import generics, serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import log_event
from auth.permissions import requires
from customers.models import Customer, CustomerLedgerEntry
from customers.services import post_customer_entry, profiles
from sales.models import Shift, Terminal


class CustomerPagination(PageNumberPagination):
    page_size = 40
    page_size_query_param = 'page_size'
    max_page_size = 200


class CustomerSerializer(serializers.ModelSerializer):
    opening_balance = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal(0), required=False, write_only=True)
    # Filled only on list/detail reads that go through profiles.annotated().
    last_visit = serializers.DateTimeField(read_only=True, default=None)
    visits = serializers.IntegerField(source='recent_visits', read_only=True, default=None)
    segments = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = (
            'id', 'name', 'phone', 'address', 'area', 'credit_limit', 'balance', 'active', 'created_at',
            'opening_balance', 'last_visit', 'visits', 'segments',
        )
        read_only_fields = ('balance', 'created_at')
        extra_kwargs = {'credit_limit': {'min_value': Decimal(0)}}

    def validate_phone(self, value):
        return value.strip() or None if value else None

    def validate_area(self, value):
        return ' '.join(value.split())

    def get_segments(self, customer):
        if not hasattr(customer, 'recent_visits'):
            return []
        return profiles.segments_of(customer)

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

    ORDERING = {
        'name': ('name',),
        'last_visit': (F('last_visit').desc(nulls_last=True), 'name'),
        '-last_visit': (F('last_visit').asc(nulls_first=True), 'name'),
        'balance': ('-balance', 'name'),
    }

    def get_queryset(self):
        params = CustomerFilterInput(data=self.request.query_params)
        params.is_valid(raise_exception=True)
        values = params.validated_data
        queryset = profiles.annotated(Customer.objects.filter(active=True))
        if values.get('search'):
            search = values['search']
            queryset = queryset.filter(Q(name__icontains=search) | Q(phone__icontains=search))
        if values.get('segment'):
            queryset = queryset.filter(profiles.segment_filter(values['segment']))
        if values.get('area'):
            queryset = queryset.filter(area__iexact=values['area'])
        return queryset.order_by(*self.ORDERING[values.get('ordering') or 'name'])


class CustomerFilterInput(serializers.Serializer):
    search = serializers.CharField(required=False, allow_blank=True, max_length=100)
    segment = serializers.ChoiceField(choices=profiles.SEGMENTS, required=False, allow_blank=True)
    area = serializers.CharField(required=False, allow_blank=True, max_length=100)
    ordering = serializers.ChoiceField(choices=list(CustomerListCreateView.ORDERING), required=False, allow_blank=True)


class CustomerDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [requires('customers.view', 'customers.edit')]
    serializer_class = CustomerSerializer

    def get_queryset(self):
        return profiles.annotated(Customer.objects.all())


class CustomerSummaryView(APIView):
    permission_classes = [requires('customers.view')]

    def get(self, request):
        return Response(profiles.summary())


class CustomerProfileView(APIView):
    permission_classes = [requires('customers.view')]

    def get(self, request, pk):
        return Response(profiles.profile(generics.get_object_or_404(Customer, pk=pk)))


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
