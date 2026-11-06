import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Input, Select } from '@/components/ui';
import { apiErrorMessage } from '@/services';
import { purchasesApi, suppliersApi, type PurchaseReturnPayload } from '@/services/endpoints';
import { mapSupplierFromApi } from '@/services/suppliers';
import { useCan, useInventoryStore } from '@/store';
import { useTranslation } from '@/i18n';
import { formatCurrency, localDate } from '@/utils';
import type { Product, Supplier } from '@/types';

type Line = { product: string; quantity: string; rate: string };

const emptyLine = (): Line => ({ product: '', quantity: '1', rate: '' });

export default function PurchaseReturnPanel() {
  const { t } = useTranslation();
  const can = useCan();
  const { products, fetchProducts } = useInventoryStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(localDate());
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [history, setHistory] = useState<{ id: number; number: string | null; status: string; total: string; supplier_name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadHistory = useCallback(() => {
    purchasesApi.listReturns()
      .then(({ data }) => setHistory(data.results))
      .catch(() => setError(t('purchases.loadError')));
  }, [t]);

  useEffect(() => {
    void fetchProducts();
    suppliersApi.getAll({ status: 'active', page_size: 100, ordering: 'name' })
      .then(({ data }) => setSuppliers(data.results.map(mapSupplierFromApi)))
      .catch(() => setSuppliers([]));
    loadHistory();
  }, [fetchProducts, loadHistory]);

  const setLine = (index: number, patch: Partial<Line>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const pickProduct = (index: number, product: Product | undefined) => {
    setLine(index, {
      product: product?.id ?? '',
      rate: product ? String(product.cost || product.price) : '',
    });
  };

  const submit = async () => {
    if (!can('purchases.edit') || !supplier) return;
    const payload: PurchaseReturnPayload = {
      supplier: Number(supplier),
      date,
      reason,
      lines: lines
        .filter((line) => line.product && Number(line.quantity) > 0)
        .map((line) => ({
          product: Number(line.product),
          quantity: String(Number(line.quantity)),
          rate: String(Number(line.rate) || 0),
        })),
    };
    if (!payload.lines.length) {
      setError(t('purchases.noLines'));
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data: draft } = await purchasesApi.createReturn(payload);
      const { data: posted } = await purchasesApi.postReturn(draft.id);
      setMessage(t('purchases.returnPosted', { number: posted.number ?? '', total: formatCurrency(Number(posted.total)) }));
      setLines([emptyLine()]);
      setReason('');
      await fetchProducts();
      loadHistory();
    } catch (err) {
      setError(apiErrorMessage(err, t('purchases.saveError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {message && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      <Card hover padding="sm">
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Select
            id="pr-supplier"
            label={t('purchases.selectSupplier')}
            value={supplier}
            disabled={!can('purchases.edit')}
            onChange={(e) => setSupplier(e.target.value)}
            options={[{ value: '', label: '—' }, ...suppliers.map((item) => ({ value: item.id, label: item.name }))]}
          />
          <Input id="pr-date" label={t('sales.date')} type="date" value={date} disabled={!can('purchases.edit')} onChange={(e) => setDate(e.target.value)} />
          <Input id="pr-reason" label={t('sales.reason')} value={reason} disabled={!can('purchases.edit')} onChange={(e) => setReason(e.target.value)} />
        </div>

        <div className="space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_6rem_7rem_auto]">
              <Select
                id={`pr-product-${index}`}
                label={index === 0 ? t('inventory.product') : undefined}
                value={line.product}
                disabled={!can('purchases.edit')}
                onChange={(e) => pickProduct(index, products.find((item) => item.id === e.target.value))}
                options={[
                  { value: '', label: '—' },
                  // shortcut: dropdown capped at 200; add typeahead when catalogues grow
                  ...products.slice(0, 200).map((item) => ({ value: item.id, label: item.name })),
                ]}
              />
              <Input
                id={`pr-qty-${index}`}
                label={index === 0 ? t('purchases.qty') : undefined}
                type="number"
                min={0}
                step="any"
                value={line.quantity}
                disabled={!can('purchases.edit')}
                onChange={(e) => setLine(index, { quantity: e.target.value })}
              />
              <Input
                id={`pr-rate-${index}`}
                label={index === 0 ? t('purchases.rate') : undefined}
                type="number"
                min={0}
                step="0.01"
                value={line.rate}
                disabled={!can('purchases.edit')}
                onChange={(e) => setLine(index, { rate: e.target.value })}
              />
              {can('purchases.edit') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-end"
                  onClick={() => setLines((current) => {
                    const next = current.filter((_, i) => i !== index);
                    return next.length ? next : [emptyLine()];
                  })}
                >
                  ×
                </Button>
              )}
            </div>
          ))}
        </div>

        {can('purchases.edit') && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setLines((current) => [...current, emptyLine()])}>
              {t('purchases.addReturnLine')}
            </Button>
            <Button variant="accent" size="sm" loading={saving} disabled={!supplier || saving} onClick={() => void submit()}>
              {t('purchases.postReturn')}
            </Button>
          </div>
        )}
      </Card>

      <Card hover padding="sm">
        <p className="mb-2 text-sm font-semibold">{t('purchases.returnHistory')}</p>
        <div className="divide-y divide-brand-100 dark:divide-brand-800">
          {history.length === 0 && <p className="py-2 text-sm text-brand-500">{t('purchases.noReturns')}</p>}
          {history.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>{row.number || t('purchases.draft')} · {row.supplier_name}</span>
              <span className="font-medium">{formatCurrency(Number(row.total))} · {row.status}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
