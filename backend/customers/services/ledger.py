from django.db import transaction


def post_customer_entry(customer_id, delta, kind, user, method='', reference='', shift=None):
    from customers.models import Customer, CustomerLedgerEntry

    with transaction.atomic():
        customer = Customer.objects.select_for_update().get(pk=customer_id)
        customer.balance += delta
        customer.save(update_fields=['balance'])
        return CustomerLedgerEntry.objects.create(
            customer=customer, delta=delta, kind=kind, method=method, reference=reference, shift=shift, user=user,
        )
