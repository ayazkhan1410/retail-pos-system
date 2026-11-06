import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal, Button, Input } from '@/components/ui';
import { apiErrorMessage } from '@/services';
import { useTranslation } from '@/i18n';
import { formatCurrency } from '@/utils';
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
}

function CashForm({ title, body, label, submitLabel, preventClose, onClose, onSubmit, extraFooter }: CashFormProps) {
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
      <form id="cash-form" onSubmit={submit} className="space-y-3">
        <p className="text-sm text-brand-500">{body}</p>
        <Input id="cash-amount" label={label} type="number" min={0} step="0.01" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
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
          <Link to="/dashboard"><Button variant="outline" className="w-full">{t('pos.backToDashboard')}</Button></Link>
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
      <dl className="space-y-2 text-sm">
        {[
          [t('pos.shiftSales'), `${formatCurrency(Number(shift.sales_total))} · ${t('dashboard.salesCount', { count: shift.sales_count })}`],
          [t('pos.expectedCash'), formatCurrency(expected)],
          [t('pos.countedCash'), formatCurrency(counted)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-brand-500">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
        <div className={`flex justify-between border-t border-brand-100 pt-2 text-base font-bold dark:border-brand-800 ${difference === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          <dt>{t('pos.difference')}</dt>
          <dd>{difference > 0 ? '+' : ''}{formatCurrency(difference)}</dd>
        </div>
      </dl>
    </Modal>
  );
}
