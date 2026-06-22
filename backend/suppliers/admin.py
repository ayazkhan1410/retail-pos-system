from django.contrib import admin
from suppliers.models import Supplier


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "contact_person",
        "phone",
        "email",
        "city",
        "ntn",
        "bank_account",
        "credit_balance",
        "payment_type",
        "status",
        "created_at",
        "updated_at",
    )

    search_fields = (
        "name",
        "contact_person",
        "phone",
        "email",
        "city",
        "ntn",
    )

    list_filter = (
        "payment_type",
        "status",
        "city",
        "created_at",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )
