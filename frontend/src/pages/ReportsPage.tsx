import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Download } from 'lucide-react';
import PageShell from '@/components/layout/PageShell';
import { Button, ErrorState, Input, Skeleton } from '@/components/ui';
import { KpiStrip, PageHeading, Panel, Pill, ProgressBar, Segmented, Tabs } from '@/components/ui/Kit';
import { reportPagesApi } from '@/services/pages';
import { useTranslation } from '@/i18n';
import type { FinancialReport } from '@/types';
import type { CashiersSection, KhataSection, ReportPnl, SalesSection, StockSection, TaxSection, TrendRow } from '@/types/pages';
import { cn, formatCurrency, formatMoneyShort, localDate, num, shortDate } from '@/utils';
import { useChartTheme } from '@/utils/chartTheme';
import { printFinancialReport } from '@/utils/reportPrint';

type Period = 'day' | 'week' | 'month' | 'custom';
type Tab = 'pnl' | 'sales' | 'stock' | 'tax' | 'cashiers' | 'khata';
const TABS: Tab[] = ['pnl', 'sales', 'stock', 'tax', 'cashiers', 'khata'];

function rangeFor(period: Period, custom: { from: string; to: string }) {
  const today = new Date();
  if (period === 'day') return { from: localDate(today), to: localDate(today) };
  if (period === 'week') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: localDate(start), to: localDate(today) };
  }
  if (period === 'month') return { from: localDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: localDate(today) };
  return custom;
}

const money = (value: unknown) => formatCurrency(num(value));

function Table({ head, rows, empty, foot }: { head: ReactNode[]; rows: ReactNode[][]; empty: string; foot?: ReactNode[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-y border-brand-100 text-[13px] text-brand-500 dark:border-brand-800">
            {head.map((cell, index) => <th key={index} className={cn('px-5 py-2.5 font-normal', index === 0 ? 'text-start' : 'text-end')}>{cell}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="px-5 py-8 text-center text-[13px] text-brand-500">{empty}</td></tr>}
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-brand-100 last:border-0 dark:border-brand-800">
              {row.map((cell, i) => <td key={i} className={cn('px-5 py-3', i === 0 ? 'text-brand-900 dark:text-white' : 'num text-end text-brand-700 dark:text-brand-200')}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr className="border-t border-brand-200 font-semibold dark:border-brand-700">
              {foot.map((cell, i) => <td key={i} className={cn('px-5 py-3', i === 0 ? '' : 'num text-end')}>{cell}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const chart = useChartTheme();
  const [params, setParams] = useSearchParams();
  const initialTab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'pnl';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [period, setPeriod] = useState<Period>('month');
  const [custom, setCustom] = useState(() => rangeFor('month', { from: '', to: '' }));
  const range = useMemo(() => rangeFor(period, custom), [custom, period]);
  const [pnl, setPnl] = useState<ReportPnl | null>(null);
  const [trend, setTrend] = useState<TrendRow[] | null>(null);
  const [section, setSection] = useState<SalesSection | StockSection | TaxSection | CashiersSection | KhataSection | null>(null);
  const [failed, setFailed] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    setFailed(false);
    setPnl(null);
    reportPagesApi.pnl(range).then(({ data }) => setPnl(data)).catch(() => setFailed(true));
  }, [range]);

  useEffect(() => {
    reportPagesApi.trend(6).then(({ data }) => setTrend(data)).catch(() => setTrend([]));
  }, []);

  useEffect(() => {
    if (tab === 'pnl') return;
    setSection(null);
    const request = {
      sales: () => reportPagesApi.sales(range),
      stock: () => reportPagesApi.stock(),
      tax: () => reportPagesApi.tax(range),
      cashiers: () => reportPagesApi.cashiers(range),
      khata: () => reportPagesApi.khata(),
    }[tab];
    request().then(({ data }) => setSection(data)).catch(() => setFailed(true));
  }, [range, tab]);

  const chooseTab = (next: Tab) => {
    setTab(next);
    setParams(next === 'pnl' ? {} : { tab: next }, { replace: true });
  };

  const print = async () => {
    if (!pnl || printing) return;
    setPrinting(true);
    try {
      await printFinancialReport(pnl as unknown as FinancialReport, range, {
        documentTitle: t('reports.printTitle'), period: t('reports.printPeriod'), printedAt: t('reports.printedAt'),
        profitLoss: t('reports.profitLoss'), position: t('reports.position'), topProducts: t('reports.topProducts'),
        byCategory: t('reports.byCategory'), byCashier: t('reports.byCashier'), expenseBreakdown: t('reports.expenseBreakdown'),
        netSales: t('reports.netSales'), grossProfit: t('reports.grossProfit'), expenses: t('reports.expenses'),
        netProfit: t('reports.netProfit'), grossSales: t('reports.grossSales'), returns: t('reports.returns'),
        costOfGoods: t('reports.costOfGoods'), stockValue: t('reports.stockValue'), supplierPayable: t('reports.supplierPayable'),
        customerReceivable: t('reports.customerReceivable'), taxCollected: t('reports.taxCollected'), discounts: t('reports.discounts'),
        invoices: t('sales.invoices'), footer: t('reports.printFooter'),
      }, {
        money: (value) => formatCurrency(Number(value)),
        expenseRows: pnl.expenses_by_category.map((row) => [t(`expenses.cat_${row.category}`), money(row.amount)]),
      });
    } finally {
      setPrinting(false);
    }
  };

  const tabs = TABS.map((value) => ({ value, label: t(`pg.reports.tab_${value}`) }));
  const periods = [
    { value: 'day' as const, label: t('pg.reports.day') },
    { value: 'week' as const, label: t('pg.reports.week') },
    { value: 'month' as const, label: t('pg.reports.month') },
    { value: 'custom' as const, label: t('pg.reports.custom') },
  ];
  const subtitle = `${t(`pg.reports.tab_${tab}`)} · ${range.from === range.to ? shortDate(range.from) : `${shortDate(range.from)} – ${shortDate(range.to)}`}`;

  return (
    <PageShell crumb={t('nav.reports')} subCrumb={t(`pg.reports.tab_${tab}`)}>
      <PageHeading
        title={t('nav.reports')}
        subtitle={subtitle}
        actions={
          <>
            <Segmented value={period} options={periods} onChange={setPeriod} label={t('pg.reports.period')} />
            <Button variant="outline" onClick={() => void print()} disabled={!pnl} loading={printing} title={t('pg.reports.pdfHint')}>
              <Download className="h-4 w-4" /> {t('pg.reports.pdf')}
            </Button>
          </>
        }
      />
      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44"><Input id="report-from" type="date" label={t('pg.reports.from')} max={custom.to} value={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} /></div>
          <div className="w-44"><Input id="report-to" type="date" label={t('pg.reports.to')} min={custom.from} max={localDate()} value={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} /></div>
        </div>
      )}
      <Tabs value={tab} items={tabs} onChange={chooseTab} label={t('nav.reports')} />

      {failed ? (
        <ErrorState message={t('pg.common.loadError')} retryLabel={t('pg.common.retry')} onRetry={() => { setFailed(false); setCustom({ ...custom }); }} />
      ) : tab === 'pnl' ? (
        <PnlTab pnl={pnl} trend={trend} chart={chart} period={period} range={range} />
      ) : !section ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : tab === 'sales' ? (
        <SalesTab data={section as SalesSection} />
      ) : tab === 'stock' ? (
        <StockTab data={section as StockSection} />
      ) : tab === 'tax' ? (
        <TaxTab data={section as TaxSection} />
      ) : tab === 'cashiers' ? (
        <CashiersTab data={section as CashiersSection} />
      ) : (
        <KhataTab data={section as KhataSection} />
      )}
    </PageShell>
  );
}

function PnlTab({ pnl, trend, chart, period, range }: { pnl: ReportPnl | null; trend: TrendRow[] | null; chart: ReturnType<typeof useChartTheme>; period: Period; range: { from: string; to: string } }) {
  const { t } = useTranslation();
  if (!pnl) return <Skeleton className="h-96 w-full rounded-xl" />;
  const net = num(pnl.net_profit_after_write_offs);
  const previous = num(pnl.previous_net_profit_after_write_offs);
  // A percentage only means something when both periods made a profit; otherwise show the rupee difference.
  const bothPositive = net > 0 && previous > 0;
  const change = bothPositive ? Math.round(((net - previous) / previous) * 1000) / 10 : null;
  const diff = net - previous;
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long' }).format(new Date(`${range.to}T00:00:00`));
  const title = period === 'month' ? t('pg.reports.soFar', { month: monthName }) : t('pg.reports.thisPeriod');
  const lines: [string, number, 'plus' | 'minus' | 'total' | 'grand'][] = [
    [t('pg.reports.grossSales'), num(pnl.gross_before_discounts), 'plus'],
    [t('pg.orders.returns'), num(pnl.returns), 'minus'],
    [t('pg.reports.discounts'), num(pnl.discounts), 'minus'],
    [t('pg.reports.netSales'), num(pnl.net_sales), 'total'],
    [t('pg.reports.cogs'), num(pnl.cost_of_goods), 'minus'],
    [t('pg.reports.grossProfit'), num(pnl.gross_profit), 'total'],
    [t('nav.expenses'), num(pnl.expenses), 'minus'],
    [t('pg.reports.writtenOff'), num(pnl.stock_written_off), 'minus'],
  ];
  const bars = (trend ?? []).map((row) => ({
    month: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(`${row.month}T00:00:00`)),
    sales: num(row.net_sales),
    profit: num(row.net_profit),
  }));
  const maxMargin = Math.max(1, ...pnl.margin_by_category.map((row) => row.margin_percent));
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Panel
        title={title}
        action={
          change != null
            ? <Pill tone={change >= 0 ? 'success' : 'danger'}>{t('pg.reports.netVs', { change: `${change > 0 ? '+' : ''}${change}%` })}</Pill>
            : previous !== 0 || net !== 0
              ? <Pill tone={diff >= 0 ? 'success' : 'danger'}>{t('pg.reports.netVs', { change: `${diff >= 0 ? '+' : '−'}${formatCurrency(Math.abs(diff))}` })}</Pill>
              : undefined
        }
      >
        <dl className="text-sm">
          {lines.map(([label, value, kind]) => (
            <div key={label} className={cn('flex justify-between gap-3 px-5 py-3', kind === 'total' ? 'border-t border-brand-100 font-semibold text-brand-900 dark:border-brand-800 dark:text-white' : 'text-brand-600 dark:text-brand-300')}>
              <dt>{label}</dt>
              <dd className="num">{kind === 'minus' ? `− ${formatCurrency(value)}` : formatCurrency(value)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-brand-200 px-5 py-4 text-base font-semibold text-brand-900 dark:border-brand-700 dark:text-white">
            <dt>{t('pg.reports.netProfit')}</dt>
            <dd className={cn('num', net < 0 && 'text-red-600 dark:text-red-400')}>{formatCurrency(net)}</dd>
          </div>
        </dl>
      </Panel>
      <div className="space-y-5">
        <Panel
          title={t('pg.reports.revenueProfit')}
          subtitle={t('pg.reports.lastMonths', { count: 6 })}
          action={
            <span className="flex items-center gap-4 text-[13px] text-brand-600 dark:text-brand-300">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-200 dark:bg-brand-700" />{t('pg.reports.netSales')}</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />{t('pg.reports.netProfit')}</span>
            </span>
          }
        >
          <div className="h-[220px] px-3 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} barGap={4} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="month" tick={chart.tick} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: chart.cursor }} {...chart.tooltip} formatter={(value: number, name: string) => [formatCurrency(value), name === 'sales' ? t('pg.reports.netSales') : t('pg.reports.netProfit')]} />
                <Bar dataKey="sales" fill={chart.dark ? '#3f434a' : '#e6e6ea'} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="profit" fill={chart.accent} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title={t('pg.reports.marginByCategory')} action={<span className="text-brand-500">{period === 'month' ? monthName : t('pg.reports.thisPeriod')}</span>}>
          <Table
            head={[t('pg.products.category'), t('pg.reports.netSales'), t('pg.products.margin'), '']}
            empty={t('pg.home.noSales')}
            rows={pnl.margin_by_category.map((row) => [
              row.category,
              formatMoneyShort(num(row.net_sales)),
              `${row.margin_percent.toFixed(1)}%`,
              <ProgressBar key="bar" className="ms-auto w-32" value={(row.margin_percent / maxMargin) * 100} tone={row.margin_percent < 0 ? 'danger' : 'accent'} />,
            ])}
          />
        </Panel>
      </div>
    </div>
  );
}

function SalesTab({ data }: { data: SalesSection }) {
  const { t } = useTranslation();
  const totals = data.days.reduce((sum, day) => ({ bills: sum.bills + day.bills, gross: sum.gross + num(day.gross_sales), returns: sum.returns + num(day.returns), net: sum.net + num(day.net_sales) }), { bills: 0, gross: 0, returns: 0, net: 0 });
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Panel title={t('pg.reports.byDay')}>
        <Table
          head={[t('pg.purchases.date'), t('pg.home.bills'), t('pg.reports.grossSales'), t('pg.orders.returns'), t('pg.reports.netSales'), t('pg.orders.avgBill')]}
          empty={t('pg.home.noSales')}
          rows={[...data.days].reverse().filter((day) => day.bills || num(day.returns)).map((day) => [shortDate(day.day), day.bills, money(day.gross_sales), money(day.returns), money(day.net_sales), money(Math.round(num(day.avg_bill)))])}
          foot={[t('pg.reports.total'), totals.bills, money(totals.gross), money(totals.returns), money(totals.net), totals.bills ? money(Math.round(totals.gross / totals.bills)) : '—']}
        />
      </Panel>
      <div className="space-y-5">
        <Panel title={t('pg.home.paymentMix')}>
          <Table head={[t('pg.orders.payment'), t('pg.expenses.amount')]} empty={t('pg.home.noPayments')} rows={data.payments.map((row) => [t(`pg.methods.${row.method}`), money(row.amount)])} />
        </Panel>
        <Panel title={t('pg.home.topProducts')}>
          <Table head={[t('pg.home.product'), t('pg.home.units'), t('pg.home.sales')]} empty={t('pg.home.noSales')} rows={data.top_products.map((row) => [row.name, num(row.units).toLocaleString(), money(row.revenue)])} />
        </Panel>
      </div>
    </div>
  );
}

function StockTab({ data }: { data: StockSection }) {
  const { t } = useTranslation();
  const margin = (cost: number, retail: number) => (retail ? `${Math.round(((retail - cost) / retail) * 1000) / 10}%` : '—');
  return (
    <div className="space-y-5">
      <KpiStrip items={[
        { key: 'cost', label: t('pg.reports.atCost'), value: formatCurrency(num(data.cost_value)) },
        { key: 'retail', label: t('pg.reports.atRetail'), value: formatCurrency(num(data.retail_value)) },
        { key: 'margin', label: t('pg.reports.potentialMargin'), value: margin(num(data.cost_value), num(data.retail_value)), hint: t('pg.reports.stockNow') },
      ]} />
      <Panel title={t('pg.reports.tab_stock')} subtitle={t('pg.reports.stockNow')}>
        <Table
          head={[t('pg.products.category'), t('pg.reports.products'), t('pg.home.units'), t('pg.reports.atCost'), t('pg.reports.atRetail'), t('pg.products.margin')]}
          empty={t('pg.reports.noStock')}
          rows={data.categories.map((row) => [row.category, row.products, num(row.units).toLocaleString(), money(row.cost_value), money(row.retail_value), margin(num(row.cost_value), num(row.retail_value))])}
          foot={[t('pg.reports.total'), '', num(data.units).toLocaleString(), money(data.cost_value), money(data.retail_value), margin(num(data.cost_value), num(data.retail_value))]}
        />
      </Panel>
    </div>
  );
}

function TaxTab({ data }: { data: TaxSection }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <KpiStrip items={[
        { key: 'collected', label: t('pg.reports.taxCollected'), value: money(data.collected) },
        { key: 'returned', label: t('pg.reports.taxReturned'), value: money(data.returned) },
        { key: 'net', label: t('pg.reports.netTax'), value: money(data.net_tax), hint: t('pg.reports.taxIncludedNote') },
      ]} />
      <Panel title={t('pg.reports.byRate')}>
        <Table
          head={[t('pg.reports.rate'), t('pg.reports.taxableSales'), t('pg.reports.tax')]}
          empty={t('pg.home.noSales')}
          rows={data.rates.map((row) => [`${num(row.tax_rate)}%`, money(row.taxable), money(row.tax)])}
        />
      </Panel>
    </div>
  );
}

function CashiersTab({ data }: { data: CashiersSection }) {
  const { t } = useTranslation();
  return (
    <Panel title={t('pg.reports.tab_cashiers')} subtitle={t('pg.reports.cashiersNote')}>
      <Table
        head={[t('pg.reports.cashier'), t('pg.home.bills'), t('pg.home.sales'), t('pg.orders.avgBill'), t('pg.reports.discounts'), t('pg.orders.returns'), t('pg.reports.shifts'), t('pg.reports.drawer')]}
        empty={t('pg.home.noSales')}
        rows={data.cashiers.map((row) => {
          const diff = num(row.cash_difference);
          return [
            row.name || '—', row.bills, money(row.sales), money(Math.round(num(row.avg_bill))), money(row.discounts), money(row.returns), row.shifts,
            <span key="d" className={cn(diff < 0 ? 'text-red-600 dark:text-red-400' : diff > 0 ? 'text-amber-600' : '')}>{diff === 0 ? t('pg.reports.balanced') : diff < 0 ? t('pg.home.short', { amount: money(-diff) }) : t('pg.home.over', { amount: money(diff) })}</span>,
          ];
        })}
      />
    </Panel>
  );
}

function KhataTab({ data }: { data: KhataSection }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <KpiStrip items={data.buckets.map((bucket) => ({ key: bucket, label: t('pg.reports.daysBucket', { range: bucket }), value: money(data.totals[bucket]) }))} />
      <Panel title={t('pg.reports.tab_khata')} subtitle={t('pg.reports.khataNote')}>
        <Table
          head={[t('pg.orders.customer'), ...data.buckets.map((bucket) => t('pg.reports.daysBucket', { range: bucket })), t('pg.customers.owes')]}
          empty={t('pg.reports.noKhata')}
          rows={data.customers.map((row) => [
            <span key="n">{row.name}<span dir="ltr" className="block text-[13px] text-brand-500 rtl:text-end">{row.phone}</span></span>,
            ...data.buckets.map((bucket) => (num(row.buckets[bucket]) ? money(row.buckets[bucket]) : '—')),
            <span key="b" className="font-semibold text-brand-900 dark:text-white">{money(row.balance)}</span>,
          ])}
        />
        {data.truncated && <p className="px-5 py-3 text-[13px] text-brand-500">{t('pg.reports.khataTruncated')}</p>}
      </Panel>
    </div>
  );
}
