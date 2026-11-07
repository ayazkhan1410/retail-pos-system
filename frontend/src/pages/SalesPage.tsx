import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Receipt } from 'lucide-react';
import PageShell from '@/components/layout/PageShell';
import { Button, EmptyState, ErrorState, SkeletonRows, toast } from '@/components/ui';
import { Avatar, Delta, FilterSelect, KpiStrip, PageHeading, Pager, Pill, SearchField } from '@/components/ui/Kit';
import ReturnModal from '@/components/sales/ReturnModal';
import WalkInReturnModal from '@/components/sales/WalkInReturnModal';
import { salesApi } from '@/services/endpoints';
import { ordersApi } from '@/services/pages';
import { useTranslation } from '@/i18n';
import { useCan } from '@/store';
import type { Sale, Terminal } from '@/types';
import type { OrderStatus, OrdersSummary } from '@/types/pages';
import { clockTime, cn, formatCurrency, localDate, num, shortDate } from '@/utils';
import { printReceipt } from '@/utils/receiptPrint';

const PAGE_SIZE = 10;
const EXPORT_PAGE = 200;
const EXPORT_MAX = 2000;
type Range = 'today' | 'yesterday' | '7d' | '30d' | 'month';

function rangeDates(range: Range): { from: string; to: string } {
  const today = new Date();
  const back = (days: number) => {
    const day = new Date(today);
    day.setDate(day.getDate() - days);
    return localDate(day);
  };
  switch (range) {
    case 'today': return { from: localDate(today), to: localDate(today) };
    case 'yesterday': return { from: back(1), to: back(1) };
    case '7d': return { from: back(6), to: localDate(today) };
    case '30d': return { from: back(29), to: localDate(today) };
    case 'month': return { from: localDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: localDate(today) };
  }
}

const STATUS_TONE: Record<OrderStatus, 'success' | 'warn' | 'accent' | 'muted' | 'danger'> = {
  paid: 'success', khata: 'warn', offline: 'accent', part_returned: 'muted', returned: 'danger',
};

function paidBy(sale: Sale, t: (key: string) => string) {
  if (sale.payments.length > 1) return t('pg.methods.split');
  const method = sale.payments[0]?.method;
  return method ? t(`pg.methods.${method}`) : t('pg.common.none');
}

function csvCell(value: string | number) {
  const text = String(value);
  // A leading = + - @ would run as a formula in Excel.
  return `"${(/^[=+@-]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
}

export default function SalesPage() {
  const { t } = useTranslation();
  const can = useCan();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [range, setRange] = useState<Range>(params.get('search') ? '30d' : 'today');
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [debounced, setDebounced] = useState(search);
  const [terminal, setTerminal] = useState('');
  const [cashier, setCashier] = useState('');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [rows, setRows] = useState<Sale[]>([]);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState<OrdersSummary | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [returning, setReturning] = useState<Sale | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    salesApi.terminals().then(({ data }) => setTerminals(data)).catch(() => undefined);
  }, []);

  const filters = useMemo(() => ({
    ...rangeDates(range),
    search: debounced || undefined,
    terminal: terminal || undefined,
    cashier: cashier || undefined,
    method: method || undefined,
  }), [cashier, debounced, method, range, terminal]);

  useEffect(() => setPage(1), [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [list, kpis] = await Promise.all([
        salesApi.list({ ...filters, page, page_size: PAGE_SIZE }),
        ordersApi.summary(filters),
      ]);
      setRows(list.data.results);
      setCount(list.data.count);
      setSummary(kpis.data);
      setSelectedId((current) => (list.data.results.some((sale) => sale.id === current) ? current : list.data.results[0]?.id ?? null));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = rows.find((sale) => sale.id === selectedId) ?? null;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: Sale[] = [];
      for (let p = 1; all.length < Math.min(count, EXPORT_MAX); p += 1) {
        const { data } = await salesApi.list({ ...filters, page: p, page_size: EXPORT_PAGE });
        all.push(...data.results);
        if (data.results.length < EXPORT_PAGE) break;
      }
      const header = ['Invoice', 'Date', 'Register', 'Cashier', 'Customer', 'Phone', 'Paid by', 'Status', 'Subtotal', 'Discount', 'Tax', 'Total', 'Returned'];
      const body = all.slice(0, EXPORT_MAX).map((sale) => [
        sale.invoice_no, sale.created_at, sale.terminal_name, sale.cashier_name, sale.customer_name, sale.customer_phone ?? '',
        sale.payments.map((payment) => payment.method).join(' + '), sale.status ?? '', sale.subtotal, sale.discount, sale.tax, sale.total, sale.returned_total,
      ]);
      const csv = [header, ...body].map((row) => row.map(csvCell).join(',')).join('\n');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
      link.download = `orders-${filters.from}-${filters.to}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      if (count > EXPORT_MAX) toast(t('pg.orders.exportCapped', { max: EXPORT_MAX }), { tone: 'warning' });
    } catch {
      toast(t('pg.common.loadError'), { tone: 'warning' });
    } finally {
      setExporting(false);
    }
  };

  const rangeOptions: { value: Range; label: string }[] = [
    { value: 'today', label: t('pg.common.today') },
    { value: 'yesterday', label: t('pg.common.yesterday') },
    { value: '7d', label: t('pg.common.days7') },
    { value: '30d', label: t('pg.common.days30') },
    { value: 'month', label: t('pg.common.thisMonth') },
  ];
  const rangeLabel = rangeOptions.find((option) => option.value === range)!.label;

  return (
    <PageShell crumb={t('nav.sales')}>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <PageHeading
            title={t('nav.sales')}
            subtitle={summary ? t('pg.orders.subtitle', { count: summary.orders.toLocaleString(), period: rangeLabel.toLowerCase(), revenue: formatCurrency(num(summary.revenue)) }) : ' '}
            actions={
              <>
                {can('sales.export') && (
                  <Button variant="outline" onClick={() => void exportCsv()} loading={exporting} disabled={count === 0}>
                    <Download className="h-4 w-4" /> {t('pg.common.export')}
                  </Button>
                )}
                {can('returns.create') && <Button variant="outline" onClick={() => setWalkIn(true)}>{t('pg.orders.newReturn')}</Button>}
              </>
            }
          />

          {summary && (
            <KpiStrip
              items={[
                { key: 'orders', label: t('nav.sales'), value: summary.orders.toLocaleString(), delta: <Delta value={summary.orders_change} suffix="" /> },
                { key: 'avg', label: t('pg.orders.avgBill'), value: formatCurrency(Math.round(num(summary.avg_bill))), delta: <Delta value={summary.avg_bill_change} /> },
                {
                  key: 'returns', label: t('pg.orders.returns'),
                  value: `${summary.returns_count} · ${formatCurrency(num(summary.returns_amount))}`,
                  hint: t('pg.orders.ofSales', { share: summary.returns_share }),
                },
                {
                  key: 'offline', label: t('pg.orders.syncedOffline'), value: summary.offline_count,
                  hint: summary.offline_terminals.length ? t('pg.orders.from', { names: summary.offline_terminals.join(', ') }) : t('pg.orders.allOnline'),
                },
              ]}
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <SearchField value={search} onChange={setSearch} placeholder={t('pg.orders.searchPlaceholder')} className="w-full sm:w-64" />
            <FilterSelect label={t('pg.orders.period')} value={range} onChange={(value) => setRange(value as Range)} options={rangeOptions} />
            <FilterSelect
              label={t('pg.orders.registers')}
              value={terminal}
              onChange={setTerminal}
              options={[{ value: '', label: t('pg.orders.allRegisters') }, ...terminals.map((item) => ({ value: String(item.id), label: item.name }))]}
            />
            <FilterSelect
              label={t('pg.orders.cashiers')}
              value={cashier}
              onChange={setCashier}
              options={[{ value: '', label: t('pg.orders.allCashiers') }, ...(summary?.cashiers ?? []).map((item) => ({ value: String(item.cashier_id), label: item.cashier__full_name || '—' }))]}
            />
            <FilterSelect
              label={t('pg.orders.payment')}
              value={method}
              onChange={setMethod}
              options={[{ value: '', label: t('pg.orders.payment') }, ...['cash', 'jazzcash', 'easypaisa', 'card', 'credit', 'raast'].map((value) => ({ value, label: t(`pg.methods.${value}`) }))]}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-brand-800 dark:bg-brand-900">
            {error ? (
              <ErrorState message={t('pg.common.loadError')} retryLabel={t('pg.common.retry')} onRetry={() => void load()} />
            ) : loading && rows.length === 0 ? (
              <SkeletonRows rows={8} columns={6} />
            ) : rows.length === 0 ? (
              <EmptyState icon={Receipt} title={t('pg.orders.empty')} description={t('pg.orders.emptyHint')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-brand-200 text-[13px] text-brand-500 dark:border-brand-800">
                      <th className="px-4 py-3 text-start font-normal">{t('pg.orders.invoice')}</th>
                      <th className="px-4 py-3 text-start font-normal">{t('pg.orders.register')}</th>
                      <th className="px-4 py-3 text-start font-normal">{t('pg.orders.customer')}</th>
                      <th className="px-4 py-3 text-start font-normal">{t('pg.orders.paidBy')}</th>
                      <th className="px-4 py-3 text-start font-normal">{t('pg.orders.status')}</th>
                      <th className="px-4 py-3 text-end font-normal">{t('pg.orders.total')}</th>
                    </tr>
                  </thead>
                  <tbody className={cn(loading && 'opacity-60')}>
                    {rows.map((sale) => {
                      const status = (sale.status ?? 'paid') as OrderStatus;
                      const active = sale.id === selectedId;
                      return (
                        <tr
                          key={sale.id}
                          onClick={() => setSelectedId(sale.id)}
                          aria-selected={active}
                          className={cn('cursor-pointer border-b border-brand-100 last:border-0 dark:border-brand-800', active ? 'bg-accent-soft/60 dark:bg-accent-soft/40' : 'hover:bg-brand-50 dark:hover:bg-brand-800/40')}
                        >
                          <td className="px-4 py-3">
                            <button type="button" className="text-start focus-ring" onClick={() => setSelectedId(sale.id)}>
                              <span dir="ltr" className="block font-medium tabular-nums text-brand-900 dark:text-white">{sale.invoice_no}</span>
                              <span className="block text-[13px] text-brand-500">{range === 'today' ? clockTime(sale.created_at) : `${shortDate(sale.created_at)} · ${clockTime(sale.created_at)}`}</span>
                            </button>
                          </td>
                          <td className="px-4 py-3 text-brand-800 dark:text-brand-200">{sale.terminal_name} <span className="text-brand-400">· {sale.cashier_name}</span></td>
                          <td className="px-4 py-3 text-brand-800 dark:text-brand-200">{sale.customer_name || t('pg.orders.walkIn')}</td>
                          <td className="px-4 py-3 text-brand-600 dark:text-brand-300">{paidBy(sale, t)}</td>
                          <td className="px-4 py-3"><Pill tone={STATUS_TONE[status]}>{t(`pg.orders.st_${status}`)}</Pill></td>
                          <td className="num px-4 py-3 text-end font-semibold text-brand-900 dark:text-white">{formatCurrency(num(sale.total))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pager page={page} pageSize={PAGE_SIZE} total={count} onPage={setPage} />
          </div>
        </div>

        <OrderDetail
          sale={selected}
          canReturn={can('returns.create')}
          canSeeCustomer={can('customers.view')}
          onReturn={(sale) => setReturning(sale)}
          onViewCustomer={(id) => navigate(`/customers?id=${id}`)}
        />
      </div>

      {returning && (
        <ReturnModal
          sale={returning}
          onClose={() => setReturning(null)}
          onDone={() => {
            setReturning(null);
            void load();
          }}
        />
      )}
      {walkIn && (
        <WalkInReturnModal
          terminals={terminals}
          onClose={() => setWalkIn(false)}
          onDone={() => {
            setWalkIn(false);
            void load();
          }}
        />
      )}
    </PageShell>
  );
}

function OrderDetail({ sale, canReturn, canSeeCustomer, onReturn, onViewCustomer }: {
  sale: Sale | null; canReturn: boolean; canSeeCustomer: boolean; onReturn: (sale: Sale) => void; onViewCustomer: (id: number) => void;
}) {
  const { t } = useTranslation();
  if (!sale) {
    return (
      <aside className="hidden rounded-xl border border-dashed border-brand-200 p-8 text-center text-sm text-brand-500 xl:block dark:border-brand-800">
        {t('pg.orders.pick')}
      </aside>
    );
  }
  const status = (sale.status ?? 'paid') as OrderStatus;
  const owes = num(sale.customer_balance);
  const fullyReturned = status === 'returned';
  return (
    <aside aria-label={t('pg.orders.detail')} className="overflow-hidden rounded-xl border border-brand-200 bg-white xl:sticky xl:top-20 dark:border-brand-800 dark:bg-brand-900">
      <div className="border-b border-brand-100 px-5 py-4 dark:border-brand-800">
        <div className="flex items-start justify-between">
          <Pill tone={STATUS_TONE[status]}>{t(`pg.orders.st_${status}`)}</Pill>
          <span className="text-[13px] text-brand-500">{clockTime(sale.created_at)}</span>
        </div>
        <p dir="ltr" className="mt-3 text-lg font-semibold tabular-nums text-brand-900 dark:text-white">{sale.invoice_no}</p>
        <p className="text-[13px] text-brand-500">{sale.terminal_name} · {sale.cashier_name} · {shortDate(sale.created_at)}</p>
      </div>
      {sale.customer && (
        <div className="flex items-center gap-3 border-b border-brand-100 px-5 py-3.5 dark:border-brand-800">
          <Avatar name={sale.customer_name} round className="bg-accent-soft text-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-brand-900 dark:text-white">{sale.customer_name}</p>
            <p className="truncate text-[13px] text-brand-500">
              <span dir="ltr">{sale.customer_phone}</span>
              {owes > 0 && ` · ${t('pg.register.owes', { amount: formatCurrency(owes) })}`}
            </p>
          </div>
          {canSeeCustomer && <button type="button" onClick={() => onViewCustomer(sale.customer!)} className="text-[13px] text-brand-500 hover:text-brand-900 focus-ring dark:hover:text-white">{t('pg.common.view')}</button>}
        </div>
      )}
      <ul className="divide-y divide-brand-100 px-5 dark:divide-brand-800">
        {sale.lines.map((line) => {
          const returned = num(line.returned_quantity);
          return (
            <li key={line.id} className="flex justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-brand-900 dark:text-white">{line.name}</p>
                <p className="text-[13px] text-brand-500">
                  {num(line.quantity)} × {formatCurrency(num(line.unit_price))}
                  {returned > 0 && <span className="ms-1 text-red-500">· {t('pg.orders.returnedQty', { count: returned })}</span>}
                </p>
              </div>
              <span className="num shrink-0 text-sm text-brand-900 dark:text-white">{formatCurrency(num(line.line_total))}</span>
            </li>
          );
        })}
      </ul>
      <dl className="space-y-1.5 border-t border-brand-100 px-5 py-4 text-sm dark:border-brand-800">
        <div className="flex justify-between text-brand-500"><dt>{t('pos.subtotal')}</dt><dd className="num">{formatCurrency(num(sale.subtotal))}</dd></div>
        <div className="flex justify-between text-brand-500"><dt>{t('pg.register.discount')}</dt><dd className="num">{num(sale.discount) ? `− ${formatCurrency(num(sale.discount))}` : '—'}</dd></div>
        {num(sale.returned_total) > 0 && (
          <div className="flex justify-between text-red-500"><dt>{t('pg.orders.returns')}</dt><dd className="num">− {formatCurrency(num(sale.returned_total))}</dd></div>
        )}
        <div className="flex justify-between pt-1.5 text-base font-semibold text-brand-900 dark:text-white"><dt>{t('pg.orders.total')}</dt><dd className="num">{formatCurrency(num(sale.total))}</dd></div>
      </dl>
      <div className="grid grid-cols-2 gap-2 px-5 pb-5">
        <Button variant="outline" onClick={() => void printReceipt(sale)}>{t('pg.orders.printReceipt')}</Button>
        <Button variant="outline" disabled={!canReturn || fullyReturned || sale.is_offline && sale.id === 0} onClick={() => onReturn(sale)}>
          {t('pg.orders.returnItems')}
        </Button>
      </div>
    </aside>
  );
}
