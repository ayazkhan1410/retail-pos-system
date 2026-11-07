from django.urls import path

from finance.views import (
    AnalyticsView,
    ExpenseDetailView,
    ExpenseListCreateView,
    ExpenseSummaryView,
    FinancialReportView,
    InsightsView,
    OverviewView,
    ReportSectionView,
    ReportTrendView,
)

urlpatterns = [
    path('expenses/', ExpenseListCreateView.as_view()),
    path('expenses/summary/', ExpenseSummaryView.as_view()),
    path('expenses/<int:pk>/', ExpenseDetailView.as_view()),
    path('report/', FinancialReportView.as_view()),
    path('report/trend/', ReportTrendView.as_view()),
    path('report/<str:section>/', ReportSectionView.as_view()),
    path('insights/', InsightsView.as_view()),
    path('analytics/', AnalyticsView.as_view()),
    path('overview/', OverviewView.as_view()),
]
