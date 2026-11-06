import { useCallback, useEffect, useState } from 'react';
import { Search, Download, Eye, Printer, Receipt, Undo2 } from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Card, Button, Input, Select, Badge, Modal, EmptyState } from '@/components/ui';
import { salesApi } from '@/services/endpoints';
import { useTranslation } from '@/i18n';
import { useCan } from '@/store';
import { formatCurrency, formatDate } from '@/utils';
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

function downloadCsv(sales: Sale[]) {
  const header = ['Invoice', 'Counter', 'Cashier', 'Date', 'Items', 'Subtotal', 'Discount', 'Tax', 'Total', 'Payment'];
  const rows = sales.map((sale) => [
    sale.invoice_no, sale.terminal_name, sale.cashier_name, sale.created_at, sale.lines.length,
    sale.subtotal, sale.discount, sale.tax, sale.total, sale.payments.map((p) => p.method).join(' + '),
  ]);
  // A leading quote stops spreadsheets running a staff name that starts with = as a formula.
  const cell = (value: string | number) => {
    const text = String(value);
    return `"${(/^[=+@-]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
  };
  const csv = [header, ...rows].map((row) => row.map(cell).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'sales.csv';
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

  return (
    <>
      <Header
        title={t('sales.title')}
        subtitle={t('sales.subtitleReal')}
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

      <main className="page-bg flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: t('sales.totalRevenue'), value: formatCurrency(revenue), sub: t('common.pkr') },
            { label: t('sales.invoices'), value: String(count), sub: t('sales.completed') },
            { label: t('sales.avgBill'), value: formatCurrency(count ? Math.round((revenue / count) * 100) / 100 : 0), sub: t('sales.perInvoice') },
          ].map((s) => (
            <Card key={s.label} hover className="relative overflow-hidden">
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-accent/5" />
              <p className="text-sm text-brand-500">{s.label}</p>
              <p className="mt-1 font-display text-2xl font-bold">{s.value}</p>
              <p className="mt-0.5 text-xs text-brand-400">{s.sub}</p>
            </Card>
          ))}
        </div>

        <Card padding="none" hover>
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
                  <th>{t('sales.date')}</th>
                  <th className="text-end">{t('sales.items')}</th>
                  <th className="text-end">{t('sales.total')}</th>
                  <th>{t('sales.payment')}</th>
                  <th><span className="sr-only">{t('common.view')}</span></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-brand-400" />
                        <span dir="ltr" className="font-mono text-xs font-semibold">{sale.invoice_no}</span>
                      </div>
                    </td>
                    <td><Badge>{sale.terminal_name}</Badge></td>
                    <td className="tabular-nums text-brand-500">{formatDate(sale.created_at)}</td>
                    <td className="text-end tabular-nums">{sale.lines.length}</td>
                    <td className="text-end font-semibold tabular-nums">{formatCurrency(Number(sale.total))}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {sale.payments.map((payment) => (
                          <Badge key={payment.method} variant="info">{t(METHOD_KEYS[payment.method])}</Badge>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Button variant="ghost" size="sm" aria-label={t('common.view')} onClick={() => setViewing(sale)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !error && sales.length === 0 && (
              <EmptyState icon={Receipt} title={t('sales.empty')} />
            )}
          </div>

          {sales.length < count && (
            <div className="border-t border-brand-100 p-3 text-center dark:border-brand-800">
              <Button variant="outline" size="sm" loading={loading} onClick={() => void load(page + 1)}>
                {t('sales.loadMore')}
              </Button>
            </div>
          )}
        </Card>
      </main>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? t('sales.details', { invoice: `\u2066${viewing.invoice_no}\u2069` }) : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setViewing(null)}>{t('common.close')}</Button>
            {can('returns.create') && viewing && viewing.lines.some((line) => Number(line.returned_quantity) < Number(line.quantity)) && (
              <Button variant="outline" onClick={() => setReturning(true)}>
                <Undo2 className="h-4 w-4" /> {t('sales.returnItems')}
              </Button>
            )}
            <Button variant="accent" onClick={() => viewing && void printReceipt(viewing)}>
              <Printer className="h-4 w-4" /> {t('pos.printReceipt')}
            </Button>
          </>
        }
      >
        {viewing && (
          <div className="space-y-3 text-sm">
            <p className="text-brand-500">
              {formatDate(viewing.created_at)} · {viewing.terminal_name} · {t('sales.cashier')}: {viewing.cashier_name}
              {viewing.customer_name && ` · ${viewing.customer_name}`}
            </p>
            <div className="divide-y divide-brand-100 dark:divide-brand-800">
              {viewing.lines.map((line) => (
                <div key={line.barcode} className="flex justify-between gap-3 py-2">
                  <span>
                    {line.name} <span className="text-brand-500">× {Number(line.quantity)}</span>
                    {Number(line.returned_quantity) > 0 && (
                      <span className="ml-2 text-xs text-amber-600">{t('sales.returnedCount', { count: Number(line.returned_quantity) })}</span>
                    )}
                  </span>
                  <span className="font-semibold">{formatCurrency(Number(line.line_total))}</span>
                </div>
              ))}
            </div>
            <dl className="space-y-1 border-t border-brand-200 pt-2 dark:border-brand-700">
              {[
                [t('sales.subtotal'), viewing.subtotal],
                [t('sales.discount'), viewing.discount],
                [t('sales.tax'), viewing.tax],
                [t('sales.total'), viewing.total],
                ...viewing.payments.map((payment) => [t(METHOD_KEYS[payment.method]), payment.amount]),
                [t('sales.change'), viewing.change_due],
                ...(Number(viewing.returned_total) > 0 ? [[t('sales.returnedTotal'), viewing.returned_total]] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-brand-500">{label}</dt>
                  <dd className="font-medium">{formatCurrency(Number(value))}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Modal>
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
