import { useState, useEffect, useMemo } from 'react';
import { Input, Select } from '@/components/ui';
import { PAKISTAN_CITIES } from '@/constants/pakistanCities';
import { useTranslation } from '@/i18n';
import type { Supplier } from '@/types';
import type { SupplierFormData } from '@/store';

const emptyForm: SupplierFormData = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  ntn: '',
  bankAccount: '',
  notes: '',
  status: 'active',
  paymentType: 'credit',
  paymentTermsDays: null,
  currentBalance: 0,
};

interface SupplierFormProps {
  supplier?: Supplier | null;
  onSubmit: (data: SupplierFormData) => void;
}

export default function SupplierForm({ supplier, onSubmit }: SupplierFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<SupplierFormData>(emptyForm);

  const cityOptions = useMemo(() => {
    const citySet = new Set<string>(PAKISTAN_CITIES);
    if (form.city) citySet.add(form.city);
    return [
      { value: '', label: t('suppliers.selectCity') },
      ...[...citySet]
        .sort((a, b) => a.localeCompare(b))
        .map((city) => ({ value: city, label: city })),
    ];
  }, [form.city, t]);

  useEffect(() => {
    if (supplier) {
      setForm({
        name: supplier.name,
        contactPerson: supplier.contactPerson ?? '',
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        city: supplier.city,
        ntn: supplier.ntn,
        bankAccount: supplier.bankAccount ?? '',
        notes: supplier.notes ?? '',
        status: supplier.status,
        paymentType: supplier.paymentType,
        paymentTermsDays: supplier.paymentTermsDays ?? null,
        currentBalance: supplier.currentBalance,
      });
    } else {
      setForm(emptyForm);
    }
  }, [supplier]);

  const handleChange = (field: keyof SupplierFormData, value: string) => {
    if (field === 'paymentTermsDays') {
      setForm((prev) => ({ ...prev, paymentTermsDays: value === '' ? null : Math.max(0, Math.min(365, Math.round(Number(value) || 0))) }));
    } else if (field === 'currentBalance') {
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
        label={t('suppliers.companyName')}
        value={form.name}
        onChange={(e) => handleChange('name', e.target.value)}
        placeholder={t('suppliers.companyNamePlaceholder')}
        required
        className="sm:col-span-2"
      />
      <Input
        label={t('suppliers.phone')}
        value={form.phone}
        onChange={(e) => handleChange('phone', e.target.value)}
        placeholder={t('suppliers.phonePlaceholder')}
      />
      <Input
        label={t('suppliers.email')}
        type="email"
        value={form.email}
        onChange={(e) => handleChange('email', e.target.value)}
        placeholder={t('suppliers.emailPlaceholder')}
      />
      <Select
        label={t('suppliers.city')}
        value={form.city}
        onChange={(e) => handleChange('city', e.target.value)}
        options={cityOptions}
      />
      <Input
        label={t('suppliers.ntn')}
        value={form.ntn}
        onChange={(e) => handleChange('ntn', e.target.value)}
        placeholder={t('suppliers.ntnPlaceholder')}
      />
      <Input
        label={t('suppliers.address')}
        value={form.address}
        onChange={(e) => handleChange('address', e.target.value)}
        placeholder={t('suppliers.addressPlaceholder')}
        className="sm:col-span-2"
      />
      <Input
        label={t('suppliers.bankAccount')}
        value={form.bankAccount}
        onChange={(e) => handleChange('bankAccount', e.target.value)}
        placeholder={t('suppliers.bankAccountPlaceholder')}
        className="sm:col-span-2"
      />
      <Select
        label={t('suppliers.paymentType')}
        value={form.paymentType}
        onChange={(e) => handleChange('paymentType', e.target.value)}
        options={[
          { value: 'credit', label: t('suppliers.paymentCredit') },
          { value: 'cash', label: t('suppliers.paymentCash') },
        ]}
      />
      <Input
        label={t('pg.suppliers.terms')}
        type="number"
        min={0}
        max={365}
        placeholder={t('pg.suppliers.termsHint')}
        value={form.paymentTermsDays ?? ''}
        onChange={(e) => handleChange('paymentTermsDays', e.target.value)}
      />
      <Input
        label={t('suppliers.currentBalance')}
        type="number"
        value={form.currentBalance}
        disabled={!!supplier}
        onChange={(e) => handleChange('currentBalance', e.target.value)}
      />
      <Select
        label={t('suppliers.status')}
        value={form.status}
        onChange={(e) => handleChange('status', e.target.value)}
        options={[
          { value: 'active', label: t('suppliers.statusActive') },
          { value: 'inactive', label: t('suppliers.statusInactive') },
        ]}
      />
      <div className="sm:col-span-2">
        <label className="mb-2 block text-sm font-medium text-brand-700 dark:text-brand-300">
          {t('suppliers.notes')}
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder={t('suppliers.notesPlaceholder')}
          rows={3}
          className="w-full rounded-xl border border-brand-200/80 bg-white/80 px-3.5 py-2.5 text-sm shadow-soft focus-ring dark:border-brand-700/80 dark:bg-brand-900/80"
        />
      </div>
    </form>
  );
}
