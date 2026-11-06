import math
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Max, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from audit.models import AuditLog
from customers.models import Customer
from finance.models import Expense
from inventory.models import Batch, Product, StockLevel, default_branch
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
    return {
        'from': start,
        'to': end,
        'invoices': sales.count(),
        'gross_sales': gross_sales,
        'returns': returned,
        'discounts': _sum(sales, 'discount'),
        'net_sales': net_sales,
        'cost_of_goods': cost_of_goods,
        'gross_profit': gross_profit,
        'gross_margin_percent': round(gross_profit / net_sales * 100, 1) if net_sales else 0,
        'expenses': total_expenses,
        'net_profit': gross_profit - total_expenses,
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


def insights():
    today = timezone.localdate()
    on_hand = dict(StockLevel.objects.filter(branch=default_branch()).values_list('product_id', 'quantity'))
    return {
        'reorder': _reorder_list(today, on_hand),
        'expiry': _expiry_alerts(today),
        'dead_stock': _dead_stock(today, on_hand),
        'staff': _staff_review(today),
    }
