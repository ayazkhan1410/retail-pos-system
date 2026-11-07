"""Customer segments, list annotations and the profile panel.

Segments (one definition, used by the tabs, the row badges and the counts):
  over_limit  owes more than their credit limit
  at_risk     bought before, but not in the last AT_RISK_DAYS days
  new         added in the last NEW_DAYS days
  regular     REGULAR_VISITS+ bills in the last WINDOW_DAYS days
  khata       owes anything
"""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, F, Max, Q, Sum
from django.db.models.functions import Coalesce, ExtractHour, ExtractWeekDay, TruncMonth
from django.utils import timezone

from customers.models import Customer
from sales.models import Sale, SaleLine, SaleReturn

ZERO = Decimal(0)
MONEY = DecimalField(max_digits=20, decimal_places=2)
WINDOW_DAYS = 30
AT_RISK_DAYS = 30
NEW_DAYS = 7
REGULAR_VISITS = 2
PROFILE_MONTHS = 6
SEGMENTS = ('regular', 'khata', 'over_limit', 'at_risk', 'new')


def annotated(queryset, today=None):
    """Adds last_visit (datetime) and recent_visits (bills in the last WINDOW_DAYS days)."""
    today = today or timezone.localdate()
    return queryset.annotate(
        last_visit=Max('sales__created_at'),
        recent_visits=Count('sales', filter=Q(sales__created_at__date__gte=today - timedelta(days=WINDOW_DAYS - 1))),
    )


def segment_filter(segment, today=None):
    """A Q for annotated() customers in one segment."""
    today = today or timezone.localdate()
    return {
        'over_limit': Q(balance__gt=F('credit_limit')) & Q(balance__gt=0),
        'khata': Q(balance__gt=0),
        'at_risk': Q(last_visit__isnull=False, last_visit__date__lt=today - timedelta(days=AT_RISK_DAYS - 1)),
        'new': Q(created_at__date__gte=today - timedelta(days=NEW_DAYS - 1)),
        'regular': Q(recent_visits__gte=REGULAR_VISITS),
    }[segment]


def segments_of(customer, today=None):
    """Every segment an annotated() customer is in, most important first."""
    today = today or timezone.localdate()
    tags = []
    if customer.balance > 0 and customer.balance > customer.credit_limit:
        tags.append('over_limit')
    last = timezone.localtime(customer.last_visit).date() if customer.last_visit else None
    if last and (today - last).days >= AT_RISK_DAYS:
        tags.append('at_risk')
    if timezone.localtime(customer.created_at).date() >= today - timedelta(days=NEW_DAYS - 1):
        tags.append('new')
    if customer.recent_visits >= REGULAR_VISITS:
        tags.append('regular')
    if customer.balance > 0:
        tags.append('khata')
    return tags


def _buyers(start, end):
    return set(
        Sale.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
        .exclude(customer_id=None).values_list('customer_id', flat=True).distinct()
    )


def _returning_rate(today, offset_days=0):
    """Of customers who bought in the last 30 days, the % who had also bought in the 30 days before."""
    end = today - timedelta(days=offset_days)
    recent = _buyers(end - timedelta(days=WINDOW_DAYS - 1), end)
    if not recent:
        return 0.0
    before = _buyers(end - timedelta(days=2 * WINDOW_DAYS - 1), end - timedelta(days=WINDOW_DAYS))
    return round(len(recent & before) / len(recent) * 100, 1)


def summary():
    today = timezone.localdate()
    month_start = today.replace(day=1)
    last_month_end = month_start - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)
    # Compare month-to-date with the same number of days last month.
    same_day_last_month = min(last_month_start + (today - month_start), last_month_end)

    active = len(_buyers(month_start, today))
    active_before = len(_buyers(last_month_start, same_day_last_month))
    window = Sale.objects.filter(created_at__date__gte=today - timedelta(days=WINDOW_DAYS - 1)).exclude(customer_id=None)
    visits = window.count()
    buyers = window.values('customer_id').distinct().count()
    returning = _returning_rate(today)
    over_limit = Customer.objects.filter(active=True, balance__gt=0).filter(balance__gt=F('credit_limit')).aggregate(
        count=Count('id'), total=Coalesce(Sum('balance'), ZERO, output_field=MONEY),
    )
    base = annotated(Customer.objects.filter(active=True), today)
    khata = Customer.objects.filter(active=True).aggregate(
        total=Coalesce(Sum('balance', filter=Q(balance__gt=0)), ZERO, output_field=MONEY),
    )
    return {
        'customers': Customer.objects.filter(active=True).count(),
        'khata_total': khata['total'],
        'active_this_month': active,
        'active_change': round((active - active_before) / active_before * 100, 1) if active_before else None,
        'returning_rate': returning,
        'returning_change': round(returning - _returning_rate(today, WINDOW_DAYS), 1),
        'avg_visits_per_month': round(visits / buyers, 1) if buyers else 0,
        'over_limit_count': over_limit['count'],
        'over_limit_total': over_limit['total'],
        'counts': {segment: base.filter(segment_filter(segment, today)).count() for segment in SEGMENTS},
        'areas': list(
            Customer.objects.filter(active=True).exclude(area='').values_list('area', flat=True).distinct().order_by('area')[:200]
        ),
    }


def _often_buys(customer_id, limit=3):
    rows = (
        SaleLine.objects.filter(sale__customer_id=customer_id)
        .values('product_id', 'name')
        .annotate(times=Count('sale', distinct=True), first=Max('sale__created_at'), units=Sum('quantity'))
        .order_by('-times', '-units')[:limit]
    )
    out = []
    for row in rows:
        days = SaleLine.objects.filter(sale__customer_id=customer_id, product_id=row['product_id']).values_list(
            'sale__created_at', flat=True,
        )
        dates = sorted({timezone.localtime(value).date() for value in days})
        interval = round((dates[-1] - dates[0]).days / (len(dates) - 1), 1) if len(dates) > 1 else None
        out.append({'product_id': row['product_id'], 'name': row['name'], 'times': row['times'], 'interval_days': interval})
    return out


def profile(customer):
    today = timezone.localdate()
    sales = Sale.objects.filter(customer=customer)
    returned = SaleReturn.objects.filter(sale__customer=customer).aggregate(
        v=Coalesce(Sum('total'), ZERO, output_field=MONEY),
    )['v']
    totals = sales.aggregate(spend=Coalesce(Sum('total'), ZERO, output_field=MONEY), visits=Count('id'))
    lifetime = totals['spend'] - returned

    first_month = today.replace(day=1)
    for _ in range(PROFILE_MONTHS - 1):
        first_month = (first_month - timedelta(days=1)).replace(day=1)
    monthly = {
        timezone.localtime(row['month']).date() if hasattr(row['month'], 'hour') else row['month']: row['spend']
        for row in sales.filter(created_at__date__gte=first_month).annotate(month=TruncMonth('created_at'))
        .values('month').annotate(spend=Sum('total'))
    }
    months, cursor = [], first_month
    while cursor <= today:
        months.append({'month': cursor.isoformat(), 'spend': monthly.get(cursor, ZERO)})
        cursor = (cursor + timedelta(days=32)).replace(day=1)

    habit = (
        sales.annotate(weekday=ExtractWeekDay('created_at'), hour=ExtractHour('created_at'))
        .values('weekday', 'hour').annotate(n=Count('id')).order_by('-n').first()
    )
    return {
        'id': customer.id,
        'lifetime_spend': lifetime,
        'visits': totals['visits'],
        'avg_bill': (totals['spend'] / totals['visits']).quantize(Decimal('0.01')) if totals['visits'] else ZERO,
        'monthly_spend': months,
        # Mon=0 ... Sun=6, matching the heatmaps.
        'usual_weekday': (int(habit['weekday']) - 2) % 7 if habit else None,
        'usual_hour': int(habit['hour']) if habit else None,
        'often_buys': _often_buys(customer.id),
    }
