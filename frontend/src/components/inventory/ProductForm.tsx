import { useState, useEffect, useMemo } from 'react';
import { Input, Select } from '@/components/ui';
import type { ProductFormData } from '@/store';
import { PRODUCT_CATEGORIES_LIST, type Product } from '@/types';
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
};

interface ProductFormProps {
  product?: Product | null;
  onSubmit: (data: ProductFormSubmitResult) => void;
}

export default function ProductForm({ product, onSubmit }: ProductFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ProductFormData>(emptyProduct);
  const [hasFactoryBarcode, setHasFactoryBarcode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(() => generateInternalBarcode());

  useEffect(() => {
    if (product) {
      const { id, status, ...rest } = product;
      setForm({ ...emptyProduct, ...rest });
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
        options={PRODUCT_CATEGORIES_LIST.map((c) => ({ value: c, label: c }))}
      />

      <Input
        label={`${t('inventory.cost')} *`}
        type="number"
        min={0}
        step="0.01"
        value={form.cost}
        onChange={(e) => set('cost', Number(e.target.value))}
        required
      />

      <Input
        label={`${t('inventory.rate')} *`}
        type="number"
        min={0}
        step="0.01"
        value={form.price}
        onChange={(e) => set('price', Number(e.target.value))}
        required
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
          <Input
            label={`${t('inventory.barcode')} *`}
            value={form.aluCode ?? form.barcode}
            onChange={(e) => {
              const v = e.target.value;
              set('aluCode', v);
              set('barcode', v);
              set('sku', v);
            }}
            placeholder="Scan or type factory barcode"
            required
            className="mt-3"
          />
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
        type="number"
        min={0}
        value={form.stock}
        onChange={(e) => set('stock', Number(e.target.value))}
      />

      <Input
        label={t('inventory.lowStockAlert')}
        type="number"
        min={0}
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
    </form>
  );
}
