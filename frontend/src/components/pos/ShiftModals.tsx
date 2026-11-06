import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal, Button, Input } from '@/components/ui';
import { apiErrorMessage } from '@/services';
import { useTranslation } from '@/i18n';
import { Lock, Unlock } from 'lucide-react';
import { cn, formatCurrency } from '@/utils';
import type { Shift } from '@/types';

interface CashFormProps {
  title: string;
  body: string;
  label: string;
  submitLabel: string;
  preventClose?: boolean;
  onClose: () => void;
  onSubmit: (amount: string) => Promise<void>;
  extraFooter?: React.ReactNode;
  icon?: 'open' | 'close';
}

function CashForm({ title, body, label, submitLabel, preventClose, onClose, onSubmit, extraFooter, icon = 'open' }: CashFormProps) {
  const Icon = icon === 'open' ? Unlock : Lock;
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit(Number(amount).toFixed(2));
    } catch (err) {
      setError(apiErrorMessage(err, t('pos.saleFailed')));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      preventClose={preventClose || saving}
      title={title}
      size="sm"
      footer={
        <>
          {extraFooter}
          <Button variant="accent" type="submit" form="cash-form" loading={saving}>{submitLabel}</Button>
        </>
      }
    >
      <form id="cash-form" onSubmit={submit} className="space-y-4">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon className="h-5 w-5" />
          </span>
          <p className="pt-0.5 text-sm text-brand-600 dark:text-brand-300">{body}</p>
        </div>
        <Input
          id="cash-amount"
          label={label}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          required
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-14 text-2xl font-semibold tabular-nums"
        />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      </form>
    </Modal>
  );
}

export function OpenShiftModal({ counterName, canLeave, onOpen, onLogout }: {
  counterName: string;
  canLeave: boolean;
  onOpen: (amount: string) => Promise<void>;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  return (
    <CashForm
      title={t('pos.openShift')}
      body={t('pos.openShiftBody', { counter: counterName })}
      label={t('pos.openingCash')}
      submitLabel={t('pos.openShift')}
      preventClose
      onClose={() => undefined}
      onSubmit={onOpen}
      extraFooter={
        canLeave ? (
          <Link
            to="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-800 shadow-soft hover:bg-brand-50 focus-ring dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100 dark:hover:bg-brand-800"
          >
            {t('pos.backToDashboard')}
          </Link>
        ) : (
          <Button variant="outline" onClick={onLogout}>{t('common.logout')}</Button>
        )
      }
    />
  );
}

export function CloseShiftModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (amount: string) => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <CashForm
      title={t('pos.closeShift')}
      body={t('pos.closeShiftBody')}
      label={t('pos.countedCash')}
      submitLabel={t('pos.closeShift')}
      icon="close"
      onClose={onClose}
      onSubmit={onSubmit}
      extraFooter={<Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>}
    />
  );
}

export function ShiftSummaryModal({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const { t } = useTranslation();
  const expected = Number(shift.expected_cash);
  const counted = Number(shift.counted_cash);
  const difference = Math.round((counted - expected) * 100) / 100;
  return (
    <Modal open onClose={onClose} title={t('pos.shiftClosed')} size="sm" footer={<Button variant="accent" onClick={onClose}>{t('common.close')}</Button>}>
      <dl className="space-y-2.5 text-sm">
        {[
          [t('pos.shiftSales'), `${formatCurrency(Number(shift.sales_total))} · ${t('dashboard.salesCount', { count: shift.sales_count })}`],
          [t('pos.expectedCash'), formatCurrency(expected)],
          [t('pos.countedCash'), formatCurrency(counted)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-brand-500">{label}</dt>
            <dd className="num font-semibold">{value}</dd>
          </div>
        ))}
        <div
          className={cn(
            'mt-1 flex items-baseline justify-between rounded-xl px-4 py-3 text-base font-semibold',
            difference === 0
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
          )}
        >
          <dt>{t('pos.difference')}</dt>
          <dd className="num text-2xl">{difference > 0 ? '+' : ''}{formatCurrency(difference)}</dd>
        </div>
      </dl>
    </Modal>
  );
}
