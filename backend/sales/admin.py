from django.contrib import admin

from audit.admin_mixins import SuperuserMayDeleteMixin
from sales.models import (
    Payment,
    ReturnLine,
    Sale,
    SaleLine,
    SaleReturn,
    Shift,
    Terminal,
)


@admin.register(Terminal)
class TerminalAdmin(admin.ModelAdmin):
    list_display = ('id', 'branch', 'code', 'name', 'active', 'last_invoice_seq')
    list_filter = ('active', 'branch')
    search_fields = ('code', 'name', 'branch__name', 'branch__code')
    autocomplete_fields = ('branch',)
    ordering = ('code',)


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'terminal',
        'opened_by',
        'closed_by',
        'opened_at',
        'closed_at',
        'opening_cash',
        'expected_cash',
        'counted_cash',
    )
    list_filter = ('terminal', 'opened_at', 'closed_at')
    search_fields = ('terminal__code', 'terminal__name', 'opened_by__email', 'closed_by__email')
    autocomplete_fields = ('terminal', 'opened_by', 'closed_by')
    ordering = ('-id',)


class SaleLineInline(admin.TabularInline):
    model = SaleLine
    extra = 0
    fields = (
        'id',
        'product',
        'name',
        'barcode',
        'pct_code',
        'quantity',
        'unit_price',
        'unit_cost',
        'discount',
        'tax_rate',
        'tax_amount',
        'line_total',
    )
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    fields = ('id', 'method', 'amount', 'reference')
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser


@admin.register(Sale)
class SaleAdmin(SuperuserMayDeleteMixin, admin.ModelAdmin):
    list_display = (
        'id',
        'invoice_no',
        'client_uuid',
        'branch',
        'terminal',
        'shift',
        'cashier',
        'customer',
        'is_offline',
        'subtotal',
        'discount',
        'tax',
        'total',
        'change_due',
        'created_at',
    )
    list_filter = ('is_offline', 'branch', 'terminal', 'created_at')
    search_fields = ('invoice_no', 'client_uuid', 'cashier__email', 'customer__name')
    autocomplete_fields = ('branch', 'terminal', 'shift', 'cashier', 'customer')
    readonly_fields = (
        'client_uuid',
        'invoice_no',
        'branch',
        'terminal',
        'shift',
        'cashier',
        'customer',
        'is_offline',
        'subtotal',
        'discount',
        'tax',
        'total',
        'change_due',
        'created_at',
    )
    inlines = [SaleLineInline, PaymentInline]
    ordering = ('-id',)

    def get_readonly_fields(self, request, obj=None):
        if request.user.is_superuser:
            return ()
        return self.readonly_fields

    def delete_model(self, request, obj):
        # Children use PROTECT; clear them first so a superuser can purge a sale.
        for ret in obj.returns.all():
            for line in ret.lines.all():
                line.delete(force=True)
            ret.delete(force=True)
        for payment in obj.payments.all():
            payment.delete(force=True)
        for line in obj.lines.all():
            line.delete(force=True)
        obj.delete(force=True)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            self.delete_model(request, obj)


@admin.register(SaleLine)
class SaleLineAdmin(SuperuserMayDeleteMixin, admin.ModelAdmin):
    list_display = (
        'id',
        'sale',
        'product',
        'name',
        'barcode',
        'pct_code',
        'quantity',
        'unit_price',
        'unit_cost',
        'discount',
        'tax_rate',
        'tax_amount',
        'line_total',
    )
    search_fields = ('sale__invoice_no', 'name', 'barcode', 'product__name')
    autocomplete_fields = ('sale', 'product')
    readonly_fields = (
        'sale',
        'product',
        'name',
        'barcode',
        'pct_code',
        'quantity',
        'unit_price',
        'unit_cost',
        'discount',
        'tax_rate',
        'tax_amount',
        'line_total',
    )
    ordering = ('id',)

    def get_readonly_fields(self, request, obj=None):
        if request.user.is_superuser:
            return ()
        return self.readonly_fields


@admin.register(Payment)
class PaymentAdmin(SuperuserMayDeleteMixin, admin.ModelAdmin):
    list_display = ('id', 'sale', 'method', 'amount', 'reference')
    list_filter = ('method',)
    search_fields = ('sale__invoice_no', 'reference')
    autocomplete_fields = ('sale',)
    readonly_fields = ('sale', 'method', 'amount', 'reference')
    ordering = ('id',)

    def get_readonly_fields(self, request, obj=None):
        if request.user.is_superuser:
            return ()
        return self.readonly_fields


class ReturnLineInline(admin.TabularInline):
    model = ReturnLine
    extra = 0
    fields = ('id', 'sale_line', 'quantity', 'amount', 'tax_amount', 'restocked')
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser


@admin.register(SaleReturn)
class SaleReturnAdmin(SuperuserMayDeleteMixin, admin.ModelAdmin):
    list_display = (
        'id',
        'number',
        'client_uuid',
        'sale',
        'terminal',
        'shift',
        'user',
        'method',
        'reason',
        'total',
        'tax',
        'created_at',
    )
    list_filter = ('method', 'terminal', 'created_at')
    search_fields = ('number', 'client_uuid', 'sale__invoice_no', 'reason', 'user__email')
    autocomplete_fields = ('sale', 'terminal', 'shift', 'user')
    readonly_fields = (
        'client_uuid',
        'number',
        'sale',
        'terminal',
        'shift',
        'user',
        'method',
        'reason',
        'total',
        'tax',
        'created_at',
    )
    inlines = [ReturnLineInline]
    ordering = ('-id',)

    def get_readonly_fields(self, request, obj=None):
        if request.user.is_superuser:
            return ()
        return self.readonly_fields

    def delete_model(self, request, obj):
        for line in obj.lines.all():
            line.delete(force=True)
        obj.delete(force=True)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            self.delete_model(request, obj)


@admin.register(ReturnLine)
class ReturnLineAdmin(SuperuserMayDeleteMixin, admin.ModelAdmin):
    list_display = (
        'id',
        'sale_return',
        'sale_line',
        'quantity',
        'amount',
        'tax_amount',
        'restocked',
    )
    list_filter = ('restocked',)
    search_fields = ('sale_return__number', 'sale_line__barcode', 'sale_line__name')
    autocomplete_fields = ('sale_return', 'sale_line')
    readonly_fields = (
        'sale_return',
        'sale_line',
        'quantity',
        'amount',
        'tax_amount',
        'restocked',
    )
    ordering = ('id',)

    def get_readonly_fields(self, request, obj=None):
        if request.user.is_superuser:
            return ()
        return self.readonly_fields
