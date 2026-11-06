import { useCallback, useEffect, useState } from 'react';
import { Button, Input, Select } from '@/components/ui';
import { apiErrorMessage } from '@/services';
import { useTranslation } from '@/i18n';
import { formatCurrency, formatDate } from '@/utils';
import type { LedgerEntry } from '@/types';

interface LedgerPanelProps {
  canPay: boolean;
  methods: string[];
  load: () => Promise<{ data: LedgerEntry[] }>;
  pay: (data: { amount: string; method: string; reference: string }) => Promise<void>;
}

/** Account history plus a payment form; used for both supplier and customer accounts. */
export default function LedgerPanel({ canPay, methods, load, pay }: LedgerPanelProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(methods[0]);
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    load().then(({ data }) => setEntries(data)).catch(() => setEntries([]));
    // `load` is a new function each render of the parent; the panel is keyed by account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(refresh, [refresh]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await pay({ amount: Number(amount).toFixed(2), method, reference });
      setAmount('');
      setReference('');
      refresh();
    } catch (err) {
      setError(apiErrorMessage(err, t('ledger.failed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-brand-100 p-3 dark:border-brand-800">
      {canPay && (
        <form onSubmit={submit} className="grid items-end gap-2 sm:grid-cols-4">
          <Input id="ledger-amount" label={t('ledger.recordPayment')} type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select id="ledger-method" label={t('ledger.method')} value={method} onChange={(e) => setMethod(e.target.value)} options={methods.map((value) => ({ value, label: t(`ledger.method_${value}`) }))} />
          <Input id="ledger-reference" label={t('pos.reference')} value={reference} onChange={(e) => setReference(e.target.value)} />
          <Button variant="accent" type="submit" loading={saving} className="h-11">{t('common.save')}</Button>
          {error && <p role="alert" className="text-sm text-red-600 sm:col-span-4">{error}</p>}
        </form>
      )}
      <div className="max-h-56 divide-y divide-brand-100 overflow-y-auto text-sm dark:divide-brand-800">
        {entries.length === 0 && <p className="py-4 text-center text-brand-500">{t('ledger.empty')}</p>}
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <p className="font-medium">{t(`ledger.kind_${entry.kind}`)} {entry.reference && <span dir="ltr" className="font-mono text-xs text-brand-500">{entry.reference}</span>}</p>
              <p className="text-xs text-brand-500">{formatDate(entry.created_at)} {entry.user_name && `· ${entry.user_name}`}</p>
            </div>
            <span className={`font-semibold ${Number(entry.delta) < 0 ? 'text-emerald-600' : ''}`}>{formatCurrency(Number(entry.delta))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
