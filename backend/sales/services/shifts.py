from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from audit.services import log_event
from customers.models import CustomerLedgerEntry
from sales.models import Payment, Shift, Terminal


def _reject(message):
    raise ValidationError({'detail': message})


def expected_cash(shift):
    def total(queryset, field):
        return queryset.aggregate(v=Sum(field))['v'] or 0

    cash_in = total(Payment.objects.filter(sale__shift=shift, method=Payment.Method.CASH), 'amount')
    change = total(shift.sales.all(), 'change_due')
    refunds = total(shift.returns.filter(method=Payment.Method.CASH), 'total')
    collected = total(shift.customer_entries.filter(kind=CustomerLedgerEntry.Kind.PAYMENT, method='cash'), 'delta')
    return shift.opening_cash + cash_in - change - refunds - collected  # collected is negative on the ledger


def open_shift(user, terminal, opening_cash):
    try:
        with transaction.atomic():
            shift = Shift.objects.create(terminal=terminal, opened_by=user, opening_cash=opening_cash)
    except IntegrityError:
        _reject(f'{terminal.name} already has an open shift.')
    log_event(user, 'shift_opened', terminal.name, {'opening_cash': str(opening_cash)})
    return shift


@transaction.atomic
def close_shift(user, shift_id, counted_cash):
    # Terminal first, same order as a sale, so closing can't deadlock with one and no sale lands after the count.
    terminal_id = Shift.objects.filter(pk=shift_id).values_list('terminal_id', flat=True).first()
    if terminal_id:
        Terminal.objects.select_for_update().get(pk=terminal_id)
    shift = Shift.objects.select_for_update(of=('self',)).select_related('terminal').filter(pk=shift_id).first()
    if not shift or shift.closed_at:
        _reject('This shift is already closed.')
    shift.expected_cash = expected_cash(shift)
    shift.counted_cash = counted_cash
    shift.closed_by = user
    shift.closed_at = timezone.now()
    shift.save()
    log_event(user, 'shift_closed', shift.terminal.name, {
        'expected_cash': str(shift.expected_cash),
        'counted_cash': str(counted_cash),
        'difference': str(counted_cash - shift.expected_cash),
    })
    return shift


def build_z_report(shift):
    """End-of-day style summary for print/share from an already-closed (or open) shift."""
    sales = list(shift.sales.select_related('cashier').prefetch_related('payments', 'lines'))
    returns = list(shift.returns.all())
    payments = {}
    for sale in sales:
        for payment in sale.payments.all():
            payments[payment.method] = payments.get(payment.method, Decimal(0)) + payment.amount
    sales_total = sum((sale.total for sale in sales), Decimal(0))
    returns_total = sum((row.total for row in returns), Decimal(0))
    expected = shift.expected_cash if shift.expected_cash is not None else expected_cash(shift)
    counted = shift.counted_cash
    difference = None if counted is None else counted - expected
    return {
        'shift_id': shift.pk,
        'terminal': shift.terminal.name,
        'opened_at': shift.opened_at,
        'closed_at': shift.closed_at,
        'opened_by': shift.opened_by.full_name,
        'opening_cash': str(shift.opening_cash),
        'expected_cash': str(expected),
        'counted_cash': None if counted is None else str(counted),
        'difference': None if difference is None else str(difference),
        'sales_count': len(sales),
        'sales_total': str(sales_total),
        'returns_count': len(returns),
        'returns_total': str(returns_total),
        'net_sales': str(sales_total - returns_total),
        'payments': {method: str(amount) for method, amount in sorted(payments.items())},
        'invoices': [
            {
                'invoice_no': sale.invoice_no,
                'total': str(sale.total),
                'cashier': sale.cashier.full_name,
                'created_at': sale.created_at,
            }
            for sale in sales
        ],
    }
