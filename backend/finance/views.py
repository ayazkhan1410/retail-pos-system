from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import log_event
from auth.permissions import requires
from finance.models import Expense
from finance.services import analytics, expenses_summary, financial_report, insights, overview, report_section, trend
from finance.services.overview import PERIODS
from finance.services.reports import SECTIONS
from inventory.models import default_branch
from sales.models import Shift, Terminal

EXPENSE_METHODS = ['cash', 'bank', 'cheque', 'jazzcash', 'easypaisa', 'card']
EXPENSE_LIST_LIMIT = 500
MAX_RANGE_DAYS = 366


class ExpenseSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    method = serializers.ChoiceField(choices=EXPENSE_METHODS, default='cash')
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    # Write: the register whose drawer the cash came from. Read: that register's name.
    terminal = serializers.PrimaryKeyRelatedField(
        queryset=Terminal.objects.filter(active=True), required=False, allow_null=True, write_only=True,
    )
    terminal_name = serializers.CharField(source='shift.terminal.name', read_only=True, default='')

    class Meta:
        model = Expense
        fields = ('id', 'category', 'amount', 'date', 'method', 'note', 'terminal', 'terminal_name', 'user_name', 'created_at')
        read_only_fields = ('created_at',)

    def validate(self, attrs):
        if attrs.get('terminal') and attrs.get('method') != 'cash':
            raise serializers.ValidationError({'terminal': 'Only cash can come out of a register drawer.'})
        if attrs['date'] > timezone.localdate():
            raise serializers.ValidationError({'date': 'An expense cannot be dated in the future.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        terminal = validated_data.pop('terminal', None)
        if terminal:
            # Same lock order as closing a shift, so the payout can't land after the drawer was counted.
            Terminal.objects.select_for_update().get(pk=terminal.pk)
            shift = Shift.objects.select_for_update().filter(terminal=terminal, closed_at__isnull=True).first()
            if not shift:
                raise serializers.ValidationError({'terminal': f'{terminal.name} has no open shift to pay from.'})
            validated_data['shift'] = shift
        return super().create(validated_data)


class RangeInput(serializers.Serializer):
    to = serializers.DateField(required=False)
    search = serializers.CharField(required=False, allow_blank=True, max_length=100)

    def get_fields(self):
        # "from" is a Python keyword, so it can't be declared as a class attribute.
        return {**super().get_fields(), 'from': serializers.DateField(required=False)}

    def validate(self, attrs):
        start, end = attrs.get('from'), attrs.get('to')
        if start and end:
            if start > end:
                raise serializers.ValidationError({'from': 'Start date is after the end date.'})
            if (end - start).days > MAX_RANGE_DAYS:
                raise serializers.ValidationError({'from': 'Pick a range of a year or less.'})
        return attrs


class ExpenseListCreateView(generics.ListCreateAPIView):
    permission_classes = [requires('expenses.view', 'expenses.edit')]
    serializer_class = ExpenseSerializer
    pagination_class = None

    def get_queryset(self):
        params = RangeInput(data=self.request.query_params)
        params.is_valid(raise_exception=True)
        values = params.validated_data
        queryset = Expense.objects.select_related('user', 'shift__terminal')
        if values.get('from'):
            queryset = queryset.filter(date__gte=values['from'])
        if values.get('to'):
            queryset = queryset.filter(date__lte=values['to'])
        if values.get('search'):
            search = values['search']
            queryset = queryset.filter(Q(note__icontains=search) | Q(category__icontains=search))
        return queryset[:EXPENSE_LIST_LIMIT]

    def perform_create(self, serializer):
        expense = serializer.save(user=self.request.user, branch=default_branch())
        log_event(self.request.user, 'expense_added', expense.category, {
            'amount': str(expense.amount), 'method': expense.method,
            'terminal': expense.shift.terminal.name if expense.shift_id else '',
        })


class ExpenseDetailView(generics.DestroyAPIView):
    permission_classes = [requires('expenses.view', 'expenses.edit')]
    queryset = Expense.objects.all()

    def perform_destroy(self, instance):
        if instance.shift_id and Shift.objects.filter(pk=instance.shift_id, closed_at__isnull=False).exists():
            # The drawer count already included it; deleting would silently change a closed shift's numbers.
            raise serializers.ValidationError({'detail': 'This came out of a drawer on a closed shift and cannot be deleted.'})
        log_event(self.request.user, 'expense_deleted', instance.category, {'amount': str(instance.amount), 'date': str(instance.date)})
        instance.delete()


class MonthInput(serializers.Serializer):
    month = serializers.RegexField(r'^\d{4}-(0[1-9]|1[0-2])$', required=False)


class ExpenseSummaryView(APIView):
    permission_classes = [requires('expenses.view')]

    def get(self, request):
        params = MonthInput(data=request.query_params)
        params.is_valid(raise_exception=True)
        month = params.validated_data.get('month')
        first = timezone.localdate().replace(day=1)
        if month:
            year, number = (int(part) for part in month.split('-'))
            first = first.replace(year=year, month=number)
        return Response(expenses_summary(first))


class ReportInput(serializers.Serializer):
    to = serializers.DateField(required=False)

    def get_fields(self):
        return {**super().get_fields(), 'from': serializers.DateField(required=False)}


def _report_range(request):
    params = ReportInput(data=request.query_params)
    params.is_valid(raise_exception=True)
    today = timezone.localdate()
    end = params.validated_data.get('to') or today
    start = params.validated_data.get('from') or end - timedelta(days=29)
    if start > end:
        raise serializers.ValidationError({'from': 'Start date is after the end date.'})
    if (end - start).days > MAX_RANGE_DAYS:
        raise serializers.ValidationError({'from': 'Pick a range of a year or less.'})
    return start, end


class FinancialReportView(APIView):
    permission_classes = [requires('reports.view')]

    def get(self, request):
        return Response(financial_report(*_report_range(request)))


class ReportSectionView(APIView):
    """The other Reports tabs: sales, stock, tax, cashiers, khata."""

    permission_classes = [requires('reports.view')]

    def get(self, request, section):
        if section not in SECTIONS:
            raise serializers.ValidationError({'section': f'Unknown report. Choose one of: {", ".join(SECTIONS)}.'})
        return Response(report_section(section, *_report_range(request)))


class TrendInput(serializers.Serializer):
    months = serializers.IntegerField(min_value=1, max_value=24, default=6)


class ReportTrendView(APIView):
    permission_classes = [requires('reports.view')]

    def get(self, request):
        params = TrendInput(data=request.query_params)
        params.is_valid(raise_exception=True)
        return Response(trend(params.validated_data['months']))


class InsightsView(APIView):
    permission_classes = [requires('insights.view')]

    def get(self, request):
        return Response(insights())


class AnalyticsInput(serializers.Serializer):
    days = serializers.ChoiceField(choices=[30, 90, 365], default=90)


class AnalyticsView(APIView):
    permission_classes = [requires('insights.view')]

    def get(self, request):
        params = AnalyticsInput(data=request.query_params)
        params.is_valid(raise_exception=True)
        return Response(analytics(int(params.validated_data['days'])))


class OverviewInput(serializers.Serializer):
    period = serializers.ChoiceField(choices=list(PERIODS), default='today')


class OverviewView(APIView):
    permission_classes = [requires('dashboard.view')]

    def get(self, request):
        params = OverviewInput(data=request.query_params)
        params.is_valid(raise_exception=True)
        return Response(overview(params.validated_data['period']))
