from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, F, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce, ExtractHour, TruncDate
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import AuditLog
from auth.permissions import requires
from inventory.models import Product, StockLevel, default_branch
from sales.models import Payment, Sale, SaleLine, SaleReturn, Shift, Terminal
from sales.serializers import (
    ReturnInputSerializer,
    ReturnSerializer,
    SaleInputSerializer,
    SaleSerializer,
    ShiftSerializer,
    TerminalSerializer,
)
from sales.services import close_shift, create_return, create_sale, open_shift


class SalePagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class SaleFilterInput(serializers.Serializer):
    search = serializers.CharField(required=False, allow_blank=True)
    terminal = serializers.IntegerField(required=False)
    to = serializers.DateField(required=False)

    def get_fields(self):
        # "from" is a Python keyword, so it can't be declared as a class attribute.
        return {**super().get_fields(), 'from': serializers.DateField(required=False)}


class TerminalListView(generics.ListAPIView):
    queryset = Terminal.objects.filter(active=True)
    serializer_class = TerminalSerializer
    pagination_class = None


class SaleListCreateView(APIView):
    permission_classes = [requires('sales.view', 'pos.sell')]

    def get(self, request):
        queryset = Sale.objects.select_related('terminal', 'cashier', 'customer').prefetch_related(
            'lines__return_lines', 'payments', 'returns',
        )
        filters = SaleFilterInput(data=request.query_params)
        filters.is_valid(raise_exception=True)
        params = filters.validated_data
        if params.get('search'):
            queryset = queryset.filter(invoice_no__icontains=params['search'])
        if params.get('terminal'):
            queryset = queryset.filter(terminal_id=params['terminal'])
        if params.get('from'):
            queryset = queryset.filter(created_at__date__gte=params['from'])
        if params.get('to'):
            queryset = queryset.filter(created_at__date__lte=params['to'])
        paginator = SalePagination()
        page = paginator.paginate_queryset(queryset, request)
        summary = queryset.aggregate(revenue=Coalesce(Sum('total'), Decimal(0)))
        response = paginator.get_paginated_response(SaleSerializer(page, many=True).data)
        response.data['revenue'] = summary['revenue']
        return response

    def post(self, request):
        serializer = SaleInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sale, created = create_sale(request.user, serializer.validated_data)
        return Response(
            SaleSerializer(sale).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ReturnCreateView(APIView):
    permission_classes = [requires(write='returns.create')]

    def post(self, request):
        data = ReturnInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        sale_return, created = create_return(request.user, data.validated_data)
        return Response(
            {'return': ReturnSerializer(sale_return).data, 'sale': SaleSerializer(sale_return.sale).data},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class CurrentShiftView(APIView):
    """The terminal's open shift. Opening float and totals help the cashier at close."""

    def get(self, request, terminal_id):
        shift = (
            Shift.objects.select_related('terminal', 'opened_by')
            .prefetch_related('sales')
            .filter(terminal_id=terminal_id, closed_at__isnull=True)
            .first()
        )
        return Response({'shift': ShiftSerializer(shift).data if shift else None})


class OpenShiftInput(serializers.Serializer):
    terminal = serializers.PrimaryKeyRelatedField(queryset=Terminal.objects.filter(active=True))
    opening_cash = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal(0))


class CloseShiftInput(serializers.Serializer):
    counted_cash = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal(0))


class OpenShiftView(APIView):
    permission_classes = [requires(write='pos.sell')]

    def post(self, request):
        data = OpenShiftInput(data=request.data)
        data.is_valid(raise_exception=True)
        shift = open_shift(request.user, data.validated_data['terminal'], data.validated_data['opening_cash'])
        return Response(ShiftSerializer(shift).data, status=status.HTTP_201_CREATED)


class CloseShiftView(APIView):
    permission_classes = [requires(write='pos.sell')]

    def post(self, request, pk):
        data = CloseShiftInput(data=request.data)
        data.is_valid(raise_exception=True)
        shift = close_shift(request.user, pk, data.validated_data['counted_cash'])
        return Response(ShiftSerializer(shift).data)


class DashboardView(APIView):
    permission_classes = [requires('dashboard.view')]

    def get(self, request):
        today = timezone.localdate()
        week_start = today - timedelta(days=6)
        sales_today = Sale.objects.filter(created_at__date=today)
        totals = sales_today.aggregate(revenue=Coalesce(Sum('total'), Decimal(0)), count=Count('id'))
        yesterday_date = today - timedelta(days=1)
        yesterday = Sale.objects.filter(created_at__date=yesterday_date).aggregate(
            revenue=Coalesce(Sum('total'), Decimal(0)),
        )['revenue'] - self._returned(yesterday_date)

        return Response({
            'today_revenue': totals['revenue'] - self._returned(today),
            'today_count': totals['count'],
            'yesterday_revenue': yesterday,
            'open_counters': Shift.objects.filter(closed_at__isnull=True).count(),
            'total_counters': Terminal.objects.filter(active=True).count(),
            'stock': self._stock_counts(),
            'counters': list(Terminal.objects.filter(active=True).values_list('name', flat=True)),
            'sales_by_day': self._sales_by_day(week_start, today),
            'top_products': list(
                SaleLine.objects.filter(sale__created_at__date__gte=week_start)
                .values('name')
                .annotate(units=Sum('quantity'), revenue=Sum('line_total'))
                .order_by('-revenue')[:5]
            ),
            'payment_methods': list(
                Payment.objects.filter(sale__created_at__date=today)
                .values('method')
                .annotate(amount=Sum('amount'))
                .order_by('-amount')
            ),
            'peak_hours': list(
                sales_today.annotate(hour=ExtractHour('created_at'))
                .values('hour')
                .annotate(count=Count('id'))
                .order_by('hour')
            ),
            'recent_activity': [
                {
                    'id': entry.id,
                    'action': entry.action,
                    'target': entry.target,
                    'user': str(entry.user) if entry.user else '',
                    'created_at': entry.created_at,
                }
                for entry in AuditLog.objects.select_related('user')[:8]
            ],
            'recent_shifts': [
                {**ShiftSerializer(shift).data, 'difference': shift.counted_cash - shift.expected_cash}
                for shift in Shift.objects.filter(closed_at__isnull=False)
                .select_related('terminal', 'opened_by')
                .prefetch_related('sales')
                .order_by('-closed_at')[:5]
            ],
        })

    @staticmethod
    def _returned(day):
        return SaleReturn.objects.filter(created_at__date=day).aggregate(v=Coalesce(Sum('total'), Decimal(0)))['v']

    @staticmethod
    def _stock_counts():
        level = StockLevel.objects.filter(product=OuterRef('pk'), branch=default_branch()).values('quantity')[:1]
        return Product.objects.filter(active=True).annotate(
            on_hand=Coalesce(Subquery(level), Value(Decimal(0)), output_field=DecimalField(max_digits=12, decimal_places=3)),
        ).aggregate(
            out=Count('id', filter=Q(on_hand__lte=0)),
            low=Count('id', filter=Q(on_hand__gt=0, on_hand__lte=F('threshold'))),
            ok=Count('id', filter=Q(on_hand__gt=F('threshold'))),
        )

    @staticmethod
    def _sales_by_day(start, end):
        rows = (
            Sale.objects.filter(created_at__date__gte=start)
            .annotate(day=TruncDate('created_at'))
            .values('day', 'terminal__name')
            .annotate(revenue=Sum('total'))
        )
        by_day = {start + timedelta(days=n): {} for n in range((end - start).days + 1)}
        for row in rows:
            by_day[row['day']][row['terminal__name']] = row['revenue']
        return [{'day': day.strftime('%a'), **values} for day, values in by_day.items()]
