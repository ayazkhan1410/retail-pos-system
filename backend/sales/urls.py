from django.urls import path

from sales.views import (
    CloseShiftView, CurrentShiftView, DashboardView, OpenShiftView, ReturnCreateView, SaleListCreateView,
    TerminalListView,
)

urlpatterns = [
    path('', SaleListCreateView.as_view()),
    path('returns/', ReturnCreateView.as_view()),
    path('dashboard/', DashboardView.as_view()),
    path('terminals/', TerminalListView.as_view()),
    path('terminals/<int:terminal_id>/shift/', CurrentShiftView.as_view()),
    path('shifts/', OpenShiftView.as_view()),
    path('shifts/<int:pk>/close/', CloseShiftView.as_view()),
]
