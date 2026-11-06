from django.contrib import admin
from django.urls import path, include
from smartshop_pos.views import HealthCheckView
from smartshop_pos.system_views import AppVersionView, DatabaseBackupView


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('auth.urls')),
    path('api/inventory/', include('inventory.urls')),
    path('api/suppliers/', include('suppliers.urls')),
    path('api/sales/', include('sales.urls')),
    path('api/audit/', include('audit.urls')),
    path('api/purchases/', include('purchases.urls')),
    path('api/customers/', include('customers.urls')),
    path('api/finance/', include('finance.urls')),

    # Health Check Endpoints
    path('api/health-check/', HealthCheckView.as_view()),

    # System Endpoints
    path('api/system/version/', AppVersionView.as_view()),
    path('api/system/backup/', DatabaseBackupView.as_view()),
]
