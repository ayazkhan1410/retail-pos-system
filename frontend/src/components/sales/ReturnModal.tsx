import { useEffect, useRef, useState } from 'react';
import { Button, Input, Modal, Select } from '@/components/ui';
import { apiErrorMessage } from '@/services';
import { salesApi } from '@/services/endpoints';
import { useTranslation } from '@/i18n';
import { formatCurrency, newUuid } from '@/utils';
import type { Sale } from '@/types';

export default function ReturnModal({ sale, onClose, onDone }: { sale: Sale; onClose: () => void; onDone: (sale: Sale) => void }) {
  const { t } = useTranslation();
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [damaged, setDamaged] = useState<Record<number, boolean>>({});
  const [method, setMethod] = useState('cash');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const uuid = useRef(newUuid());

  useEffect(() => {
    uuid.current = newUuid();
  }, [quantities, damaged, method]);

  const left = (line: Sale['lines'][number]) => Number(line.quantity) - Number(line.returned_quantity);
  const refund = sale.lines.reduce((sum, line) => sum + (Number(quantities[line.id]) || 0) * (Number(line.line_total) / Number(line.quantity)), 0);
  const lines = sale.lines
    .filter((line) => Number(quantities[line.id]) > 0)
    .map((line) => ({ sale_line: line.id, quantity: String(Number(quantities[line.id])), restock: !damaged[line.id] }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await salesApi.createReturn({ client_uuid: uuid.current, sale: sale.id, method, reason, lines });
      if (data.sale) onDone(data.sale);
      else onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t('sales.returnFailed')));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      preventClose={saving}
      title={t('sales.returnTitle', { invoice: `⁦${sale.invoice_no}⁩` })}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button variant="accent" type="submit" form="return-form" loading={saving} disabled={lines.length === 0}>
            {t('sales.refundAmount', { amount: formatCurrency(Math.round(refund * 100) / 100) })}
          </Button>
        </>
      }
    >
      <form id="return-form" onSubmit={submit} className="space-y-3 text-sm">
        {sale.lines.map((line) => (
          <div key={line.id} className="grid grid-cols-[1fr_5rem] items-end gap-2 border-b border-brand-100 pb-2 dark:border-brand-800">
            <div>
              <p className="font-medium">{line.name}</p>
              <p className="text-xs text-brand-500">{t('sales.leftToReturn', { count: left(line) })}</p>
              <label className="mt-1 flex items-center gap-1.5 text-xs">
                <input type="checkbox" className="accent-accent" checked={!!damaged[line.id]} onChange={(e) => setDamaged({ ...damaged, [line.id]: e.target.checked })} />
                {t('sales.damaged')}
              </label>
            </div>
            <Input
              id={`return-${line.id}`}
              aria-label={`${line.name} ${t('pos.qty')}`}
              type="number"
              min={0}
              max={left(line)}
              step="any"
              disabled={left(line) <= 0}
              value={quantities[line.id] ?? ''}
              onChange={(e) => setQuantities({ ...quantities, [line.id]: e.target.value })}
            />
          </div>
        ))}
        <Select
          id="return-method"
          label={t('sales.refundBy')}
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          options={[
            { value: 'cash', label: t('pos.cash') },
            { value: 'jazzcash', label: t('pos.jazzcash') },
            { value: 'easypaisa', label: t('pos.easypaisa') },
            { value: 'card', label: t('pos.cardShort') },
            ...(sale.customer ? [{ value: 'credit', label: t('pos.onCredit') }] : []),
          ]}
        />
        <Input id="return-reason" label={t('sales.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <p role="alert" className="text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
