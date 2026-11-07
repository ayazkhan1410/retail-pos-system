import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Cell, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import PageShell from '@/components/layout/PageShell';
import RecentActivityCard from '@/components/dashboard/RecentActivityCard';
import Heatmap, { hourLabel } from '@/components/charts/Heatmap';
import { Button, ErrorState, Skeleton, toast } from '@/components/ui';
import { Delta, KpiStrip, LinkButton, Panel, Pill, ProgressBar, Segmented, StackedBar } from '@/components/ui/Kit';
import { useTranslation } from '@/i18n';
import { overviewApi } from '@/services/pages';
import { salesApi } from '@/services/endpoints';
import { useCan } from '@/store';
import type { AttentionItem, Overview, OverviewPeriod } from '@/types/pages';
import { clockTime, cn, formatCurrency, formatMoneyShort, num, shortDate } from '@/utils';
import { SERIES_CLASSES, useChartTheme } from '@/utils/chartTheme';
import { printZReport } from '@/utils/zReportPrint';
import { displayName, useStoreDetails } from '@/utils/storeDetails';

const METHOD_ORDER = ['cash', 'jazzcash', 'card', 'easypaisa', 'raast', 'credit'];
const REFRESH_MS = 60_000;

function downloadCsv(name: string, rows: (string | number)[][]) {
  const body = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`\ufeff${body}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const can = useCan();
  const navigate = useNavigate();
  const chart = useChartTheme();
  const store = useStoreDetails((state) => state.details);
  const [period, setPeriod] = useState<OverviewPeriod>('today');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await overviewApi.get(period);
      setData(response.data);
      setError(false);
    } catch {
      setError(true);
    }
  }, [period]);

  useEffect(() => {
    setData(null);
    void load();
    // Today keeps moving while the shop is open.
    if (period !== 'today') return;
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load, period]);

  const periods: { value: OverviewPeriod; label: string }[] = [
    { value: 'today', label: t('pg.common.today') },
    { value: 'yesterday', label: t('pg.common.yesterday') },
    { value: '7d', label: t('pg.common.days7') },
    { value: '30d', label: t('pg.common.days30') },
  ];
  const periodLabel = periods.find((option) => option.value === period)!.label;
  const compareLabel = {
    today: t('pg.home.compareYesterday'),
    yesterday: t('pg.home.compareDayBefore'),
    '7d': t('pg.home.comparePrevious7'),
    '30d': t('pg.home.comparePrevious30'),
  }[period];

  const heading = data
    ? data.from === data.to
      ? `${new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${data.from}T00:00:00`))}${period === 'today' ? ` · ${clockTime(new Date())}` : ''}`
      : `${shortDate(data.from)} – ${shortDate(data.to)}`
    : '';

  const exportCsv = () => {
    if (!data) return;
    const m = data.money;
    downloadCsv(`tijori-${period}-${data.from}.csv`, [
      [t('pg.home.grossSales'), num(m.gross_sales)],
      [t('pg.home.netProfit'), num(m.net_profit)],
      [t('pg.home.bills'), m.bills],
      [t('pg.home.customersServed'), data.customers.served],
      [t('pg.home.khata'), num(data.khata.outstanding)],
      [],
      [t('pg.home.product'), t('pg.home.units'), t('pg.home.sales')],
      ...data.top_products.map((row) => [row.name, num(row.units), num(row.revenue)]),
    ]);
  };

  return (
    <PageShell
      crumb={t('nav.dashboard')}
      subCrumb={periodLabel}
      barActions={
        <>
          <Button variant="outline" size="sm" className="h-9 text-sm" onClick={exportCsv} disabled={!data}>
            <Download className="h-4 w-4" /> {t('pg.common.export')}
          </Button>
          {can('pos.sell') && (
            <Button size="sm" className="h-9 text-sm" onClick={() => navigate('/pos')}>
              {t('pg.home.openRegister')} <kbd className="!border-white/30 !bg-white/10 !text-white dark:!border-brand-300 dark:!bg-brand-200 dark:!text-brand-800">F2</kbd>
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-brand-900 dark:text-white">{periodLabel}</h1>
          <span className="text-sm text-brand-500">{heading}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={period} options={periods} onChange={setPeriod} label={t('pg.home.period')} />
          <span className="inline-flex h-9 items-center rounded-lg border border-brand-200 bg-white px-3 text-sm text-brand-800 shadow-soft dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100">{compareLabel}</span>
          <span className="inline-flex h-9 items-center rounded-lg border border-brand-200 bg-white px-3 text-sm text-brand-800 shadow-soft dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100">
            {store.store_name ? store.name : displayName(store)}
          </span>
        </div>
      </div>

      {error && !data ? (
        <ErrorState message={t('pg.common.loadError')} retryLabel={t('pg.common.retry')} onRetry={() => void load()} />
      ) : !data ? (
        <HomeSkeleton />
      ) : (
        <>
          <Kpis data={data} period={period} />
          <div className="grid gap-5 xl:grid-cols-3">
            <SalesTrend data={data} chart={chart} periodLabel={periodLabel} />
            <RegistersPanel data={data} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <WhoBought data={data} chart={chart} />
            <BasketSize data={data} />
            <TopAreas data={data} />
            <BusyTimes data={data} />
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            <TopProducts data={data} />
            <Categories data={data} chart={chart} />
            <NeedsAttention items={data.attention} storeName={displayName(store)} />
          </div>
          <RecentActivityCard />
        </>
      )}
    </PageShell>
  );
}

type Chart = ReturnType<typeof useChartTheme>;

function HomeSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <Skeleton className="h-[104px] w-full rounded-xl" />
      <div className="grid gap-5 xl:grid-cols-3">
        <Skeleton className="h-[360px] rounded-xl xl:col-span-2" />
        <Skeleton className="h-[360px] rounded-xl" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-[270px] rounded-xl" />)}
      </div>
    </div>
  );
}

function Kpis({ data, period }: { data: Overview; period: OverviewPeriod }) {
  const { t } = useTranslation();
  const m = data.money;
  const previousLabel = period === 'today' ? t('pg.home.vsYesterday') : t('pg.home.vsPrevious');
  const returningShare = data.customers.served ? Math.round((data.customers.returning / data.customers.served) * 100) : 0;
  const khataChange = num(data.khata.change);
  return (
    <KpiStrip
      items={[
        {
          key: 'gross', label: t('pg.home.grossSales'), value: formatCurrency(num(m.gross_sales)),
          delta: <Delta value={data.changes.gross_sales} />,
          hint: `${previousLabel} ${formatCurrency(num(data.previous_money.gross_sales))}`,
        },
        {
          key: 'profit', label: t('pg.home.netProfit'), value: formatCurrency(num(m.net_profit)),
          delta: <Delta value={data.changes.net_profit} />,
          hint: data.margin_percent != null ? t('pg.home.marginAfterExpenses', { value: data.margin_percent }) : t('pg.common.none'),
        },
        {
          key: 'bills', label: t('pg.home.bills'), value: m.bills.toLocaleString(),
          delta: <Delta value={data.changes.bills} suffix="" />,
          hint: t('pg.home.avgBillReturns', { avg: formatCurrency(Math.round(num(m.avg_bill))), returns: m.returns_count }),
        },
        {
          key: 'customers', label: t('pg.home.customersServed'), value: data.customers.served.toLocaleString(),
          delta: <Delta value={data.changes.customers} suffix="" />,
          hint: t('pg.home.returningNew', { share: returningShare, count: data.customers.new }),
        },
        {
          key: 'khata', label: t('pg.home.khata'), value: formatCurrency(num(data.khata.outstanding)),
          // More owed to the shop is bad news, so an increase shows red.
          delta: <Delta value={khataChange} good="down" format={(value) => formatCurrency(value)} />,
          hint: t('pg.home.khataHint', { customers: data.khata.customers, over: data.khata.over_limit }),
        },
      ]}
    />
  );
}

function SalesTrend({ data, chart, periodLabel }: { data: Overview; chart: Chart; periodLabel: string }) {
  const { t } = useTranslation();
  const hourly = data.trend.granularity === 'hour';
  const points = useMemo(() => {
    const rows = data.trend.points.map((point) => ({
      label: point.label,
      current: point.current == null ? null : num(point.current),
      previous: num(point.previous),
    }));
    if (!hourly) return rows;
    // Shop hours, widened if there were sales outside them.
    const busy = rows.filter((row) => (row.current ?? 0) > 0 || row.previous > 0).map((row) => Number(row.label));
    const first = Math.min(9, ...(busy.length ? [Math.max(0, busy[0] - 1)] : []));
    const last = Math.max(21, ...(busy.length ? [busy[busy.length - 1]] : []));
    return rows.filter((row) => Number(row.label) >= first && Number(row.label) <= last);
  }, [data.trend.points, hourly]);
  const format = (label: number | string) =>
    hourly ? `${hourLabel(Number(label))} ${Number(label) < 12 ? 'am' : 'pm'}` : shortDate(String(label));
  const compareName = data.period === 'today' ? t('pg.common.yesterday') : t('pg.home.previousPeriod');

  return (
    <Panel
      className="xl:col-span-2"
      title={hourly ? t('pg.home.salesByHour') : t('pg.home.salesByDay')}
      subtitle={t('pg.home.trendSubtitle', { period: periodLabel, compare: compareName.toLowerCase() })}
      action={
        <span className="flex items-center gap-4 text-[13px] text-brand-600 dark:text-brand-300">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />{periodLabel}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-300 dark:bg-brand-600" />{compareName}</span>
        </span>
      }
    >
      <div className="h-[280px] px-2 pb-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chart.accent} stopOpacity={0.22} />
                <stop offset="100%" stopColor={chart.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={chart.grid} />
            <XAxis dataKey="label" tickFormatter={format} tick={chart.tick} axisLine={false} tickLine={false} interval={hourly ? 1 : 'preserveStartEnd'} minTickGap={12} />
            <YAxis tickFormatter={(value: number) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(value))} tick={chart.tick} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              cursor={{ stroke: chart.muted, strokeDasharray: '3 3' }}
              {...chart.tooltip}
              labelFormatter={(label) => format(label as string)}
              formatter={(value: number, name: string) => [formatCurrency(value), name === 'current' ? periodLabel : compareName]}
            />
            <Line type="monotone" dataKey="previous" stroke={chart.previous} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="current" stroke={chart.accent} strokeWidth={2} fill="url(#trendFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, fill: '#fff' }} isAnimationActive={false} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function RegistersPanel({ data }: { data: Overview }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const can = useCan();
  const mix = [...data.payment_mix].sort((a, b) => METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method));
  return (
    <Panel
      title={t('pg.home.registers')}
      action={can('reports.view') ? <LinkButton onClick={() => navigate('/reports?tab=cashiers')}>{t('pg.home.viewShifts')}</LinkButton> : undefined}
      bodyClassName="px-5 pb-5"
    >
      <ul className="divide-y divide-brand-100 border-t border-brand-100 dark:divide-brand-800 dark:border-brand-800">
        {data.registers.map((register) => {
          const diff = register.difference == null ? 0 : num(register.difference);
          const dot = register.status === 'open' ? (register.offline_bills > 0 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-brand-300 dark:bg-brand-600';
          const detail = register.status === 'open'
            ? t('pg.home.openSince', { time: clockTime(register.since!), bills: register.bills })
            : register.status === 'closed'
              ? `${t('pg.home.closedAt', { time: clockTime(register.since!) })}${diff < 0 ? ` · ${t('pg.home.short', { amount: formatCurrency(-diff) })}` : diff > 0 ? ` · ${t('pg.home.over', { amount: formatCurrency(diff) })}` : ''}`
              : t('pg.home.notOpened');
          return (
            <li key={register.id} className="flex items-center gap-3 py-3">
              <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-brand-900 dark:text-white">
                  {register.name}{register.cashier && <span> · {register.cashier}</span>}
                </p>
                <p className="truncate text-[13px] text-brand-500">
                  {detail}
                  {register.offline_bills > 0 && ` · ${t('pg.home.offlineBills', { count: register.offline_bills })}`}
                </p>
              </div>
              <span className="num text-sm text-brand-900 dark:text-white">{formatCurrency(num(register.sales_total))}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 border-t border-brand-100 pt-4 dark:border-brand-800">
        <p className="mb-2.5 text-[13px] text-brand-600 dark:text-brand-300">{t('pg.home.paymentMix')}</p>
        <StackedBar parts={mix.map((row, index) => ({ key: row.method, value: row.share, color: SERIES_CLASSES[Math.min(index, SERIES_CLASSES.length - 1)] }))} />
        <div className="mt-3 grid grid-cols-4 gap-2">
          {mix.slice(0, 4).map((row, index) => (
            <div key={row.method} className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-xs text-brand-600 dark:text-brand-300">
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', SERIES_CLASSES[Math.min(index, SERIES_CLASSES.length - 1)])} />
                {t(`pg.methods.${row.method}`)}
              </p>
              <p className="num ms-3 text-xs text-brand-500">{Math.round(row.share)}%</p>
            </div>
          ))}
          {mix.length === 0 && <p className="col-span-4 text-xs text-brand-500">{t('pg.home.noPayments')}</p>}
        </div>
      </div>
    </Panel>
  );
}

function Donut({ rows, chart, center }: { rows: { key: string; value: number; color: string }[]; chart: Chart; center?: string }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <div className="relative h-[120px] w-[120px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={total ? rows : [{ key: 'empty', value: 1, color: chart.muted }]} dataKey="value" innerRadius={42} outerRadius={58} paddingAngle={total ? 2 : 0} stroke="none" isAnimationActive={false}>
            {(total ? rows : [{ key: 'empty', value: 1, color: chart.muted }]).map((row) => <Cell key={row.key} fill={row.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {center && <span className="num absolute inset-0 flex items-center justify-center text-sm font-semibold">{center}</span>}
    </div>
  );
}

function WhoBought({ data, chart }: { data: Overview; chart: Chart }) {
  const { t } = useTranslation();
  const rows = [
    { key: 'returning', label: t('pg.home.returning'), value: data.customers.returning, color: chart.series[1], dot: 'bg-accent' },
    { key: 'new', label: t('pg.home.new'), value: data.customers.new, color: chart.series[2], dot: 'bg-cyan-500' },
    { key: 'walkin', label: t('pg.home.walkIn'), value: data.customers.walk_in, color: chart.series[4], dot: 'bg-brand-300 dark:bg-brand-600' },
  ];
  return (
    <Panel title={t('pg.home.whoBought')} subtitle={t('pg.home.identified', { count: data.customers.identified })} bodyClassName="flex items-center gap-6 px-5 pb-5 pt-2">
      <Donut rows={rows} chart={chart} />
      <ul className="flex-1 space-y-2.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 text-sm">
            <span className={cn('h-1.5 w-1.5 rounded-full', row.dot)} />
            <span className="flex-1 text-brand-600 dark:text-brand-300">{row.label}</span>
            <span className="num font-semibold text-brand-900 dark:text-white">{row.value}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function BasketSize({ data }: { data: Overview }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.basket_sizes.map((row) => row.count));
  const top = data.basket_sizes.reduce((best, row) => (row.count > best.count ? row : best), data.basket_sizes[0]);
  return (
    <Panel title={t('pg.home.basketSize')} subtitle={t('pg.home.basketSubtitle')} bodyClassName="px-5 pb-5 pt-3">
      <div className="flex h-[120px] items-end gap-2">
        {data.basket_sizes.map((row) => (
          <div key={row.label} className="flex flex-1 flex-col items-center gap-2" title={`${row.label}: ${row.count}`}>
            <div className={cn('w-full rounded-[3px]', row === top && row.count > 0 ? 'bg-accent' : 'bg-brand-200 dark:bg-brand-800')} style={{ height: `${Math.max(6, (row.count / max) * 100)}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {data.basket_sizes.map((row) => <span key={row.label} className="flex-1 text-center text-xs text-brand-500">{row.label}</span>)}
      </div>
    </Panel>
  );
}

function TopAreas({ data }: { data: Overview }) {
  const { t } = useTranslation();
  return (
    <Panel title={t('pg.home.topAreas')} subtitle={t('pg.home.topAreasSubtitle')} bodyClassName="space-y-3.5 px-5 pb-5 pt-1">
      {data.top_areas.length === 0 && <p className="text-[13px] text-brand-500">{t('pg.home.noAreas')}</p>}
      {data.top_areas.map((row) => (
        <div key={row.area}>
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="truncate text-brand-900 dark:text-white">{row.area}</span>
            <span className="num font-medium text-brand-900 dark:text-white">{Math.round(row.share)}%</span>
          </div>
          <ProgressBar value={row.share} />
        </div>
      ))}
    </Panel>
  );
}

function BusyTimes({ data }: { data: Overview }) {
  const { t } = useTranslation();
  const peak = data.busy_times.peak;
  return (
    <Panel
      title={t('pg.home.busyTimes')}
      subtitle={t('pg.home.lastWeeks', { count: data.busy_times.weeks })}
      action={peak.count > 0 ? <Pill tone="accent">{t('pg.home.peak', { day: t(`pg.days.${peak.weekday.toLowerCase()}`), hour: `${hourLabel(peak.hour)} ${peak.hour < 12 ? 'am' : 'pm'}` })}</Pill> : undefined}
      bodyClassName="px-5 pb-5"
    >
      <Heatmap grid={data.busy_times.heatmap} />
    </Panel>
  );
}

function TopProducts({ data }: { data: Overview }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const can = useCan();
  return (
    <Panel title={t('pg.home.topProducts')} action={can('reports.view') ? <LinkButton onClick={() => navigate('/reports?tab=sales')}>{t('pg.common.seeAll')}</LinkButton> : undefined}>
      <table className="w-full table-fixed text-sm">
        <colgroup><col className="w-[58%]" /><col className="w-[14%]" /><col /></colgroup>
        <thead>
          <tr className="border-y border-brand-100 text-[13px] text-brand-500 dark:border-brand-800">
            <th className="px-5 py-2.5 text-start font-normal">{t('pg.home.product')}</th>
            <th className="px-2 py-2.5 text-end font-normal">{t('pg.home.units')}</th>
            <th className="px-5 py-2.5 text-end font-normal">{t('pg.home.sales')}</th>
          </tr>
        </thead>
        <tbody>
          {data.top_products.length === 0 && (
            <tr><td colSpan={3} className="px-5 py-6 text-center text-[13px] text-brand-500">{t('pg.home.noSales')}</td></tr>
          )}
          {data.top_products.map((row) => (
            <tr key={row.name} className="border-b border-brand-100 last:border-0 dark:border-brand-800">
              <td className="truncate px-5 py-3 text-brand-900 dark:text-white" title={row.name}>{row.name}</td>
              <td className="num px-2 py-3 text-end text-brand-700 dark:text-brand-300">{num(row.units).toLocaleString()}</td>
              <td className="num px-5 py-3 text-end text-brand-900 dark:text-white">{formatCurrency(num(row.revenue))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Categories({ data, chart }: { data: Overview; chart: Chart }) {
  const { t } = useTranslation();
  const dots = ['bg-brand-900 dark:bg-brand-100', 'bg-accent', 'bg-cyan-500', 'bg-brand-300 dark:bg-brand-600'];
  const colors = [chart.series[0], chart.series[1], chart.series[2], chart.series[4]];
  const rows = data.categories.map((row, index) => ({
    key: row.category || 'other', label: row.category || t('pg.common.other'), value: num(row.revenue),
    color: colors[Math.min(index, colors.length - 1)], dot: dots[Math.min(index, dots.length - 1)],
  }));
  return (
    <Panel title={t('pg.home.byCategory')} bodyClassName="flex items-center gap-6 px-5 pb-6 pt-3">
      <Donut rows={rows} chart={chart} />
      <ul className="flex-1 space-y-2.5">
        {rows.length === 0 && <li className="text-[13px] text-brand-500">{t('pg.home.noSales')}</li>}
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 text-sm">
            <span className={cn('h-1.5 w-1.5 rounded-full', row.dot)} />
            <span className="flex-1 truncate text-brand-600 dark:text-brand-300">{row.label}</span>
            <span className="num font-semibold text-brand-900 dark:text-white">{formatMoneyShort(row.value)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function NeedsAttention({ items, storeName }: { items: AttentionItem[]; storeName: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const can = useCan();
  const review = async (shiftId: number) => {
    try {
      const { data } = await salesApi.zReport(shiftId);
      printZReport(data, storeName);
    } catch {
      toast(t('pg.common.loadError'), { tone: 'warning' });
    }
  };
  const shown = items.slice(0, 6);
  return (
    <Panel title={t('pg.home.needsAttention')} action={<span className="text-[13px] text-brand-500">{t('pg.home.items', { count: items.length })}</span>}>
      {shown.length === 0 ? (
        <p className="border-t border-brand-100 px-5 py-6 text-center text-[13px] text-brand-500 dark:border-brand-800">{t('pg.home.allClear')}</p>
      ) : (
        <ul className="divide-y divide-brand-100 border-t border-brand-100 dark:divide-brand-800 dark:border-brand-800">
          {shown.map((item) => {
            let note: string;
            let tone: 'warn' | 'danger';
            let action: { label: string; run: () => void } | null = null;
            if (item.kind === 'reorder') {
              const left = num(item.stock);
              const days = item.days_left == null ? null : Math.max(0, Math.round(item.days_left));
              // The till never blocks a sale, so a miscounted shelf can go below zero: that needs a count, not a forecast.
              note = left <= 0
                ? (left < 0 ? t('pg.home.countNeeded') : t('pg.home.outOfStock'))
                : days == null ? t('pg.home.lowLeft', { left }) : days <= 1 ? t('pg.home.runsOutSoon', { left }) : t('pg.home.runsOut', { days, left });
              tone = 'warn';
              if (can('purchases.edit')) action = { label: t('pg.home.reorder'), run: () => navigate(`/purchases?reorder=${item.product_id}`) };
            } else if (item.kind === 'expiring') {
              note = item.days_left < 0 ? t('pg.home.expired', { count: num(item.stock) }) : t('pg.home.expiresIn', { count: num(item.stock), days: item.days_left });
              tone = 'danger';
              if (can('products.edit')) action = { label: t('pg.home.markDown'), run: () => navigate(`/inventory?edit=${item.product_id}`) };
            } else {
              note = t('pg.home.shortAtClose', { amount: formatCurrency(num(item.amount)) });
              tone = 'warn';
              action = { label: t('pg.home.review'), run: () => void review(item.shift_id) };
            }
            return (
              <li key={`${item.kind}-${'product_id' in item ? item.product_id : item.shift_id}`} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-brand-900 dark:text-white">{item.kind === 'short' ? t('pg.home.drawer', { name: item.title }) : item.title}</p>
                  <Pill tone={tone} className="mt-1">{note}</Pill>
                </div>
                {action && <Button variant="outline" size="sm" onClick={action.run}>{action.label}</Button>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
