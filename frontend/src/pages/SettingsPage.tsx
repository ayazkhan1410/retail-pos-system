import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import PageShell from '@/components/layout/PageShell';
import StaffCard from '@/components/settings/StaffCard';
import RolesCard from '@/components/settings/RolesCard';
import LanguageToggle from '@/components/layout/LanguageToggle';
import { Button, Input, Select, toast } from '@/components/ui';
import { PageHeading, Panel, Pill, Toggle } from '@/components/ui/Kit';
import { fieldClass, labelClass } from '@/components/ui/Input';
import { apiErrorMessage, healthApi, inventoryApi, systemApi } from '@/services';
import { terminalsApi } from '@/services/pages';
import { useAuthStore, useCan, useThemeStore } from '@/store';
import { useTranslation } from '@/i18n';
import type { Branch, Terminal } from '@/types';
import { cn } from '@/utils';
import { displayName, useStoreDetails } from '@/utils/storeDetails';
import '@/types/desktop';

type Section = 'store' | 'registers' | 'staff' | 'receipt' | 'taxes' | 'payments' | 'backups' | 'language';
const SECTIONS: Section[] = ['store', 'registers', 'staff', 'receipt', 'taxes', 'payments', 'backups', 'language'];
const RECORDED_METHODS = ['cash', 'jazzcash', 'easypaisa', 'raast', 'card', 'credit'];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const ownerOnly = useAuthStore((state) => state.user?.role === 'owner');
  const setDetails = useStoreDetails((state) => state.set);
  const [active, setActive] = useState<Section>('store');
  const [store, setStore] = useState<Branch | null>(null);
  const [savingStore, setSavingStore] = useState(false);
  const [inviteRequest, setInviteRequest] = useState(0);

  useEffect(() => {
    inventoryApi.branch().then(({ data }) => setStore(data)).catch(() => undefined);
  }, []);

  const visible = SECTIONS.filter((section) => {
    if (section === 'staff') return can('staff.manage') || ownerOnly;
    if (section === 'registers') return can('settings.store');
    if (section === 'backups') return can('backup.run');
    return true;
  });

  const go = (section: Section) => {
    setActive(section);
    document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const saveStore = async () => {
    if (!store) return;
    setSavingStore(true);
    try {
      const { data } = await inventoryApi.updateBranch(store);
      setStore(data);
      setDetails(data);
      toast(t('settings.storeSaved'));
    } catch (err) {
      toast(apiErrorMessage(err, t('settings.storeSaveFailed')), { tone: 'warning' });
    } finally {
      setSavingStore(false);
    }
  };

  const field = (key: keyof Branch) => ({
    value: (store?.[key] as string) ?? '',
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => store && setStore({ ...store, [key]: event.target.value }),
    disabled: !store || !can('settings.store'),
  });

  return (
    <PageShell crumb={t('nav.settings')}>
      <PageHeading title={t('nav.settings')} subtitle={store ? [displayName(store), store.store_name ? store.name : ''].filter(Boolean).join(' · ') : ' '} />
      <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label={t('nav.settings')} className="flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:flex-col">
          {visible.map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => go(section)}
              aria-current={active === section ? 'true' : undefined}
              className={cn(
                'h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-start text-sm transition-colors focus-ring',
                active === section
                  ? 'bg-white font-medium text-brand-900 shadow-soft ring-1 ring-brand-200 dark:bg-brand-900 dark:text-white dark:ring-brand-800'
                  : 'text-brand-700 hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-brand-900',
              )}
            >
              {t(`pg.settings.nav_${section}`)}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-5">
          <section id="settings-store" className="scroll-mt-20">
            <Panel
              title={t('pg.settings.storeDetails')}
              subtitle={t('pg.settings.storeDetailsHint')}
              action={can('settings.store') && <Button size="sm" onClick={() => void saveStore()} loading={savingStore} disabled={!store}>{t('pg.common.save')}</Button>}
              bodyClassName="grid gap-4 border-t border-brand-100 px-5 py-5 sm:grid-cols-2 dark:border-brand-800"
            >
              <Input id="store-name" label={t('pg.settings.storeName')} maxLength={255} placeholder="Al-Madina Mart" {...field('store_name')} />
              <Input id="store-branch" label={t('pg.settings.branch')} maxLength={255} required {...field('name')} />
              <Input id="store-phone" label={t('settings.phone')} maxLength={30} {...field('phone')} />
              <Input id="store-ntn" label={t('pg.settings.ntn')} maxLength={30} {...field('ntn')} />
              <div className="sm:col-span-2"><Input id="store-address" label={t('settings.address')} {...field('address')} /></div>
              <div className="sm:col-span-2">
                <label htmlFor="store-footer" className={labelClass}>{t('pg.settings.footer')}</label>
                <textarea id="store-footer" rows={3} maxLength={300} className={cn(fieldClass, 'h-auto py-2')} placeholder={t('pg.settings.footerHint')} {...field('receipt_footer')} />
              </div>
            </Panel>
          </section>

          {visible.includes('registers') && (
            <section id="settings-registers" className="scroll-mt-20"><RegistersPanel /></section>
          )}

          {visible.includes('staff') && (
            <section id="settings-staff" className="scroll-mt-20 space-y-5">
              {ownerOnly && <RolesCard onInvite={can('staff.manage') ? () => setInviteRequest((n) => n + 1) : undefined} />}
              {can('staff.manage') && <StaffCard addRequest={inviteRequest} />}
            </section>
          )}

          <section id="settings-receipt" className="scroll-mt-20">
            <Panel title={t('pg.settings.receipt')} subtitle={t('pg.settings.receiptHint')} bodyClassName="border-t border-brand-100 px-5 py-5 dark:border-brand-800">
              <div className="mx-auto w-full max-w-[300px] rounded-md border border-dashed border-brand-300 bg-white px-5 py-4 font-mono text-[11px] leading-relaxed text-brand-900 dark:border-brand-600 dark:bg-brand-950 dark:text-brand-100">
                <p className="text-center text-[13px] font-bold">{store ? displayName(store) : '…'}</p>
                {store?.store_name && <p className="text-center">{store.name}</p>}
                {store?.address && <p className="text-center">{store.address}</p>}
                {store?.phone && <p className="text-center">{store.phone}</p>}
                {store?.ntn && <p className="text-center">NTN: {store.ntn}</p>}
                <p className="my-2 border-t border-dashed border-brand-300" />
                <p className="flex justify-between"><span>Super Basmati Rice 5kg</span></p>
                <p className="flex justify-between"><span>1 x Rs 1,850</span><span>Rs 1,850</span></p>
                <p className="my-2 border-t border-dashed border-brand-300" />
                <p className="flex justify-between font-bold"><span>TOTAL</span><span>Rs 1,850</span></p>
                <p className="my-2 border-t border-dashed border-brand-300" />
                <p className="text-center">{store?.receipt_footer?.trim() || 'Thank you for shopping with us'}</p>
              </div>
              <p className="mt-3 text-center text-[13px] text-brand-500">{t('pg.settings.receiptSample')}</p>
            </Panel>
          </section>

          <section id="settings-taxes" className="scroll-mt-20">
            <Panel title={t('pg.settings.taxes')} subtitle={t('pg.settings.taxesHint')} bodyClassName="border-t border-brand-100 px-5 py-4 text-sm text-brand-700 dark:border-brand-800 dark:text-brand-300">
              <TaxesBody />
            </Panel>
          </section>

          <section id="settings-payments" className="scroll-mt-20">
            <Panel title={t('pg.settings.payments')} subtitle={t('pg.settings.paymentsHint')} bodyClassName="border-t border-brand-100 dark:border-brand-800">
              <ul className="divide-y divide-brand-100 dark:divide-brand-800">
                {RECORDED_METHODS.map((method) => (
                  <li key={method} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="text-brand-900 dark:text-white">{t(`pg.methods.${method}`)}</span>
                    <Pill tone={method === 'cash' || method === 'credit' ? 'success' : 'muted'}>{t(method === 'cash' || method === 'credit' ? 'pg.settings.tracked' : 'pg.settings.recordedOnly')}</Pill>
                  </li>
                ))}
              </ul>
            </Panel>
          </section>

          {visible.includes('backups') && (
            <section id="settings-backups" className="scroll-mt-20"><BackupsPanel /></section>
          )}

          <section id="settings-language" className="scroll-mt-20"><LanguagePanel /></section>
        </div>
      </div>
    </PageShell>
  );
}

function TaxesBody() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const can = useCan();
  return (
    <div className="space-y-3">
      <p>{t('pg.settings.taxesBody')}</p>
      {can('products.edit') && <Button variant="outline" size="sm" onClick={() => navigate('/inventory')}>{t('pg.settings.openProducts')}</Button>}
    </div>
  );
}

function RegistersPanel() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Terminal[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    terminalsApi.list(true).then(({ data }) => setRows(data)).catch(() => setError(t('pg.common.loadError')));
  }, [t]);
  useEffect(load, [load]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await terminalsApi.create({ code, name });
      setCode('');
      setName('');
      load();
      toast(t('pg.settings.registerAdded'));
    } catch (err) {
      setError(apiErrorMessage(err, t('pg.settings.registerFailed')));
    } finally {
      setSaving(false);
    }
  };

  const update = async (terminal: Terminal, patch: Partial<Terminal>) => {
    setError('');
    try {
      await terminalsApi.update(terminal.id, patch);
      load();
    } catch (err) {
      setError(apiErrorMessage(err, t('pg.settings.registerFailed')));
      load();
    }
  };

  return (
    <Panel title={t('pg.settings.registers')} subtitle={t('pg.settings.registersHint')}>
      <ul className="divide-y divide-brand-100 border-y border-brand-100 dark:divide-brand-800 dark:border-brand-800">
        {rows.map((terminal) => (
          <li key={terminal.id} className="flex items-center gap-3 px-5 py-2.5">
            <span className="w-10 shrink-0 text-xs font-semibold text-brand-500">{terminal.code}</span>
            <input
              defaultValue={terminal.name}
              aria-label={t('pg.settings.registerName', { code: terminal.code })}
              maxLength={50}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next && next !== terminal.name) void update(terminal, { name: next });
              }}
              className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm text-brand-900 hover:border-brand-200 focus:border-accent focus:outline-none dark:text-white dark:hover:border-brand-700"
            />
            <span className="text-[13px] text-brand-500">{terminal.active ? t('pg.settings.inUse') : t('pg.products.inactive')}</span>
            <Toggle checked={terminal.active !== false} label={t('pg.settings.registerActive', { name: terminal.name })} onChange={(on) => void update(terminal, { active: on })} />
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 px-5 py-4">
        <div className="w-24"><Input id="register-code" label={t('pg.settings.code')} placeholder="C3" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
        <div className="w-56"><Input id="register-name" label={t('pg.settings.name')} placeholder={t('pg.settings.registerPlaceholder')} maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button type="submit" variant="outline" loading={saving} disabled={!code.trim() || !name.trim()}><Plus className="h-4 w-4" /> {t('pg.settings.addRegister')}</Button>
      </form>
      {error && <p role="alert" className="px-5 pb-4 text-sm text-red-600">{error}</p>}
    </Panel>
  );
}

function BackupsPanel() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const run = async () => {
    setLoading(true);
    setMessage('');
    try {
      const { data } = await systemApi.backupDatabase();
      const saved = t('settings.backupSuccess', { file: data.filename ?? '', size: formatBytes(data.size_bytes ?? 0) });
      setMessage(saved);
      if (window.smartshop?.openBackupsFolder) {
        try {
          await window.smartshop.openBackupsFolder();
        } catch {
          setMessage(`${saved} ${t('settings.backupFolderAccess')}`);
        }
      }
    } catch (err) {
      setMessage(apiErrorMessage(err, t('settings.backupFailed')));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Panel title={t('pg.settings.backups')} subtitle={t('pg.settings.backupsHint')} action={<Button size="sm" variant="outline" onClick={() => void run()} loading={loading}>{t('pg.settings.backupNow')}</Button>}>
      <p className="border-t border-brand-100 px-5 py-4 text-sm text-brand-600 dark:border-brand-800 dark:text-brand-300">{message || t('pg.settings.backupsBody')}</p>
    </Panel>
  );
}

function LanguagePanel() {
  const { t } = useTranslation();
  const { theme, setTheme } = useThemeStore();
  const [health, setHealth] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [version, setVersion] = useState('');

  const check = useCallback(async () => {
    setHealth('checking');
    try {
      await healthApi.check();
      setHealth('connected');
    } catch {
      setHealth('disconnected');
    }
  }, []);

  useEffect(() => {
    void check();
    systemApi.getVersion().then(({ data }) => setVersion(data.version)).catch(() => undefined);
  }, [check]);

  return (
    <Panel title={t('pg.settings.language')} subtitle={t('pg.settings.languageHint')} bodyClassName="grid gap-4 border-t border-brand-100 px-5 py-5 sm:grid-cols-2 dark:border-brand-800">
      <div className="space-y-2">
        <p className={labelClass}>{t('common.language')}</p>
        <LanguageToggle />
      </div>
      <Select id="theme" label={t('settings.theme')} value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')} options={[{ value: 'light', label: t('common.lightMode') }, { value: 'dark', label: t('common.darkMode') }]} />
      <div className="flex items-center gap-2 text-sm sm:col-span-2">
        <span className="text-brand-500">{t('settings.apiStatus')}</span>
        <Pill tone={health === 'connected' ? 'success' : health === 'disconnected' ? 'danger' : 'muted'}>
          {health === 'connected' ? t('settings.connected') : health === 'disconnected' ? t('settings.disconnected') : '…'}
        </Pill>
        <button type="button" onClick={() => void check()} aria-label={t('pg.settings.recheck')} className="rounded p-1 text-brand-400 hover:text-brand-900 dark:hover:text-white">
          <RefreshCw className={cn('h-3.5 w-3.5', health === 'checking' && 'animate-spin')} />
        </button>
        {version && <span className="ms-auto text-brand-500">{t('settings.version')} {version}</span>}
      </div>
    </Panel>
  );
}
