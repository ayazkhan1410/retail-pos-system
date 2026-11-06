import { useState, useEffect, useMemo, useRef } from 'react';
import { ScanBarcode } from 'lucide-react';
import { Input, Select } from '@/components/ui';
import { useCan, useInventoryStore, type ProductFormData } from '@/store';
import { suppliersApi } from '@/services/endpoints';
import type { Product, SupplierApiOption } from '@/types';
import { generateInternalBarcode, isInternalBarcode } from '@/utils/barcode';
import { useTranslation } from '@/i18n';

export type { ProductFormData } from '@/store';

export interface ProductFormSubmitResult extends ProductFormData {
  shouldPrintLabel: boolean;
}

const emptyProduct: ProductFormData = {
  active: true,
  name: '',
  barcode: '',
  sku: '',
  price: 0,
  cost: 0,
  stock: 0,
  category: 'GROCERY',
  threshHold: 10,
  trackExpiry: false,
  oemBarcode: false,
  itemType: 'Trading Item',
  uom: 'PCS',
};

const TEXT_FIELDS = [
  ['subCategory', 'inventory.subCategory'],
  ['brand', 'inventory.brand'],
  ['make', 'inventory.make'],
  ['attributes', 'inventory.attributes'],
  ['size', 'inventory.size'],
  ['colour', 'inventory.colour'],
  ['designModel', 'inventory.designModel'],
  ['department', 'inventory.department'],
  ['season', 'inventory.season'],
  ['itemType', 'inventory.itemType'],
  ['uom', 'inventory.uom'],
  ['caseUnit', 'inventory.caseUnit'],
] as const;

const NUMBER_FIELDS = [
  ['boxPcs', 'inventory.boxPcs'],
  ['weight', 'inventory.weight'],
  ['leadTime', 'inventory.leadTime'],
  ['minLevel', 'inventory.minLevel'],
  ['maxLevel', 'inventory.maxLevel'],
] as const;

const FLAG_FIELDS = [
  ['active', 'inventory.active'],
  ['qtyDecimal', 'inventory.qtyDecimal'],
  ['unorderable', 'inventory.unorderable'],
  ['isStyleItem', 'inventory.isStyleItem'],
] as const;

interface ProductFormProps {
  product?: Product | null;
  onSubmit: (data: ProductFormSubmitResult) => void;
}

export default function ProductForm({ product, onSubmit }: ProductFormProps) {
  const { t } = useTranslation();
  const can = useCan();
  const categories = useInventoryStore((state) => state.categories);
  const [suppliers, setSuppliers] = useState<SupplierApiOption[]>([]);
  const [form, setForm] = useState<ProductFormData>(emptyProduct);
  const [hasFactoryBarcode, setHasFactoryBarcode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(() => generateInternalBarcode());
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasFactoryBarcode) return;
    const id = window.requestAnimationFrame(() => barcodeInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [hasFactoryBarcode]);

  useEffect(() => {
    if (product) {
      setForm({ ...emptyProduct, ...product });
      const code = product.aluCode || product.sku || product.barcode || '';
      const isFactory =
        product.oemBarcode === true || (!!code && !isInternalBarcode(code));
      setHasFactoryBarcode(isFactory);
      if (!isFactory && code) {
        setGeneratedCode(code);
      }
    } else {
      setForm(emptyProduct);
      setHasFactoryBarcode(false);
      setGeneratedCode(generateInternalBarcode());
    }
  }, [product]);

  useEffect(() => {
    suppliersApi.getAll({ status: 'active', page_size: 100, ordering: 'name' })
      .then(({ data }) => setSuppliers(data.results.map(({ id, name }) => ({ id, name }))))
      .catch(() => setSuppliers([]));
  }, []);

  const previewCode = useMemo(() => {
    if (hasFactoryBarcode) {
      return form.aluCode || form.sku || form.barcode || '';
    }
    return generatedCode;
  }, [form.aluCode, form.barcode, form.sku, generatedCode, hasFactoryBarcode]);

  const set = <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName) return;

    const itemCode = hasFactoryBarcode
      ? (form.aluCode?.trim() || form.sku.trim() || form.barcode.trim())
      : generatedCode;

    onSubmit({
      ...form,
      name: trimmedName,
      aluCode: itemCode,
      barcode: itemCode,
      sku: itemCode,
      oemBarcode: hasFactoryBarcode,
      trackExpiry: !!form.expiryDate,
      shouldPrintLabel: !hasFactoryBarcode && !product,
    });
  };

  const switchToGenerated = () => {
    setHasFactoryBarcode(false);
    if (product) {
      const code = product.aluCode || product.sku || product.barcode;
      if (code && isInternalBarcode(code)) {
        setGeneratedCode(code);
      }
    }
  };

  return (
    <form id="product-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <Input
        label={`${t('inventory.itemDescription')} *`}
        value={form.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder="e.g. Sprite 1.5 LTR"
        required
        className="sm:col-span-2"
      />

      <Select
        label={`${t('inventory.category')} *`}
        value={form.category}
        onChange={(e) => set('category', e.target.value)}
        options={categories.map((c) => ({ value: c, label: c }))}
      />

      {can('products.view_cost') && <Input
        label={`${t('inventory.cost')} *`}
        type="number"
        min={0}
        step="0.01"
        value={form.cost}
        onChange={(e) => set('cost', Number(e.target.value))}
        required
      />}

      <Input
        label={`${t('inventory.rate')} *`}
        type="number"
        min={0}
        step="0.01"
        value={form.price}
        onChange={(e) => set('price', Number(e.target.value))}
        required
      />

      <Input
        label={t('inventory.saleRate')}
        type="number"
        min={0}
        step="0.01"
        value={form.saleRate ?? ''}
        onChange={(e) => set('saleRate', e.target.value === '' ? undefined : Number(e.target.value))}
        placeholder={t('inventory.saleRateHint')}
      />

      <Input
        label={t('inventory.extraBarcodes')}
        value={(form.extraBarcodes ?? []).join(', ')}
        onChange={(e) => set(
          'extraBarcodes',
          e.target.value.split(/[\s,]+/).map((code) => code.trim()).filter(Boolean),
        )}
        placeholder={t('inventory.extraBarcodesHint')}
        className="sm:col-span-2"
      />

      <div className="sm:col-span-2 rounded-xl border border-brand-200/80 bg-brand-50/50 p-4 dark:border-brand-700 dark:bg-brand-800/30">
        <p className="mb-3 text-sm font-medium text-brand-800 dark:text-brand-200">
          {t('inventory.barcodeSource')}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={switchToGenerated}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              !hasFactoryBarcode
                ? 'bg-accent text-white'
                : 'bg-white text-brand-600 ring-1 ring-brand-200 dark:bg-brand-900 dark:text-brand-300 dark:ring-brand-700'
            }`}
          >
            {t('inventory.noFactoryBarcode')}
          </button>
          <button
            type="button"
            onClick={() => setHasFactoryBarcode(true)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              hasFactoryBarcode
                ? 'bg-accent text-white'
                : 'bg-white text-brand-600 ring-1 ring-brand-200 dark:bg-brand-900 dark:text-brand-300 dark:ring-brand-700'
            }`}
          >
            {t('inventory.hasFactoryBarcode')}
          </button>
        </div>

        {hasFactoryBarcode ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-accent/40 bg-accent-soft/40 px-3 py-2 text-xs text-brand-700 dark:border-accent/30 dark:bg-accent/10 dark:text-brand-200">
              <ScanBarcode className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span>{t('inventory.scanBarcodeHint')}</span>
            </div>
            <Input
              ref={barcodeInputRef}
              id="product-factory-barcode"
              label={t('inventory.barcode')}
              value={form.aluCode ?? form.barcode}
              onChange={(e) => {
                const v = e.target.value;
                set('aluCode', v);
                set('barcode', v);
                set('sku', v);
              }}
              placeholder={t('inventory.scanBarcodePlaceholder')}
              hint={t('inventory.scanBarcodeReady')}
              icon={<ScanBarcode />}
              autoComplete="off"
              inputMode="numeric"
              required
            />
          </div>
        ) : (
          <div className="mt-3 rounded-lg bg-white px-3 py-2 dark:bg-brand-900">
            <p className="text-xs text-brand-500">{t('inventory.generatedBarcode')}</p>
            <p className="font-mono text-sm font-bold text-accent">{previewCode}</p>
            <p className="mt-1 text-[11px] text-brand-500">{t('inventory.generatedBarcodeHint')}</p>
            {!product && (
              <button
                type="button"
                onClick={() => setGeneratedCode(generateInternalBarcode())}
                className="mt-2 text-xs font-medium text-accent hover:underline"
              >
                {t('inventory.regenerateBarcode')}
              </button>
            )}
            {product && (
              <p className="mt-2 text-[11px] text-brand-500">{t('inventory.internalBarcodeLocked')}</p>
            )}
          </div>
        )}
      </div>

      <Input
        label={t('inventory.qtyOnHand')}
        disabled={!!product && !can('stock.adjust')}
        type="number"
        // Negative stock (sold past zero) must not block saving other fields; it is only sent if edited.
        min={product && product.stock < 0 ? undefined : 0}
        step="any"
        value={form.stock}
        onChange={(e) => set('stock', Number(e.target.value))}
      />

      <Input
        label={t('inventory.lowStockAlert')}
        type="number"
        min={0}
        step="any"
        value={form.threshHold ?? 10}
        onChange={(e) => set('threshHold', Number(e.target.value))}
      />

      <Input
        label={t('inventory.expiryDate')}
        type="date"
        value={form.expiryDate ?? ''}
        onChange={(e) => set('expiryDate', e.target.value)}
        className="sm:col-span-2"
      />

      <p className="sm:col-span-2 border-t border-brand-100 pt-3 text-sm font-semibold dark:border-brand-800">
        {t('inventory.pricingSection')}
      </p>
      <Input label={t('inventory.salesTax')} type="number" min={0} max={100} step="0.01" value={form.salesTaxPercent ?? 0} onChange={(e) => set('salesTaxPercent', Number(e.target.value))} />
      <Input label={t('inventory.pctCode')} value={form.pctCode ?? ''} onChange={(e) => set('pctCode', e.target.value)} />
      <Input label={t('inventory.discPercent')} type="number" min={0} max={100} step="0.01" value={form.discPercent ?? 0} onChange={(e) => set('discPercent', Number(e.target.value))} />
      <Input label={t('inventory.discAmount')} type="number" min={0} step="0.01" value={form.discAmount ?? 0} onChange={(e) => set('discAmount', Number(e.target.value))} />
      <Input label={t('inventory.discStart')} type="date" value={form.discStart ?? ''} onChange={(e) => set('discStart', e.target.value)} />
      <Input label={t('inventory.discEnd')} type="date" value={form.discEnd ?? ''} onChange={(e) => set('discEnd', e.target.value)} />

      <details className="sm:col-span-2 rounded-xl border border-brand-200/80 p-4 dark:border-brand-700">
        <summary className="cursor-pointer text-sm font-semibold">{t('inventory.detailsSection')}</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input label={t('inventory.longDesc')} className="sm:col-span-2" value={form.longDesc ?? ''} onChange={(e) => set('longDesc', e.target.value)} />
          <Select
            label={t('inventory.supplier')}
            value={form.supplierId ?? ''}
            onChange={(e) => set('supplierId', e.target.value)}
            options={[
              { value: '', label: t('inventory.noSupplier') },
              ...suppliers.map((s) => ({ value: String(s.id), label: s.name })),
              // Keeps an inactive supplier selectable, so saving doesn't silently unlink it.
              ...(form.supplierId && !suppliers.some((s) => String(s.id) === form.supplierId)
                ? [{ value: form.supplierId, label: form.supplierName || form.supplierId }]
                : []),
            ]}
          />
          <Select
            label={t('inventory.costing')}
            value={form.costingMethod ?? 'recent_cost'}
            onChange={(e) => set('costingMethod', e.target.value as Product['costingMethod'])}
            options={[
              { value: 'recent_cost', label: t('inventory.recentCost') },
              { value: 'manual_cost', label: t('inventory.manualCost') },
            ]}
          />
          {TEXT_FIELDS.map(([key, labelKey]) => (
            <Input key={key} label={t(labelKey)} value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} />
          ))}
          {NUMBER_FIELDS.map(([key, labelKey]) => (
            <Input
              key={key}
              label={t(labelKey)}
              type="number"
              min={0}
              step="any"
              value={form[key] ?? ''}
              onChange={(e) => set(key, e.target.value === '' ? undefined : Number(e.target.value))}
            />
          ))}
          {FLAG_FIELDS.map(([key, labelKey]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={!!form[key]} onChange={(e) => set(key, e.target.checked)} />
              {t(labelKey)}
            </label>
          ))}
        </div>
      </details>
    </form>
  );
}
