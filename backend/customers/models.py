from django.conf import settings
from django.db import models

from audit.models import AppendOnlyModel


class Customer(models.Model):
    name = models.CharField(max_length=255, db_index=True)
    phone = models.CharField(max_length=30, unique=True, null=True, blank=True)
    address = models.TextField(blank=True)
    credit_limit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # What they owe the shop (khata), kept in step with the ledger.
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class CustomerLedgerEntry(AppendOnlyModel):
    class Kind(models.TextChoices):
        OPENING = 'opening', 'Opening balance'
        SALE = 'sale', 'Credit sale'
        PAYMENT = 'payment', 'Payment received'
        RETURN = 'return', 'Return'

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='ledger')
    delta = models.DecimalField(max_digits=14, decimal_places=2)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    method = models.CharField(max_length=20, blank=True)
    reference = models.CharField(max_length=100, blank=True)
    # Set when cash went into a till's drawer, so the shift count expects it.
    shift = models.ForeignKey('sales.Shift', null=True, blank=True, on_delete=models.PROTECT, related_name='customer_entries')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-id']
