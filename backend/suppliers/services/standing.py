"""Where each supplier account stands: last delivery, what was bought this year and when payment is due."""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Max, Q, Sum
from django.utils import timezone

ZERO = Decimal(0)


def with_standing(queryset):
    """Annotates last_delivery (date of the latest posted GRN) and bought_this_year (posted GRN totals)."""
    year_start = timezone.localdate().replace(month=1, day=1)
    posted = Q(grns__status='posted')
    return queryset.annotate(
        last_delivery=Max('grns__date', filter=posted),
        bought_this_year=Sum('grns__total', filter=posted & Q(grns__date__gte=year_start)),
    )


def due_dates(suppliers):
    """{supplier_id: date} when the oldest unpaid charge falls due. Payments clear the oldest charges first.

    Only for suppliers that are owed money and have agreed payment terms."""
    from suppliers.models import SupplierLedgerEntry

    wanted = {s.pk: s.payment_terms_days for s in suppliers if s.credit_balance > 0 and s.payment_terms_days is not None}
    if not wanted:
        return {}
    entries = SupplierLedgerEntry.objects.filter(supplier_id__in=wanted).order_by('supplier_id', 'created_at', 'id')
    charges, paid = {}, {}
    for entry in entries.only('supplier_id', 'delta', 'created_at'):
        if entry.delta > 0:
            charges.setdefault(entry.supplier_id, []).append(entry)
        else:
            paid[entry.supplier_id] = paid.get(entry.supplier_id, ZERO) - entry.delta
    out = {}
    for supplier_id, terms in wanted.items():
        left = paid.get(supplier_id, ZERO)
        for charge in charges.get(supplier_id, []):
            if left >= charge.delta:
                left -= charge.delta
                continue
            out[supplier_id] = timezone.localtime(charge.created_at).date() + timedelta(days=terms)
            break
    return out
