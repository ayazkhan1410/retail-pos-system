from django.urls import path

from auth.views import (
    LoginView,
    LogoutView,
    RolePermissionsView,
    SessionView,
    SwitchByPinView,
    UserDetailView,
    UserListCreateView,
)

urlpatterns = [
    path('session/', SessionView.as_view()),
    path('login/', LoginView.as_view()),
    path('logout/', LogoutView.as_view()),
    path('switch-pin/', SwitchByPinView.as_view()),
    path('roles/', RolePermissionsView.as_view()),
    path('users/', UserListCreateView.as_view()),
    path('users/<int:pk>/', UserDetailView.as_view()),
]
