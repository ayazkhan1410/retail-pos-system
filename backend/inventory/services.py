from decimal import Decimal

from django.db import transaction
from django.db.models import Min
from django.utils import timezone

from inventory.models import Batch, Product, StockLevel, StockMovement


def _locked_level(product, branch):
    StockLevel.objects.get_or_create(product=product, branch=branch)
    return StockLevel.objects.select_for_update().get(product=product, branch=branch)


def _refresh_expiry(product, branch):
    batches = Batch.objects.filter(product=product, branch=branch)
    if batches.exists():
        earliest = batches.filter(quantity__gt=0).aggregate(v=Min('expiry_date'))['v']
        Product.objects.filter(pk=product.pk).update(expiry_date=earliest)
        product.expiry_date = earliest


def _consume_batches(product, branch, quantity):
    for batch in Batch.objects.select_for_update().filter(product=product, branch=branch, quantity__gt=0).order_by('expiry_date'):
        taken = min(batch.quantity, quantity)
        batch.quantity -= taken
        batch.save(update_fields=['quantity'])
        quantity -= taken
        if not quantity:
            break


def add_batch(product, branch, quantity, expiry_date):
    with transaction.atomic():
        batch, _ = Batch.objects.select_for_update().get_or_create(product=product, branch=branch, expiry_date=expiry_date)
        batch.quantity += quantity
        batch.save(update_fields=['quantity'])
        _refresh_expiry(product, branch)


def move_stock(product, branch, delta, reason, user, reference=''):
    with transaction.atomic():
        level = _locked_level(product, branch)
        level.quantity += delta
        level.save(update_fields=['quantity'])
        StockMovement.objects.create(
            product=product, branch=branch, delta=delta, reason=reason, reference=reference, user=user,
        )
        if delta < 0:
            _consume_batches(product, branch, -delta)
            _refresh_expiry(product, branch)


def set_stock(product, branch, quantity, reason, user):
    """Records the difference, so history still adds up after a manual correction."""
    with transaction.atomic():
        delta = quantity - _locked_level(product, branch).quantity
        if delta:
            move_stock(product, branch, delta, reason, user)
        return delta


def write_off_expired(product, branch, user):
    """Takes expired units out of stock, which also lets the rest of the product sell again."""
    with transaction.atomic():
        today = timezone.localdate()
        batches = Batch.objects.filter(product=product, branch=branch, quantity__gt=0, expiry_date__lt=today)
        quantity = sum((batch.quantity for batch in batches), Decimal(0))
        if quantity:
            move_stock(product, branch, -quantity, StockMovement.Reason.EXPIRED, user)
        elif product.expiry_date and product.expiry_date < today:
            # Expiry typed on the form, with no batch behind it: all of it counts as expired.
            quantity = max(_locked_level(product, branch).quantity, Decimal(0))
            if quantity:
                move_stock(product, branch, -quantity, StockMovement.Reason.EXPIRED, user)
            Product.objects.filter(pk=product.pk).update(expiry_date=None)
            product.expiry_date = None
        return quantity
