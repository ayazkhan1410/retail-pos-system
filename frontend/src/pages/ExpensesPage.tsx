import { useCallback, useEffect, useState } from 'react';
import { Trash2, Wallet } from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Button, Card, Input, Select, confirmAction, toast, EmptyState } from '@/components/ui';
import { apiErrorMessage } from '@/services';
import { financeApi } from '@/services/endpoints';
import { useCan } from '@/store';
import { useTranslation } from '@/i18n';
import { formatCurrency, localDate } from '@/utils';
import type { Expense } from '@/types';

const CATEGORIES = ['rent', 'salaries', 'utilities', 'transport', 'supplies', 'other'];

export default function ExpensesPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [category, setCategory] = useState('rent');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localDate());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    financeApi.expenses().then(({ data }) => setExpenses(data)).catch(() => setError(t('expenses.loadError')));
  }, [t]);

  useEffect(load, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await financeApi.addExpense({ category, amount, date, note });
      setAmount('');
      setNote('');
      load();
    } catch (err) {
      setError(apiErrorMessage(err, t('expenses.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (expense: Expense) => {
    const confirmed = await confirmAction({ title: t('expenses.deleteTitle'), body: t('expenses.confirmDelete'), confirmLabel: t('common.delete'), tone: 'danger' });
    if (!confirmed) return;
    try {
      await financeApi.deleteExpense(expense.id);
      load();
      toast(t('expenses.deleted'));
    } catch (err) {
      setError(apiErrorMessage(err, t('expenses.saveError')));
    }
  };

  return (
    <>
      <Header title={t('expenses.title')} subtitle={t('expenses.subtitle')} />
      <main className="page-bg flex-1 space-y-4 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {can('expenses.edit') && (
          <Card hover>
            <form onSubmit={submit} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Select id="expense-category" label={t('expenses.category')} value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES.map((value) => ({ value, label: t(`expenses.cat_${value}`) }))} />
              <Input id="expense-amount" label={t('expenses.amount')} type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Input id="expense-date" label={t('sales.date')} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
              <Input id="expense-note" label={t('expenses.note')} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button variant="accent" type="submit" loading={saving}>{t('expenses.add')}</Button>
            </form>
          </Card>
        )}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        <Card padding="none" hover>
          {expenses.length === 0 && <EmptyState icon={Wallet} title={t('expenses.empty')} description={can('expenses.edit') ? t('expenses.emptyHint') : undefined} />}
          <div className="divide-y divide-brand-100 dark:divide-brand-800">
            {expenses.map((expense) => (
              <div key={expense.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t(`expenses.cat_${expense.category}`)}</p>
                  <p className="truncate text-xs text-brand-500">{expense.date} · {expense.user_name}{expense.note && ` · ${expense.note}`}</p>
                </div>
                <span className="num font-semibold">{formatCurrency(Number(expense.amount))}</span>
                {can('expenses.edit') && (
                  <Button variant="ghost" size="sm" aria-label={t('common.delete')} className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" onClick={() => void remove(expense)}><Trash2 className="h-3.5 w-3.5" /></Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      </main>
    </>
  );
}
