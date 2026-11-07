"""Numbers for the Purchases page: this month's deliveries, drafts and cost changes."""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from purchases.models import GRN, GRNLine
from suppliers.models import Supplier

ZERO = Decimal(0)
# How far back to look for the delivery before this one when working out a cost change.
COST_LOOKBACK_DAYS = 365


def previous_costs(grns):
    """{grn_line_id: unit cost before that delivery} for the given GRNs (with lines prefetched)."""
    out = {}
    posted = [grn for grn in grns if grn.posted_at]
    for grn in grns:
        if not grn.posted_at:
            for line in grn.lines.all():
                out[line.pk] = line.product.cost
    if not posted:
        return out
    product_ids = {line.product_id for grn in posted for line in grn.lines.all()}
    earliest = min(grn.posted_at for grn in posted) - timedelta(days=COST_LOOKBACK_DAYS)
    latest = max(grn.posted_at for grn in posted)
    history = {}
    for product_id, posted_at, cost in (
        GRNLine.objects.filter(
            product_id__in=product_ids, grn__posted_at__gte=earliest, grn__posted_at__lt=latest,
        ).exclude(grn__posted_at=None).order_by('grn__posted_at').values_list('product_id', 'grn__posted_at', 'unit_cost')
    ):
        history.setdefault(product_id, []).append((posted_at, cost))
    for grn in posted:
        for line in grn.lines.all():
            earlier = [cost for posted_at, cost in history.get(line.product_id, []) if posted_at < grn.posted_at]
            out[line.pk] = earlier[-1] if earlier else None
    return out


def purchases_summary():
    today = timezone.localdate()
    month_start = today.replace(day=1)
    month = GRN.objects.filter(status=GRN.Status.POSTED, date__gte=month_start, date__lte=today)
    drafts = GRN.objects.filter(status=GRN.Status.DRAFT)
    month_totals = month.aggregate(total=Coalesce(Sum('total'), ZERO), count=Count('id'))
    draft_totals = drafts.aggregate(total=Coalesce(Sum('total'), ZERO), count=Count('id'))

    up = down = 0
    month_grns = list(month.prefetch_related('lines__product'))
    costs = previous_costs(month_grns)
    for grn in month_grns:
        for line in grn.lines.all():
            before = costs.get(line.pk)
            if before is None or before == line.unit_cost:
                continue
            if line.unit_cost > before:
                up += 1
            else:
                down += 1
    owed = Supplier.objects.filter(credit_balance__gt=0).aggregate(total=Coalesce(Sum('credit_balance'), ZERO), count=Count('id'))
    return {
        'month_total': month_totals['total'],
        'month_deliveries': month_totals['count'],
        'drafts': draft_totals['count'],
        'drafts_total': draft_totals['total'],
        'cost_changes': up + down,
        'cost_up': up,
        'cost_down': down,
        'owed_total': owed['total'],
        'suppliers_owed': owed['count'],
    }
