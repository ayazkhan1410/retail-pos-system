from django.contrib import admin

from purchases.models import GRN, GRNLine, PurchaseReturn, PurchaseReturnLine


class GRNLineInline(admin.TabularInline):
    model = GRNLine
    extra = 0
    autocomplete_fields = ('product',)
    fields = (
        'id',
        'product',
        'cases',
        'qty',
        'free',
        'rate',
        'disc',
        'disc_percent',
        'freight',
        'retail',
        'expiry_date',
        'line_total',
        'unit_cost',
        'margin_percent',
    )
    readonly_fields = ('id',)


@admin.register(GRN)
class GRNAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'number',
        'status',
        'branch',
        'supplier',
        'date',
        'po_no',
        'payment_type',
        'subtotal',
        'total',
        'created_by',
        'posted_by',
        'posted_at',
        'voided_at',
        'created_at',
    )
    list_filter = ('status', 'payment_type', 'branch', 'date')
    search_fields = ('number', 'po_no', 'supplier__name', 'void_reason')
    autocomplete_fields = ('branch', 'supplier', 'created_by', 'posted_by', 'voided_by')
    readonly_fields = ('created_at',)
    inlines = [GRNLineInline]
    ordering = ('-id',)


@admin.register(GRNLine)
class GRNLineAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'grn',
        'product',
        'cases',
        'qty',
        'free',
        'rate',
        'disc',
        'disc_percent',
        'freight',
        'retail',
        'expiry_date',
        'line_total',
        'unit_cost',
        'margin_percent',
    )
    list_filter = ('expiry_date',)
    search_fields = ('grn__number', 'product__name', 'product__barcode')
    autocomplete_fields = ('grn', 'product')
    ordering = ('id',)


class PurchaseReturnLineInline(admin.TabularInline):
    model = PurchaseReturnLine
    extra = 0
    autocomplete_fields = ('product',)


@admin.register(PurchaseReturn)
class PurchaseReturnAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'number',
        'status',
        'supplier',
        'grn',
        'date',
        'total',
        'created_by',
        'posted_at',
    )
    list_filter = ('status', 'date')
    search_fields = ('number', 'supplier__name', 'reason')
    autocomplete_fields = ('branch', 'supplier', 'grn', 'created_by', 'posted_by')
    inlines = [PurchaseReturnLineInline]
    ordering = ('-id',)
