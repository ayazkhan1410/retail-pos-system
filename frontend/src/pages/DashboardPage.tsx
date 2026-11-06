import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  ShoppingCart,
  CreditCard,
  Clock,
  Activity,
  Wallet,
  Trophy,
  PackageCheck,
  BarChart3,
  Package,
  Receipt,
  Truck,
  Users,
} from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Card, CardHeader, CardTitle, CardDescription, Badge, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { salesApi } from '@/services/endpoints';
import { useCan } from '@/store';
import { cn, formatCurrency, formatCurrencyCompact, formatDate } from '@/utils';
import { useChartTheme } from '@/utils/chartTheme';
import { useTranslation } from '@/i18n';
import type { DashboardData } from '@/types';

const METHOD_KEYS: Record<string, string> = {
  cash: 'pos.cash',
  jazzcash: 'pos.jazzcash',
  easypaisa: 'pos.easypaisa',
  raast: 'pos.raast',
  card: 'pos.cardShort',
  credit: 'pos.onCredit',
};

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-brand-200 bg-white p-6 lg:col-span-2 dark:border-brand-800 dark:bg-brand-900">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-12 w-56" />
          <Skeleton className="mt-6 h-28 w-full" />
        </div>
        <div className="grid gap-4">
          {[0, 1].map((key) => (
            <div key={key} className="rounded-xl border border-brand-200 bg-white p-5 dark:border-brand-800 dark:bg-brand-900">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-8 w-20" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const can = useCan();
  const chart = useChartTheme();
  const [data, setData] = useState<DashboardData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback((opts?: { soft?: boolean }) => {
    if (!opts?.soft) setFailed(false);
    salesApi.dashboard()
      .then((response) => {
        setData(response.data);
        setFailed(false);
      })
      .catch(() => {
        if (!opts?.soft) setFailed(true);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Soft refresh while this page is open so till sales/purchases appear without a manual reload.
  // (SSE covers stock alerts in the bell; activity is audit-backed.)
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      load({ soft: true });
    };
    const id = window.setInterval(tick, 8000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const hour = new Date().getHours();
  const subtitle =
    hour < 12
      ? t('dashboard.subtitleMorning')
      : hour < 17
        ? t('dashboard.subtitleAfternoon')
        : t('dashboard.subtitleEvening');

  const header = (
    <Header
      title={t('dashboard.title')}
      subtitle={subtitle}
      actions={can('pos.sell') && (
        <Link
          to="/pos"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-900 px-3.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-brand-800 focus-ring dark:bg-white dark:text-brand-900 dark:hover:bg-brand-100"
        >
          <ShoppingCart className="h-4 w-4" />
          {t('common.openPos')}
        </Link>
      )}
    />
  );

  if (!data) {
    return (
      <>
        {header}
        <main className="page-bg flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {failed ? (
            <Card padding="none">
              <ErrorState message={t('dashboard.loadError')} retryLabel={t('common.retry')} onRetry={load} />
            </Card>
          ) : (
            <DashboardSkeleton />
          )}
        </main>
      </>
    );
  }

  const revenue = Number(data.today_revenue);
  const yesterday = Number(data.yesterday_revenue);
  const change = yesterday > 0 ? Math.round(((revenue - yesterday) / yesterday) * 1000) / 10 : 0;
  const averageBasket = data.today_count > 0 ? Math.round((revenue / data.today_count) * 100) / 100 : 0;
  const attentionCount = data.stock.low + data.stock.out;
  const returnsAmount = Number(data.today_returns_amount ?? 0);
  const returnsCount = data.today_returns_count ?? 0;
  const khataOutstanding = Number(data.khata_outstanding ?? 0);
  const registers = data.registers ?? [];

  const chartRows = data.sales_by_day.map((row) => ({
    day: row.day,
    ...Object.fromEntries(data.counters.map((name) => [name, Number(row[name] ?? 0)])),
  }));
  const dayTotals = data.sales_by_day.map((row) => ({
    day: row.day,
    total: data.counters.reduce((sum, name) => sum + Number(row[name] ?? 0), 0),
  }));
  const hasWeekSales = dayTotals.some((row) => row.total > 0);

  const paymentTotal = data.payment_methods.reduce((sum, row) => sum + Number(row.amount), 0);
  const paymentRows = [...data.payment_methods]
    .map((row) => ({ name: t(METHOD_KEYS[row.method]), value: Number(row.amount) }))
    .sort((a, b) => b.value - a.value);

  const peakRows = data.peak_hours.map((row) => ({ hour: `${String(row.hour).padStart(2, '0')}:00`, sales: row.count }));
  const peakMax = Math.max(0, ...peakRows.map((row) => row.sales));
  const topRevenue = Math.max(0, ...data.top_products.map((product) => Number(product.revenue)));
  const stockTotal = data.stock.out + data.stock.low + data.stock.ok;
  const noData = t('dashboard.noData');
  const TrendIcon = change >= 0 ? ArrowUpRight : ArrowDownRight;

  const quickActions = [
    { perm: 'pos.sell', to: '/pos', icon: ShoppingCart, label: t('dashboard.quickPos') },
    { perm: 'products.edit', to: '/inventory', icon: Package, label: t('dashboard.quickInventory') },
    { perm: 'sales.view', to: '/sales', icon: Receipt, label: t('dashboard.quickSales') },
    { perm: 'purchases.view', to: '/purchases', icon: Truck, label: t('dashboard.quickPurchases') },
    { perm: 'customers.view', to: '/customers', icon: Users, label: t('dashboard.quickCustomers') },
    { perm: 'reports.view', to: '/reports', icon: BarChart3, label: t('dashboard.quickReports') },
  ].filter((action) => can(action.perm));

  return (
    <>
      {header}

      <main className="page-bg flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-[1440px] space-y-4 sm:space-y-6">
          {quickActions.length > 0 && (
            <section aria-label={t('dashboard.quickActions')}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-brand-400">{t('dashboard.quickActions')}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {quickActions.map(({ to, icon: Icon, label }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center gap-2.5 rounded-xl border border-brand-200 bg-white px-3.5 py-3 text-sm font-medium text-brand-800 shadow-card transition-colors hover:border-accent/40 hover:bg-accent-soft focus-ring dark:border-brand-800 dark:bg-brand-900 dark:text-brand-100 dark:hover:bg-brand-800/60"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="truncate">{label}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Today at a glance */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-brand-200 bg-white p-5 dark:border-brand-800 dark:bg-brand-900">
              <p className="text-sm font-medium text-brand-500 dark:text-brand-400">{t('dashboard.kpiTodaySales')}</p>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                <span className="num text-[26px] font-semibold leading-tight">{formatCurrency(revenue)}</span>
                {yesterday > 0 && (
                  <span className={cn('inline-flex items-center gap-0.5 text-sm font-medium tabular-nums', change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                    <TrendIcon className="h-3.5 w-3.5" />
                    {Math.abs(change)}%
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-brand-400">
                {yesterday > 0 ? <>{t('common.vsYesterday')} <span className="tabular-nums">{formatCurrency(yesterday)}</span></> : t('dashboard.noYesterday')}
              </p>
            </div>
            {[
              { label: t('dashboard.kpiTransactions'), value: String(data.today_count), sub: t('dashboard.avgBasket') + ' ' + formatCurrency(averageBasket) },
              {
                label: t('dashboard.kpiReturns'),
                value: String(returnsCount),
                sub: formatCurrency(returnsAmount),
                warn: returnsCount > 0,
              },
              {
                label: t('dashboard.kpiCustomers'),
                value: String((data.customers_identified ?? 0) + (data.customers_walk_in ?? 0)),
                sub: `${t('dashboard.identifiedToday', { count: data.customers_identified ?? 0 })} · ${t('dashboard.walkIns', { count: data.customers_walk_in ?? 0 })}`,
              },
              {
                label: t('dashboard.kpiKhata'),
                value: formatCurrency(khataOutstanding),
                sub: t('dashboard.salesCount', { count: data.khata_customers ?? 0 }),
                warn: khataOutstanding > 0,
                to: can('customers.view') ? '/customers' : undefined,
              },
              {
                label: t('dashboard.kpiLowStock'),
                value: String(attentionCount),
                sub: t('dashboard.stockSplit', { out: data.stock.out, low: data.stock.low }),
                warn: attentionCount > 0,
                to: can('products.edit') ? '/inventory' : undefined,
              },
              { label: t('dashboard.kpiActiveCounters'), value: `${data.open_counters} / ${data.total_counters}`, sub: t('dashboard.registers') },
            ].map((cell) => {
              const content = (
                <>
                  <p className="text-sm font-medium text-brand-500 dark:text-brand-400">{cell.label}</p>
                  <p className={cn('num mt-1.5 text-[26px] font-semibold leading-tight', cell.warn && 'text-amber-700 dark:text-amber-300')}>{cell.value}</p>
                  <p className="mt-2 truncate text-xs text-brand-400">{cell.sub}</p>
                </>
              );
              const shell = 'rounded-xl border border-brand-200 bg-white p-5 dark:border-brand-800 dark:bg-brand-900';
              return cell.to ? (
                <Link key={cell.label} to={cell.to} className={cn(shell, 'transition-colors hover:bg-brand-50 focus-ring dark:hover:bg-brand-800/40')}>{content}</Link>
              ) : (
                <div key={cell.label} className={shell}>{content}</div>
              );
            })}
          </div>

          {registers.length > 0 && (
            <Card hover>
              <CardHeader><CardTitle>{t('dashboard.registers')}</CardTitle></CardHeader>
              <div className="divide-y divide-brand-100 dark:divide-brand-800">
                {registers.map((register) => (
                  <div key={register.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{register.name}</p>
                      <p className="truncate text-xs text-brand-500">{register.cashier || '—'}</p>
                    </div>
                    <div className="text-end">
                      <Badge variant={register.status === 'open' ? 'success' : 'default'}>
                        {register.status === 'open' ? t('dashboard.registerOpen') : t('dashboard.registerClosed')}
                      </Badge>
                      <p className="mt-1 tabular-nums font-semibold">{formatCurrency(Number(register.sales_total))}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Week by counter + what sold */}
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>{t('dashboard.salesByCounter')}</CardTitle>
                  <CardDescription>{t('dashboard.salesByCounterDesc')}</CardDescription>
                </div>
                {hasWeekSales && data.counters.length > 0 && (
                  <ul className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                    {data.counters.map((name, index) => (
                      <li key={name} className="flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-300">
                        <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: chart.series[index % chart.series.length] }} />
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
              </CardHeader>
              <div className="h-72">
                {hasWeekSales ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                      <CartesianGrid stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="day" tick={chart.tick} axisLine={false} tickLine={false} />
                      <YAxis tick={chart.tick} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrencyCompact(v)} width={64} />
                      <Tooltip cursor={{ fill: chart.cursor }} formatter={(value: number, name: string) => [formatCurrency(value), name]} {...chart.tooltip} />
                      {data.counters.map((name, index) => (
                        <Bar
                          key={name}
                          dataKey={name}
                          name={name}
                          stackId="sales"
                          fill={chart.series[index % chart.series.length]}
                          radius={index === data.counters.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                          maxBarSize={44}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState icon={BarChart3} title={noData} compact className="h-full" />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-brand-400" />
                  {t('dashboard.topProducts')}
                </CardTitle>
              </CardHeader>
              {data.top_products.length === 0 ? (
                <EmptyState title={noData} compact />
              ) : (
                <ol className="space-y-3.5">
                  {data.top_products.map((product, i) => {
                    const share = topRevenue > 0 ? (Number(product.revenue) / topRevenue) * 100 : 0;
                    return (
                      <li key={product.name}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-brand-400">{i + 1}</span>
                            <span className="truncate font-medium">{product.name}</span>
                          </span>
                          <span className="num shrink-0 font-semibold">{formatCurrency(Number(product.revenue))}</span>
                        </div>
                        <div className="ms-6 mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-800">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-brand-500">
                            {Number(product.units)} {t('dashboard.unitsSold')}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          </div>

          {/* How they paid, when they came, how the drawers counted */}
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-brand-400" />
                    {t('dashboard.paymentMethods')}
                  </CardTitle>
                  <CardDescription>{t('dashboard.paymentMethodsDesc')}</CardDescription>
                </div>
              </CardHeader>
              {paymentRows.length === 0 ? (
                <EmptyState title={noData} compact />
              ) : (
                <ul className="space-y-3">
                  {paymentRows.map((row, index) => {
                    const pct = paymentTotal > 0 ? Math.round((row.value / paymentTotal) * 100) : 0;
                    return (
                      <li key={row.name}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-medium">{row.name}</span>
                          <span className="flex items-baseline gap-2">
                            <span className="num font-semibold">{formatCurrency(row.value)}</span>
                            <span className="w-9 text-end text-xs tabular-nums text-brand-500">{pct}%</span>
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-800">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: chart.series[index % chart.series.length] }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-brand-400" />
                    {t('dashboard.peakHours')}
                  </CardTitle>
                  <CardDescription>{t('dashboard.peakHoursDesc')}</CardDescription>
                </div>
              </CardHeader>
              <div className="h-48">
                {peakRows.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={peakRows} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
                      <CartesianGrid stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="hour" tick={{ ...chart.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ ...chart.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: chart.cursor }} formatter={(value: number) => [value, t('dashboard.salesLabel')]} {...chart.tooltip} />
                      <Bar dataKey="sales" radius={[4, 4, 0, 0]} maxBarSize={28}>
                        {peakRows.map((row) => (
                          <Cell key={row.hour} fill={row.sales === peakMax ? chart.highlight : chart.muted} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title={noData} compact className="h-full" />
                )}
              </div>
            </Card>

            <Card className="md:col-span-2 xl:col-span-1">
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-brand-400" />
                    {t('dashboard.recentShifts')}
                  </CardTitle>
                  <CardDescription>{t('dashboard.recentShiftsDesc')}</CardDescription>
                </div>
              </CardHeader>
              {data.recent_shifts.length === 0 ? (
                <EmptyState title={noData} compact />
              ) : (
                <ul className="divide-y divide-brand-100 dark:divide-brand-800">
                  {data.recent_shifts.map((shift) => {
                    const difference = Number(shift.difference);
                    return (
                      <li key={shift.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{shift.terminal_name} · {shift.opened_by_name}</p>
                          <p className="text-xs tabular-nums text-brand-500">{shift.closed_at && formatDate(shift.closed_at)}</p>
                        </div>
                        <Badge variant={difference === 0 ? 'success' : 'danger'}>
                          {difference > 0 ? '+' : ''}{formatCurrency(difference)}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          {/* What happened, what needs restocking */}
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-brand-400" />
                  {t('dashboard.recentActivity')}
                </CardTitle>
              </CardHeader>
              {data.recent_activity.length === 0 ? (
                <EmptyState title={noData} compact />
              ) : (
                <ol className="relative space-y-4 before:absolute before:inset-y-1 before:start-[5px] before:w-px before:bg-brand-200 dark:before:bg-brand-800">
                  {data.recent_activity.map((item) => {
                    const total = item.details?.total != null ? Number(item.details.total) : null;
                    const isSale = item.action === 'sale_completed' || item.action === 'offline_sale';
                    return (
                      <li key={item.id} className="relative flex gap-3 ps-5">
                        <span
                          aria-hidden
                          className={cn(
                            'absolute start-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-white dark:border-brand-900',
                            isSale ? 'bg-emerald-500' : 'bg-brand-300 dark:bg-brand-600',
                          )}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {t(`dashboard.activity.${item.action}`)}
                            {item.target && <span className="font-normal text-brand-500"> · {item.target}</span>}
                            {total != null && Number.isFinite(total) && (
                              <span className="font-semibold text-brand-800 dark:text-brand-100"> · {formatCurrency(total)}</span>
                            )}
                          </p>
                          <p className="text-xs text-brand-500">
                            {item.user} · <span className="tabular-nums">{formatDate(item.created_at)}</span>
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-brand-400" />
                  {t('dashboard.stockAlerts')}
                </CardTitle>
                {can('products.edit') && (
                  <Link
                    to="/inventory"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-brand-600 hover:bg-brand-100 hover:text-brand-900 focus-ring dark:text-brand-300 dark:hover:bg-brand-800"
                  >
                    {t('dashboard.viewInventory')} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                  </Link>
                )}
              </CardHeader>
              {stockTotal > 0 && (
                <div className="mb-5 flex h-2.5 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-800" aria-hidden>
                  <div className="bg-red-500" style={{ width: `${(data.stock.out / stockTotal) * 100}%` }} />
                  <div className="bg-amber-500" style={{ width: `${(data.stock.low / stockTotal) * 100}%` }} />
                  <div className="bg-emerald-500" style={{ width: `${(data.stock.ok / stockTotal) * 100}%` }} />
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: t('dashboard.outOfStock'), count: data.stock.out, dot: 'bg-red-500', desc: t('dashboard.needsRestock') },
                  { label: t('dashboard.lowStock'), count: data.stock.low, dot: 'bg-amber-500', desc: t('dashboard.belowThreshold') },
                  { label: t('dashboard.inStock'), count: data.stock.ok, dot: 'bg-emerald-500', desc: t('dashboard.healthyLevels') },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-brand-100 p-3.5 dark:border-brand-800">
                    <p className="flex items-center gap-2 text-xs font-medium text-brand-600 dark:text-brand-300">
                      <span aria-hidden className={cn('h-2 w-2 rounded-full', item.dot)} />
                      {item.label}
                    </p>
                    <p className="num mt-2 text-2xl font-semibold">{item.count}</p>
                    <p className="mt-0.5 text-xs text-brand-500">{item.desc}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
