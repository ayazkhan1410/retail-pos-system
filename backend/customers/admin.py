from django.contrib import admin

from audit.admin_mixins import SuperuserMayDeleteMixin
from customers.models import Customer, CustomerLedgerEntry


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'name',
        'phone',
        'credit_limit',
        'balance',
        'active',
        'created_at',
    )
    list_filter = ('active', 'created_at')
    search_fields = ('name', 'phone', 'address')
    readonly_fields = ('created_at',)
    ordering = ('name',)


@admin.register(CustomerLedgerEntry)
class CustomerLedgerEntryAdmin(SuperuserMayDeleteMixin, admin.ModelAdmin):
    list_display = (
        'id',
        'customer',
        'delta',
        'kind',
        'method',
        'reference',
        'shift',
        'user',
        'created_at',
    )
    list_filter = ('kind', 'method', 'created_at')
    search_fields = ('customer__name', 'customer__phone', 'reference', 'user__email')
    autocomplete_fields = ('customer', 'shift', 'user')
    readonly_fields = (
        'customer',
        'delta',
        'kind',
        'method',
        'reference',
        'shift',
        'user',
        'created_at',
    )
    ordering = ('-id',)

    def get_readonly_fields(self, request, obj=None):
        if request.user.is_superuser:
            return ()
        return self.readonly_fields
