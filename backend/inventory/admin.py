from django.contrib import admin

from audit.admin_mixins import SuperuserMayDeleteMixin
from inventory.models import (
    Batch,
    Branch,
    Category,
    Product,
    ProductBarcode,
    StockLevel,
    StockMovement,
)


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ('id', 'code', 'name', 'phone', 'ntn', 'address')
    search_fields = ('code', 'name', 'phone', 'ntn')
    ordering = ('id',)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('id', 'name')
    search_fields = ('name',)
    ordering = ('name',)


class ProductBarcodeInline(admin.TabularInline):
    model = ProductBarcode
    extra = 1


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'barcode',
        'name',
        'category',
        'supplier',
        'cost',
        'price',
        'sale_rate',
        'active',
        'oem_barcode',
        'track_expiry',
        'expiry_date',
        'created_at',
        'updated_at',
    )
    list_filter = (
        'active',
        'category',
        'costing_method',
        'oem_barcode',
        'track_expiry',
        'unorderable',
        'qty_decimal',
    )
    search_fields = ('barcode', 'name', 'brand', 'make', 'pct_code')
    readonly_fields = ('created_at', 'updated_at')
    autocomplete_fields = ('category', 'supplier')
    inlines = [ProductBarcodeInline]
    ordering = ('-id',)


@admin.register(ProductBarcode)
class ProductBarcodeAdmin(admin.ModelAdmin):
    list_display = ('id', 'barcode', 'product')
    search_fields = ('barcode', 'product__name', 'product__barcode')
    autocomplete_fields = ('product',)


@admin.register(StockLevel)
class StockLevelAdmin(admin.ModelAdmin):
    list_display = ('id', 'product', 'branch', 'quantity')
    list_filter = ('branch',)
    search_fields = ('product__name', 'product__barcode', 'branch__name', 'branch__code')
    autocomplete_fields = ('product', 'branch')
    ordering = ('id',)


@admin.register(Batch)
class BatchAdmin(admin.ModelAdmin):
    list_display = ('id', 'product', 'branch', 'expiry_date', 'quantity')
    list_filter = ('branch', 'expiry_date')
    search_fields = ('product__name', 'product__barcode', 'branch__name')
    autocomplete_fields = ('product', 'branch')
    ordering = ('expiry_date', 'id')


@admin.register(StockMovement)
class StockMovementAdmin(SuperuserMayDeleteMixin, admin.ModelAdmin):
    list_display = (
        'id',
        'product',
        'branch',
        'delta',
        'reason',
        'reference',
        'user',
        'created_at',
    )
    list_filter = ('reason', 'branch', 'created_at')
    search_fields = ('product__name', 'product__barcode', 'reference', 'user__email')
    autocomplete_fields = ('product', 'branch', 'user')
    readonly_fields = (
        'product',
        'branch',
        'delta',
        'reason',
        'reference',
        'user',
        'created_at',
    )
    ordering = ('-id',)

    def get_readonly_fields(self, request, obj=None):
        if request.user.is_superuser:
            return ()
        return self.readonly_fields
