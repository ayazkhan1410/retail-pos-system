from django.conf import settings
from django.db import models

from inventory.models import Branch, Product
from suppliers.models import PaymentType, Supplier


def _money(**kwargs):
    return models.DecimalField(max_digits=14, decimal_places=2, default=0, **kwargs)


class GRN(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        POSTED = 'posted', 'Posted'

    number = models.CharField(max_length=20, unique=True, null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT, db_index=True)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='grns')
    date = models.DateField()
    po_no = models.CharField(max_length=50, blank=True)
    payment_type = models.CharField(max_length=10, choices=PaymentType.choices, default=PaymentType.CREDIT)
    disc_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    flat_disc = _money()
    freight = _money()
    sales_tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    expense = _money()
    disperse_discount = models.BooleanField(default=True)
    disperse_freight = models.BooleanField(default=False)
    disperse_tax = models.BooleanField(default=False)
    subtotal = _money()
    total = _money()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    posted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    posted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-id']


class GRNLine(models.Model):
    grn = models.ForeignKey(GRN, on_delete=models.CASCADE, related_name='lines')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    cases = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    qty = models.DecimalField(max_digits=12, decimal_places=3)
    free = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    rate = models.DecimalField(max_digits=14, decimal_places=2)
    disc = _money()
    disc_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    freight = _money()
    retail = _money()
    expiry_date = models.DateField(null=True, blank=True)
    # Worked out when saved, so an old GRN keeps its numbers.
    line_total = _money()
    unit_cost = _money()
    margin_percent = models.DecimalField(max_digits=7, decimal_places=2, default=0)
