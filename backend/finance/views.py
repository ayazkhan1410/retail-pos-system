from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import generics, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import log_event
from auth.permissions import requires
from finance.models import Expense
from finance.services import financial_report, insights
from inventory.models import default_branch


class ExpenseSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))

    class Meta:
        model = Expense
        fields = ('id', 'category', 'amount', 'date', 'method', 'note', 'user_name', 'created_at')
        read_only_fields = ('created_at',)


class ExpenseListCreateView(generics.ListCreateAPIView):
    permission_classes = [requires('expenses.view', 'expenses.edit')]
    serializer_class = ExpenseSerializer
    pagination_class = None

    def get_queryset(self):
        return Expense.objects.select_related('user')[:300]

    def perform_create(self, serializer):
        expense = serializer.save(user=self.request.user, branch=default_branch())
        log_event(self.request.user, 'expense_added', expense.category, {'amount': str(expense.amount)})


class ExpenseDetailView(generics.DestroyAPIView):
    permission_classes = [requires('expenses.view', 'expenses.edit')]
    queryset = Expense.objects.all()

    def perform_destroy(self, instance):
        log_event(self.request.user, 'expense_deleted', instance.category, {'amount': str(instance.amount), 'date': str(instance.date)})
        instance.delete()


class ReportInput(serializers.Serializer):
    to = serializers.DateField(required=False)

    def get_fields(self):
        return {**super().get_fields(), 'from': serializers.DateField(required=False)}


class FinancialReportView(APIView):
    permission_classes = [requires('reports.view')]

    def get(self, request):
        params = ReportInput(data=request.query_params)
        params.is_valid(raise_exception=True)
        today = timezone.localdate()
        end = params.validated_data.get('to') or today
        start = params.validated_data.get('from') or end - timedelta(days=29)
        return Response(financial_report(start, end))


class InsightsView(APIView):
    permission_classes = [requires('insights.view')]

    def get(self, request):
        return Response(insights())
