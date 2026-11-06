from django.urls import path

from inventory.views import CategoryListView, CurrentBranchView, ProductDetailView, ProductListCreateView

urlpatterns = [
    path('products/', ProductListCreateView.as_view()),
    path('products/<int:pk>/', ProductDetailView.as_view()),
    path('categories/', CategoryListView.as_view()),
    path('branch/', CurrentBranchView.as_view()),
]
