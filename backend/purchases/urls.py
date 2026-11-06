from django.urls import path

from purchases.views import GRNDetailView, GRNListCreateView, GRNPostView, GRNPreviewView

urlpatterns = [
    path('', GRNListCreateView.as_view()),
    path('preview/', GRNPreviewView.as_view()),
    path('<int:pk>/', GRNDetailView.as_view()),
    path('<int:pk>/post/', GRNPostView.as_view()),
]
