"""Numbers for the Home screen: one period, compared with the period just before it."""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, F, Min, Sum
from django.db.models.functions import Coalesce, ExtractHour, TruncDate
from django.utils import timezone

from customers.models import Customer, CustomerLedgerEntry
from finance.models import Expense
from finance.services.reports import MONEY, ZERO, _cost_of, _expiry_alerts, _heatmap_and_peak, _reorder_list, _sum
from inventory.models import StockLevel, default_branch
from sales.models import Payment, ReturnLine, Sale, SaleLine, SaleReturn, Shift, Terminal

PERIODS = {'today': 1, 'yesterday': 1, '7d': 7, '30d': 30}
BASKET_BUCKETS = (('1', 1, 1), ('2-3', 2, 3), ('4-6', 4, 6), ('7-10', 7, 10), ('11+', 11, None))
ATTENTION_LIMIT = 5
BUSY_WEEKS = 4


def period_range(period, today=None):
    """(start, end, previous_start, previous_end) for a period key; dates are inclusive."""
    today = today or timezone.localdate()
    days = PERIODS[period]
    end = today - timedelta(days=1) if period == 'yesterday' else today
    start = end - timedelta(days=days - 1)
    return start, end, start - timedelta(days=days), start - timedelta(days=1)


def _between(queryset, start, end, field='created_at__date'):
    return queryset.filter(**{f'{field}__gte': start, f'{field}__lte': end})


def _change(current, previous):
    """Percent change, or None when there is nothing to compare with."""
    if not previous:
        return None
    return round((Decimal(current) - Decimal(previous)) / Decimal(previous) * 100, 1)


def _money_block(start, end):
    sales = _between(Sale.objects.all(), start, end)
    returns = _between(SaleReturn.objects.all(), start, end)
    returned_cost = ReturnLine.objects.filter(sale_return__in=returns, restocked=True).annotate(
        cost=F('sale_line__unit_cost') * F('quantity'),
    )
    gross = _sum(sales, 'total')
    returned = _sum(returns, 'total')
    net_sales = gross - returned
    cost = _cost_of(SaleLine.objects.filter(sale__in=sales)) - _sum(returned_cost, 'cost')
    expenses = _sum(_between(Expense.objects.all(), start, end, 'date'), 'amount')
    bills = sales.count()
    return {
        'gross_sales': gross,
        'net_sales': net_sales,
        'net_profit': net_sales - cost - expenses,
        'bills': bills,
        'avg_bill': (gross / bills).quantize(Decimal('0.01')) if bills else ZERO,
        'returns_count': returns.count(),
        'returns_amount': returned,
    }


def _customers_block(start, end):
    sales = _between(Sale.objects.all(), start, end)
    identified = list(sales.exclude(customer_id=None).values_list('customer_id', flat=True).distinct())
    first_sale = dict(
        Sale.objects.filter(customer_id__in=identified).values_list('customer_id').annotate(first=Min('created_at__date'))
    )
    new = sum(1 for customer_id in identified if first_sale.get(customer_id) and first_sale[customer_id] >= start)
    walk_in = sales.filter(customer_id=None).count()
    return {
        'served': len(identified) + walk_in,
        'identified': len(identified),
        'returning': len(identified) - new,
        'new': new,
        'walk_in': walk_in,
    }


def _khata_block(start, end):
    owing = Customer.objects.filter(active=True, balance__gt=0)
    totals = owing.aggregate(outstanding=Coalesce(Sum('balance'), ZERO, output_field=MONEY), count=Count('id'))
    return {
        'outstanding': totals['outstanding'],
        'customers': totals['count'],
        'over_limit': owing.filter(balance__gt=F('credit_limit')).count(),
        'change': _sum(_between(CustomerLedgerEntry.objects.all(), start, end), 'delta'),
    }


def _trend(start, end, prev_start, today):
    """Cumulative sales by hour for a single day, otherwise sales per day; with the previous period alongside."""
    if start == end:
        def by_hour(day):
            rows = dict(
                Sale.objects.filter(created_at__date=day).annotate(hour=ExtractHour('created_at'))
                .values_list('hour').annotate(total=Sum('total'))
            )
            running, out = ZERO, []
            for hour in range(24):
                running += rows.get(hour, ZERO)
                out.append(running)
            return out

        current, previous = by_hour(start), by_hour(prev_start)
        now_hour = timezone.localtime().hour if start == today else 23
        return {
            'granularity': 'hour',
            'points': [
                {'label': hour, 'current': current[hour] if hour <= now_hour else None, 'previous': previous[hour]}
                for hour in range(24)
            ],
        }

    def by_day(first, days):
        rows = dict(
            _between(Sale.objects.all(), first, first + timedelta(days=days - 1))
            .annotate(day=TruncDate('created_at')).values_list('day').annotate(total=Sum('total'))
        )
        return [rows.get(first + timedelta(days=n), ZERO) for n in range(days)]

    days = (end - start).days + 1
    current, previous = by_day(start, days), by_day(prev_start, days)
    return {
        'granularity': 'day',
        'points': [
            {'label': (start + timedelta(days=n)).isoformat(), 'current': current[n], 'previous': previous[n]}
            for n in range(days)
        ],
    }


def _registers(today):
    open_shifts = {
        shift.terminal_id: shift
        for shift in Shift.objects.filter(closed_at__isnull=True).select_related('opened_by').annotate(
            bills=Count('sales'), takings=Coalesce(Sum('sales__total'), ZERO, output_field=MONEY),
        )
    }
    last_closed = {}
    for shift in (
        Shift.objects.filter(closed_at__date=today).select_related('closed_by')
        .annotate(bills=Count('sales'), takings=Coalesce(Sum('sales__total'), ZERO, output_field=MONEY))
        .order_by('terminal_id', '-closed_at')
    ):
        last_closed.setdefault(shift.terminal_id, shift)
    offline_today = dict(
        Sale.objects.filter(created_at__date=today, is_offline=True).values_list('terminal_id').annotate(n=Count('id'))
    )

    rows = []
    for terminal in Terminal.objects.filter(active=True).order_by('code'):
        shift = open_shifts.get(terminal.id)
        closed = last_closed.get(terminal.id)
        if shift:
            rows.append({
                'id': terminal.id, 'name': terminal.name, 'status': 'open',
                'cashier': shift.opened_by.full_name or shift.opened_by.email,
                'since': shift.opened_at, 'bills': shift.bills, 'sales_total': shift.takings,
                'offline_bills': offline_today.get(terminal.id, 0), 'difference': None,
            })
        elif closed:
            rows.append({
                'id': terminal.id, 'name': terminal.name, 'status': 'closed',
                'cashier': (closed.closed_by.full_name or closed.closed_by.email) if closed.closed_by else '',
                'since': closed.closed_at, 'bills': closed.bills, 'sales_total': closed.takings,
                'offline_bills': offline_today.get(terminal.id, 0),
                'difference': closed.counted_cash - closed.expected_cash,
            })
        else:
            rows.append({
                'id': terminal.id, 'name': terminal.name, 'status': 'idle', 'cashier': '', 'since': None,
                'bills': 0, 'sales_total': ZERO, 'offline_bills': 0, 'difference': None,
            })
    return rows


def _basket_sizes(sales):
    counts = sales.annotate(items=Count('lines')).values_list('items', flat=True)
    buckets = {label: 0 for label, _, _ in BASKET_BUCKETS}
    for items in counts:
        for label, low, high in BASKET_BUCKETS:
            if items >= low and (high is None or items <= high):
                buckets[label] += 1
                break
    return [{'label': label, 'count': count} for label, count in buckets.items()]


def _top_areas(sales, limit=4):
    rows = list(
        sales.exclude(customer_id=None).exclude(customer__area='')
        .values(area=F('customer__area')).annotate(bills=Count('id')).order_by('-bills')
    )
    total = sum(row['bills'] for row in rows)
    return [
        {'area': row['area'], 'bills': row['bills'], 'share': round(row['bills'] / total * 100, 1)}
        for row in rows[:limit]
    ] if total else []


def _categories(lines, limit=3):
    rows = list(
        lines.values(category=F('product__category__name')).annotate(revenue=Sum('line_total')).order_by('-revenue')
    )
    top = [{'category': row['category'], 'revenue': row['revenue']} for row in rows[:limit]]
    other = sum((row['revenue'] for row in rows[limit:]), ZERO)
    if other:
        top.append({'category': '', 'revenue': other})
    return top


def _attention(today, start, end):
    """Things an owner should act on, most urgent first. Kinds: reorder, expiring, short."""
    on_hand = dict(StockLevel.objects.filter(branch=default_branch()).values_list('product_id', 'quantity'))
    items = []
    for row in _reorder_list(today, on_hand)[:ATTENTION_LIMIT]:
        items.append({
            'kind': 'reorder', 'product_id': row['id'], 'title': row['name'],
            'stock': row['stock'], 'days_left': row['days_left'], 'supplier': row['supplier'],
        })
    for row in _expiry_alerts(today):
        if row['days_left'] > 7:
            break
        items.append({
            'kind': 'expiring', 'product_id': row['id'], 'title': row['name'],
            'stock': row['quantity'], 'days_left': row['days_left'],
        })
    for shift in (
        _between(Shift.objects.filter(closed_at__isnull=False), start, end, 'closed_at__date')
        .filter(counted_cash__lt=F('expected_cash')).select_related('terminal').order_by('-closed_at')[:ATTENTION_LIMIT]
    ):
        items.append({
            'kind': 'short', 'shift_id': shift.id, 'title': shift.terminal.name,
            'amount': shift.expected_cash - shift.counted_cash, 'closed_at': shift.closed_at,
        })
    return items


def overview(period):
    today = timezone.localdate()
    start, end, prev_start, prev_end = period_range(period, today)
    sales = _between(Sale.objects.all(), start, end)
    lines = SaleLine.objects.filter(sale__in=sales)

    current, previous = _money_block(start, end), _money_block(prev_start, prev_end)
    customers, previous_customers = _customers_block(start, end), _customers_block(prev_start, prev_end)

    payments = list(Payment.objects.filter(sale__in=sales).values('method').annotate(amount=Sum('amount')).order_by('-amount'))
    paid = sum((row['amount'] for row in payments), ZERO)
    busy_since = today - timedelta(days=BUSY_WEEKS * 7 - 1)
    heatmap, peak = _heatmap_and_peak(_between(Sale.objects.all(), busy_since, today))

    return {
        'period': period,
        'from': start,
        'to': end,
        'compare_from': prev_start,
        'compare_to': prev_end,
        'money': current,
        'previous_money': previous,
        'changes': {
            'gross_sales': _change(current['gross_sales'], previous['gross_sales']),
            'net_profit': _change(current['net_profit'], previous['net_profit']),
            'bills': current['bills'] - previous['bills'],
            'customers': customers['served'] - previous_customers['served'],
        },
        'margin_percent': round(current['net_profit'] / current['net_sales'] * 100, 1) if current['net_sales'] else None,
        'customers': customers,
        'khata': _khata_block(start, end),
        'trend': _trend(start, end, prev_start, today),
        'registers': _registers(today),
        'payment_mix': [
            {'method': row['method'], 'amount': row['amount'], 'share': round(row['amount'] / paid * 100, 1)}
            for row in payments
        ] if paid else [],
        'basket_sizes': _basket_sizes(sales),
        'top_areas': _top_areas(sales),
        'busy_times': {'heatmap': heatmap, 'peak': peak, 'weeks': BUSY_WEEKS},
        'top_products': list(lines.values('name').annotate(units=Sum('quantity'), revenue=Sum('line_total')).order_by('-revenue')[:5]),
        'categories': _categories(lines),
        'attention': _attention(today, start, end),
    }


def orders_summary(queryset, start, end):
    """KPIs above the Orders table for an already-filtered sale queryset, against the same-length window before it."""
    days = (end - start).days + 1
    prev_start, prev_end = start - timedelta(days=days), start - timedelta(days=1)

    def block(qs):
        totals = qs.aggregate(count=Count('id'), revenue=Coalesce(Sum('total'), ZERO, output_field=MONEY))
        avg = (totals['revenue'] / totals['count']).quantize(Decimal('0.01')) if totals['count'] else ZERO
        return totals['count'], totals['revenue'], avg

    count, revenue, avg = block(_between(queryset, start, end))
    prev_count, _, prev_avg = block(_between(queryset, prev_start, prev_end))
    window = _between(queryset, start, end)
    returns = SaleReturn.objects.filter(sale__in=window)
    returned = _sum(returns, 'total')
    offline = window.filter(is_offline=True)
    return {
        'from': start,
        'to': end,
        'orders': count,
        'orders_change': count - prev_count,
        'revenue': revenue,
        'avg_bill': avg,
        'avg_bill_change': _change(avg, prev_avg),
        'returns_count': returns.count(),
        'returns_amount': returned,
        'returns_share': round(returned / revenue * 100, 1) if revenue else 0,
        'offline_count': offline.count(),
        'offline_terminals': sorted(set(offline.values_list('terminal__name', flat=True))),
    }

