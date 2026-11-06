from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from audit.models import log_event
from inventory.models import CENT, Branch, Product, StockMovement
from inventory.services import add_batch, move_stock
from purchases.models import GRN
from suppliers.models import PaymentType, SupplierLedgerEntry, post_supplier_entry


def _money(value):
    return Decimal(value).quantize(CENT, ROUND_HALF_UP)


def calculate(header, lines):
    """All GRN arithmetic. `lines` are dicts with product, qty, free, rate, disc, disc_percent, freight, retail.

    Bill-level amounts are shared across lines by value when "disperse" is on, so unit cost reflects
    what the goods really cost. The bill total is the same either way.
    """
    nets = []
    for line in lines:
        gross = line['qty'] * line['rate']
        net = gross - line.get('disc', 0) - gross * line.get('disc_percent', 0) / 100 + line.get('freight', 0)
        if net < 0:
            raise ValidationError({'detail': f"{line['product'].name}: discount is larger than the line."})
        nets.append(net)
    subtotal = sum(nets, Decimal(0))
    bill_discount = subtotal * header.get('disc_percent', 0) / 100 + header.get('flat_disc', 0)
    if bill_discount > subtotal:
        raise ValidationError({'detail': 'Discount is larger than the bill.'})
    taxable = subtotal - bill_discount
    tax = taxable * header.get('sales_tax_percent', 0) / 100
    freight = header.get('freight', 0)
    total = taxable + freight + header.get('expense', 0) + tax

    shared = Decimal(0)
    if header.get('disperse_discount', True):
        shared -= bill_discount
    if header.get('disperse_freight', False):
        shared += freight
    if header.get('disperse_tax', False):
        shared += tax

    results = []
    for line, net in zip(lines, nets):
        units = line['qty'] + line.get('free', 0)
        loaded = net + (shared * net / subtotal if subtotal else 0)
        cost = _money(loaded / units)
        retail = line.get('retail', 0)
        product = line['product']
        warnings = []
        if retail and cost >= retail:
            warnings.append('below_cost')
        if product.cost and cost > product.cost:
            warnings.append('cost_up')
        results.append({
            'line_total': _money(net),
            'unit_cost': cost,
            'margin_percent': _money((retail - cost) / retail * 100) if retail else Decimal(0),
            'previous_cost': product.cost,
            'warnings': warnings,
        })
    return {'subtotal': _money(subtotal), 'discount': _money(bill_discount), 'tax': _money(tax), 'total': _money(total), 'lines': results}


@transaction.atomic
def post_grn(grn_id, user):
    """Receives the goods: adds stock and batches, updates cost and retail, and charges the supplier's ledger."""
    grn = GRN.objects.select_for_update().filter(pk=grn_id).first()
    if not grn or grn.status != GRN.Status.DRAFT:
        raise ValidationError({'detail': 'This GRN has already been posted.'})
    lines = list(grn.lines.select_related('product'))
    if not lines:
        raise ValidationError({'detail': 'Add at least one line.'})

    Branch.objects.select_for_update().get(pk=grn.branch_id)  # Serialises numbering: no gaps, no duplicates.
    sequence = GRN.objects.filter(status=GRN.Status.POSTED).count() + 1
    grn.number = f'GRN-{sequence:06d}'
    for line in sorted(lines, key=lambda item: item.product_id):
        product = Product.objects.select_for_update().get(pk=line.product_id)
        units = line.qty + line.free
        move_stock(product, grn.branch, units, StockMovement.Reason.PURCHASE, user, grn.number)
        if line.expiry_date:
            add_batch(product, grn.branch, units, line.expiry_date)
            product.track_expiry = True
        changes = {}
        if product.costing_method == Product.Costing.RECENT and product.cost != line.unit_cost:
            changes['cost'] = [str(product.cost), str(line.unit_cost)]
            product.cost = line.unit_cost
        if line.retail and product.price != line.retail:
            changes['price'] = [str(product.price), str(line.retail)]
            product.price = line.retail
        product.save(update_fields=['cost', 'price', 'track_expiry', 'updated_at'])
        if changes:
            log_event(user, 'product_updated', product.name, {**changes, 'grn': grn.number})

    if grn.payment_type == PaymentType.CREDIT:
        post_supplier_entry(grn.supplier_id, grn.total, SupplierLedgerEntry.Kind.PURCHASE, user, reference=grn.number)
    grn.status = GRN.Status.POSTED
    grn.posted_by = user
    grn.posted_at = timezone.now()
    grn.save()
    log_event(user, 'grn_posted', grn.number, {'supplier': grn.supplier.name, 'total': str(grn.total)})
    return grn
