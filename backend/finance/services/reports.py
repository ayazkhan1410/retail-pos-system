import math
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Max, Min, Sum
from django.db.models.functions import Coalesce, ExtractHour, ExtractWeekDay, TruncDate
from django.utils import timezone

from audit.models import AuditLog
from customers.models import Customer, CustomerLedgerEntry
from finance.models import Expense
from inventory.models import Batch, Product, StockLevel, StockMovement, default_branch
from sales.models import Payment, ReturnLine, Sale, SaleLine, SaleReturn, Shift
from suppliers.models import Supplier

ZERO = Decimal(0)
MONEY = DecimalField(max_digits=20, decimal_places=2)
REORDER_WINDOW_DAYS = 30
SAFETY_DAYS = 7
DEFAULT_LEAD_DAYS = 3
DEAD_STOCK_DAYS = 60
EXPIRY_ALERT_DAYS = 30


def _sum(queryset, field):
    return queryset.aggregate(v=Coalesce(Sum(field), ZERO, output_field=MONEY))['v']


def _cost_of(lines):
    return _sum(lines.annotate(cost=ExpressionWrapper(F('unit_cost') * F('quantity'), output_field=MONEY)), 'cost')


def financial_report(start, end):
    """Profit and loss for a date range, net of returns. Returned goods only reverse their cost if they went back on the shelf."""
    sales = Sale.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    lines = SaleLine.objects.filter(sale__in=sales)
    returns = SaleReturn.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    returned_lines = ReturnLine.objects.filter(sale_return__in=returns, restocked=True).annotate(
        cost=ExpressionWrapper(F('sale_line__unit_cost') * F('quantity'), output_field=MONEY),
    )
    expenses = Expense.objects.filter(date__gte=start, date__lte=end)

    gross_sales = _sum(sales, 'total')
    returned = _sum(returns, 'total')
    net_sales = gross_sales - returned
    cost_of_goods = _cost_of(lines) - _sum(returned_lines, 'cost')
    gross_profit = net_sales - cost_of_goods
    total_expenses = _sum(expenses, 'amount')

    stock_value = StockLevel.objects.filter(branch=default_branch(), quantity__gt=0).annotate(
        value=ExpressionWrapper(F('quantity') * F('product__cost'), output_field=MONEY),
    )
    written_off = _written_off(start, end)
    days = (end - start).days + 1
    previous = _net_profit(start - timedelta(days=days), start - timedelta(days=1))
    net_profit = gross_profit - total_expenses
    return {
        'from': start,
        'to': end,
        'invoices': sales.count(),
        # Before bill discounts, so gross - returns - discounts = net_sales.
        'gross_before_discounts': _sum(sales, 'subtotal'),
        'stock_written_off': written_off,
        'net_profit_after_write_offs': net_profit - written_off,
        'previous_net_profit_after_write_offs': previous,
        'margin_by_category': _margin_by_category(lines),
        'gross_sales': gross_sales,
        'returns': returned,
        'discounts': _sum(sales, 'discount'),
        'net_sales': net_sales,
        'cost_of_goods': cost_of_goods,
        'gross_profit': gross_profit,
        'gross_margin_percent': round(gross_profit / net_sales * 100, 1) if net_sales else 0,
        'expenses': total_expenses,
        'net_profit': net_profit,
        'tax_collected': _sum(sales, 'tax') - _sum(returns, 'tax'),
        'expenses_by_category': list(expenses.values('category').annotate(amount=Sum('amount')).order_by('-amount')),
        'payments': list(Payment.objects.filter(sale__in=sales).values('method').annotate(amount=Sum('amount')).order_by('-amount')),
        'by_category': list(lines.values(category=F('product__category__name')).annotate(revenue=Sum('line_total')).order_by('-revenue')),
        'by_cashier': list(sales.values(name=F('cashier__full_name')).annotate(revenue=Sum('total'), invoices=Count('id')).order_by('-revenue')),
        'top_products': list(lines.values('name').annotate(units=Sum('quantity'), revenue=Sum('line_total')).order_by('-revenue')[:10]),
        'stock_value': _sum(stock_value, 'value'),
        'supplier_payable': _sum(Supplier.objects.all(), 'credit_balance'),
        'customer_receivable': _sum(Customer.objects.all(), 'balance'),
    }


def _written_off(start, end):
    """Damaged and expired stock taken off the shelf, valued at the product's current cost (no cost history per movement)."""
    rows = StockMovement.objects.filter(
        created_at__date__gte=start, created_at__date__lte=end, delta__lt=0,
        reason__in=[StockMovement.Reason.DAMAGE, StockMovement.Reason.EXPIRED],
    ).annotate(value=ExpressionWrapper(-F('delta') * F('product__cost'), output_field=MONEY))
    return _sum(rows, 'value')


def _net_profit(start, end):
    """Net profit after expenses and write-offs, for comparing one period with another."""
    sales = Sale.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    returns = SaleReturn.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    returned_cost = ReturnLine.objects.filter(sale_return__in=returns, restocked=True).annotate(
        cost=ExpressionWrapper(F('sale_line__unit_cost') * F('quantity'), output_field=MONEY),
    )
    net_sales = _sum(sales, 'total') - _sum(returns, 'total')
    cost = _cost_of(SaleLine.objects.filter(sale__in=sales)) - _sum(returned_cost, 'cost')
    expenses = _sum(Expense.objects.filter(date__gte=start, date__lte=end), 'amount')
    return net_sales - cost - expenses - _written_off(start, end)


def _margin_by_category(lines):
    """Net sales and gross margin per category. Returns are not split by category, so this is before returns."""
    rows = lines.values(category=F('product__category__name')).annotate(
        revenue=Coalesce(Sum('line_total'), ZERO, output_field=MONEY),
        cost=Coalesce(Sum(ExpressionWrapper(F('unit_cost') * F('quantity'), output_field=MONEY)), ZERO, output_field=MONEY),
    ).order_by('-revenue')
    return [
        {
            'category': row['category'],
            'net_sales': row['revenue'],
            'margin_percent': round((row['revenue'] - row['cost']) / row['revenue'] * 100, 1) if row['revenue'] else 0,
        }
        for row in rows
    ]


def trend(months):
    """Net sales and net profit per calendar month, oldest first, ending with the current month."""
    today = timezone.localdate()
    first = today.replace(day=1)
    for _ in range(months - 1):
        first = (first - timedelta(days=1)).replace(day=1)
    out = []
    while first <= today:
        last = min((first + timedelta(days=32)).replace(day=1) - timedelta(days=1), today)
        sales = Sale.objects.filter(created_at__date__gte=first, created_at__date__lte=last)
        returns = SaleReturn.objects.filter(created_at__date__gte=first, created_at__date__lte=last)
        out.append({
            'month': first.isoformat(),
            'net_sales': _sum(sales, 'total') - _sum(returns, 'total'),
            'net_profit': _net_profit(first, last),
        })
        first = last + timedelta(days=1)
    return out


SECTIONS = ('sales', 'stock', 'tax', 'cashiers', 'khata')
KHATA_BUCKETS = ((0, 30), (31, 60), (61, 90), (91, None))
KHATA_ROW_LIMIT = 500


def _sales_section(start, end):
    sales = Sale.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    returns = SaleReturn.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    by_day = {
        row['day']: row for row in sales.annotate(day=TruncDate('created_at')).values('day').annotate(
            bills=Count('id'), gross=Coalesce(Sum('total'), ZERO, output_field=MONEY),
            discounts=Coalesce(Sum('discount'), ZERO, output_field=MONEY),
        )
    }
    returned = dict(returns.annotate(day=TruncDate('created_at')).values_list('day').annotate(v=Sum('total')))
    days, cursor = [], start
    while cursor <= end:
        row = by_day.get(cursor, {'bills': 0, 'gross': ZERO, 'discounts': ZERO})
        back = returned.get(cursor, ZERO)
        days.append({
            'day': cursor.isoformat(), 'bills': row['bills'], 'gross_sales': row['gross'], 'discounts': row['discounts'],
            'returns': back, 'net_sales': row['gross'] - back,
            'avg_bill': (row['gross'] / row['bills']).quantize(Decimal('0.01')) if row['bills'] else ZERO,
        })
        cursor += timedelta(days=1)
    lines = SaleLine.objects.filter(sale__in=sales)
    return {
        'days': days,
        'payments': list(Payment.objects.filter(sale__in=sales).values('method').annotate(amount=Sum('amount')).order_by('-amount')),
        'top_products': list(lines.values('name').annotate(units=Sum('quantity'), revenue=Sum('line_total')).order_by('-revenue')[:20]),
    }


def _stock_section():
    """What is on the shelf now, by category, at cost and at shelf price. Not date-ranged."""
    rows = StockLevel.objects.filter(branch=default_branch(), quantity__gt=0, product__active=True).values(
        category=F('product__category__name'),
    ).annotate(
        products=Count('product', distinct=True),
        units=Sum('quantity'),
        cost_value=Coalesce(Sum(ExpressionWrapper(F('quantity') * F('product__cost'), output_field=MONEY)), ZERO, output_field=MONEY),
        retail_value=Coalesce(Sum(ExpressionWrapper(F('quantity') * F('product__price'), output_field=MONEY)), ZERO, output_field=MONEY),
    ).order_by('-cost_value')
    rows = list(rows)
    return {
        'categories': rows,
        'cost_value': sum((row['cost_value'] for row in rows), ZERO),
        'retail_value': sum((row['retail_value'] for row in rows), ZERO),
        'units': sum((row['units'] for row in rows), ZERO),
    }


def _tax_section(start, end):
    lines = SaleLine.objects.filter(sale__created_at__date__gte=start, sale__created_at__date__lte=end)
    returns = SaleReturn.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    rates = list(lines.values('tax_rate').annotate(
        taxable=Coalesce(Sum('line_total'), ZERO, output_field=MONEY),
        tax=Coalesce(Sum('tax_amount'), ZERO, output_field=MONEY),
    ).order_by('tax_rate'))
    collected = sum((row['tax'] for row in rates), ZERO)
    returned = _sum(returns, 'tax')
    return {'rates': rates, 'collected': collected, 'returned': returned, 'net_tax': collected - returned}


def _cashiers_section(start, end):
    people = {}

    def person(user_id, name):
        return people.setdefault(user_id, {
            'id': user_id, 'name': name or '', 'bills': 0, 'sales': ZERO, 'discounts': ZERO,
            'returns': ZERO, 'cash_difference': ZERO, 'shifts': 0,
        })

    sales = Sale.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    for row in sales.values('cashier_id', name=F('cashier__full_name')).annotate(
        bills=Count('id'), sales=Sum('total'), discounts=Sum('discount'),
    ):
        person(row['cashier_id'], row['name']).update(bills=row['bills'], sales=row['sales'], discounts=row['discounts'])
    for row in SaleReturn.objects.filter(created_at__date__gte=start, created_at__date__lte=end).values(
        'user_id', name=F('user__full_name'),
    ).annotate(total=Sum('total')):
        person(row['user_id'], row['name'])['returns'] = row['total']
    for shift in Shift.objects.filter(closed_at__date__gte=start, closed_at__date__lte=end).select_related('closed_by'):
        row = person(shift.closed_by_id, shift.closed_by.full_name if shift.closed_by else '')
        row['cash_difference'] += shift.counted_cash - shift.expected_cash
        row['shifts'] += 1
    rows = sorted(people.values(), key=lambda row: -row['sales'])
    for row in rows:
        row['avg_bill'] = (row['sales'] / row['bills']).quantize(Decimal('0.01')) if row['bills'] else ZERO
    return {'cashiers': rows}


def _khata_section():
    """Who owes what and for how long. Payments clear the oldest charges first, so what is left is the newest."""
    today = timezone.localdate()
    owing = list(Customer.objects.filter(active=True, balance__gt=0).order_by('-balance')[:KHATA_ROW_LIMIT])
    charges = {}
    for entry in CustomerLedgerEntry.objects.filter(customer__in=owing, delta__gt=0).order_by('customer_id', '-created_at'):
        charges.setdefault(entry.customer_id, []).append(entry)
    labels = [f'{low}-{high}' if high else f'{low}+' for low, high in KHATA_BUCKETS]
    totals = dict.fromkeys(labels, ZERO)
    rows = []
    for customer in owing:
        left = customer.balance
        buckets = dict.fromkeys(labels, ZERO)
        oldest = None
        for entry in charges.get(customer.id, []):
            if left <= 0:
                break
            part = min(entry.delta, left)
            left -= part
            age = (today - timezone.localtime(entry.created_at).date()).days
            oldest = age
            for (low, high), label in zip(KHATA_BUCKETS, labels, strict=True):
                if age >= low and (high is None or age <= high):
                    buckets[label] += part
                    break
        if left > 0:
            # Balance older than the ledger (imported opening balance with no dated charge).
            buckets[labels[-1]] += left
        for label in labels:
            totals[label] += buckets[label]
        rows.append({
            'id': customer.id, 'name': customer.name, 'phone': customer.phone or '', 'balance': customer.balance,
            'credit_limit': customer.credit_limit, 'oldest_days': oldest, 'buckets': buckets,
        })
    return {'buckets': labels, 'totals': totals, 'customers': rows, 'truncated': len(owing) == KHATA_ROW_LIMIT}


def report_section(section, start, end):
    if section == 'sales':
        return _sales_section(start, end)
    if section == 'stock':
        return _stock_section()
    if section == 'tax':
        return _tax_section(start, end)
    if section == 'cashiers':
        return _cashiers_section(start, end)
    return _khata_section()


def expenses_summary(first):
    """The Expenses page header for one calendar month."""
    today = timezone.localdate()
    last = min((first + timedelta(days=32)).replace(day=1) - timedelta(days=1), today)
    previous_first = (first - timedelta(days=1)).replace(day=1)
    month = Expense.objects.filter(date__gte=first, date__lte=last)
    total = _sum(month, 'amount')
    previous = _sum(Expense.objects.filter(date__gte=previous_first, date__lt=first), 'amount')
    sales = Sale.objects.filter(created_at__date__gte=first, created_at__date__lte=last)
    returns = SaleReturn.objects.filter(created_at__date__gte=first, created_at__date__lte=last)
    net_sales = _sum(sales, 'total') - _sum(returns, 'total')
    by_category = list(month.values('category').annotate(amount=Sum('amount')).order_by('-amount'))
    for row in by_category:
        row['share'] = round(row['amount'] / total * 100, 1) if total else 0
    return {
        'month': first.isoformat(),
        'total': total,
        'previous_total': previous,
        'change': round((total - previous) / previous * 100, 1) if previous else None,
        'share_of_sales': round(total / net_sales * 100, 1) if net_sales else None,
        'from_drawers': _sum(month.exclude(shift=None), 'amount'),
        'by_category': by_category,
    }


def _reorder_list(today, on_hand):
    since = today - timedelta(days=REORDER_WINDOW_DAYS)
    sold = dict(
        SaleLine.objects.filter(sale__created_at__date__gte=since)
        .values_list('product_id')
        .annotate(units=Sum('quantity'))
    )
    suggestions = []
    for product in Product.objects.filter(active=True, unorderable=False).select_related('supplier'):
        stock = on_hand.get(product.pk, ZERO)
        # shortcut: averages over the whole window, so items that were out of stock look slower; use daily stock history once it has built up.
        days_listed = max(min((today - product.created_at.date()).days, REORDER_WINDOW_DAYS), 1)
        daily = sold.get(product.pk, ZERO) / days_listed
        lead = product.lead_time_days or DEFAULT_LEAD_DAYS
        reorder_point = max(daily * (lead + SAFETY_DAYS), product.min_level or product.threshold)
        if stock > reorder_point:
            continue
        target = product.max_level or daily * (lead + SAFETY_DAYS + REORDER_WINDOW_DAYS) or reorder_point * 2
        quantity = max(Decimal(math.ceil(target - stock)), Decimal(1))
        if product.box_pcs:
            quantity = Decimal(math.ceil(quantity / product.box_pcs) * product.box_pcs)
        suggestions.append({
            'id': product.pk,
            'name': product.name,
            'supplier': product.supplier.name if product.supplier else '',
            'stock': stock,
            'daily_sales': round(daily, 2),
            'days_left': max(round(stock / daily, 1), ZERO) if daily else None,
            'order_quantity': quantity,
            'order_cost': quantity * product.cost,
        })
    return sorted(suggestions, key=lambda row: (row['days_left'] is None, row['days_left'] or 0))


def _expiry_alerts(today):
    alerts = []
    limit = today + timedelta(days=EXPIRY_ALERT_DAYS)
    batches = Batch.objects.filter(quantity__gt=0, expiry_date__lte=limit, product__active=True).select_related('product').order_by('expiry_date')
    for batch in batches[:100]:
        days = (batch.expiry_date - today).days
        # Simple starting points for the owner to overrule, not computed prices.
        markdown = None if days < 0 else 30 if days <= 7 else 10
        alerts.append({
            'id': batch.product_id,
            'name': batch.product.name,
            'quantity': batch.quantity,
            'expiry_date': batch.expiry_date,
            'days_left': days,
            'value_at_cost': batch.quantity * batch.product.cost,
            'suggested_markdown': markdown,
        })
    return alerts


def _dead_stock(today, on_hand):
    cutoff = today - timedelta(days=DEAD_STOCK_DAYS)
    last_sold = dict(SaleLine.objects.values_list('product_id').annotate(last=Max('sale__created_at')))
    rows = []
    for product in Product.objects.filter(active=True, created_at__date__lte=cutoff):
        stock = on_hand.get(product.pk, ZERO)
        last = last_sold.get(product.pk)
        if stock > 0 and (not last or last.date() < cutoff):
            rows.append({
                'id': product.pk,
                'name': product.name,
                'stock': stock,
                'value_at_cost': stock * product.cost,
                'last_sold': last.date() if last else None,
            })
    return sorted(rows, key=lambda row: -row['value_at_cost'])[:50]


def _staff_review(today):
    """Patterns worth a look, per cashier. A flag is a prompt to check, never proof of wrongdoing."""
    since = today - timedelta(days=REORDER_WINDOW_DAYS)
    people = {}

    def person(name):
        return people.setdefault(name, {'name': name, 'sales': ZERO, 'invoices': 0, 'discounts': ZERO, 'returns': ZERO, 'cleared_carts': 0, 'cash_difference': ZERO})

    for row in Sale.objects.filter(created_at__date__gte=since).values(name=F('cashier__full_name')).annotate(sales=Sum('total'), invoices=Count('id'), discounts=Sum('discount')):
        person(row['name']).update(sales=row['sales'], invoices=row['invoices'], discounts=row['discounts'])
    for row in SaleReturn.objects.filter(created_at__date__gte=since).values(name=F('user__full_name')).annotate(total=Sum('total')):
        person(row['name'])['returns'] = row['total']
    for row in AuditLog.objects.filter(action='cart_cleared', created_at__date__gte=since).values(name=F('user__full_name')).annotate(total=Count('id')):
        person(row['name'])['cleared_carts'] = row['total']
    for shift in Shift.objects.filter(closed_at__date__gte=since).select_related('closed_by'):
        person(shift.closed_by.full_name)['cash_difference'] += shift.counted_cash - shift.expected_cash

    rows = list(people.values())
    total_sales = sum((row['sales'] for row in rows), ZERO)
    for row in rows:
        flags = []
        if total_sales and len(rows) > 1:
            def share(field):
                return sum((other[field] for other in rows), ZERO) / total_sales

            for field in ('discounts', 'returns'):
                if row['sales'] and row[field] / row['sales'] > 2 * share(field) and row[field] > 0:
                    flags.append(field)
        if row['cash_difference'] < 0:
            flags.append('cash_short')
        if row['cleared_carts'] >= 5:
            flags.append('cleared_carts')
        row['flags'] = flags
    return sorted(rows, key=lambda row: -len(row['flags']))


def _heatmap_and_peak(queryset):
    """Weekday x hour counts for any sale queryset (Mon=0 ... Sun=6)."""
    heat_rows = (
        queryset.annotate(weekday=ExtractWeekDay('created_at'), hour=ExtractHour('created_at'))
        .values('weekday', 'hour')
        .annotate(count=Count('id'))
    )
    heatmap = [[0 for _ in range(24)] for _ in range(7)]
    for row in heat_rows:
        wd = (int(row['weekday']) - 2) % 7
        heatmap[wd][int(row['hour'])] = row['count']
    peak = max(
        ((day, hour, heatmap[day][hour]) for day in range(7) for hour in range(24)),
        key=lambda item: item[2],
        default=(0, 0, 0),
    )
    weekday_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    return heatmap, {
        'weekday': weekday_names[peak[0]],
        'hour': peak[1],
        'count': peak[2],
    }


def _money_analytics(today, days=30):
    """Shop money picture from every bill — no customer names required."""
    start = today - timedelta(days=days - 1)
    sales = Sale.objects.filter(created_at__date__gte=start, created_at__date__lte=today)
    returns = SaleReturn.objects.filter(created_at__date__gte=start, created_at__date__lte=today)
    lines = SaleLine.objects.filter(sale__in=sales)
    returned_lines = ReturnLine.objects.filter(sale_return__in=returns, restocked=True).annotate(
        cost=ExpressionWrapper(F('sale_line__unit_cost') * F('quantity'), output_field=MONEY),
    )
    expenses = Expense.objects.filter(date__gte=start, date__lte=today)

    sales_daily = {
        row['day']: row
        for row in sales.annotate(day=TruncDate('created_at')).values('day').annotate(
            gross=Coalesce(Sum('total'), ZERO, output_field=MONEY),
            invoices=Count('id'),
        )
    }
    returns_daily = {
        row['day']: row['amount']
        for row in returns.annotate(day=TruncDate('created_at')).values('day').annotate(
            amount=Coalesce(Sum('total'), ZERO, output_field=MONEY),
        )
    }

    daily = []
    cursor = start
    while cursor <= today:
        row = sales_daily.get(cursor)
        gross = row['gross'] if row else ZERO
        invoices = row['invoices'] if row else 0
        returned = returns_daily.get(cursor, ZERO)
        daily.append({
            'day': cursor.isoformat(),
            'gross_sales': gross,
            'returns': returned,
            'net_sales': gross - returned,
            'invoices': invoices,
        })
        cursor += timedelta(days=1)

    gross_sales = _sum(sales, 'total')
    returned_total = _sum(returns, 'total')
    net_sales = gross_sales - returned_total
    cost_of_goods = _cost_of(lines) - _sum(returned_lines, 'cost')
    gross_profit = net_sales - cost_of_goods
    total_expenses = _sum(expenses, 'amount')
    invoice_count = sales.count()
    heatmap, peak = _heatmap_and_peak(sales)

    return {
        'window_days': days,
        'gross_sales': gross_sales,
        'returns': returned_total,
        'net_sales': net_sales,
        'cost_of_goods': cost_of_goods,
        'gross_profit': gross_profit,
        'gross_margin_percent': round(gross_profit / net_sales * 100, 1) if net_sales else 0,
        'expenses': total_expenses,
        'net_profit': gross_profit - total_expenses,
        'invoices': invoice_count,
        'avg_basket': (net_sales / invoice_count) if invoice_count else ZERO,
        'daily': daily,
        'payments': list(
            Payment.objects.filter(sale__in=sales).values('method').annotate(amount=Sum('amount')).order_by('-amount')
        ),
        'top_products': list(
            lines.values('name').annotate(units=Sum('quantity'), revenue=Sum('line_total')).order_by('-revenue')[:8]
        ),
        'heatmap': heatmap,
        'peak': peak,
    }


def _customer_analytics(today, days=90):
    """Customer visit patterns from identified (named) sales — no geography fields."""
    start = today - timedelta(days=days - 1)
    window = Sale.objects.filter(created_at__date__gte=start, created_at__date__lte=today)
    identified = window.exclude(customer_id=None)
    by_customer = list(
        identified.values('customer_id')
        .annotate(
            visits=Count('id'),
            spend=Coalesce(Sum('total'), ZERO, output_field=MONEY),
            first_sale=Min('created_at__date'),
            last_sale=Max('created_at__date'),
            name=Max('customer__name'),
        )
    )
    identified_count = len(by_customer)
    returning = [row for row in by_customer if row['visits'] >= 2]
    returning_rate = round((len(returning) / identified_count) * 100, 1) if identified_count else 0
    total_spend = sum((row['spend'] for row in by_customer), ZERO)
    avg_spend = (total_spend / identified_count) if identified_count else ZERO

    buckets = {'1': 0, '2-3': 0, '4-8': 0, '9-15': 0, '16+': 0}
    loyal, regular, new, at_risk = [], [], [], []
    for row in by_customer:
        visits = row['visits']
        if visits == 1:
            buckets['1'] += 1
        elif visits <= 3:
            buckets['2-3'] += 1
        elif visits <= 8:
            buckets['4-8'] += 1
        elif visits <= 15:
            buckets['9-15'] += 1
        else:
            buckets['16+'] += 1

        days_since = (today - row['last_sale']).days
        days_span = max(1, (row['last_sale'] - row['first_sale']).days)
        rate_per_month = visits / (days_span / 30)
        segment = {
            'id': row['customer_id'],
            'name': row['name'] or '',
            'visits': visits,
            'spend': row['spend'],
            'last_sale': row['last_sale'].isoformat(),
        }
        if days_since >= 30 and visits >= 1:
            at_risk.append(segment)
        elif row['first_sale'] >= today - timedelta(days=30) and visits <= 2:
            new.append(segment)
        elif rate_per_month >= 4 or visits >= 12:
            loyal.append(segment)
        else:
            regular.append(segment)

    heatmap, peak = _heatmap_and_peak(window)

    def _seg_summary(rows, label):
        return {
            'key': label,
            'count': len(rows),
            'revenue': sum((row['spend'] for row in rows), ZERO),
        }

    return {
        'window_days': days,
        'identified_customers': identified_count,
        'returning_rate': returning_rate,
        'avg_spend_per_customer': avg_spend,
        'at_risk_count': len(at_risk),
        'visit_buckets': [{'label': key, 'count': value} for key, value in buckets.items()],
        'segments': [
            _seg_summary(loyal, 'loyal'),
            _seg_summary(regular, 'regular'),
            _seg_summary(new, 'new'),
            _seg_summary(at_risk, 'at_risk'),
        ],
        'heatmap': heatmap,
        'peak': peak,
    }


def insights():
    today = timezone.localdate()
    on_hand = dict(StockLevel.objects.filter(branch=default_branch()).values_list('product_id', 'quantity'))
    return {
        'money': _money_analytics(today),
        'reorder': _reorder_list(today, on_hand),
        'expiry': _expiry_alerts(today),
        'dead_stock': _dead_stock(today, on_hand),
        'staff': _staff_review(today),
        'customers': _customer_analytics(today),
    }
