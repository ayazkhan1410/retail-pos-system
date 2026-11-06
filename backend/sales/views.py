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
from customers.models import Customer
from inventory.models import Product, StockLevel, default_branch
from sales.models import HeldBill, Payment, Sale, SaleLine, SaleReturn, Shift, Terminal
from sales.serializers import (
    HELD_BILL_LIMIT,
    HeldBillInputSerializer,
    HeldBillSerializer,
    ReturnInputSerializer,
    ReturnSerializer,
    SaleInputSerializer,
    SaleSerializer,
    ShiftSerializer,
    TerminalSerializer,
)
from sales.services import build_z_report, close_shift, create_return, create_sale, open_shift


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
        sale_payload = SaleSerializer(sale_return.sale).data if sale_return.sale_id else None
        return Response(
            {'return': ReturnSerializer(sale_return).data, 'sale': sale_payload},
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


class ShiftZReportView(APIView):
    permission_classes = [requires(read='pos.sell')]

    def get(self, request, pk):
        shift = generics.get_object_or_404(
            Shift.objects.select_related('terminal', 'opened_by'),
            pk=pk,
        )
        return Response(build_z_report(shift))


class HeldBillListCreateView(APIView):
    permission_classes = [requires(write='pos.sell')]

    def get(self, request):
        terminal_id = request.query_params.get('terminal')
        queryset = HeldBill.objects.select_related('terminal', 'held_by', 'customer')
        if terminal_id:
            queryset = queryset.filter(terminal_id=terminal_id)
        return Response(HeldBillSerializer(queryset[:HELD_BILL_LIMIT], many=True).data)

    def post(self, request):
        data = HeldBillInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        payload = data.validated_data
        terminal = payload['terminal']
        open_count = HeldBill.objects.filter(terminal=terminal).count()
        if open_count >= HELD_BILL_LIMIT:
            return Response(
                {'detail': f'At most {HELD_BILL_LIMIT} held bills per counter.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        bill = HeldBill.objects.create(
            terminal=terminal,
            held_by=request.user,
            label=payload.get('label') or '',
            customer=payload.get('customer'),
            discount=payload.get('discount') or 0,
            lines=[
                {
                    'product_id': line['product_id'],
                    'quantity': str(line['quantity']),
                    'name': line['name'],
                    'barcode': line.get('barcode') or '',
                    'unit_price': str(line['unit_price']),
                }
                for line in payload['lines']
            ],
        )
        return Response(HeldBillSerializer(bill).data, status=status.HTTP_201_CREATED)


class HeldBillDetailView(APIView):
    permission_classes = [requires(write='pos.sell')]

    def delete(self, request, pk):
        bill = generics.get_object_or_404(HeldBill, pk=pk)
        bill.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        returns_today = SaleReturn.objects.filter(created_at__date=today).aggregate(
            amount=Coalesce(Sum('total'), Decimal(0)),
            count=Count('id'),
        )
        identified = sales_today.exclude(customer_id=None).values('customer_id').distinct().count()
        walk_ins = sales_today.filter(customer_id=None).count()
        khata = Customer.objects.filter(active=True, balance__gt=0).aggregate(
            outstanding=Coalesce(Sum('balance'), Decimal(0)),
            count=Count('id'),
        )
        open_shifts = {
            shift.terminal_id: shift
            for shift in Shift.objects.filter(closed_at__isnull=True)
            .select_related('terminal', 'opened_by')
            .prefetch_related('sales')
        }
        registers = []
        for terminal in Terminal.objects.filter(active=True).order_by('code'):
            shift = open_shifts.get(terminal.id)
            sales_total = (
                sum((sale.total for sale in shift.sales.all()), Decimal(0)) if shift else Decimal(0)
            )
            registers.append({
                'id': terminal.id,
                'name': terminal.name,
                'code': terminal.code,
                'status': 'open' if shift else 'closed',
                'cashier': (shift.opened_by.full_name or shift.opened_by.email) if shift else '',
                'sales_total': sales_total,
            })

        return Response({
            'today_revenue': totals['revenue'] - self._returned(today),
            'today_count': totals['count'],
            'yesterday_revenue': yesterday,
            'today_returns_count': returns_today['count'],
            'today_returns_amount': returns_today['amount'],
            'customers_identified': identified,
            'customers_walk_in': walk_ins,
            'khata_outstanding': khata['outstanding'],
            'khata_customers': khata['count'],
            'registers': registers,
            'open_counters': len(open_shifts),
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
                    'details': entry.details or {},
                }
                for entry in AuditLog.objects.select_related('user')[:15]
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
