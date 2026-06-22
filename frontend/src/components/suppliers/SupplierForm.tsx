import { useState, useEffect, useMemo } from 'react';
import { Input, Select } from '@/components/ui';
import { PAKISTAN_CITIES } from '@/constants/pakistanCities';
import type { Supplier } from '@/types';
import type { SupplierFormData } from '@/store';

const emptyForm: SupplierFormData = {
  name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  ntn: '',
  bankAccount: '',
  notes: '',
  status: 'active',
  paymentType: 'credit',
  currentBalance: 0,
};

interface SupplierFormProps {
  supplier?: Supplier | null;
  onSubmit: (data: SupplierFormData) => void;
}

export default function SupplierForm({ supplier, onSubmit }: SupplierFormProps) {
  const [form, setForm] = useState<SupplierFormData>(emptyForm);

  const cityOptions = useMemo(() => {
    const citySet = new Set<string>(PAKISTAN_CITIES);
    if (form.city) citySet.add(form.city);
    return [
      { value: '', label: 'Select city' },
      ...[...citySet]
        .sort((a, b) => a.localeCompare(b))
        .map((city) => ({ value: city, label: city })),
    ];
  }, [form.city]);

  useEffect(() => {
    if (supplier) {
      setForm({
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        city: supplier.city,
        ntn: supplier.ntn,
        bankAccount: supplier.bankAccount ?? '',
        notes: supplier.notes ?? '',
        status: supplier.status,
        paymentType: supplier.paymentType,
        currentBalance: supplier.currentBalance,
      });
    } else {
      setForm(emptyForm);
    }
  }, [supplier]);

  const handleChange = (field: keyof SupplierFormData, value: string) => {
    if (field === 'currentBalance') {
      setForm((prev) => ({ ...prev, currentBalance: Number(value) || 0 }));
    } else if (field === 'paymentType') {
      setForm((prev) => ({ ...prev, paymentType: value as 'credit' | 'cash' }));
    } else if (field === 'status') {
      setForm((prev) => ({ ...prev, status: value as 'active' | 'inactive' }));
    } else {
      setForm((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName) return;
    onSubmit({ ...form, name: trimmedName });
  };

  return (
    <form id="supplier-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <Input
        label="Supplier / Company Name *"
        value={form.name}
        onChange={(e) => handleChange('name', e.target.value)}
        placeholder="e.g. Metro Cash & Carry"
        required
        className="sm:col-span-2"
      />
      <Input
        label="Phone Number"
        value={form.phone}
        onChange={(e) => handleChange('phone', e.target.value)}
        placeholder="+92 300 1234567"
      />
      <Input
        label="Email"
        type="email"
        value={form.email}
        onChange={(e) => handleChange('email', e.target.value)}
        placeholder="orders@supplier.pk"
      />
      <Select
        label="City"
        value={form.city}
        onChange={(e) => handleChange('city', e.target.value)}
        options={cityOptions}
      />
      <Input
        label="NTN / STRN"
        value={form.ntn}
        onChange={(e) => handleChange('ntn', e.target.value)}
        placeholder="1234567-8"
      />
      <Input
        label="Address"
        value={form.address}
        onChange={(e) => handleChange('address', e.target.value)}
        placeholder="Street, area, landmark"
        className="sm:col-span-2"
      />
      <Input
        label="Bank Account (IBAN)"
        value={form.bankAccount}
        onChange={(e) => handleChange('bankAccount', e.target.value)}
        placeholder="PK00 XXXX 0000 0000 0000 0000"
        className="sm:col-span-2"
      />
      <Select
        label="Payment Type"
        value={form.paymentType}
        onChange={(e) => handleChange('paymentType', e.target.value)}
        options={[
          { value: 'credit', label: 'Credit' },
          { value: 'cash', label: 'Cash' },
        ]}
      />
      <Input
        label="Current Balance (PKR)"
        type="number"
        value={form.currentBalance}
        onChange={(e) => handleChange('currentBalance', e.target.value)}
      />
      <Select
        label="Status"
        value={form.status}
        onChange={(e) => handleChange('status', e.target.value)}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
      />
      <div className="sm:col-span-2">
        <label className="mb-2 block text-sm font-medium text-brand-700 dark:text-brand-300">
          Notes
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Delivery schedule, payment terms, etc."
          rows={3}
          className="w-full rounded-xl border border-brand-200/80 bg-white/80 px-3.5 py-2.5 text-sm shadow-soft focus-ring dark:border-brand-700/80 dark:bg-brand-900/80"
        />
      </div>
    </form>
  );
}
