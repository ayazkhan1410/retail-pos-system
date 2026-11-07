from django.urls import path

from purchases.views import (
    GRNDetailView,
    GRNListCreateView,
    GRNPostView,
    GRNPreviewView,
    GRNVoidView,
    PurchaseReturnDetailView,
    PurchaseReturnListCreateView,
    PurchaseReturnPostView,
    PurchaseSummaryView,
)

urlpatterns = [
    path('', GRNListCreateView.as_view()),
    path('preview/', GRNPreviewView.as_view()),
    path('summary/', PurchaseSummaryView.as_view()),
    path('returns/', PurchaseReturnListCreateView.as_view()),
    path('returns/<int:pk>/', PurchaseReturnDetailView.as_view()),
    path('returns/<int:pk>/post/', PurchaseReturnPostView.as_view()),
    path('<int:pk>/', GRNDetailView.as_view()),
    path('<int:pk>/post/', GRNPostView.as_view()),
    path('<int:pk>/void/', GRNVoidView.as_view()),
]
