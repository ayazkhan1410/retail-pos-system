import { useEffect, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { Modal, Button, Input } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { formatCurrency, cn } from '@/utils';
import type { PaymentResult } from './PaymentModal';

/** Common notes a customer hands over — one tap, no typing. */
const QUICK_NOTES = [50, 100, 500, 1000, 5000];

interface CashQuickModalProps {
  open: boolean;
  total: number;
  submitting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (result: PaymentResult) => void;
  onNeedMoreOptions: () => void;
}

export default function CashQuickModal({
  open,
  total,
  submitting,
  error,
  onClose,
  onConfirm,
  onNeedMoreOptions,
}: CashQuickModalProps) {
  const { t } = useTranslation();
  const [tendered, setTendered] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const due = Math.round(Math.max(0, total) * 100) / 100;

  useEffect(() => {
    if (!open) return;
    setTendered('');
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [open, due]);

  const hasEntered = tendered.trim() !== '';
  const given = hasEntered ? Number(tendered) : 0;
  const paid = Number.isFinite(given) ? Math.round(Math.max(0, given) * 100) / 100 : 0;
  const change = hasEntered ? Math.round(Math.max(0, paid - due) * 100) / 100 : 0;
  const short = hasEntered ? Math.round(Math.max(0, due - paid) * 100) / 100 : due;
  // Must type an amount or tap Exact / a note — empty field keeps Take & Print locked.
  const canSubmit = hasEntered && paid >= due && !submitting;

  const submit = (print: boolean, event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    onConfirm({
      discount: 0,
      customer: null,
      payments: [{ method: 'cash', amount: paid.toFixed(2) }],
      print,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      preventClose={submitting}
      size="md"
      title={t('pos.cashQuickTitle')}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onNeedMoreOptions} disabled={submitting} className="mr-auto">
            {t('pos.morePaymentOptions')}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={submitting}>{t('common.cancel')}</Button>
          <Button
            variant="outline"
            type="button"
            loading={submitting}
            disabled={!canSubmit}
            onClick={() => submit(true)}
          >
            <Printer className="h-4 w-4" /> {t('pos.printReceipt')}
          </Button>
          <Button
            variant="accent"
            type="submit"
            form="cash-quick-form"
            loading={submitting}
            disabled={!canSubmit}
          >
            {t('pos.takePayment')}
          </Button>
        </div>
      }
    >
      <form id="cash-quick-form" onSubmit={(e) => submit(false, e)} className="space-y-4">
        <div className="flex items-baseline justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3 dark:bg-brand-800/50">
          <p className="text-sm font-medium text-brand-500">{t('pos.amountDue')}</p>
          <p className="num text-3xl font-semibold" data-testid="amount-due">
            {formatCurrency(due)}
          </p>
        </div>

        <Input
          ref={inputRef}
          id="cash-tendered"
          label={t('pos.cashReceived')}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          placeholder={due.toFixed(2)}
          value={tendered}
          onChange={(e) => setTendered(e.target.value)}
          className="!h-14 text-center text-2xl font-semibold tabular-nums"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTendered(due.toFixed(2))}
            className="h-10 rounded-lg border border-brand-200 px-3 text-sm font-medium hover:bg-brand-50 dark:border-brand-700 dark:hover:bg-brand-800"
          >
            {t('pos.exactCash')}
          </button>
          {QUICK_NOTES.filter((note) => note >= due).slice(0, 4).map((note) => (
            <button
              key={note}
              type="button"
              onClick={() => setTendered(String(note))}
              className={cn(
                'h-10 rounded-lg border border-brand-200 px-3 text-sm font-medium tabular-nums hover:bg-brand-50 dark:border-brand-700 dark:hover:bg-brand-800',
                Number(tendered) === note && 'border-accent bg-accent-soft text-accent',
              )}
            >
              {formatCurrency(note)}
            </button>
          ))}
        </div>

        <div className="rounded-xl bg-emerald-50 px-3 py-5 text-center sm:px-5 dark:bg-emerald-500/10">
          {short > 0 ? (
            <>
              <p className="text-sm font-medium text-red-600">{t('pos.remaining')}</p>
              <p
                dir="ltr"
                className="num font-semibold leading-none text-red-600 dark:text-red-400"
                style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)' }}
              >
                {formatCurrency(short)}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{t('pos.changeDue')}</p>
              <p
                dir="ltr"
                className="num mt-1 font-semibold leading-none text-emerald-700 dark:text-emerald-300"
                style={{ fontSize: 'clamp(2.25rem, 9vw, 4rem)' }}
                data-testid="change-preview"
              >
                {formatCurrency(change)}
              </p>
            </>
          )}
        </div>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        <p className="text-center text-[11px] text-brand-400">{t('pos.cashQuickHint')}</p>
      </form>
    </Modal>
  );
}
