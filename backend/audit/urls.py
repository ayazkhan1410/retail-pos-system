from django.urls import path

from audit.views import ActivityListView, ClientEventView

urlpatterns = [
    path('events/', ClientEventView.as_view()),
    path('activity/', ActivityListView.as_view()),
]
