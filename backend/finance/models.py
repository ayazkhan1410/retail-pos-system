from django.conf import settings
from django.db import models

from inventory.models import Branch


class Expense(models.Model):
    class Category(models.TextChoices):
        RENT = 'rent', 'Rent'
        SALARIES = 'salaries', 'Salaries'
        UTILITIES = 'utilities', 'Utilities'
        TRANSPORT = 'transport', 'Transport'
        SUPPLIES = 'supplies', 'Supplies'
        OTHER = 'other', 'Other'

    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    category = models.CharField(max_length=20, choices=Category.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    date = models.DateField(db_index=True)
    method = models.CharField(max_length=20, default='cash')
    note = models.CharField(max_length=255, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    # Set when the cash came out of a till drawer, so that shift's expected cash goes down.
    shift = models.ForeignKey(
        'sales.Shift', null=True, blank=True, on_delete=models.PROTECT, related_name='expenses',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']
