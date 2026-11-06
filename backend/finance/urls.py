from django.urls import path

from finance.views import ExpenseDetailView, ExpenseListCreateView, FinancialReportView, InsightsView

urlpatterns = [
    path('expenses/', ExpenseListCreateView.as_view()),
    path('expenses/<int:pk>/', ExpenseDetailView.as_view()),
    path('report/', FinancialReportView.as_view()),
    path('insights/', InsightsView.as_view()),
]
