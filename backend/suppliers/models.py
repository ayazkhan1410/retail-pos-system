from django.conf import settings
from django.db import models, transaction

from audit.models import AppendOnlyModel


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
        max_digits=14, decimal_places=2, default=0,
        help_text='What we owe them, kept in step with the ledger. Negative means we paid in advance.',
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

    def __str__(self):
        return self.name


class SupplierLedgerEntry(AppendOnlyModel):
    class Kind(models.TextChoices):
        OPENING = 'opening', 'Opening balance'
        PURCHASE = 'purchase', 'Purchase'
        PAYMENT = 'payment', 'Payment'

    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='ledger')
    delta = models.DecimalField(max_digits=14, decimal_places=2)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    method = models.CharField(max_length=20, blank=True)
    reference = models.CharField(max_length=100, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-id']


def post_supplier_entry(supplier_id, delta, kind, user, method='', reference=''):
    with transaction.atomic():
        supplier = Supplier.objects.select_for_update().get(pk=supplier_id)
        supplier.credit_balance += delta
        supplier.save(update_fields=['credit_balance', 'updated_at'])
        return SupplierLedgerEntry.objects.create(
            supplier=supplier, delta=delta, kind=kind, method=method, reference=reference, user=user,
        )
