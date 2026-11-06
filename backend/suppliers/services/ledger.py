from django.db import transaction


def post_supplier_entry(supplier_id, delta, kind, user, method='', reference=''):
    from suppliers.models import Supplier, SupplierLedgerEntry

    with transaction.atomic():
        supplier = Supplier.objects.select_for_update().get(pk=supplier_id)
        supplier.credit_balance += delta
        supplier.save(update_fields=['credit_balance', 'updated_at'])
        return SupplierLedgerEntry.objects.create(
            supplier=supplier, delta=delta, kind=kind, method=method, reference=reference, user=user,
        )
