import { useState, useEffect } from 'react';
import { Input, Select } from '@/components/ui';
import type { ProductFormData } from '@/store';
import { PRODUCT_CATEGORIES_LIST, type Product } from '@/types';

export type { ProductFormData } from '@/store';

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
};

interface ProductFormProps {
  product?: Product | null;
  onSubmit: (data: ProductFormData) => void;
}

export default function ProductForm({ product, onSubmit }: ProductFormProps) {
  const [form, setForm] = useState<ProductFormData>(emptyProduct);

  useEffect(() => {
    if (product) {
      const { id, status, ...rest } = product;
      setForm({ ...emptyProduct, ...rest });
    } else {
      setForm(emptyProduct);
    }
  }, [product]);

  const set = <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const itemCode = form.aluCode?.trim() || form.sku.trim() || form.barcode.trim();
    onSubmit({
      ...form,
      aluCode: itemCode,
      barcode: itemCode,
      sku: itemCode,
      trackExpiry: !!form.expiryDate,
    });
  };

  const itemCode = form.aluCode ?? form.sku ?? form.barcode ?? '';

  return (
    <form id="product-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <Input
        label="Item Code *"
        value={itemCode}
        onChange={(e) => {
          const v = e.target.value;
          set('aluCode', v);
          set('barcode', v);
          set('sku', v);
        }}
        placeholder="e.g. SPR15"
        required
      />
      <Select
        label="Category *"
        value={form.category}
        onChange={(e) => set('category', e.target.value)}
        options={PRODUCT_CATEGORIES_LIST.map((c) => ({ value: c, label: c }))}
      />
      <Input
        label="Item Description *"
        value={form.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder="e.g. Sprite 1.5 LTR"
        required
        className="sm:col-span-2"
      />
      <Input
        label="Qty on Hand *"
        type="number"
        min={0}
        value={form.stock}
        onChange={(e) => set('stock', Number(e.target.value))}
        required
      />
      <Input
        label="Low Stock Alert At"
        type="number"
        min={0}
        value={form.threshHold ?? 10}
        onChange={(e) => set('threshHold', Number(e.target.value))}
      />
      <Input
        label="Cost (PKR) *"
        type="number"
        min={0}
        step="0.01"
        value={form.cost}
        onChange={(e) => set('cost', Number(e.target.value))}
        required
      />
      <Input
        label="Rate (PKR) *"
        type="number"
        min={0}
        step="0.01"
        value={form.price}
        onChange={(e) => set('price', Number(e.target.value))}
        required
      />
      <Input
        label="Expiry Date"
        type="date"
        value={form.expiryDate ?? ''}
        onChange={(e) => set('expiryDate', e.target.value)}
        className="sm:col-span-2"
      />
    </form>
  );
}
