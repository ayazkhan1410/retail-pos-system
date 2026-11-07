from django.urls import path

from customers.views import (
    CustomerDetailView,
    CustomerLedgerView,
    CustomerListCreateView,
    CustomerProfileView,
    CustomerSummaryView,
)

urlpatterns = [
    path('', CustomerListCreateView.as_view()),
    path('summary/', CustomerSummaryView.as_view()),
    path('<int:pk>/', CustomerDetailView.as_view()),
    path('<int:pk>/profile/', CustomerProfileView.as_view()),
    path('<int:pk>/ledger/', CustomerLedgerView.as_view()),
]
