from django.contrib import admin

from audit.admin_mixins import SuperuserMayDeleteMixin
from suppliers.models import Supplier, SupplierLedgerEntry


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'name',
        'contact_person',
        'phone',
        'email',
        'city',
        'ntn',
        'bank_account',
        'credit_balance',
        'payment_type',
        'status',
        'created_at',
        'updated_at',
    )
    search_fields = (
        'name',
        'contact_person',
        'phone',
        'email',
        'city',
        'ntn',
    )
    list_filter = (
        'payment_type',
        'status',
        'city',
        'created_at',
    )
    readonly_fields = (
        'created_at',
        'updated_at',
    )
    ordering = ('-id',)


@admin.register(SupplierLedgerEntry)
class SupplierLedgerEntryAdmin(SuperuserMayDeleteMixin, admin.ModelAdmin):
    list_display = (
        'id',
        'supplier',
        'delta',
        'kind',
        'method',
        'reference',
        'user',
        'created_at',
    )
    list_filter = ('kind', 'method', 'created_at')
    search_fields = ('supplier__name', 'reference', 'user__email')
    autocomplete_fields = ('supplier', 'user')
    readonly_fields = (
        'supplier',
        'delta',
        'kind',
        'method',
        'reference',
        'user',
        'created_at',
    )
    ordering = ('-id',)

    def get_readonly_fields(self, request, obj=None):
        if request.user.is_superuser:
            return ()
        return self.readonly_fields
