from django.urls import path

from inventory.views import (
    AdjustStockView,
    CategoryListView,
    CurrentBranchView,
    ImportProductsView,
    ProductDetailView,
    ProductListCreateView,
    WriteOffExpiredView,
)

urlpatterns = [
    path('products/', ProductListCreateView.as_view()),
    path('products/<int:pk>/', ProductDetailView.as_view()),
    path('products/import/', ImportProductsView.as_view()),
    path('products/<int:pk>/adjust/', AdjustStockView.as_view()),
    path('products/<int:pk>/write-off-expired/', WriteOffExpiredView.as_view()),
    path('categories/', CategoryListView.as_view()),
    path('branch/', CurrentBranchView.as_view()),
]
