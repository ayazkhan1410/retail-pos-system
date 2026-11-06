from decimal import ROUND_HALF_UP, Decimal

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from audit.models import log_event
from inventory.models import CENT, Product, StockMovement
from inventory.services import move_stock
from sales.models import Payment, Sale, SaleLine, Shift, Terminal


def _money(value):
    return value.quantize(CENT, ROUND_HALF_UP)


def _reject(message):
    raise ValidationError({'detail': message})


def create_sale(user, data):
    """Posts a sale once. Returns (sale, created); a repeat client_uuid returns the first result."""
    existing = Sale.objects.filter(client_uuid=data['client_uuid']).first()
    if existing:
        return existing, False
    try:
        return _post_sale(user, data), True
    except IntegrityError:
        # Two identical requests raced: the loser's transaction rolled back, so answer with the winner.
        existing = Sale.objects.filter(client_uuid=data['client_uuid']).first()
        if existing:
            return existing, False
        raise


@transaction.atomic
def _post_sale(user, data):
    if data['discount'] and not user.can('pos.discount'):
        raise PermissionDenied('You are not allowed to give a bill discount.')

    # The lock also keeps invoice numbers gap-free per terminal.
    terminal = Terminal.objects.select_for_update().select_related('branch').get(pk=data['terminal'].pk)
    shift = Shift.objects.filter(terminal=terminal, closed_at__isnull=True).first()
    if not shift:
        _reject(f'{terminal.name} has no open shift.')

    # Ordered by id so two tills selling the same items can't deadlock on stock rows.
    requested = sorted(data['lines'], key=lambda line: line['product'].pk)
    product_ids = [line['product'].pk for line in requested]
    if len(set(product_ids)) != len(product_ids):
        _reject('The same product appears on two lines.')
    products = Product.objects.in_bulk(product_ids)

    rows = []
    for line in requested:
        product = products[line['product'].pk]
        quantity = line['quantity']
        if not product.active:
            _reject(f'{product.name} is no longer on sale.')
        if product.is_expired:
            _reject(f'{product.name} has expired and cannot be sold.')
        if not product.qty_decimal and quantity != quantity.to_integral_value():
            _reject(f'{product.name} must be sold in whole units.')
        rows.append((product, quantity, product.sale_price(), _money(product.sale_price() * quantity)))

    subtotal = sum((row[3] for row in rows), Decimal(0))
    if data['discount'] > subtotal:
        _reject('Discount is larger than the bill.')
    total = subtotal - data['discount']

    paid = sum((payment['amount'] for payment in data['payments']), Decimal(0))
    cash = sum((p['amount'] for p in data['payments'] if p['method'] == Payment.Method.CASH), Decimal(0))
    if paid < total:
        _reject('Payment is less than the bill total.')
    change_due = paid - total
    if change_due > cash:
        _reject('Only cash can be overpaid.')

    terminal.last_invoice_seq += 1
    terminal.save(update_fields=['last_invoice_seq'])
    sale = Sale.objects.create(
        client_uuid=data['client_uuid'],
        invoice_no=f'{terminal.branch.code}-{terminal.code}-{terminal.last_invoice_seq:06d}',
        branch=terminal.branch,
        terminal=terminal,
        shift=shift,
        cashier=user,
        subtotal=subtotal,
        discount=data['discount'],
        tax=0,
        total=total,
        change_due=change_due,
    )

    tax_total = Decimal(0)
    discount_left = data['discount']
    for index, (product, quantity, unit_price, gross) in enumerate(rows):
        # The bill discount is spread across lines so tax is worked out on what was really charged.
        is_last = index == len(rows) - 1
        share = discount_left if is_last else (_money(data['discount'] * gross / subtotal) if subtotal else Decimal(0))
        share = min(share, discount_left)
        discount_left -= share
        line_total = gross - share
        # Shelf prices include tax, so tax is the part of the price above the pre-tax amount.
        rate = product.sales_tax_percent
        tax_amount = _money(line_total * rate / (100 + rate))
        tax_total += tax_amount
        SaleLine.objects.create(
            sale=sale,
            product=product,
            name=product.name,
            barcode=product.barcode,
            pct_code=product.pct_code,
            quantity=quantity,
            unit_price=unit_price,
            unit_cost=product.cost,
            discount=share,
            tax_rate=rate,
            tax_amount=tax_amount,
            line_total=line_total,
        )
        # Stock may go negative: shelf counts are often wrong and the customer is holding the item.
        move_stock(product, terminal.branch, -quantity, StockMovement.Reason.SALE, user, sale.invoice_no)

    Sale.objects.filter(pk=sale.pk).update(tax=tax_total)
    sale.tax = tax_total

    Payment.objects.bulk_create([
        Payment(sale=sale, method=p['method'], amount=p['amount'], reference=p.get('reference', ''))
        for p in data['payments']
    ])
    if data['discount']:
        log_event(user, 'sale_discount', sale.invoice_no, {'discount': str(data['discount']), 'total': str(total)})
    return sale


def expected_cash(shift):
    cash_in = Payment.objects.filter(sale__shift=shift, method=Payment.Method.CASH).aggregate(v=Sum('amount'))['v'] or 0
    change = shift.sales.aggregate(v=Sum('change_due'))['v'] or 0
    return shift.opening_cash + cash_in - change


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
