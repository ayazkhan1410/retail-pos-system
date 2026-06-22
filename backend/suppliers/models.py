from django.db import models


class PaymentType(models.TextChoices):
    CREDIT = 'credit', 'Credit'
    CASH = 'cash', 'Cash'


class Status(models.TextChoices):
    ACTIVE = 'active', 'Active'
    INACTIVE = 'inactive', 'Inactive'


class Supplier(models.Model):
    name = models.CharField(
        max_length=255, null=False, blank=False,
        db_index=True,
    )
    contact_person = models.CharField(max_length=255, null=True, blank=True)
    phone = models.CharField(max_length=255, null=True, blank=True)
    email = models.EmailField(max_length=255, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    city = models.CharField(max_length=255, null=True, blank=True)
    ntn = models.CharField(max_length=255, null=True, blank=True)
    bank_account = models.CharField(max_length=255, null=True, blank=True)
    credit_balance = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    payment_type = models.CharField(
        max_length=255, null=True, blank=True,
        choices=PaymentType.choices, default=PaymentType.CREDIT,
    )
    status = models.CharField(
        max_length=255, null=True, blank=True,
        choices=Status.choices, default=Status.ACTIVE,
    )
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
