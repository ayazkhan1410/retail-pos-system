import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, MessageCircle, Pencil, Plus, Users } from 'lucide-react';
import PageShell from '@/components/layout/PageShell';
import { Button, EmptyState, ErrorState, Input, Modal, SkeletonRows, toast } from '@/components/ui';
import { Avatar, Delta, FilterSelect, KpiStrip, PageHeading, Pager, Pill, ProgressBar, SearchField, Tabs } from '@/components/ui/Kit';
import LedgerPanel from '@/components/customers/LedgerPanel';
import { apiErrorMessage } from '@/services';
import { customersApi } from '@/services/endpoints';
import { customerPagesApi, type CustomerQuery } from '@/services/pages';
import { useCan, usePOSStore } from '@/store';
import { useTranslation } from '@/i18n';
import type { Customer } from '@/types';
import type { CustomerProfile, CustomerSegment, CustomerSummary } from '@/types/pages';
import { cn, formatCurrency, formatMoneyShort, num } from '@/utils';
import { khataWhatsAppText, printKhataStatement } from '@/utils/khataPrint';
import { displayName, loadStoreDetails } from '@/utils/storeDetails';

const PAGE_SIZE = 12;
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const emptyForm = { name: '', phone: '', area: '', address: '', credit_limit: '0', opening_balance: '0' };
type Tab = 'all' | CustomerSegment;

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  const today = new Date();
  const start = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  return Math.round((start(today) - start(then)) / 86_400_000);
}

export function lastVisitLabel(iso: string | null | undefined, t: (key: string, params?: Record<string, string | number>) => string) {
  const days = daysAgo(iso);
  if (days == null) return t('pg.common.none');
  if (days <= 0) return t('pg.common.today');
  if (days === 1) return t('pg.common.yesterday');
  return t('pg.customers.daysAgo', { count: days });
}

function SegmentPill({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const tags = customer.segments ?? [];
  if (tags.includes('over_limit')) return <Pill tone="danger">{t('pg.customers.seg_over_limit')}</Pill>;
  if (tags.includes('at_risk')) return <Pill tone="muted">{t('pg.customers.atRiskDays', { count: daysAgo(customer.last_visit) ?? 0 })}</Pill>;
  if (tags.includes('new')) return <Pill tone="accent">{t('pg.customers.seg_new')}</Pill>;
  if (tags.includes('regular') && tags.includes('khata')) return <Pill tone="warn">{t('pg.customers.regularKhata')}</Pill>;
  if (tags.includes('regular')) return <Pill tone="success">{t('pg.customers.seg_regular')}</Pill>;
  if (tags.includes('khata')) return <Pill tone="warn">{t('pg.customers.seg_khata')}</Pill>;
  return <span className="text-brand-400">—</span>;
}

function frequency(interval: number | null, times: number, t: (key: string, params?: Record<string, string | number>) => string) {
  if (interval == null || times < 2) return t('pg.customers.once');
  if (interval <= 4) return t('pg.customers.perWeek', { count: Math.max(2, Math.round(7 / Math.max(interval, 1))) });
  if (interval <= 10) return t('pg.customers.weekly');
  if (interval <= 20) return t('pg.customers.fortnightly');
  if (interval <= 45) return t('pg.customers.monthly');
  return t('pg.customers.nowAndThen');
}

export default function CustomersPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const segment = params.get('segment');
    return segment && ['regular', 'khata', 'over_limit', 'at_risk', 'new'].includes(segment) ? (segment as Tab) : 'all';
  });
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [area, setArea] = useState('');
  const [ordering, setOrdering] = useState<NonNullable<CustomerQuery['ordering']>>('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Customer[]>([]);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useMemo<CustomerQuery>(() => ({
    search: debounced, segment: tab === 'all' ? '' : tab, area, ordering,
  }), [area, debounced, ordering, tab]);

  useEffect(() => setPage(1), [query]);

  const loadSummary = useCallback(() => {
    customerPagesApi.summary().then(({ data }) => setSummary(data)).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await customerPagesApi.list({ ...query, page, page_size: PAGE_SIZE });
      setRows(data.results);
      setCount(data.count);
      setSelected((current) => data.results.find((row) => row.id === current?.id) ?? current ?? data.results[0] ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(loadSummary, [loadSummary]);

  // Deep link from search or an order: /customers?id=12
  useEffect(() => {
    const id = Number(params.get('id'));
    if (!id) return;
    customerPagesApi.get(id).then(({ data }) => setSelected(data)).catch(() => undefined);
  }, [params]);

  const refreshSelected = async (id: number) => {
    const { data } = await customerPagesApi.get(id);
    setSelected(data);
    setRows((current) => current.map((row) => (row.id === id ? data : row)));
    loadSummary();
  };

  const show = (customer: Customer | null) => {
    setEditing(customer);
    setForm(customer
      ? { name: customer.name, phone: customer.phone ?? '', area: customer.area ?? '', address: customer.address, credit_limit: customer.credit_limit, opening_balance: '0' }
      : emptyForm);
    setFormError('');
    setFormOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const { data } = editing ? await customersApi.update(editing.id, form) : await customersApi.create(form);
      setFormOpen(false);
      await load();
      await refreshSelected(data.id);
    } catch (err) {
      setFormError(apiErrorMessage(err, t('customers.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: Customer[] = [];
      for (let p = 1; p <= 10; p += 1) {
        const { data } = await customerPagesApi.list({ ...query, page: p, page_size: 200 });
        all.push(...data.results);
        if (data.results.length < 200) break;
      }
      const cell = (value: string | number) => {
        const text = String(value ?? '');
        return `"${(/^[=+@-]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
      };
      const csv = [
        ['Name', 'Phone', 'Area', 'Segments', 'Last visit', 'Credit limit', 'Owes'],
        ...all.map((c) => [c.name, c.phone ?? '', c.area ?? '', (c.segments ?? []).join(' '), c.last_visit ?? '', c.credit_limit, c.balance]),
      ].map((row) => row.map(cell).join(',')).join('\n');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      link.download = 'customers.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      toast(t('pg.common.loadError'), { tone: 'warning' });
    } finally {
      setExporting(false);
    }
  };

  const counts = summary?.counts;
  const tabs = [
    { value: 'all' as const, label: t('pg.common.all') },
    { value: 'regular' as const, label: t('pg.customers.seg_regular') },
    { value: 'khata' as const, label: t('pg.customers.seg_khata') },
    { value: 'over_limit' as const, label: t('pg.customers.seg_over_limit'), count: counts?.over_limit },
    { value: 'at_risk' as const, label: t('pg.customers.seg_at_risk'), count: counts?.at_risk },
    { value: 'new' as const, label: t('pg.customers.newThisWeek'), count: counts?.new },
  ];

  return (
    <PageShell crumb={t('nav.customers')}>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <PageHeading
            title={t('nav.customers')}
            subtitle={summary ? t('pg.customers.subtitle', { count: summary.customers.toLocaleString(), khata: formatCurrency(num(summary.khata_total)) }) : ' '}
            actions={
              <>
                <Button variant="outline" onClick={() => void exportCsv()} loading={exporting}><Download className="h-4 w-4" /> {t('pg.common.export')}</Button>
                {can('customers.edit') && <Button onClick={() => show(null)}><Plus className="h-4 w-4" /> {t('pg.customers.add')}</Button>}
              </>
            }
          />
          {summary && (
            <KpiStrip
              items={[
                { key: 'active', label: t('pg.customers.activeMonth'), value: summary.active_this_month.toLocaleString(), delta: <Delta value={summary.active_change} />, hint: t('pg.customers.boughtOnce') },
                { key: 'returning', label: t('pg.customers.returningRate'), value: `${Math.round(summary.returning_rate)}%`, delta: <Delta value={summary.returning_change} suffix=" pts" />, hint: t('pg.customers.backWithin') },
                { key: 'visits', label: t('pg.customers.avgVisits'), value: t('pg.customers.perMonth', { count: summary.avg_visits_per_month }), hint: t('pg.customers.regulars') },
                { key: 'over', label: t('pg.customers.overLimit'), value: summary.over_limit_count, hint: t('pg.customers.overTotal', { amount: formatCurrency(num(summary.over_limit_total)) }) },
              ]}
            />
          )}
          <Tabs value={tab} items={tabs} onChange={setTab} label={t('pg.customers.segments')} />
          <div className="flex flex-wrap items-center gap-2">
            <SearchField value={search} onChange={setSearch} placeholder={t('pg.customers.search')} className="w-full sm:w-72" />
            <FilterSelect label={t('pg.customers.area')} value={area} onChange={setArea} options={[{ value: '', label: t('pg.customers.area') }, ...(summary?.areas ?? []).map((value) => ({ value, label: value }))]} />
            <FilterSelect
              label={t('pg.customers.lastVisit')}
              value={ordering}
              onChange={(value) => setOrdering(value as typeof ordering)}
              options={[
                { value: '', label: t('pg.customers.sortName') },
                { value: 'last_visit', label: t('pg.customers.sortRecent') },
                { value: '-last_visit', label: t('pg.customers.sortLongest') },
                { value: 'balance', label: t('pg.customers.sortOwes') },
              ]}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-brand-800 dark:bg-brand-900">
            {error ? (
              <ErrorState message={t('pg.common.loadError')} retryLabel={t('pg.common.retry')} onRetry={() => void load()} />
            ) : loading && rows.length === 0 ? (
              <SkeletonRows rows={6} columns={6} />
            ) : rows.length === 0 ? (
              <EmptyState icon={Users} title={t('customers.empty')} description={debounced ? undefined : t('customers.emptyHint')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b border-brand-200 text-[13px] text-brand-500 dark:border-brand-800">
                      <th className="px-4 py-3 text-start font-normal">{t('pg.orders.customer')}</th>
                      <th className="px-4 py-3 text-start font-normal">{t('pg.customers.area')}</th>
                      <th className="px-4 py-3 text-start font-normal">{t('pg.customers.segment')}</th>
                      <th className="px-4 py-3 text-start font-normal">{t('pg.customers.lastVisit')}</th>
                      <th className="px-4 py-3 text-end font-normal">{t('pg.customers.creditLimit')}</th>
                      <th className="px-4 py-3 text-end font-normal">{t('pg.customers.owes')}</th>
                    </tr>
                  </thead>
                  <tbody className={cn(loading && 'opacity-60')}>
                    {rows.map((customer) => {
                      const active = customer.id === selected?.id;
                      return (
                        <tr
                          key={customer.id}
                          onClick={() => setSelected(customer)}
                          aria-selected={active}
                          className={cn('cursor-pointer border-b border-brand-100 last:border-0 dark:border-brand-800', active ? 'bg-accent-soft/60 dark:bg-accent-soft/40' : 'hover:bg-brand-50 dark:hover:bg-brand-800/40')}
                        >
                          <td className="px-4 py-2.5">
                            <button type="button" onClick={() => setSelected(customer)} className="flex items-center gap-3 text-start focus-ring">
                              <Avatar name={customer.name} round muted />
                              <span>
                                <span className="block text-brand-900 dark:text-white">{customer.name}</span>
                                <span dir="ltr" className="block text-[13px] text-brand-500 rtl:text-end">{customer.phone || '—'}</span>
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-brand-600 dark:text-brand-300">{customer.area || '—'}</td>
                          <td className="px-4 py-2.5"><SegmentPill customer={customer} /></td>
                          <td className="px-4 py-2.5 text-brand-600 dark:text-brand-300">{lastVisitLabel(customer.last_visit, t)}</td>
                          <td className="num px-4 py-2.5 text-end text-brand-600 dark:text-brand-300">{num(customer.credit_limit) ? formatCurrency(num(customer.credit_limit)) : '—'}</td>
                          <td className="num px-4 py-2.5 text-end font-semibold text-brand-900 dark:text-white">{formatCurrency(num(customer.balance))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pager page={page} pageSize={PAGE_SIZE} total={count} onPage={setPage} />
          </div>
        </div>

        {selected ? (
          <CustomerPanel
            key={selected.id}
            customer={selected}
            canEdit={can('customers.edit')}
            canCollect={can('customers.collect')}
            onEdit={() => show(selected)}
            onCollect={() => setLedgerOpen(true)}
          />
        ) : (
          <aside className="hidden rounded-xl border border-dashed border-brand-200 p-8 text-center text-sm text-brand-500 xl:block dark:border-brand-800">{t('pg.customers.pick')}</aside>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        preventClose={saving}
        title={editing ? t('pg.customers.edit') : t('pg.customers.add')}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="customer-form" loading={saving}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="customer-form" onSubmit={submit} className="space-y-3">
          <Input id="customer-name" label={t('customers.name')} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input id="customer-phone" label={t('settings.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input id="customer-area" label={t('pg.customers.area')} placeholder={t('pg.customers.areaHint')} maxLength={100} list="customer-areas" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
          <datalist id="customer-areas">{(summary?.areas ?? []).map((value) => <option key={value} value={value} />)}</datalist>
          <Input id="customer-address" label={t('settings.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input id="customer-limit" label={t('customers.limit')} type="number" min={0} step="0.01" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
          {!editing && <Input id="customer-opening" label={t('customers.opening')} type="number" min={0} step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />}
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
        </form>
      </Modal>

      <Modal open={ledgerOpen && !!selected} onClose={() => setLedgerOpen(false)} title={t('pg.customers.collectTitle', { name: selected?.name ?? '' })} size="lg">
        {selected && (
          <CollectBody customer={selected} onPaid={() => void refreshSelected(selected.id)} />
        )}
      </Modal>
    </PageShell>
  );
}

function CollectBody({ customer, onPaid }: { customer: Customer; onPaid: () => void }) {
  const can = useCan();
  const terminal = usePOSStore((state) => state.activeCounter?.id);
  return (
    <LedgerPanel
      key={customer.id}
      canPay={can('customers.collect')}
      methods={['cash', 'jazzcash', 'easypaisa', 'card', 'bank']}
      load={() => customersApi.ledger(customer.id)}
      pay={async (data) => {
        await customersApi.collect(customer.id, { ...data, terminal: terminal ?? null });
        onPaid();
      }}
    />
  );
}

function CustomerPanel({ customer, canEdit, canCollect, onEdit, onCollect }: {
  customer: Customer; canEdit: boolean; canCollect: boolean; onEdit: () => void; onCollect: () => void;
}) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);

  useEffect(() => {
    setProfile(null);
    customerPagesApi.profile(customer.id).then(({ data }) => setProfile(data)).catch(() => undefined);
  }, [customer.id, customer.balance]);

  const owes = num(customer.balance);
  const limit = num(customer.credit_limit);
  const since = customer.created_at ? new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date(customer.created_at)) : '';
  const months = profile?.monthly_spend ?? [];
  const maxSpend = Math.max(1, ...months.map((row) => num(row.spend)));
  const habit = profile && profile.usual_weekday != null && profile.usual_hour != null
    ? t('pg.customers.usually', {
      day: t(`pg.days.${DAY_KEYS[profile.usual_weekday]}`),
      part: t(profile.usual_hour < 12 ? 'pg.customers.morning' : profile.usual_hour < 17 ? 'pg.customers.afternoon' : 'pg.customers.evening'),
    })
    : '';

  const statement = async () => {
    const store = await loadStoreDetails();
    const { data } = await customersApi.ledger(customer.id);
    printKhataStatement(customer, data, displayName(store));
  };
  const whatsApp = async () => {
    const store = await loadStoreDetails();
    try {
      await navigator.clipboard.writeText(khataWhatsAppText(customer, displayName(store)));
      toast(t('customers.statementCopied'));
    } catch {
      toast(t('pg.customers.copyFailed'), { tone: 'warning' });
    }
  };

  return (
    <aside aria-label={customer.name} className="overflow-hidden rounded-xl border border-brand-200 bg-white xl:sticky xl:top-20 dark:border-brand-800 dark:bg-brand-900">
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={customer.name} round size="lg" className="bg-accent-soft text-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-brand-900 dark:text-white">{customer.name}</p>
            <p className="truncate text-[13px] text-brand-500">
              {[since && t('pg.customers.since', { date: since }), customer.area].filter(Boolean).join(' · ') || customer.phone}
            </p>
          </div>
          {canEdit && (
            <button type="button" onClick={onEdit} aria-label={t('pg.customers.edit')} className="rounded-md p-1.5 text-brand-400 hover:bg-brand-100 hover:text-brand-900 focus-ring dark:hover:bg-brand-800 dark:hover:text-white">
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            [t('pg.customers.lifetime'), profile ? formatMoneyShort(num(profile.lifetime_spend)) : '…'],
            [t('pg.customers.visits'), profile ? profile.visits.toLocaleString() : '…'],
            [t('pg.orders.avgBill'), profile ? formatCurrency(Math.round(num(profile.avg_bill))) : '…'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-brand-50 px-3 py-2.5 dark:bg-brand-800/60">
              <p className="text-xs text-brand-500">{label}</p>
              <p className="num mt-0.5 truncate text-[15px] font-semibold text-brand-900 dark:text-white">{value}</p>
            </div>
          ))}
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-[13px] text-brand-600 dark:text-brand-300">{t('pg.customers.monthlySpend')}</p>
            <p className="text-[13px] text-brand-500">{habit}</p>
          </div>
          <div className="mt-3 flex h-16 items-end gap-2">
            {months.map((row, index) => (
              <div
                key={row.month}
                title={`${row.month.slice(0, 7)} · ${formatCurrency(num(row.spend))}`}
                className={cn('flex-1 rounded-[3px]', index === months.length - 1 ? 'bg-accent' : 'bg-brand-200 dark:bg-brand-700')}
                style={{ height: `${Math.max(8, (num(row.spend) / maxSpend) * 64)}px` }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex gap-2">
            {months.map((row) => (
              <span key={row.month} className="flex-1 text-center text-[11px] text-brand-400">
                {new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(`${row.month}T00:00:00`))}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-brand-200 p-3.5 dark:border-brand-700">
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-800 dark:text-brand-200">{t('pg.customers.khata')}</p>
            <Pill tone={owes > limit && owes > 0 ? 'danger' : owes > 0 ? 'warn' : 'success'}>
              {limit > 0 ? t('pg.customers.ofLimit', { owes: formatCurrency(owes), limit: num(customer.credit_limit).toLocaleString() }) : formatCurrency(owes)}
            </Pill>
          </div>
          <ProgressBar className="mt-3" value={limit > 0 ? (owes / limit) * 100 : owes > 0 ? 100 : 0} tone={owes > limit && owes > 0 ? 'danger' : 'warn'} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={onCollect} disabled={!canCollect || owes <= 0}>{t('pg.customers.collect')}</Button>
          <Button variant="outline" onClick={() => void statement()}>{t('pg.customers.statement')}</Button>
        </div>
        <button type="button" onClick={() => void whatsApp()} className="flex items-center gap-1.5 text-[13px] text-brand-500 hover:text-brand-900 focus-ring dark:hover:text-white">
          <MessageCircle className="h-3.5 w-3.5" /> {t('customers.copyWhatsApp')}
        </button>
      </div>
      <div className="border-t border-brand-100 px-5 py-4 dark:border-brand-800">
        <p className="mb-2 text-[13px] text-brand-600 dark:text-brand-300">{t('pg.customers.oftenBuys')}</p>
        {profile && profile.often_buys.length === 0 && <p className="text-[13px] text-brand-400">{t('pg.customers.noBuys')}</p>}
        <ul className="divide-y divide-brand-100 dark:divide-brand-800">
          {profile?.often_buys.map((row) => (
            <li key={row.product_id} className="flex justify-between gap-3 py-2 text-sm">
              <span className="truncate text-brand-900 dark:text-white">{row.name}</span>
              <span className="shrink-0 text-[13px] text-brand-500">{frequency(row.interval_days, row.times, t)}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
