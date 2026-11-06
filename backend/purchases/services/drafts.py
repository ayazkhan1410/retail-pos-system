from decimal import Decimal

from purchases.models import GRNLine, PurchaseReturnLine
from purchases.services.posting import calculate


def save_grn_draft(grn, values):
    """Persist a draft GRN header + lines and recalculate totals."""
    lines = values.pop('lines')
    result = calculate(values, lines)
    for field, value in values.items():
        setattr(grn, field, value)
    grn.subtotal = result['subtotal']
    grn.total = result['total']
    grn.save()
    grn.lines.all().delete()
    GRNLine.objects.bulk_create([
        GRNLine(grn=grn, line_total=computed['line_total'], unit_cost=computed['unit_cost'], margin_percent=computed['margin_percent'], **line)
        for line, computed in zip(lines, result['lines'], strict=True)
    ])
    return grn


def save_purchase_return_draft(row, values):
    """Persist a draft purchase return header + lines."""
    lines = values.pop('lines')
    for field, value in values.items():
        setattr(row, field, value)
    row.total = sum((line['quantity'] * line['rate'] for line in lines), Decimal(0))
    row.total = Decimal(row.total).quantize(Decimal('0.01'))
    row.save()
    row.lines.all().delete()
    PurchaseReturnLine.objects.bulk_create([
        PurchaseReturnLine(
            purchase_return=row,
            product=line['product'],
            quantity=line['quantity'],
            rate=line['rate'],
            line_total=(line['quantity'] * line['rate']).quantize(Decimal('0.01')),
        )
        for line in lines
    ])
    return row
