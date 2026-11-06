import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Modal, Select } from '@/components/ui';
import { apiErrorMessage } from '@/services';
import { salesApi } from '@/services/endpoints';
import { useInventoryStore } from '@/store';
import { useTranslation } from '@/i18n';
import { formatCurrency, newUuid } from '@/utils';
import type { Terminal } from '@/types';

export default function WalkInReturnModal({
  terminals,
  onClose,
  onDone,
}: {
  terminals: Terminal[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const products = useInventoryStore((state) => state.products);
  const fetchProducts = useInventoryStore((state) => state.fetchProducts);
  const [terminalId, setTerminalId] = useState(String(terminals[0]?.id ?? ''));
  const [query, setQuery] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [damaged, setDamaged] = useState(false);
  const [method, setMethod] = useState('cash');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const uuid = useRef(newUuid());

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    if (!terminals.length) return;
    if (!terminalId) setTerminalId(String(terminals[0].id));
  }, [terminals, terminalId]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products.slice(0, 20);
    return products
      .filter((p) =>
        p.name.toLowerCase().includes(needle)
        || p.barcode.toLowerCase().includes(needle)
        || (p.extraBarcodes ?? []).some((code) => code.toLowerCase().includes(needle)))
      .slice(0, 20);
  }, [products, query]);

  const selected = products.find((p) => p.id === productId);
  const refund = selected
    ? (Number(qty) || 0) * (unitPrice !== '' ? Number(unitPrice) : selected.salePrice)
    : 0;

  useEffect(() => {
    uuid.current = newUuid();
  }, [productId, qty, unitPrice, damaged, method, terminalId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !terminalId) return;
    setSaving(true);
    setError('');
    try {
      await salesApi.createReturn({
        client_uuid: uuid.current,
        terminal: Number(terminalId),
        method,
        reason,
        lines: [{
          product: Number(selected.id),
          quantity: String(Number(qty)),
          restock: !damaged,
        }],
      });
      onDone();
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
      title={t('sales.walkInReturnTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button
            variant="accent"
            type="submit"
            form="walkin-return-form"
            loading={saving}
            disabled={!selected || Number(qty) <= 0 || !terminalId}
          >
            {t('sales.refundAmount', { amount: formatCurrency(Math.round(refund * 100) / 100) })}
          </Button>
        </>
      }
    >
      <form id="walkin-return-form" onSubmit={submit} className="space-y-3 text-sm">
        <Select
          id="walkin-terminal"
          label={t('sales.counter')}
          value={terminalId}
          onChange={(e) => setTerminalId(e.target.value)}
          options={terminals.map((item) => ({ value: String(item.id), label: item.name || item.code }))}
        />
        <Input
          id="walkin-search"
          label={t('sales.walkInSearch')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('sales.walkInSearchHint')}
        />
        <Select
          id="walkin-product"
          label={t('inventory.product')}
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            const product = products.find((item) => item.id === e.target.value);
            setUnitPrice(product ? String(product.salePrice) : '');
          }}
          options={[
            { value: '', label: '—' },
            ...matches.map((item) => ({
              value: item.id,
              label: `${item.name} · ${formatCurrency(item.salePrice)}`,
            })),
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            id="walkin-qty"
            label={t('pos.qty')}
            type="number"
            min={0.001}
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <Input
            id="walkin-price"
            label={t('inventory.rate')}
            type="number"
            min={0}
            step="0.01"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" className="accent-accent" checked={damaged} onChange={(e) => setDamaged(e.target.checked)} />
          {t('sales.damaged')}
        </label>
        <Select
          id="walkin-method"
          label={t('sales.refundBy')}
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          options={[
            { value: 'cash', label: t('pos.cash') },
            { value: 'jazzcash', label: t('pos.jazzcash') },
            { value: 'easypaisa', label: t('pos.easypaisa') },
            { value: 'card', label: t('pos.cardShort') },
          ]}
        />
        <Input id="walkin-reason" label={t('sales.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <p role="alert" className="text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
