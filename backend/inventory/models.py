from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from audit.models import AppendOnlyModel

CENT = Decimal('0.01')
NON_NEGATIVE = [MinValueValidator(0)]
PERCENT = [MinValueValidator(0), MaxValueValidator(100)]


def money_field(**kwargs):
    return models.DecimalField(max_digits=14, decimal_places=2, default=0, validators=NON_NEGATIVE, **kwargs)


class Branch(models.Model):
    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=255)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    ntn = models.CharField(max_length=30, blank=True)

    def __str__(self):
        return self.name


def default_branch():
    # shortcut: one branch per install, replace with the user's or terminal's branch for multi-branch (Phase 5).
    return Branch.objects.order_by('id').first()


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'categories'

    def __str__(self):
        return self.name


class Product(models.Model):
    class Costing(models.TextChoices):
        RECENT = 'recent_cost', 'Recent Cost'
        MANUAL = 'manual_cost', 'Manual Cost'

    active = models.BooleanField(default=True)
    barcode = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255, db_index=True)
    long_desc = models.TextField(blank=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT)
    supplier = models.ForeignKey('suppliers.Supplier', null=True, blank=True, on_delete=models.PROTECT)

    sub_category = models.CharField(max_length=100, blank=True)
    brand = models.CharField(max_length=100, blank=True)
    make = models.CharField(max_length=100, blank=True)
    attributes = models.CharField(max_length=100, blank=True)
    size = models.CharField(max_length=50, blank=True)
    colour = models.CharField(max_length=50, blank=True)
    design_model = models.CharField(max_length=100, blank=True)
    department = models.CharField(max_length=100, blank=True)
    season = models.CharField(max_length=50, blank=True)
    item_type = models.CharField(max_length=50, blank=True, default='Trading Item')
    uom = models.CharField(max_length=20, blank=True, default='PCS')
    case_unit = models.CharField(max_length=20, blank=True)
    box_pcs = models.PositiveIntegerField(null=True, blank=True)
    weight = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, validators=NON_NEGATIVE)
    lead_time_days = models.PositiveIntegerField(null=True, blank=True)

    costing_method = models.CharField(max_length=20, choices=Costing.choices, default=Costing.RECENT)
    cost = money_field()
    # Shelf price, including sales tax.
    price = money_field()
    sales_tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0, validators=PERCENT)
    pct_code = models.CharField('PCT code', max_length=20, blank=True, help_text='FBR tariff code')
    disc_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0, validators=PERCENT)
    disc_amount = money_field()
    disc_start = models.DateField(null=True, blank=True)
    disc_end = models.DateField(null=True, blank=True)

    threshold = models.DecimalField(max_digits=12, decimal_places=3, default=10, validators=NON_NEGATIVE)
    min_level = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True, validators=NON_NEGATIVE)
    max_level = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True, validators=NON_NEGATIVE)
    qty_decimal = models.BooleanField(default=False)
    unorderable = models.BooleanField(default=False)
    is_style_item = models.BooleanField(default=False)
    oem_barcode = models.BooleanField(default=False)
    track_expiry = models.BooleanField(default=False)
    # Earliest expiry among batches still in stock; kept up to date by inventory.services.
    expiry_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    @property
    def is_expired(self):
        return bool(self.expiry_date and self.expiry_date < timezone.localdate())

    def sale_price(self):
        """Shelf price after this item's own discount, if one is running today."""
        today = timezone.localdate()
        if (self.disc_start and today < self.disc_start) or (self.disc_end and today > self.disc_end):
            return self.price
        reduced = self.price * (100 - self.disc_percent) / 100 - self.disc_amount
        return max(reduced, Decimal(0)).quantize(CENT, ROUND_HALF_UP)


class StockLevel(models.Model):
    """Running total for fast reads. StockMovement is the source of truth."""

    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['product', 'branch'], name='one_stock_level_per_branch')]


class Batch(models.Model):
    """Stock of one product sharing an expiry date. Sales use the earliest expiry first."""

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='batches')
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    expiry_date = models.DateField()
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['product', 'branch', 'expiry_date'], name='one_batch_per_expiry')]


class StockMovement(AppendOnlyModel):
    class Reason(models.TextChoices):
        OPENING = 'opening', 'Opening balance'
        SALE = 'sale', 'Sale'
        ADJUSTMENT = 'adjustment', 'Adjustment'
        PURCHASE = 'purchase', 'Purchase'
        RETURN = 'return', 'Customer return'
        COUNT = 'count', 'Stock count'
        DAMAGE = 'damage', 'Damaged'
        EXPIRED = 'expired', 'Expired write-off'

    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    delta = models.DecimalField(max_digits=12, decimal_places=3)
    reason = models.CharField(max_length=20, choices=Reason.choices)
    reference = models.CharField(max_length=64, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['product', 'branch', 'created_at'])]
