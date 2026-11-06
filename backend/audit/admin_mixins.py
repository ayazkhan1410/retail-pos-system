"""Admin helpers: keep append-only history locked for staff, open for superusers."""


class SuperuserMayDeleteMixin:
    """Allow Django superusers to delete (and edit) protected history rows."""

    def has_change_permission(self, request, obj=None):
        return bool(request.user.is_superuser)

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser

    def delete_model(self, request, obj):
        obj.delete(force=True)

    def delete_queryset(self, request, queryset):
        for obj in queryset.iterator(chunk_size=200):
            obj.delete(force=True)

    def save_model(self, request, obj, form, change):
        if change and hasattr(obj, 'save'):
            try:
                obj.save(force=True)
            except TypeError:
                obj.save()
        else:
            super().save_model(request, obj, form, change)
