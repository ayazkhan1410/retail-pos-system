from django.urls import path

from audit.views import ClientEventView

urlpatterns = [path('events/', ClientEventView.as_view())]
