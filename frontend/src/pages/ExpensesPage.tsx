import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Plus, Trash2, Wallet } from 'lucide-react';
import PageShell from '@/components/layout/PageShell';
import { Button, EmptyState, ErrorState, Input, Modal, Select, SkeletonRows, confirmAction, toast } from '@/components/ui';
import { Delta, FilterSelect, KpiStrip, PageHeading, Panel, Pill, SearchField, StackedBar } from '@/components/ui/Kit';
import { apiErrorMessage } from '@/services';
import { financeApi, salesApi } from '@/services/endpoints';
import { expensePagesApi } from '@/services/pages';
import { useCan } from '@/store';
import { useTranslation } from '@/i18n';
import type { Expense, Terminal } from '@/types';
import type { ExpenseSummary } from '@/types/pages';
import { cn, formatCurrency, localDate, num, shortDate } from '@/utils';
import { SERIES_CLASSES } from '@/utils/chartTheme';

const CATEGORIES = ['rent', 'salaries', 'utilities', 'transport', 'supplies', 'other'];
const MONTHS_BACK = 12;
/** "drawer:<terminal id>" means cash taken out of that register's drawer. */
type PaidFrom = 'bank' | 'cash' | 'cheque' | 'jazzcash' | 'easypaisa' | 'card' | `drawer:${number}`;

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(key: string) {
  const [year, month] = key.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const today = new Date();
  return { from: localDate(first), to: localDate(last > today ? today : last) };
}

export default function ExpensesPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [rows, setRows] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [formOpen, setFormOpen] = useState(false);

  const months = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const cursor = new Date();
    cursor.setDate(1);
    for (let i = 0; i < MONTHS_BACK; i += 1) {
      out.push({
        value: monthKey(cursor),
        label: i === 0 ? t('pg.common.thisMonth') : new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(cursor),
      });
      cursor.setMonth(cursor.getMonth() - 1);
    }
    return out;
  }, [t]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [list, kpis] = await Promise.all([expensePagesApi.list(monthRange(month)), expensePagesApi.summary(month)]);
      setRows(list.data);
      setSummary(kpis.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    salesApi.terminals().then(({ data }) => setTerminals(data)).catch(() => undefined);
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.note.toLowerCase().includes(q) || t(`expenses.cat_${row.category}`).toLowerCase().includes(q) || row.user_name?.toLowerCase().includes(q));
  }, [rows, search, t]);

  const remove = async (expense: Expense) => {
    const confirmed = await confirmAction({ title: t('expenses.deleteTitle'), body: t('expenses.confirmDelete'), confirmLabel: t('common.delete'), tone: 'danger' });
    if (!confirmed) return;
    try {
      await financeApi.deleteExpense(expense.id);
      toast(t('expenses.deleted'));
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, t('expenses.saveError')), { tone: 'warning' });
    }
  };

  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`));
  const biggest = summary?.by_category[0];
  const paidFrom = (row: Expense) => (row.terminal_name ? t('pg.expenses.cashFrom', { name: row.terminal_name }) : t(`pg.methods.${row.method}`));

  return (
    <PageShell crumb={t('nav.expenses')}>
      <PageHeading
        title={t('nav.expenses')}
        subtitle={monthLabel}
        actions={
          <>
            <span className="relative inline-flex items-center">
              <Calendar aria-hidden className="pointer-events-none absolute start-3 z-10 h-4 w-4 text-brand-500" />
              <FilterSelect label={t('pg.expenses.month')} value={month} onChange={setMonth} options={months} className="[&_select]:ps-9" />
            </span>
            {can('expenses.edit') && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> {t('pg.expenses.add')}</Button>}
          </>
        }
      />

      {summary && (
        <KpiStrip
          items={[
            {
              key: 'total', label: t('pg.common.thisMonth'), value: formatCurrency(num(summary.total)),
              // Spending more is bad news.
              delta: <Delta value={summary.change} good="down" />,
              hint: t('pg.expenses.vsLast', { amount: formatCurrency(num(summary.previous_total)) }),
            },
            {
              key: 'share', label: t('pg.expenses.shareOfSales'),
              value: summary.share_of_sales == null ? '—' : `${summary.share_of_sales}%`,
              hint: summary.share_of_sales == null ? t('pg.expenses.noSales') : summary.share_of_sales <= 10 ? t('pg.expenses.healthy') : t('pg.expenses.high'),
            },
            { key: 'drawers', label: t('pg.expenses.fromDrawers'), value: formatCurrency(num(summary.from_drawers)), hint: t('pg.expenses.fromDrawersHint') },
            {
              key: 'biggest', label: t('pg.expenses.biggest'),
              value: biggest ? t(`expenses.cat_${biggest.category}`) : '—',
              hint: biggest ? t('pg.expenses.ofExpenses', { share: Math.round(biggest.share) }) : t('pg.expenses.none'),
            },
          ]}
        />
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel title={t('pg.expenses.whereWent')} bodyClassName="px-5 pb-5">
          {summary && summary.by_category.length > 0 ? (
            <>
              <StackedBar parts={summary.by_category.map((row, index) => ({ key: row.category, value: num(row.amount), color: SERIES_CLASSES[Math.min(index, SERIES_CLASSES.length - 1)] }))} />
              <ul className="mt-3 divide-y divide-brand-100 dark:divide-brand-800">
                {summary.by_category.map((row, index) => (
                  <li key={row.category} className="flex items-center gap-2 py-2.5 text-sm">
                    <span className={cn('h-1.5 w-1.5 rounded-full', SERIES_CLASSES[Math.min(index, SERIES_CLASSES.length - 1)])} />
                    <span className="flex-1 text-brand-800 dark:text-brand-200">{t(`expenses.cat_${row.category}`)}</span>
                    <span className="num w-12 text-end text-brand-500">{Math.round(row.share)}%</span>
                    <span className="num w-28 text-end font-semibold text-brand-900 dark:text-white">{formatCurrency(num(row.amount))}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="py-6 text-center text-[13px] text-brand-500">{t('pg.expenses.none')}</p>
          )}
        </Panel>

        <section className="overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-brand-800 dark:bg-brand-900">
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
            <h2 className="text-[15px] font-semibold text-brand-900 dark:text-white">{t('pg.expenses.all')}</h2>
            <SearchField value={search} onChange={setSearch} placeholder={t('pg.common.search')} className="w-full sm:w-60" />
          </header>
          {error ? (
            <ErrorState message={t('pg.common.loadError')} retryLabel={t('pg.common.retry')} onRetry={() => void load()} />
          ) : loading && rows.length === 0 ? (
            <SkeletonRows rows={6} columns={6} />
          ) : shown.length === 0 ? (
            <EmptyState icon={Wallet} title={t('expenses.empty')} description={t('expenses.emptyHint')} compact />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-y border-brand-100 text-[13px] text-brand-500 dark:border-brand-800">
                    <th className="px-5 py-2.5 text-start font-normal">{t('pg.purchases.date')}</th>
                    <th className="px-3 py-2.5 text-start font-normal">{t('expenses.category')}</th>
                    <th className="px-3 py-2.5 text-start font-normal">{t('pg.expenses.description')}</th>
                    <th className="px-3 py-2.5 text-start font-normal">{t('pg.expenses.paidFrom')}</th>
                    <th className="px-3 py-2.5 text-start font-normal">{t('pg.expenses.addedBy')}</th>
                    <th className="px-5 py-2.5 text-end font-normal">{t('pg.expenses.amount')}</th>
                    {can('expenses.edit') && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.id} className="group border-b border-brand-100 last:border-0 dark:border-brand-800">
                      <td className="whitespace-nowrap px-5 py-3 text-brand-600 dark:text-brand-300">{shortDate(row.date)}</td>
                      <td className="px-3 py-3"><Pill tone="muted">{t(`expenses.cat_${row.category}`)}</Pill></td>
                      <td className="max-w-[16rem] truncate px-3 py-3 text-brand-900 dark:text-white">{row.note || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-brand-600 dark:text-brand-300">{paidFrom(row)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-brand-600 dark:text-brand-300">{row.user_name}</td>
                      <td className="num whitespace-nowrap px-5 py-3 text-end font-semibold text-brand-900 dark:text-white">{formatCurrency(num(row.amount))}</td>
                      {can('expenses.edit') && (
                        <td className="pe-3">
                          <button type="button" onClick={() => void remove(row)} aria-label={t('common.delete')} className="rounded p-1 text-brand-300 opacity-0 transition-opacity hover:text-red-600 focus:opacity-100 group-hover:opacity-100">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ExpenseForm
        open={formOpen}
        terminals={terminals}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          toast(t('pg.expenses.saved'));
          void load();
        }}
      />
    </PageShell>
  );
}

function ExpenseForm({ open, terminals, onClose, onSaved }: { open: boolean; terminals: Terminal[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [category, setCategory] = useState('utilities');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localDate());
  const [note, setNote] = useState('');
  const [paidFrom, setPaidFrom] = useState<PaidFrom>('bank');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setNote('');
    setDate(localDate());
    setError('');
  }, [open]);

  const drawer = paidFrom.startsWith('drawer:');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await financeApi.addExpense({
        category, amount, date, note,
        method: drawer ? 'cash' : paidFrom,
        terminal: drawer ? Number(paidFrom.split(':')[1]) : null,
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, t('expenses.saveError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      preventClose={saving}
      title={t('pg.expenses.add')}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="expense-form" loading={saving} disabled={!amount}>{t('common.save')}</Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={submit} className="space-y-3">
        <Select id="expense-category" label={t('expenses.category')} value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES.map((value) => ({ value, label: t(`expenses.cat_${value}`) }))} />
        <Input id="expense-amount" label={t('expenses.amount')} type="number" min={0.01} step="0.01" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        <Input id="expense-date" label={t('pg.purchases.date')} type="date" max={localDate()} value={date} onChange={(e) => setDate(e.target.value)} />
        <Input id="expense-note" label={t('pg.expenses.description')} maxLength={255} placeholder={t('pg.expenses.descriptionHint')} value={note} onChange={(e) => setNote(e.target.value)} />
        <Select
          id="expense-from"
          label={t('pg.expenses.paidFrom')}
          value={paidFrom}
          onChange={(e) => setPaidFrom(e.target.value as PaidFrom)}
          options={[
            { value: 'bank', label: t('pg.methods.bank') },
            ...terminals.map((terminal) => ({ value: `drawer:${terminal.id}`, label: t('pg.expenses.cashFrom', { name: terminal.name }) })),
            { value: 'cash', label: t('pg.expenses.cashOther') },
            { value: 'jazzcash', label: t('pg.methods.jazzcash') },
            { value: 'easypaisa', label: t('pg.methods.easypaisa') },
            { value: 'cheque', label: t('pg.methods.cheque') },
            { value: 'card', label: t('pg.methods.card') },
          ]}
        />
        {drawer && <p className="rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-brand-700 dark:text-brand-200">{t('pg.expenses.drawerNote')}</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
