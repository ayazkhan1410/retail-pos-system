import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, BookUser, CreditCard, Landmark, Smartphone, type LucideIcon } from 'lucide-react';
import { Modal, Button, Input, Select } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { cn, formatCurrency } from '@/utils';
import type { Customer, PaymentMethod } from '@/types';

const METHODS: { method: PaymentMethod; labelKey: string; icon: LucideIcon }[] = [
  { method: 'cash', labelKey: 'pos.cash', icon: Banknote },
  { method: 'jazzcash', labelKey: 'pos.jazzcash', icon: Smartphone },
  { method: 'easypaisa', labelKey: 'pos.easypaisa', icon: Smartphone },
  { method: 'raast', labelKey: 'pos.raast', icon: Landmark },
  { method: 'card', labelKey: 'pos.cardShort', icon: CreditCard },
  { method: 'credit', labelKey: 'pos.onCredit', icon: BookUser },
];

export interface PaymentResult {
  discount: number;
  customer: number | null;
  payments: { method: PaymentMethod; amount: string; reference?: string }[];
  /** Cash quick-pay: print only when cashier chooses Print. */
  print?: boolean;
}

interface PaymentModalProps {
  open: boolean;
  total: number;
  initialMethod: PaymentMethod;
  canDiscount: boolean;
  customers: Customer[];
  submitting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (result: PaymentResult) => void;
}

export default function PaymentModal({
  open, total, initialMethod, canDiscount, customers, submitting, error, onClose, onConfirm,
}: PaymentModalProps) {
  const { t } = useTranslation();
  const [discount, setDiscount] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [amounts, setAmounts] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [references, setReferences] = useState<Partial<Record<PaymentMethod, string>>>({});
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDiscount('');
    setCustomerId('');
    setAmounts({});
    setReferences({});
    window.requestAnimationFrame(() => firstInput.current?.focus());
  }, [open]);

  const discountValue = Math.max(0, Number(discount) || 0);
  const due = Math.round(Math.max(0, total - discountValue) * 100) / 100;
  const nothingTyped = !Object.values(amounts).some(Boolean);

  // With nothing typed, the chosen method pays the exact bill: one key press for the usual sale.
  const payments = useMemo(() => {
    if (nothingTyped) return due > 0 ? [{ method: initialMethod, amount: due }] : [];
    return METHODS
      .map(({ method }) => ({ method, amount: Number(amounts[method]) || 0 }))
      .filter((p) => p.amount > 0);
  }, [amounts, due, initialMethod, nothingTyped]);

  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  const cash = payments.filter((p) => p.method === 'cash').reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.round((due - paid) * 100) / 100;
  const change = Math.max(0, -remaining);
  const nonCashOverpaid = change > cash;
  const discountTooBig = discountValue > total;
  const canSubmit = remaining <= 0 && !nonCashOverpaid && !discountTooBig && !submitting;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onConfirm({
      discount: discountValue,
      customer: customerId ? Number(customerId) : null,
      payments: payments.map((p) => ({
        method: p.method,
        amount: p.amount.toFixed(2),
        reference: references[p.method] || undefined,
      })),
    });
  };

  const customer = customers.find((item) => String(item.id) === customerId);
  const ordered = [...METHODS].filter(({ method }) => method !== 'credit' || customer).sort(
    (a, b) => Number(b.method === initialMethod) - Number(a.method === initialMethod),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      preventClose={submitting}
      title={t('pos.payTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>{t('common.cancel')}</Button>
          <Button variant="accent" type="submit" form="payment-form" loading={submitting} disabled={!canSubmit}>
            {t('pos.confirmPayment')}
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        <div className="flex items-baseline justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3 dark:bg-brand-800/50">
          <span className="text-sm font-medium text-brand-500 dark:text-brand-400">{t('pos.amountDue')}</span>
          <span className="num text-3xl font-semibold" data-testid="amount-due">{formatCurrency(due)}</span>
        </div>

        {(canDiscount || customers.length > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {customers.length > 0 && (
              <div className={cn(!canDiscount && 'sm:col-span-2')}>
                <Select
                  id="sale-customer"
                  label={t('pos.customer')}
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  options={[
                    { value: '', label: t('pos.walkIn') },
                    ...customers.map((item) => ({ value: String(item.id), label: item.phone ? `${item.name} (${item.phone})` : item.name })),
                  ]}
                />
                {customer && (
                  <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                    {t('pos.khataStatus', { balance: formatCurrency(Number(customer.balance)), limit: formatCurrency(Number(customer.credit_limit)) })}
                  </p>
                )}
              </div>
            )}
            {canDiscount && (
              <div className={cn(customers.length === 0 && 'sm:col-span-2')}>
                <Input
                  id="bill-discount"
                  label={t('pos.billDiscount')}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  error={discountTooBig ? t('pos.discountTooBig') : undefined}
                />
              </div>
            )}
          </div>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-brand-700 dark:text-brand-300">{t('pos.splitPayment')}</legend>
          <div className="divide-y divide-brand-100 overflow-hidden rounded-xl border border-brand-200 dark:divide-brand-800 dark:border-brand-700">
            {ordered.map(({ method, labelKey, icon: Icon }, index) => {
              const value = amounts[method] ?? '';
              const active = Number(value) > 0 || (nothingTyped && method === initialMethod);
              const hasReference = method !== 'cash' && method !== 'credit';
              return (
                <div
                  key={method}
                  className={cn(
                    'grid items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors',
                    hasReference ? 'grid-cols-[minmax(0,1fr)_8.5rem] sm:grid-cols-[minmax(0,1fr)_8.5rem_9rem]' : 'grid-cols-[minmax(0,1fr)_8.5rem]',
                    active && 'bg-accent-soft/60',
                  )}
                >
                  <label htmlFor={`pay-${method}`} className="flex min-w-0 items-center gap-2.5 text-sm font-medium">
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', active ? 'bg-accent text-white' : 'bg-brand-100 text-brand-500 dark:bg-brand-800')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="truncate">{t(labelKey)}</span>
                  </label>
                  <input
                    ref={index === 0 ? firstInput : undefined}
                    id={`pay-${method}`}
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    placeholder={nothingTyped && method === initialMethod ? due.toFixed(2) : '0'}
                    value={value}
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [method]: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-brand-200 bg-white px-3 text-end text-sm font-semibold tabular-nums placeholder:font-normal placeholder:text-brand-400 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 dark:border-brand-700 dark:bg-brand-900"
                  />
                  {hasReference && (
                    <input
                      id={`ref-${method}`}
                      aria-label={`${t(labelKey)} ${t('pos.reference')}`}
                      placeholder={t('pos.reference')}
                      value={references[method] ?? ''}
                      onChange={(e) => setReferences((prev) => ({ ...prev, [method]: e.target.value }))}
                      className="col-span-2 h-10 w-full rounded-lg border border-brand-200 bg-white px-3 text-sm placeholder:text-brand-400 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 sm:col-span-1 dark:border-brand-700 dark:bg-brand-900"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        <dl className="space-y-1.5 rounded-xl bg-brand-50 px-4 py-3 text-sm dark:bg-brand-800/50">
          <div className="flex justify-between">
            <dt className="text-brand-500 dark:text-brand-400">{t('pos.paid')}</dt>
            <dd className="num font-semibold">{formatCurrency(paid)}</dd>
          </div>
          {remaining > 0 && (
            <div className="flex justify-between text-red-700 dark:text-red-300">
              <dt>{t('pos.remaining')}</dt>
              <dd className="num font-semibold">{formatCurrency(remaining)}</dd>
            </div>
          )}
          {change > 0 && !nonCashOverpaid && (
            <div className="flex items-baseline justify-between text-emerald-700 dark:text-emerald-300">
              <dt className="font-medium">{t('pos.changeDue')}</dt>
              <dd className="num text-xl font-semibold">{formatCurrency(change)}</dd>
            </div>
          )}
        </dl>
        {nonCashOverpaid && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{t('pos.overpaidNonCash')}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      </form>
    </Modal>
  );
}
