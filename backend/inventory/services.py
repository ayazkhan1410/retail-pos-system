from django.db import transaction

from inventory.models import StockLevel, StockMovement


def _locked_level(product, branch):
    StockLevel.objects.get_or_create(product=product, branch=branch)
    return StockLevel.objects.select_for_update().get(product=product, branch=branch)


def move_stock(product, branch, delta, reason, user, reference=''):
    with transaction.atomic():
        level = _locked_level(product, branch)
        level.quantity += delta
        level.save(update_fields=['quantity'])
        StockMovement.objects.create(
            product=product, branch=branch, delta=delta, reason=reason, reference=reference, user=user,
        )


def set_stock(product, branch, quantity, reason, user):
    """Records the difference, so history still adds up after a manual correction."""
    with transaction.atomic():
        delta = quantity - _locked_level(product, branch).quantity
        if delta:
            move_stock(product, branch, delta, reason, user)
