import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageShell from '@/components/layout/PageShell';
import Heatmap, { hourLabel } from '@/components/charts/Heatmap';
import StockInsights from '@/components/analytics/StockInsights';
import { ErrorState, Skeleton } from '@/components/ui';
import { Delta, KpiStrip, PageHeading, Panel, Pill, ProgressBar, Segmented, Tabs } from '@/components/ui/Kit';
import { analyticsApi } from '@/services/pages';
import { useTranslation } from '@/i18n';
import { useCan } from '@/store';
import type { Analytics } from '@/types/pages';
import { cn, formatCurrency, formatMoneyShort, num } from '@/utils';
import { useChartTheme } from '@/utils/chartTheme';
import { displayName, useStoreDetails } from '@/utils/storeDetails';

type Window = 30 | 90 | 365;
const SEGMENT_TONE = { loyal: 'success', regular: 'accent', new: 'muted', at_risk: 'warn' } as const;
/** Analytics segments that have a matching Customers tab. */
const SEGMENT_LINK: Partial<Record<Analytics['segments'][number]['key'], string>> = { regular: 'regular', new: 'new', at_risk: 'at_risk' };

export default function InsightsPage() {
  const { t } = useTranslation();
  const chart = useChartTheme();
  const navigate = useNavigate();
  const can = useCan();
  const store = useStoreDetails((state) => state.details);
  const [view, setView] = useState<'customers' | 'stock'>('customers');
  const [days, setDays] = useState<Window>(90);
  const [data, setData] = useState<Analytics | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (view !== 'customers') return;
    setData(null);
    setFailed(false);
    analyticsApi.get(days).then(({ data: result }) => setData(result)).catch(() => setFailed(true));
  }, [attempt, days, view]);

  const windows = [
    { value: '30', label: t('pg.common.days30') },
    { value: '90', label: t('pg.common.days90') },
    { value: '365', label: t('pg.common.months12') },
  ];
  const windowLabel = windows.find((option) => option.value === String(days))!.label.toLowerCase();

  return (
    <PageShell crumb={t('nav.insights')}>
      <PageHeading
        title={t('nav.insights')}
        subtitle={view === 'customers' ? t('pg.analytics.subtitle', { window: windowLabel }) : t('pg.analytics.stockSubtitle')}
        actions={view === 'customers' && (
          <>
            <Segmented value={String(days)} options={windows} onChange={(value) => setDays(Number(value) as Window)} label={t('pg.analytics.window')} />
            <span className="inline-flex h-9 items-center rounded-lg border border-brand-200 bg-white px-3 text-sm text-brand-800 shadow-soft dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100">
              {store.store_name ? store.name : displayName(store)}
            </span>
          </>
        )}
      />
      <Tabs
        value={view}
        onChange={setView}
        label={t('nav.insights')}
        items={[{ value: 'customers', label: t('pg.analytics.customers') }, { value: 'stock', label: t('pg.analytics.stock') }]}
      />

      {view === 'stock' ? (
        <StockInsights />
      ) : failed ? (
        <ErrorState message={t('pg.common.loadError')} retryLabel={t('pg.common.retry')} onRetry={() => setAttempt((value) => value + 1)} />
      ) : !data ? (
        <div className="space-y-5">
          <Skeleton className="h-[104px] w-full rounded-xl" />
          <div className="grid gap-5 xl:grid-cols-2"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
        </div>
      ) : (
        <>
          <KpiStrip
            items={[
              {
                key: 'identified', label: t('pg.analytics.identified'), value: data.identified_customers.toLocaleString(),
                delta: <Delta value={data.new_customers} suffix="" />, hint: t('pg.analytics.namedShare', { share: Math.round(data.named_bill_share) }),
              },
              {
                key: 'returning', label: t('pg.customers.returningRate'), value: `${Math.round(data.returning_rate)}%`,
                delta: <Delta value={data.returning_change} suffix=" pts" />, hint: t('pg.analytics.boughtAgain'),
              },
              {
                key: 'spend', label: t('pg.analytics.avgSpend'), value: formatCurrency(Math.round(num(data.avg_spend_per_month))),
                delta: <Delta value={data.avg_spend_change} />, hint: t('pg.analytics.perMonth'),
              },
              { key: 'risk', label: t('pg.customers.seg_at_risk'), value: data.at_risk.toLocaleString(), hint: t('pg.analytics.noVisit') },
            ]}
          />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <ReturningChart data={data} chart={chart} />
            <Cohorts data={data} />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Visits data={data} />
            <Areas data={data} />
            <Panel
              title={t('pg.analytics.whenShop')}
              subtitle={t('pg.analytics.byDayHour')}
              action={data.peak.count > 0 ? <Pill tone="accent">{t('pg.home.peak', { day: t(`pg.days.${data.peak.weekday.toLowerCase()}`), hour: `${hourLabel(data.peak.hour)} ${data.peak.hour < 12 ? 'am' : 'pm'}` })}</Pill> : undefined}
              bodyClassName="px-5 pb-5"
            >
              <Heatmap grid={data.heatmap} />
            </Panel>
          </div>

          <Panel title={t('pg.analytics.segments')} action={<span className="text-brand-500">{t('pg.analytics.segmentsHint')}</span>}>
            <div className="grid grid-cols-1 gap-px border-t border-brand-100 bg-brand-100 sm:grid-cols-2 lg:grid-cols-4 dark:border-brand-800 dark:bg-brand-800">
              {data.segments.map((segment) => {
                const link = SEGMENT_LINK[segment.key];
                const body = (
                  <>
                    <div className="flex items-center justify-between">
                      <Pill tone={SEGMENT_TONE[segment.key]}>{t(`pg.analytics.seg_${segment.key}`)}</Pill>
                      <span className="text-[13px] text-brand-500">{t('pg.analytics.people', { count: segment.count.toLocaleString() })}</span>
                    </div>
                    <p className="num mt-3 text-2xl font-semibold text-brand-900 dark:text-white">{formatMoneyShort(num(segment.revenue))}</p>
                    <p className="mt-1 text-[13px] text-brand-500">
                      {t(`pg.analytics.segHint_${segment.key}`)}
                      {segment.key === 'loyal' && ` · ${t('pg.analytics.ofRevenue', { share: segment.revenue_share })}`}
                    </p>
                  </>
                );
                return link && can('customers.view') ? (
                  <button key={segment.key} type="button" onClick={() => navigate(`/customers?segment=${link}`)} className="bg-white px-5 py-4 text-start transition-colors hover:bg-brand-50 focus-ring dark:bg-brand-900 dark:hover:bg-brand-800/60">
                    {body}
                  </button>
                ) : (
                  <div key={segment.key} className="bg-white px-5 py-4 dark:bg-brand-900">{body}</div>
                );
              })}
            </div>
          </Panel>
        </>
      )}
    </PageShell>
  );
}

function ReturningChart({ data, chart }: { data: Analytics; chart: ReturnType<typeof useChartTheme> }) {
  const { t } = useTranslation();
  const points = data.returning_by_month.map((row) => ({
    month: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(`${row.month}T00:00:00`)),
    rate: row.rate,
    lastYear: row.last_year,
  }));
  const first = data.returning_by_month.find((row) => row.rate != null)?.rate;
  const last = [...data.returning_by_month].reverse().find((row) => row.rate != null)?.rate;
  const lastYearAvg = data.returning_by_month.filter((row) => row.last_year != null);
  const vsLastYear = last != null && lastYearAvg.length ? Math.round(last - lastYearAvg[lastYearAvg.length - 1].last_year!) : first != null && last != null ? Math.round(last - first) : null;
  return (
    <Panel
      title={t('pg.analytics.returningChart')}
      subtitle={t('pg.analytics.thisVsLast')}
      action={vsLastYear != null ? <Pill tone={vsLastYear >= 0 ? 'success' : 'danger'}>{`${vsLastYear > 0 ? '+' : ''}${vsLastYear} pts`}</Pill> : undefined}
    >
      <div className="h-[230px] px-2 pb-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="returnFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chart.accent} stopOpacity={0.2} />
                <stop offset="100%" stopColor={chart.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={chart.grid} />
            <XAxis dataKey="month" tick={chart.tick} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(value: number) => `${value}%`} domain={[0, 100]} tick={chart.tick} axisLine={false} tickLine={false} width={40} />
            <Tooltip {...chart.tooltip} formatter={(value: number, name: string) => [`${value}%`, name === 'rate' ? t('pg.analytics.thisYear') : t('pg.analytics.lastYear')]} />
            <Line type="monotone" dataKey="lastYear" stroke={chart.previous} strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
            <Area type="monotone" dataKey="rate" stroke={chart.accent} strokeWidth={2} fill="url(#returnFill)" dot={false} isAnimationActive={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function Cohorts({ data }: { data: Analytics }) {
  const { t } = useTranslation();
  const columns = Math.max(1, ...data.cohorts.map((row) => row.retention.length));
  const shade = (value: number) =>
    value >= 90 ? 'bg-accent text-white' : value >= 60 ? 'bg-accent/60 text-white' : value >= 45 ? 'bg-accent/45 text-white' : value >= 30 ? 'bg-accent/30 text-brand-800 dark:text-white' : 'bg-accent/15 text-brand-700 dark:text-brand-200';
  return (
    <Panel title={t('pg.analytics.comeBack')} subtitle={t('pg.analytics.cohortHint')} bodyClassName="overflow-x-auto px-5 pb-5">
      <table className="w-full min-w-[420px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr className="text-brand-500">
            <th />
            {Array.from({ length: columns }, (_, index) => (
              <th key={index} className="pb-1 font-normal">{index === 0 ? t('pg.analytics.month0') : index}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.cohorts.map((row) => (
            <tr key={row.month}>
              <th className="pe-2 text-start font-normal text-brand-600 dark:text-brand-300" title={t('pg.analytics.cohortSize', { count: row.customers })}>
                {new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(`${row.month}T00:00:00`))}
              </th>
              {Array.from({ length: columns }, (_, index) => {
                const value = row.retention[index];
                return (
                  <td key={index} className={cn('h-8 rounded-md text-center font-semibold tabular-nums', value == null || row.customers === 0 ? 'bg-brand-100 dark:bg-brand-800/60' : shade(value))}>
                    {value == null || row.customers === 0 ? '' : `${value}%`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Visits({ data }: { data: Analytics }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.visit_buckets.map((row) => row.share));
  const labels: Record<string, string> = { '1': t('pg.customers.once') };
  return (
    <Panel title={t('pg.analytics.visits')} subtitle={t('pg.analytics.lastDays', { count: data.window_days })} bodyClassName="px-5 pb-5 pt-2">
      <div className="flex h-[150px] items-end gap-2">
        {data.visit_buckets.map((row) => (
          <div key={row.label} className="flex flex-1 flex-col items-center justify-end gap-1.5">
            <span className="num text-xs font-semibold text-brand-800 dark:text-brand-100">{row.share}%</span>
            <div className={cn('w-full rounded-[3px]', row.share === max && row.share > 0 ? 'bg-accent' : 'bg-brand-200 dark:bg-brand-800')} style={{ height: `${Math.max(6, (row.share / max) * 110)}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {data.visit_buckets.map((row) => <span key={row.label} className="flex-1 text-center text-xs capitalize text-brand-500">{labels[row.label] ?? row.label}</span>)}
      </div>
    </Panel>
  );
}

function Areas({ data }: { data: Analytics }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.areas.map((row) => row.customers));
  return (
    <Panel title={t('pg.analytics.byArea')} subtitle={t('pg.home.topAreasSubtitle')} bodyClassName="space-y-3.5 px-5 pb-5 pt-1">
      {data.areas.length === 0 && <p className="text-[13px] text-brand-500">{t('pg.home.noAreas')}</p>}
      {data.areas.map((row) => (
        <div key={row.area || 'other'}>
          <div className="mb-1.5 flex justify-between gap-3 text-sm">
            <span className="truncate text-brand-900 dark:text-white">{row.area || t('pg.common.other')}</span>
            <span className="num shrink-0 text-brand-500"><span className="font-semibold text-brand-900 dark:text-white">{row.customers}</span> · {formatMoneyShort(num(row.revenue))}</span>
          </div>
          <ProgressBar value={(row.customers / max) * 100} />
        </div>
      ))}
    </Panel>
  );
}
