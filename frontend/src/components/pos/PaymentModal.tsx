import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Button, Input, Select } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { formatCurrency } from '@/utils';
import type { Customer, PaymentMethod } from '@/types';

const METHODS: { method: PaymentMethod; labelKey: string }[] = [
  { method: 'cash', labelKey: 'pos.cash' },
  { method: 'jazzcash', labelKey: 'pos.jazzcash' },
  { method: 'easypaisa', labelKey: 'pos.easypaisa' },
  { method: 'card', labelKey: 'pos.cardShort' },
  { method: 'credit', labelKey: 'pos.onCredit' },
];

export interface PaymentResult {
  discount: number;
  customer: number | null;
  payments: { method: PaymentMethod; amount: string; reference?: string }[];
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
      <form id="payment-form" onSubmit={submit} className="space-y-3">
        <div className="flex items-baseline justify-between rounded-xl bg-brand-50 p-3 dark:bg-brand-800/40">
          <span className="text-sm text-brand-500">{t('pos.amountDue')}</span>
          <span className="font-display text-3xl font-bold" data-testid="amount-due">{formatCurrency(due)}</span>
        </div>

        {canDiscount && (
          <Input
            id="bill-discount"
            label={t('pos.billDiscount')}
            type="number"
            min={0}
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            error={discountTooBig ? t('pos.discountTooBig') : undefined}
          />
        )}

        {customers.length > 0 && (
          <div>
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
              <p className="mt-1 text-xs text-brand-500">
                {t('pos.khataStatus', { balance: formatCurrency(Number(customer.balance)), limit: formatCurrency(Number(customer.credit_limit)) })}
              </p>
            )}
          </div>
        )}

        {ordered.map(({ method, labelKey }, index) => (
          <div key={method} className="grid grid-cols-2 gap-2">
            <Input
              ref={index === 0 ? firstInput : undefined}
              id={`pay-${method}`}
              label={t(labelKey)}
              type="number"
              min={0}
              step="0.01"
              placeholder={nothingTyped && method === initialMethod ? due.toFixed(2) : '0'}
              value={amounts[method] ?? ''}
              onChange={(e) => setAmounts((prev) => ({ ...prev, [method]: e.target.value }))}
            />
            {method !== 'cash' && method !== 'credit' && (
              <Input
                id={`ref-${method}`}
                label={t('pos.reference')}
                value={references[method] ?? ''}
                onChange={(e) => setReferences((prev) => ({ ...prev, [method]: e.target.value }))}
              />
            )}
          </div>
        ))}

        <div className="space-y-1 border-t border-brand-100 pt-3 text-sm dark:border-brand-800">
          <div className="flex justify-between">
            <span className="text-brand-500">{t('pos.paid')}</span>
            <span className="font-semibold">{formatCurrency(paid)}</span>
          </div>
          {remaining > 0 && (
            <div className="flex justify-between text-red-600">
              <span>{t('pos.remaining')}</span>
              <span className="font-bold">{formatCurrency(remaining)}</span>
            </div>
          )}
          {change > 0 && !nonCashOverpaid && (
            <div className="flex justify-between text-lg text-emerald-600">
              <span>{t('pos.changeDue')}</span>
              <span className="font-bold">{formatCurrency(change)}</span>
            </div>
          )}
          {nonCashOverpaid && <p className="text-red-600">{t('pos.overpaidNonCash')}</p>}
          {error && <p role="alert" className="text-red-600">{error}</p>}
        </div>
      </form>
    </Modal>
  );
}
