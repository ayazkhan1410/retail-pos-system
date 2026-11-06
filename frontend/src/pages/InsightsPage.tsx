import { Fragment, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  PackageX,
  ShoppingBasket,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Header } from '@/layouts/DashboardLayout';
import { Badge, Card, CardHeader, CardTitle, ErrorState, SkeletonRows } from '@/components/ui';
import { financeApi } from '@/services/endpoints';
import { useTranslation } from '@/i18n';
import { cn, formatCurrency, formatCurrencyCompact } from '@/utils';
import { useChartTheme } from '@/utils/chartTheme';
import { formatDateOnly } from '@/utils/inventoryUtils';
import type { Insights } from '@/types';

const METHOD_KEYS: Record<string, string> = {
  cash: 'pos.cash',
  jazzcash: 'pos.jazzcash',
  easypaisa: 'pos.easypaisa',
  raast: 'pos.raast',
  card: 'pos.cardShort',
  credit: 'pos.onCredit',
};

function Empty() {
  const { t } = useTranslation();
  return <p className="py-6 text-center text-sm text-brand-500">{t('insights.nothing')}</p>;
}

export default function InsightsPage() {
  const { t } = useTranslation();
  const chart = useChartTheme();
  const [data, setData] = useState<Insights | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<'money' | 'stock'>('money');

  useEffect(() => {
    financeApi.insights().then((response) => setData(response.data)).catch(() => setFailed(true));
  }, []);

  const money = data?.money;
  const maxHeat = Math.max(1, ...(money?.heatmap.flat() ?? [1]));
  const maxProduct = Math.max(1, ...(money?.top_products.map((row) => Number(row.revenue)) ?? [1]));
  const paymentTotal = money?.payments.reduce((sum, row) => sum + Number(row.amount), 0) ?? 0;

  const dailyChart = (money?.daily ?? []).map((row) => ({
    day: row.day.slice(5),
    net: Number(row.net_sales),
  }));

  return (
    <>
      <Header title={t('insights.title')} subtitle={t('insights.subtitle')} />
      <main className="page-bg flex-1 space-y-4 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {failed && <Card padding="none"><ErrorState message={t('insights.loadError')} /></Card>}
        {!data && !failed && <Card padding="none"><SkeletonRows rows={6} columns={6} label={t('common.loading')} /></Card>}
        {data && money && (
          <>
            <div className="flex gap-1 rounded-xl border border-brand-200 bg-brand-50 p-1 dark:border-brand-800 dark:bg-brand-900">
              {([
                { id: 'money' as const, label: t('insights.tabMoney') },
                { id: 'stock' as const, label: t('insights.tabStock') },
              ]).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    tab === item.id
                      ? 'bg-white text-brand-900 shadow-soft dark:bg-brand-800 dark:text-white'
                      : 'text-brand-500 hover:text-brand-800 dark:hover:text-brand-200',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === 'money' && (
              <>
                <div>
                  <h2 className="text-lg font-semibold">{t('insights.moneyTitle')}</h2>
                  <p className="text-sm text-brand-500">{t('insights.moneySubtitle', { days: money.window_days })}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: t('reports.netSales'), value: formatCurrency(Number(money.net_sales)) },
                    { label: t('reports.grossProfit'), value: `${formatCurrency(Number(money.gross_profit))} · ${money.gross_margin_percent}%` },
                    { label: t('reports.returns'), value: formatCurrency(Number(money.returns)) },
                    { label: t('insights.avgBasket'), value: formatCurrency(Number(money.avg_basket)), hint: t('dashboard.salesCount', { count: money.invoices }) },
                  ].map((card) => (
                    <Card key={card.label} hover className="p-4">
                      <p className="text-sm text-brand-500">{card.label}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</p>
                      {card.hint && <p className="mt-1 text-xs text-brand-400">{card.hint}</p>}
                    </Card>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <Card hover className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-accent" />
                        {t('insights.dailyNetSales')}
                      </CardTitle>
                    </CardHeader>
                    <div className="h-64 pe-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dailyChart} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                          <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="day" tick={chart.tick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
                          <YAxis tick={chart.tick} axisLine={false} tickLine={false} tickFormatter={(value) => formatCurrencyCompact(Number(value))} width={56} />
                          <Tooltip
                            {...chart.tooltip}
                            formatter={(value) => [formatCurrency(Number(value)), t('reports.netSales')]}
                          />
                          <Bar dataKey="net" fill={chart.highlight} radius={[4, 4, 0, 0]} maxBarSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card hover>
                    <CardHeader><CardTitle>{t('insights.paymentMix')}</CardTitle></CardHeader>
                    {money.payments.length === 0 ? <Empty /> : (
                      <div className="space-y-3">
                        {money.payments.map((row) => {
                          const amount = Number(row.amount);
                          const share = paymentTotal > 0 ? Math.round((amount / paymentTotal) * 100) : 0;
                          return (
                            <div key={row.method}>
                              <div className="flex justify-between gap-2 text-sm">
                                <span>{t(METHOD_KEYS[row.method] ?? row.method)}</span>
                                <span className="tabular-nums font-semibold">{formatCurrency(amount)}</span>
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-800">
                                <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                              </div>
                              <p className="mt-0.5 text-xs text-brand-400">{share}%</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card hover>
                    <CardHeader><CardTitle>{t('reports.topProducts')}</CardTitle></CardHeader>
                    {money.top_products.length === 0 ? <Empty /> : (
                      <div className="space-y-2">
                        {money.top_products.map((row) => (
                          <div key={row.name} className="flex items-center gap-3 text-sm">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{row.name}</p>
                              <p className="text-xs text-brand-500">{t('dashboard.unitsSold')} · {Number(row.units)}</p>
                            </div>
                            <div className="w-28 shrink-0">
                              <div className="h-1.5 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-800">
                                <div className="h-full rounded-full bg-accent" style={{ width: `${(Number(row.revenue) / maxProduct) * 100}%` }} />
                              </div>
                              <p className="mt-1 text-end text-xs font-semibold tabular-nums">{formatCurrency(Number(row.revenue))}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card hover>
                    <CardHeader>
                      <div>
                        <CardTitle>{t('insights.busyHours')}</CardTitle>
                        {money.peak.count > 0 && (
                          <p className="mt-0.5 text-xs text-brand-500">
                            {t('insights.peakLabel', { day: money.peak.weekday, hour: money.peak.hour })}
                          </p>
                        )}
                      </div>
                    </CardHeader>
                    <div className="overflow-x-auto pb-2">
                      <div className="inline-grid min-w-[640px] grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-0.5 text-[10px]">
                        <div />
                        {Array.from({ length: 24 }, (_, hour) => (
                          <div key={hour} className="text-center text-brand-400">{hour % 3 === 0 ? hour : ''}</div>
                        ))}
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, dayIndex) => (
                          <Fragment key={day}>
                            <div className="flex items-center pe-2 text-brand-500">{day}</div>
                            {money.heatmap[dayIndex]?.map((count, hour) => (
                              <div
                                key={`${day}-${hour}`}
                                title={`${day} ${hour}:00 · ${count}`}
                                className="aspect-square rounded-[3px]"
                                style={{
                                  backgroundColor: count
                                    ? `rgb(var(--accent) / ${0.12 + (count / maxHeat) * 0.88})`
                                    : 'rgb(var(--accent) / 0.04)',
                                }}
                              />
                            ))}
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  </Card>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Card hover className="p-4">
                    <p className="text-sm text-brand-500">{t('reports.expenses')}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(Number(money.expenses))}</p>
                  </Card>
                  <Card hover className="p-4">
                    <p className="text-sm text-brand-500">{t('reports.netProfit')}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(Number(money.net_profit))}</p>
                  </Card>
                  <Card hover className="p-4">
                    <p className="text-sm text-brand-500">{t('reports.costOfGoods')}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(Number(money.cost_of_goods))}</p>
                  </Card>
                </div>
              </>
            )}

            {tab === 'stock' && (
              <>
                <Card hover>
                  <CardHeader>
                    <div>
                      <CardTitle className="flex items-center gap-2"><ShoppingBasket className="h-5 w-5 text-accent" /> {t('insights.reorder')}</CardTitle>
                      <p className="mt-0.5 text-xs text-brand-500">{t('insights.reorderHint')}</p>
                    </div>
                  </CardHeader>
                  {data.reorder.length === 0 ? <Empty /> : (
                    <div className="overflow-x-auto">
                      <table className="data-table min-w-[640px]">
                        <thead><tr>
                          <th>{t('pos.item')}</th><th>{t('inventory.supplier')}</th><th className="text-end">{t('inventory.qtyOnHand')}</th><th className="text-end">{t('insights.perDay')}</th><th className="text-end">{t('insights.daysLeft')}</th><th className="text-end">{t('insights.order')}</th><th className="text-end">{t('insights.cost')}</th>
                        </tr></thead>
                        <tbody>
                          {data.reorder.map((row) => (
                            <tr key={row.id}>
                              <td className="font-medium">{row.name}</td>
                              <td className="text-brand-500">{row.supplier || '—'}</td>
                              <td className="text-end tabular-nums">{Number(row.stock)}</td>
                              <td className="text-end tabular-nums">{Number(row.daily_sales)}</td>
                              <td className="text-end tabular-nums">{row.days_left === null ? '—' : Number(row.days_left)}</td>
                              <td className="text-end tabular-nums font-bold">{Number(row.order_quantity)}</td>
                              <td className="text-end tabular-nums">{formatCurrency(Number(row.order_cost))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card hover>
                    <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-accent" /> {t('insights.expiry')}</CardTitle></CardHeader>
                    {data.expiry.length === 0 && <Empty />}
                    <div className="divide-y divide-brand-100 text-sm dark:divide-brand-800">
                      {data.expiry.map((row) => (
                        <div key={`${row.id}-${row.expiry_date}`} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.name} <span className="text-brand-500">× {Number(row.quantity)}</span></p>
                            <p className="text-xs text-brand-500">{formatDateOnly(row.expiry_date)} · {formatCurrency(Number(row.value_at_cost))}</p>
                          </div>
                          <Badge variant={row.days_left < 0 ? 'danger' : 'warning'}>
                            {row.suggested_markdown === null ? t('insights.writeOff') : t('insights.markdown', { percent: row.suggested_markdown })}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                  <Card hover>
                    <CardHeader><CardTitle className="flex items-center gap-2"><PackageX className="h-5 w-5 text-accent" /> {t('insights.deadStock')}</CardTitle></CardHeader>
                    {data.dead_stock.length === 0 && <Empty />}
                    <div className="divide-y divide-brand-100 text-sm dark:divide-brand-800">
                      {data.dead_stock.map((row) => (
                        <div key={row.id} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.name} <span className="text-brand-500">× {Number(row.stock)}</span></p>
                            <p className="text-xs text-brand-500">{row.last_sold ? t('insights.lastSold', { date: formatDateOnly(row.last_sold) }) : t('insights.neverSold')}</p>
                          </div>
                          <span className="font-semibold">{formatCurrency(Number(row.value_at_cost))}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
                <Card hover>
                  <CardHeader>
                    <div>
                      <CardTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5 text-accent" /> {t('insights.staff')}</CardTitle>
                      <p className="mt-0.5 text-xs text-brand-500">{t('insights.staffHint')}</p>
                    </div>
                  </CardHeader>
                  {data.staff.length === 0 && <Empty />}
                  <div className="divide-y divide-brand-100 text-sm dark:divide-brand-800">
                    {data.staff.map((row) => (
                      <div key={row.name} className="flex flex-wrap items-center justify-between gap-3 py-2">
                        <div>
                          <p className="font-medium">{row.name}</p>
                          <p className="text-xs text-brand-500">
                            {t('dashboard.salesCount', { count: row.invoices })} · {formatCurrency(Number(row.sales))} · {t('sales.discount')} {formatCurrency(Number(row.discounts))} · {t('reports.returns')} {formatCurrency(Number(row.returns))} · {t('pos.difference')} {formatCurrency(Number(row.cash_difference))}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {row.flags.map((flag) => (
                            <Badge key={flag} variant="warning"><AlertTriangle className="mr-1 inline h-3 w-3" />{t(`insights.flag_${flag}`)}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
