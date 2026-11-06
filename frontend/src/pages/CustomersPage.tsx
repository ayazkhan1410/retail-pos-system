import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Users, Pencil } from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Badge, Button, Card, Input, Modal } from '@/components/ui';
import LedgerPanel from '@/components/customers/LedgerPanel';
import { apiErrorMessage } from '@/services';
import { customersApi } from '@/services/endpoints';
import { useCan, usePOSStore } from '@/store';
import { useTranslation } from '@/i18n';
import { formatCurrency } from '@/utils';
import type { Customer } from '@/types';

const emptyForm = { name: '', phone: '', address: '', credit_limit: '0', opening_balance: '0' };

export default function CustomersPage() {
  const { t } = useTranslation();
  const can = useCan();
  const terminal = usePOSStore((state) => state.activeCounter?.id);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    customersApi.list(search.trim()).then(({ data }) => setCustomers(data)).catch(() => setError(t('customers.loadError')));
  }, [search, t]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const show = (customer: Customer | null) => {
    setEditing(customer);
    setForm(customer
      ? { name: customer.name, phone: customer.phone ?? '', address: customer.address, credit_limit: customer.credit_limit, opening_balance: '0' }
      : emptyForm);
    setError('');
    setFormOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) await customersApi.update(editing.id, form);
      else await customersApi.create(form);
      setFormOpen(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err, t('customers.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const owed = customers.reduce((sum, customer) => sum + Number(customer.balance), 0);

  return (
    <>
      <Header
        title={t('customers.title')}
        subtitle={t('customers.subtitle', { count: customers.length, owed: formatCurrency(owed) })}
        actions={can('customers.edit') && (
          <Button variant="accent" size="sm" onClick={() => show(null)}><Plus className="h-4 w-4" /> {t('customers.add')}</Button>
        )}
      />
      <main className="page-bg flex-1 overflow-y-auto p-4 sm:p-6">
        {error && !formOpen && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
        <Card padding="none" hover>
          <div className="border-b border-brand-100 p-3 dark:border-brand-800">
            <div className="max-w-sm">
              <Input aria-label={t('customers.search')} placeholder={t('customers.search')} value={search} onChange={(e) => setSearch(e.target.value)} icon={<Search className="h-4 w-4" />} />
            </div>
          </div>
          {customers.length === 0 && (
            <div className="py-12 text-center text-sm text-brand-500">
              <Users className="mx-auto mb-2 h-10 w-10 text-brand-300" />
              {t('customers.empty')}
            </div>
          )}
          <div className="divide-y divide-brand-100 dark:divide-brand-800">
            {customers.map((customer) => (
              <div key={customer.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setViewing(customer)}>
                  <p className="truncate text-sm font-semibold hover:text-accent">{customer.name}</p>
                  <p className="text-xs text-brand-500">{customer.phone ?? '—'}</p>
                </button>
                <div className="text-end">
                  <Badge variant={Number(customer.balance) > 0 ? 'warning' : 'success'}>{formatCurrency(Number(customer.balance))}</Badge>
                  <p className="mt-0.5 text-[11px] text-brand-500">{t('customers.limit')}: {formatCurrency(Number(customer.credit_limit))}</p>
                </div>
                {can('customers.edit') && (
                  <Button variant="ghost" size="sm" aria-label={t('common.edit')} onClick={() => show(customer)}><Pencil className="h-3.5 w-3.5" /></Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      </main>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        preventClose={saving}
        title={editing ? t('common.edit') : t('customers.add')}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="accent" type="submit" form="customer-form" loading={saving}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="customer-form" onSubmit={submit} className="space-y-3">
          <Input id="customer-name" label={t('customers.name')} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input id="customer-phone" label={t('settings.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input id="customer-address" label={t('settings.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input id="customer-limit" label={t('customers.limit')} type="number" min={0} step="0.01" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
          {!editing && <Input id="customer-opening" label={t('customers.opening')} type="number" min={0} step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </form>
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name ?? ''} size="lg">
        {viewing && (
          <div className="space-y-3">
            <p className="text-sm">{t('customers.owes')}: <strong>{formatCurrency(Number(viewing.balance))}</strong></p>
            <LedgerPanel
              key={viewing.id}
              canPay={can('customers.collect')}
              methods={['cash', 'jazzcash', 'easypaisa', 'card', 'bank']}
              load={() => customersApi.ledger(viewing.id)}
              pay={async (data) => {
                const { data: updated } = await customersApi.collect(viewing.id, { ...data, terminal: terminal ?? null });
                setViewing(updated);
                load();
              }}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
