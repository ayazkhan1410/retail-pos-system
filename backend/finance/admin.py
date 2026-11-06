from django.contrib import admin

from finance.models import Expense


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'branch',
        'category',
        'amount',
        'date',
        'method',
        'note',
        'user',
        'created_at',
    )
    list_filter = ('category', 'method', 'branch', 'date')
    search_fields = ('note', 'user__email', 'branch__name', 'branch__code')
    autocomplete_fields = ('branch', 'user')
    readonly_fields = ('created_at',)
    ordering = ('-date', '-id')
