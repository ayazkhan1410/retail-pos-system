from django.contrib import admin

from notifications.models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'recipient',
        'kind',
        'severity',
        'title',
        'dedupe_key',
        'read_at',
        'created_at',
    )
    list_filter = ('kind', 'severity', 'read_at', 'created_at')
    search_fields = ('title', 'body', 'dedupe_key', 'recipient__email')
    autocomplete_fields = ('recipient',)
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('-id',)
