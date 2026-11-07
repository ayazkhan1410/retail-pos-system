"""The Analytics page: who the customers are, whether they come back, and when they shop."""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Min, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone

from customers.models import Customer
from customers.services import profiles
from finance.services.reports import MONEY, ZERO, _customer_analytics
from sales.models import Sale

COHORT_MONTHS = 5
AREA_ROWS = 4


def _month_start(day, back=0):
    for _ in range(back):
        day = (day.replace(day=1) - timedelta(days=1))
    return day.replace(day=1)


def _next_month(day):
    return (day + timedelta(days=32)).replace(day=1)


def _months_of(rows):
    """{customer_id: set(month_start_date)} from (customer_id, month) rows."""
    out = {}
    for customer_id, month in rows:
        month = timezone.localtime(month).date() if hasattr(month, 'hour') else month
        out.setdefault(customer_id, set()).add(month)
    return out


def _returning_by_month(today, months):
    """Per month: of the customers who bought, the % who had bought in an earlier month. This year and a year before."""
    first = _month_start(today, months - 1)
    year_ago = first.replace(year=first.year - 1)
    active = _months_of(
        Sale.objects.filter(created_at__date__gte=year_ago).exclude(customer_id=None)
        .annotate(month=TruncMonth('created_at')).values_list('customer_id', 'month').distinct()
    )
    first_ever = {
        customer_id: (timezone.localtime(value).date() if hasattr(value, 'hour') else value)
        for customer_id, value in Sale.objects.exclude(customer_id=None).values_list('customer_id')
        .annotate(first=Min('created_at'))
    }

    def rate(month):
        buyers = [customer_id for customer_id, seen in active.items() if month in seen]
        if not buyers:
            return None
        back = sum(1 for customer_id in buyers if first_ever[customer_id] < month)
        return round(back / len(buyers) * 100, 1)

    out, cursor = [], first
    while cursor <= today:
        out.append({'month': cursor.isoformat(), 'rate': rate(cursor), 'last_year': rate(cursor.replace(year=cursor.year - 1))})
        cursor = _next_month(cursor)
    return out


def _cohorts(today):
    """Rows: customers whose first bill was in that month. Columns: % of them buying N months later."""
    first = _month_start(today, COHORT_MONTHS - 1)
    starts = {
        customer_id: _month_start(timezone.localtime(value).date())
        for customer_id, value in Sale.objects.exclude(customer_id=None).values_list('customer_id')
        .annotate(first=Min('created_at'))
    }
    members = [customer_id for customer_id, month in starts.items() if month >= first]
    active = _months_of(
        Sale.objects.filter(customer_id__in=members).annotate(month=TruncMonth('created_at'))
        .values_list('customer_id', 'month').distinct()
    )
    rows, cohort = [], first
    while cohort <= today:
        people = [customer_id for customer_id in members if starts[customer_id] == cohort]
        cells, month = [], cohort
        while month <= today:
            back = sum(1 for customer_id in people if month in active.get(customer_id, ()))
            cells.append(round(back / len(people) * 100) if people else None)
            month = _next_month(month)
        rows.append({'month': cohort.isoformat(), 'customers': len(people), 'retention': cells})
        cohort = _next_month(cohort)
    return rows


def _areas(start, today):
    sales = Sale.objects.filter(created_at__date__gte=start, created_at__date__lte=today).exclude(customer_id=None)
    rows = list(
        sales.values('customer__area').annotate(
            customers=Count('customer_id', distinct=True),
            revenue=Coalesce(Sum('total'), ZERO, output_field=MONEY),
        ).order_by('-customers')
    )
    named = [row for row in rows if row['customer__area']]
    out = [{'area': row['customer__area'], 'customers': row['customers'], 'revenue': row['revenue']} for row in named[:AREA_ROWS]]
    rest = [row for row in rows if row not in named[:AREA_ROWS]]
    if rest:
        out.append({
            'area': '',
            'customers': sum(row['customers'] for row in rest),
            'revenue': sum((row['revenue'] for row in rest), ZERO),
        })
    return out


def analytics(days):
    today = timezone.localdate()
    start = today - timedelta(days=days - 1)
    current = _customer_analytics(today, days)
    previous = _customer_analytics(start - timedelta(days=1), days)

    first_sale = Sale.objects.exclude(customer_id=None).values('customer_id').annotate(first=Min('created_at__date'))
    new_customers = first_sale.filter(first__gte=start).count()
    window_sales = Sale.objects.filter(created_at__date__gte=start, created_at__date__lte=today)
    bills = window_sales.count()
    named_bills = window_sales.exclude(customer_id=None).count()
    months = max(Decimal(days) / 30, Decimal(1))
    revenue = sum((segment['revenue'] for segment in current['segments']), ZERO)

    at_risk = profiles.annotated(Customer.objects.filter(active=True), today).filter(profiles.segment_filter('at_risk', today))
    return {
        'window_days': days,
        'identified_customers': current['identified_customers'],
        'new_customers': new_customers,
        'named_bill_share': round(named_bills / bills * 100, 1) if bills else 0,
        'returning_rate': current['returning_rate'],
        'returning_change': round(current['returning_rate'] - previous['returning_rate'], 1),
        'avg_spend_per_month': (current['avg_spend_per_customer'] / months).quantize(Decimal('0.01')),
        'avg_spend_change': (
            round((current['avg_spend_per_customer'] - previous['avg_spend_per_customer']) / previous['avg_spend_per_customer'] * 100, 1)
            if previous['avg_spend_per_customer'] else None
        ),
        'at_risk': at_risk.count(),
        'returning_by_month': _returning_by_month(today, 3 if days <= 90 else 12),
        'cohorts': _cohorts(today),
        'visit_buckets': [
            {**bucket, 'share': round(bucket['count'] / current['identified_customers'] * 100) if current['identified_customers'] else 0}
            for bucket in current['visit_buckets']
        ],
        'areas': _areas(start, today),
        'heatmap': current['heatmap'],
        'peak': current['peak'],
        'segments': [
            {**segment, 'revenue_share': round(segment['revenue'] / revenue * 100) if revenue else 0}
            for segment in current['segments']
        ],
    }
