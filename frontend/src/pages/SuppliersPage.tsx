import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import PageShell from '@/components/layout/PageShell';
import { Button, EmptyState, ErrorState, Modal, SkeletonRows, confirmAction, toast } from '@/components/ui';
import { Avatar, FilterSelect, PageHeading, Pager, Pill, SearchField } from '@/components/ui/Kit';
import SupplierForm from '@/components/suppliers/SupplierForm';
import LedgerPanel from '@/components/customers/LedgerPanel';
import { apiErrorMessage } from '@/services';
import { suppliersApi } from '@/services/endpoints';
import { supplierPagesApi, type SupplierQuery } from '@/services/pages';
import { mapSupplierFromApi, mapSupplierToApi, type SupplierApi } from '@/services/suppliers';
import { useCan, type SupplierFormData } from '@/store';
import { useTranslation } from '@/i18n';
import type { LedgerEntry, Supplier } from '@/types';
import type { SupplierPage, SupplierRow } from '@/types/pages';
import { cn, formatCurrency, formatMoneyShort, num, shortDate } from '@/utils';

const PAGE_SIZE = 12;
const SOON_DAYS = 7;

function daysUntil(date: string) {
  const due = new Date(`${date}T00:00:00`).getTime();
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((due - start) / 86_400_000);
}

function PaymentPill({ row }: { row: SupplierRow }) {
  const { t } = useTranslation();
  if (num(row.credit_balance) <= 0) return <Pill tone="success">{t('pg.suppliers.settled')}</Pill>;
  if (!row.due_date) return <Pill tone="muted">{t('pg.suppliers.noTerms')}</Pill>;
  const days = daysUntil(row.due_date);
  if (days < 0) return <Pill tone="danger">{t('pg.suppliers.overdue', { count: -days })}</Pill>;
  if (days === 0) return <Pill tone="warn">{t('pg.suppliers.dueToday')}</Pill>;
  if (days <= SOON_DAYS) return <Pill tone="warn">{t('pg.suppliers.dueIn', { count: days })}</Pill>;
  return <Pill tone="muted">{t('pg.suppliers.dueOn', { date: shortDate(row.due_date) })}</Pill>;
}

export default function SuppliersPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [city, setCity] = useState('');
  const [balance, setBalance] = useState<SupplierQuery['balance']>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SupplierPage | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [ledgerKey, setLedgerKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useMemo<SupplierQuery>(() => ({ search: debounced, city, balance, ordering: 'name' }), [balance, city, debounced]);
  useEffect(() => setPage(1), [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data: result } = await supplierPagesApi.list({ ...query, page, page_size: PAGE_SIZE });
      setData(result);
      setSelectedId((current) => (result.results.some((row) => row.id === current) ? current : result.results[0]?.id ?? null));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = data?.results ?? [];
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  const openForm = (row: SupplierRow | null) => {
    setEditing(row ? mapSupplierFromApi(row as unknown as SupplierApi) : null);
    setFormError('');
    setFormOpen(true);
  };

  const submit = async (form: SupplierFormData) => {
    setSaving(true);
    setFormError('');
    try {
      const payload = mapSupplierToApi(form);
      if (editing) await suppliersApi.update(editing.id, payload);
      else await suppliersApi.create(payload);
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(apiErrorMessage(err, t('pg.suppliers.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: SupplierRow) => {
    if (!(await confirmAction({ title: t('pg.suppliers.confirmDelete', { name: row.name }), tone: 'danger' }))) return;
    try {
      await suppliersApi.delete(row.id);
      toast(t('pg.suppliers.deleted'));
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, t('pg.suppliers.deleteError')), { tone: 'warning' });
    }
  };

  return (
    <PageShell crumb={t('nav.suppliers')}>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <PageHeading
            title={t('nav.suppliers')}
            subtitle={data ? t('pg.suppliers.subtitle', { count: data.count.toLocaleString(), owed: formatCurrency(num(data.total_owed)) }) : ' '}
            actions={can('suppliers.edit') && <Button onClick={() => openForm(null)}><Plus className="h-4 w-4" /> {t('pg.suppliers.add')}</Button>}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SearchField value={search} onChange={setSearch} placeholder={t('pg.suppliers.search')} className="w-full sm:w-72" />
            <FilterSelect label={t('pg.suppliers.city')} value={city} onChange={setCity} options={[{ value: '', label: t('pg.suppliers.city') }, ...(data?.cities ?? []).map((value) => ({ value, label: value }))]} />
            <FilterSelect
              label={t('pg.suppliers.balance')}
              value={balance ?? ''}
              onChange={(value) => setBalance(value as SupplierQuery['balance'])}
              options={[
                { value: '', label: t('pg.suppliers.balance') },
                { value: 'owed', label: t('pg.suppliers.owedOnly') },
                { value: 'settled', label: t('pg.suppliers.settled') },
              ]}
            />
          </div>
          <div className="overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-brand-800 dark:bg-brand-900">
            {error ? (
              <ErrorState message={t('pg.common.loadError')} retryLabel={t('pg.common.retry')} onRetry={() => void load()} />
            ) : loading && rows.length === 0 ? (
              <SkeletonRows rows={6} columns={5} />
            ) : rows.length === 0 ? (
              <EmptyState icon={Building2} title={t('pg.suppliers.empty')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b border-brand-200 text-[13px] text-brand-500 dark:border-brand-800">
                      <th className="px-4 py-3 text-start font-normal">{t('pg.products.supplier')}</th>
                      <th className="px-4 py-3 text-start font-normal">{t('pg.suppliers.city')}</th>
                      <th className="px-4 py-3 text-start font-normal">{t('pg.suppliers.lastDelivery')}</th>
                      <th className="px-4 py-3 text-start font-normal">{t('pg.orders.payment')}</th>
                      <th className="px-4 py-3 text-end font-normal">{t('pg.suppliers.balanceOwed')}</th>
                    </tr>
                  </thead>
                  <tbody className={cn(loading && 'opacity-60')}>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        aria-selected={row.id === selectedId}
                        className={cn('cursor-pointer border-b border-brand-100 last:border-0 dark:border-brand-800', row.id === selectedId ? 'bg-accent-soft/60 dark:bg-accent-soft/40' : 'hover:bg-brand-50 dark:hover:bg-brand-800/40')}
                      >
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setSelectedId(row.id)} className="flex items-center gap-3 text-start focus-ring">
                            <Avatar name={row.name} />
                            <span className={cn('text-brand-900 dark:text-white', row.status === 'inactive' && 'text-brand-400')}>{row.name}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-brand-600 dark:text-brand-300">{row.city || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-brand-600 dark:text-brand-300">{row.last_delivery ? shortDate(row.last_delivery) : '—'}</td>
                        <td className="px-4 py-3"><PaymentPill row={row} /></td>
                        <td className="num px-4 py-3 text-end font-semibold text-brand-900 dark:text-white">{formatCurrency(num(row.credit_balance))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pager page={page} pageSize={PAGE_SIZE} total={data?.count ?? 0} onPage={setPage} />
          </div>
        </div>

        {selected ? (
          <SupplierPanel
            key={`${selected.id}-${ledgerKey}`}
            row={selected}
            canPay={can('suppliers.pay')}
            canEdit={can('suppliers.edit')}
            onPay={() => setPayOpen(true)}
            onEdit={() => openForm(selected)}
            onDelete={() => void remove(selected)}
          />
        ) : (
          <aside className="hidden rounded-xl border border-dashed border-brand-200 p-8 text-center text-sm text-brand-500 xl:block dark:border-brand-800">{t('pg.suppliers.pick')}</aside>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        preventClose={saving}
        title={editing ? t('pg.suppliers.edit') : t('pg.suppliers.add')}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="supplier-form" loading={saving}>{t('common.save')}</Button>
          </>
        }
      >
        {formError && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{formError}</p>}
        <SupplierForm supplier={editing} onSubmit={(form) => void submit(form)} />
      </Modal>

      <Modal open={payOpen && !!selected} onClose={() => setPayOpen(false)} title={t('pg.suppliers.payTitle', { name: selected?.name ?? '' })} size="lg">
        {selected && (
          <LedgerPanel
            key={selected.id}
            canPay={can('suppliers.pay')}
            methods={['bank', 'cash', 'cheque', 'jazzcash', 'easypaisa']}
            load={() => suppliersApi.ledger(selected.id)}
            pay={async (form) => {
              await suppliersApi.pay(selected.id, form);
              setLedgerKey((key) => key + 1);
              await load();
            }}
          />
        )}
      </Modal>
    </PageShell>
  );
}

function SupplierPanel({ row, canPay, canEdit, onPay, onEdit, onDelete }: {
  row: SupplierRow; canPay: boolean; canEdit: boolean; onPay: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    suppliersApi.ledger(row.id).then(({ data }) => setEntries(data)).catch(() => setEntries([]));
  }, [row.id]);

  const owed = num(row.credit_balance);
  const describe = (entry: LedgerEntry) => {
    if (entry.kind === 'purchase') return entry.reference ? t('pg.suppliers.delivery', { ref: entry.reference }) : t('pg.suppliers.deliveryPlain');
    if (entry.kind === 'opening') return t('pg.suppliers.opening');
    if (num(entry.delta) < 0 && entry.reference?.startsWith('PR')) return t('pg.suppliers.return', { ref: entry.reference });
    return entry.method ? t('pg.suppliers.paymentVia', { method: t(`pg.methods.${entry.method}`) }) : t('pg.suppliers.payment');
  };

  return (
    <aside aria-label={row.name} className="overflow-hidden rounded-xl border border-brand-200 bg-white xl:sticky xl:top-20 dark:border-brand-800 dark:bg-brand-900">
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={row.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-brand-900 dark:text-white">{row.name}</p>
            <p className="truncate text-[13px] text-brand-500">{[row.city, row.contact_person].filter(Boolean).join(' · ')}{row.phone && <>{row.city || row.contact_person ? ' · ' : ''}<bdi dir="ltr">{row.phone}</bdi></>}{!row.city && !row.contact_person && !row.phone && '—'}</p>
          </div>
          {canEdit && (
            <div className="relative">
              <button type="button" onClick={() => setMenu((open) => !open)} aria-expanded={menu} aria-label={t('pg.products.actionsFor', { name: row.name })} className="rounded-md p-1.5 text-brand-400 hover:bg-brand-100 hover:text-brand-900 focus-ring dark:hover:bg-brand-800 dark:hover:text-white">
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menu && (
                <>
                  <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={() => setMenu(false)} />
                  <div role="menu" className="absolute end-0 top-9 z-30 w-40 rounded-lg border border-brand-200 bg-white p-1 text-sm shadow-elevated dark:border-brand-700 dark:bg-brand-900">
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); onEdit(); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 hover:bg-brand-100 dark:hover:bg-brand-800"><Pencil className="h-4 w-4" /> {t('common.edit')}</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); onDelete(); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-red-600 hover:bg-brand-100 dark:text-red-400 dark:hover:bg-brand-800"><Trash2 className="h-4 w-4" /> {t('common.delete')}</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-brand-50 px-3 py-2.5 dark:bg-brand-800/60">
            <p className="text-xs text-brand-500">{t('pg.suppliers.youOwe')}</p>
            <p className="num mt-0.5 text-xl font-semibold text-brand-900 dark:text-white">{formatCurrency(owed)}</p>
          </div>
          <div className="rounded-lg bg-brand-50 px-3 py-2.5 dark:bg-brand-800/60">
            <p className="text-xs text-brand-500">{t('pg.suppliers.boughtYear')}</p>
            <p className="num mt-0.5 text-xl font-semibold text-brand-900 dark:text-white">{formatMoneyShort(num(row.bought_this_year))}</p>
          </div>
        </div>
        {row.payment_terms_days != null && (
          <p className="text-[13px] text-brand-500">{t('pg.suppliers.termsLine', { count: row.payment_terms_days })}{row.due_date && owed > 0 ? ` · ${t('pg.suppliers.nextDue', { date: shortDate(row.due_date) })}` : ''}</p>
        )}
        <Button className="w-full" onClick={onPay} disabled={!canPay}>{t('pg.suppliers.recordPayment')}</Button>
      </div>
      <div className="border-t border-brand-100 px-5 py-4 dark:border-brand-800">
        <p className="mb-1 text-[13px] text-brand-600 dark:text-brand-300">{t('pg.suppliers.ledger')}</p>
        {entries === null ? (
          <p className="py-4 text-[13px] text-brand-400">…</p>
        ) : entries.length === 0 ? (
          <p className="py-4 text-[13px] text-brand-400">{t('pg.suppliers.noLedger')}</p>
        ) : (
          <ul className="divide-y divide-brand-100 dark:divide-brand-800">
            {entries.slice(0, 8).map((entry) => {
              const delta = num(entry.delta);
              return (
                <li key={entry.id} className="flex justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-brand-900 dark:text-white">{describe(entry)}</p>
                    <p className="truncate text-[13px] text-brand-500">
                      {shortDate(entry.created_at)}
                      {entry.kind !== 'purchase' && entry.reference ? ` · ${t('pg.suppliers.ref', { ref: entry.reference })}` : ''}
                    </p>
                  </div>
                  <span className={cn('num shrink-0 text-sm', delta < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'font-medium text-brand-900 dark:text-white')}>
                    {delta < 0 ? `− ${formatCurrency(-delta)}` : formatCurrency(delta)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
