from django.contrib import admin

from audit.admin_mixins import SuperuserMayDeleteMixin
from audit.models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(SuperuserMayDeleteMixin, admin.ModelAdmin):
    list_display = (
        'id',
        'user',
        'action',
        'target',
        'details',
        'created_at',
    )
    list_filter = ('action', 'created_at')
    search_fields = ('action', 'target', 'user__email')
    autocomplete_fields = ('user',)
    readonly_fields = (
        'user',
        'action',
        'target',
        'details',
        'created_at',
    )
    ordering = ('-id',)

    def get_readonly_fields(self, request, obj=None):
        if request.user.is_superuser:
            return ()
        return self.readonly_fields
