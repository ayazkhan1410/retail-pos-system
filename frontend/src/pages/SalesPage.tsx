import { useCallback, useEffect, useState } from 'react';
import { Search, Download, Printer, Receipt, Undo2, X } from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Card, Button, Input, Select, Badge, EmptyState, StatStrip } from '@/components/ui';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { salesApi } from '@/services/endpoints';
import { useTranslation } from '@/i18n';
import { useCan } from '@/store';
import { cn, formatCurrency, formatDate } from '@/utils';
import { printReceipt } from '@/utils/receiptPrint';
import ReturnModal from '@/components/sales/ReturnModal';
import WalkInReturnModal from '@/components/sales/WalkInReturnModal';
import type { Sale, Terminal } from '@/types';

const METHOD_KEYS: Record<string, string> = {
  cash: 'pos.cash',
  jazzcash: 'pos.jazzcash',
  easypaisa: 'pos.easypaisa',
  raast: 'pos.raast',
  card: 'pos.cardShort',
  credit: 'pos.onCredit',
};

function saleStatus(sale: Sale, t: (key: string) => string) {
  const returned = Number(sale.returned_total);
  const total = Number(sale.total);
  if (returned > 0 && returned >= total) return { label: t('sales.statusReturned'), variant: 'danger' as const };
  if (returned > 0) return { label: t('sales.statusPartReturned'), variant: 'warning' as const };
  if (sale.is_offline) return { label: t('sales.statusOffline'), variant: 'info' as const };
  if (sale.payments.some((p) => p.method === 'credit')) return { label: t('sales.statusKhata'), variant: 'warning' as const };
  return { label: t('sales.statusPaid'), variant: 'success' as const };
}

function downloadCsv(sales: Sale[]) {
  const header = ['Invoice', 'Counter', 'Cashier', 'Date', 'Items', 'Subtotal', 'Discount', 'Tax', 'Total', 'Payment'];
  const rows = sales.map((sale) => [
    sale.invoice_no, sale.terminal_name, sale.cashier_name, sale.created_at, sale.lines.length,
    sale.subtotal, sale.discount, sale.tax, sale.total, sale.payments.map((p) => p.method).join(' + '),
  ]);
  const cell = (value: string | number) => {
    const text = String(value);
    return `"${(/^[=+@-]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
  };
  const csv = [header, ...rows].map((row) => row.map(cell).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'orders.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function SalesPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [sales, setSales] = useState<Sale[]>([]);
  const [count, setCount] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [page, setPage] = useState(1);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [terminal, setTerminal] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [viewing, setViewing] = useState<Sale | null>(null);
  const [returning, setReturning] = useState(false);
  const [walkInReturn, setWalkInReturn] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    salesApi.terminals().then(({ data }) => setTerminals(data)).catch(() => undefined);
  }, []);

  const load = useCallback(async (pageNumber: number) => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await salesApi.list({
        page: pageNumber,
        search: debouncedSearch || undefined,
        terminal: terminal === 'all' ? undefined : terminal,
        from: from || undefined,
        to: to || undefined,
      });
      setSales((current) => (pageNumber === 1 ? data.results : [...current, ...data.results]));
      setCount(data.count);
      setRevenue(Number(data.revenue));
      setPage(pageNumber);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, from, terminal, to]);

  useEffect(() => {
    void load(1);
  }, [load]);

  const hasMore = sales.length < count;
  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    return load(page + 1);
  }, [hasMore, loading, load, page]);
  const sentinelRef = useInfiniteScroll(hasMore && !loading, loadMore);

  const status = viewing ? saleStatus(viewing, t) : null;

  return (
    <>
      <Header
        title={t('sales.title')}
        subtitle={t('sales.subtitleOrders', { count, revenue: formatCurrency(revenue) })}
        actions={(
          <div className="flex gap-2">
            {can('returns.create') && (
              <Button variant="outline" size="sm" onClick={() => setWalkInReturn(true)}>
                <Undo2 className="h-4 w-4" /> {t('sales.walkInReturn')}
              </Button>
            )}
            {can('sales.export') && (
              <Button variant="outline" size="sm" disabled={sales.length === 0} onClick={() => downloadCsv(sales)}>
                <Download className="h-4 w-4" /> {t('sales.export')}
              </Button>
            )}
          </div>
        )}
      />

      <main className="page-bg flex min-h-0 flex-1 overflow-hidden">
        <div className={cn('flex min-w-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 lg:p-8', viewing && 'lg:pe-0')}>
          <StatStrip
            className="mb-6"
            items={[
              { key: 'revenue', label: t('sales.totalRevenue'), value: formatCurrency(revenue), hint: t('common.pkr') },
              { key: 'count', label: t('sales.invoices'), value: String(count), hint: t('sales.completed') },
              { key: 'avg', label: t('sales.avgBill'), value: formatCurrency(count ? Math.round((revenue / count) * 100) / 100 : 0), hint: t('sales.perInvoice') },
            ]}
          />

          <Card padding="none" hover className="flex-1">
            <div className="grid gap-3 border-b border-brand-100 p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-brand-800">
              <Input placeholder={t('sales.searchPlaceholder')} aria-label={t('sales.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} icon={<Search className="h-4 w-4" />} />
              <Select
                aria-label={t('sales.counter')}
                value={terminal}
                onChange={(e) => setTerminal(e.target.value)}
                options={[
                  { value: 'all', label: t('sales.allCounters') },
                  ...terminals.map((item) => ({ value: String(item.id), label: item.name })),
                ]}
              />
              <Input type="date" aria-label={t('sales.from')} title={t('sales.from')} value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" aria-label={t('sales.to')} title={t('sales.to')} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>

            {error && <p role="alert" className="m-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{t('sales.loadError')}</p>}

            <div className="overflow-x-auto">
              <table className="data-table min-w-[760px]">
                <thead>
                  <tr>
                    <th>{t('sales.invoice')}</th>
                    <th>{t('sales.counter')}</th>
                    <th>{t('sales.customer')}</th>
                    <th>{t('sales.date')}</th>
                    <th>{t('sales.payment')}</th>
                    <th>{t('sales.status')}</th>
                    <th className="text-end">{t('sales.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => {
                    const rowStatus = saleStatus(sale, t);
                    const selected = viewing?.id === sale.id;
                    return (
                      <tr
                        key={sale.id}
                        onClick={() => setViewing(sale)}
                        className={cn('cursor-pointer', selected && 'bg-accent-soft/60 dark:bg-accent/10')}
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            <Receipt className="h-4 w-4 text-brand-400" />
                            <span dir="ltr" className="font-mono text-xs font-semibold">{sale.invoice_no}</span>
                          </div>
                        </td>
                        <td><Badge>{sale.terminal_name}</Badge></td>
                        <td className="max-w-[10rem] truncate">{sale.customer_name || t('sales.walkIn')}</td>
                        <td className="tabular-nums text-brand-500">{formatDate(sale.created_at)}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {sale.payments.map((payment) => (
                              <Badge key={payment.method} variant="info">{t(METHOD_KEYS[payment.method])}</Badge>
                            ))}
                          </div>
                        </td>
                        <td><Badge variant={rowStatus.variant}>{rowStatus.label}</Badge></td>
                        <td className="text-end font-semibold tabular-nums">{formatCurrency(Number(sale.total))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!loading && !error && sales.length === 0 && (
                <EmptyState icon={Receipt} title={t('sales.empty')} />
              )}
            </div>

            <div ref={sentinelRef} className="h-8" aria-hidden />
            {loading && sales.length > 0 && (
              <p className="border-t border-brand-100 px-4 py-3 text-center text-xs text-brand-400 dark:border-brand-800">
                {t('common.loading')}
              </p>
            )}
          </Card>
        </div>

        {viewing && (
          <aside className="flex w-full shrink-0 flex-col border-t border-brand-200 bg-white max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:max-h-[70vh] max-lg:rounded-t-2xl max-lg:shadow-elevated lg:w-[380px] lg:border-s lg:border-t-0 dark:border-brand-800 dark:bg-brand-950">
            <div className="flex items-start justify-between gap-3 border-b border-brand-100 px-4 py-3 dark:border-brand-800">
              <div className="min-w-0">
                {status && <Badge variant={status.variant}>{status.label}</Badge>}
                <p dir="ltr" className="mt-1 font-mono text-sm font-semibold">{viewing.invoice_no}</p>
                <p className="text-xs text-brand-500">{formatDate(viewing.created_at)} · {viewing.terminal_name}</p>
              </div>
              <button type="button" className="rounded-lg p-1.5 text-brand-400 hover:bg-brand-100 hover:text-brand-800 focus-ring dark:hover:bg-brand-800" onClick={() => setViewing(null)} aria-label={t('common.close')}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-brand-400">{t('sales.customer')}</p>
                <p className="mt-1 font-medium">{viewing.customer_name || t('sales.walkIn')}</p>
                <p className="text-xs text-brand-500">{t('sales.cashier')}: {viewing.cashier_name}</p>
              </div>

              <div className="divide-y divide-brand-100 dark:divide-brand-800">
                {viewing.lines.map((line) => (
                  <div key={line.id || line.barcode} className="flex justify-between gap-3 py-2">
                    <span>
                      {line.name}{' '}
                      <span className="text-brand-500">× {Number(line.quantity)}</span>
                      {Number(line.returned_quantity) > 0 && (
                        <span className="ms-2 text-xs text-amber-600">{t('sales.returnedCount', { count: Number(line.returned_quantity) })}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(Number(line.line_total))}</span>
                  </div>
                ))}
              </div>

              <dl className="space-y-1.5 border-t border-brand-200 pt-3 dark:border-brand-700">
                {[
                  [t('sales.subtotal'), viewing.subtotal],
                  [t('sales.discount'), viewing.discount],
                  [t('sales.tax'), viewing.tax],
                  [t('sales.total'), viewing.total],
                  ...viewing.payments.map((payment) => [t(METHOD_KEYS[payment.method]), payment.amount] as const),
                  ...(Number(viewing.returned_total) > 0 ? [[t('sales.returnedTotal'), viewing.returned_total] as const] : []),
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between gap-3">
                    <dt className="text-brand-500">{label}</dt>
                    <dd className="font-medium tabular-nums">{formatCurrency(Number(value))}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="flex gap-2 border-t border-brand-100 p-3 dark:border-brand-800">
              <Button variant="outline" className="flex-1" onClick={() => void printReceipt(viewing)}>
                <Printer className="h-4 w-4" /> {t('pos.printReceipt')}
              </Button>
              {can('returns.create') && viewing.lines.some((line) => Number(line.returned_quantity) < Number(line.quantity)) && (
                <Button variant="accent" className="flex-1" onClick={() => setReturning(true)}>
                  <Undo2 className="h-4 w-4" /> {t('sales.returnItems')}
                </Button>
              )}
            </div>
          </aside>
        )}
      </main>

      {returning && viewing && (
        <ReturnModal
          sale={viewing}
          onClose={() => setReturning(false)}
          onDone={(sale) => {
            setReturning(false);
            setViewing(sale);
            void load(1);
          }}
        />
      )}
      {walkInReturn && (
        <WalkInReturnModal
          terminals={terminals}
          onClose={() => setWalkInReturn(false)}
          onDone={() => {
            setWalkInReturn(false);
            void load(1);
          }}
        />
      )}
    </>
  );
}
