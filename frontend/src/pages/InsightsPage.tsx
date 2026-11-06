import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, PackageX, ShoppingBasket, UserCheck } from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Badge, Card, CardHeader, CardTitle } from '@/components/ui';
import { financeApi } from '@/services/endpoints';
import { useTranslation } from '@/i18n';
import { formatCurrency } from '@/utils';
import { formatDateOnly } from '@/utils/inventoryUtils';
import type { Insights } from '@/types';

function Empty() {
  const { t } = useTranslation();
  return <p className="py-6 text-center text-sm text-brand-500">{t('insights.nothing')}</p>;
}

export default function InsightsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<Insights | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    financeApi.insights().then((response) => setData(response.data)).catch(() => setFailed(true));
  }, []);

  return (
    <>
      <Header title={t('insights.title')} subtitle={t('insights.subtitle')} />
      <main className="page-bg flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {failed && <p role="alert" className="text-sm text-red-600">{t('insights.loadError')}</p>}
        {!data && !failed && <p className="text-sm text-brand-500">{t('common.loading')}</p>}
        {data && (
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
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-brand-100 text-left text-xs text-brand-500 dark:border-brand-800">
                      <th className="py-2">{t('pos.item')}</th><th>{t('inventory.supplier')}</th><th className="text-right">{t('inventory.qtyOnHand')}</th><th className="text-right">{t('insights.perDay')}</th><th className="text-right">{t('insights.daysLeft')}</th><th className="text-right">{t('insights.order')}</th><th className="text-right">{t('insights.cost')}</th>
                    </tr></thead>
                    <tbody>
                      {data.reorder.map((row) => (
                        <tr key={row.id} className="border-b border-brand-50 dark:border-brand-800/40">
                          <td className="py-2 font-medium">{row.name}</td>
                          <td className="text-brand-500">{row.supplier || '—'}</td>
                          <td className="text-right">{Number(row.stock)}</td>
                          <td className="text-right">{Number(row.daily_sales)}</td>
                          <td className="text-right">{row.days_left === null ? '—' : Number(row.days_left)}</td>
                          <td className="text-right font-bold">{Number(row.order_quantity)}</td>
                          <td className="text-right">{formatCurrency(Number(row.order_cost))}</td>
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
      </main>
    </>
  );
}
