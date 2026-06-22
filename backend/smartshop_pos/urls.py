from django.contrib import admin
from django.urls import path, include
from smartshop_pos.views import HealthCheckView
from smartshop_pos.system_views import AppVersionView, CheckUpdatesView, DatabaseBackupView


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('auth.urls')),
    path('api/inventory/', include('inventory.urls')),
    path('api/health-check/', HealthCheckView.as_view()),
    path('api/system/version/', AppVersionView.as_view()),
    path('api/system/check-updates/', CheckUpdatesView.as_view()),
    path('api/system/backup/', DatabaseBackupView.as_view()),
]
