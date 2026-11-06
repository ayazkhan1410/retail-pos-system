import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ArrowRight, ShoppingCart, Sparkles, CreditCard, Clock, Activity, Wallet } from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Card, CardHeader, CardTitle, KPICard, Button, Badge } from '@/components/ui';
import { salesApi } from '@/services/endpoints';
import { useCan } from '@/store';
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/utils';
import { useTranslation } from '@/i18n';
import type { DashboardData, KPIData } from '@/types';

const SERIES_COLORS = ['#01411C', '#71717a', '#b45309', '#1d4ed8'];
const METHOD_KEYS: Record<string, string> = {
  cash: 'pos.cash',
  jazzcash: 'pos.jazzcash',
  easypaisa: 'pos.easypaisa',
  card: 'pos.cardShort',
};

function EmptyChart({ text }: { text: string }) {
  return <p className="flex h-full items-center justify-center text-center text-sm text-brand-500">{text}</p>;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [data, setData] = useState<DashboardData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    salesApi.dashboard().then((response) => setData(response.data)).catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

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
        <Link to="/pos">
          <Button variant="accent" size="md">
            <ShoppingCart className="h-4 w-4" />
            {t('common.openPos')}
          </Button>
        </Link>
      )}
    />
  );

  if (!data) {
    return (
      <>
        {header}
        <main className="page-bg flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-brand-500">
          {failed ? (
            <>
              <p role="alert">{t('dashboard.loadError')}</p>
              <Button variant="outline" size="sm" onClick={load}>{t('common.retry')}</Button>
            </>
          ) : t('common.loading')}
        </main>
      </>
    );
  }

  const revenue = Number(data.today_revenue);
  const yesterday = Number(data.yesterday_revenue);
  const change = yesterday > 0 ? Math.round(((revenue - yesterday) / yesterday) * 1000) / 10 : 0;
  const kpis: KPIData[] = [
    { labelKey: 'dashboard.kpiTodaySales', value: formatCurrency(revenue), change, trend: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral', icon: 'sales' },
    { labelKey: 'dashboard.kpiTransactions', value: String(data.today_count), change: 0, trend: 'neutral', icon: 'receipt' },
    { labelKey: 'dashboard.kpiLowStock', value: String(data.stock.low + data.stock.out), change: 0, trend: 'neutral', icon: 'alert' },
    { labelKey: 'dashboard.kpiActiveCounters', value: `${data.open_counters} / ${data.total_counters}`, change: 0, trend: 'neutral', icon: 'counter' },
  ];
  const chartRows = data.sales_by_day.map((row) => ({
    day: row.day,
    ...Object.fromEntries(data.counters.map((name) => [name, Number(row[name] ?? 0)])),
  }));
  const hasWeekSales = data.sales_by_day.some((row) => data.counters.some((name) => Number(row[name] ?? 0) > 0));
  const paymentRows = data.payment_methods.map((row) => ({ name: t(METHOD_KEYS[row.method]), value: Number(row.amount) }));
  const peakRows = data.peak_hours.map((row) => ({ hour: `${String(row.hour).padStart(2, '0')}:00`, sales: row.count }));
  const noData = t('dashboard.noData');

  return (
    <>
      {header}

      <main className="page-bg flex-1 overflow-y-auto p-4 sm:p-6">
        {/* Hero */}
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-brand-200/60 bg-gradient-to-r from-brand-900 via-brand-800 to-accent p-4 text-white shadow-elevated sm:p-6 dark:border-brand-800">
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
          <div className="absolute -bottom-4 right-20 h-24 w-24 rounded-full bg-accent-glow/20 blur-xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm text-white/70">
                <Sparkles className="h-4 w-4" />
                <span>{t('dashboard.heroBadge')} · {t('common.pakistan')}</span>
              </div>
              <h2 className="font-display text-2xl font-bold">{t('dashboard.heroTitle')}</h2>
              <p className="mt-1 max-w-lg text-sm text-white/60">
                {t('dashboard.heroDescReal', {
                  open: data.open_counters,
                  total: data.total_counters,
                  count: data.today_count,
                  revenue: formatCurrency(revenue),
                })}
              </p>
            </div>
            {can('pos.sell') && (
              <Link to="/pos" className="hidden sm:block">
                <Button size="lg" className="!bg-white !text-brand-900 hover:!bg-brand-100">
                  <ShoppingCart className="h-5 w-5" />
                  {t('common.startBilling')}
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <KPICard key={kpi.labelKey} {...kpi} />
          ))}
        </div>

        {/* Sales chart + Top products */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2" hover>
            <CardHeader>
              <div>
                <CardTitle>{t('dashboard.salesByCounter')}</CardTitle>
                <p className="mt-0.5 text-xs text-brand-500">{t('dashboard.salesByCounterDesc')}</p>
              </div>
              <Badge>{t('common.pkr')}</Badge>
            </CardHeader>
            <div className="h-72">
              {hasWeekSales ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrencyCompact(v)} width={70} />
                    <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name]} contentStyle={{ borderRadius: '16px', fontSize: '13px' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    {data.counters.map((name, index) => (
                      <Area
                        key={name}
                        type="monotone"
                        dataKey={name}
                        name={name}
                        stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                        fill={SERIES_COLORS[index % SERIES_COLORS.length]}
                        fillOpacity={0.1}
                        strokeWidth={2}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ) : <EmptyChart text={noData} />}
            </div>
          </Card>

          <Card hover>
            <CardHeader>
              <CardTitle>{t('dashboard.topProducts')}</CardTitle>
            </CardHeader>
            {data.top_products.length === 0 && <p className="py-8 text-center text-sm text-brand-500">{noData}</p>}
            <div className="space-y-1">
              {data.top_products.map((product, i) => (
                <div key={product.name} className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-brand-50 dark:hover:bg-brand-800/40">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${i === 0 ? 'bg-accent/15 text-accent' : 'bg-brand-100 text-brand-600 dark:bg-brand-800'}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-brand-500">{Number(product.units)} {t('dashboard.unitsSold')}</p>
                  </div>
                  <p className="text-sm font-bold">{formatCurrency(Number(product.revenue))}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Payment + Peak hours + Shifts */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card hover>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-accent" />
                  {t('dashboard.paymentMethods')}
                </CardTitle>
                <p className="mt-0.5 text-xs text-brand-500">{t('dashboard.paymentMethodsDesc')}</p>
              </div>
            </CardHeader>
            <div className="h-48">
              {paymentRows.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentRows} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                      {paymentRows.map((row, i) => (
                        <Cell key={row.name} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyChart text={noData} />}
            </div>
          </Card>

          <Card hover>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-accent" />
                  {t('dashboard.peakHours')}
                </CardTitle>
                <p className="mt-0.5 text-xs text-brand-500">{t('dashboard.peakHoursDesc')}</p>
              </div>
            </CardHeader>
            <div className="h-48">
              {peakRows.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={peakRows}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(0 0 0 / 0.06)" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="sales" fill="#01411C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart text={noData} />}
            </div>
          </Card>

          <Card hover>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-accent" />
                  {t('dashboard.recentShifts')}
                </CardTitle>
                <p className="mt-0.5 text-xs text-brand-500">{t('dashboard.recentShiftsDesc')}</p>
              </div>
            </CardHeader>
            {data.recent_shifts.length === 0 && <p className="py-8 text-center text-sm text-brand-500">{noData}</p>}
            <div className="space-y-2">
              {data.recent_shifts.map((shift) => {
                const difference = Number(shift.difference);
                return (
                  <div key={shift.id} className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 p-3 dark:border-brand-800">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{shift.terminal_name} · {shift.opened_by_name}</p>
                      <p className="text-xs text-brand-500">{shift.closed_at && formatDate(shift.closed_at)}</p>
                    </div>
                    <Badge variant={difference === 0 ? 'success' : 'danger'}>
                      {difference > 0 ? '+' : ''}{formatCurrency(difference)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Activity + Stock alerts */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card hover>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-accent" />
                {t('dashboard.recentActivity')}
              </CardTitle>
            </CardHeader>
            <div className="space-y-2">
              {data.recent_activity.map((item) => (
                <div key={item.id} className="rounded-xl border border-brand-100 p-3 dark:border-brand-800">
                  <p className="truncate text-sm font-medium">
                    {t(`dashboard.activity.${item.action}`)}
                    {item.target && <span className="font-normal text-brand-500"> · {item.target}</span>}
                  </p>
                  <p className="text-xs text-brand-500">{item.user} · {formatDate(item.created_at)}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card hover>
            <CardHeader>
              <CardTitle>{t('dashboard.stockAlerts')}</CardTitle>
              {can('products.edit') && (
                <Link to="/inventory">
                  <Button variant="ghost" size="sm">
                    {t('dashboard.viewInventory')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                </Link>
              )}
            </CardHeader>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: t('dashboard.outOfStock'), count: data.stock.out, variant: 'danger' as const, desc: t('dashboard.needsRestock') },
                { label: t('dashboard.lowStock'), count: data.stock.low, variant: 'warning' as const, desc: t('dashboard.belowThreshold') },
                { label: t('dashboard.inStock'), count: data.stock.ok, variant: 'success' as const, desc: t('dashboard.healthyLevels') },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-800/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{item.label}</span>
                    <Badge variant={item.variant}>{item.count}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-brand-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </>
  );
}
