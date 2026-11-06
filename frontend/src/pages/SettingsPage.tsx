import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/layouts/DashboardLayout';
import { Card, CardHeader, CardTitle, Button, Input, Select, Badge } from '@/components/ui';
import StaffCard from '@/components/settings/StaffCard';
import RolesCard from '@/components/settings/RolesCard';
import { useAuthStore, useCan, useThemeStore } from '@/store';
import { useTranslation } from '@/i18n';
import { apiErrorMessage, healthApi, inventoryApi, systemApi } from '@/services';
import type { Branch } from '@/types';
import LanguageToggle from '@/components/layout/LanguageToggle';
import '@/types/desktop';
import { Store, Database, Moon, Sun, MapPin, Languages, RefreshCw } from 'lucide-react';

type ApiHealthState = 'checking' | 'connected' | 'disconnected';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SettingsPage() {
  const { theme, setTheme } = useThemeStore();
  const { t, language, setLanguage } = useTranslation();
  const [apiHealth, setApiHealth] = useState<ApiHealthState>('checking');
  const [apiMessage, setApiMessage] = useState('');
  const [appVersion, setAppVersion] = useState('0.1.0');
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const can = useCan();
  const isOwner = useAuthStore((state) => state.user?.role === 'owner');
  const [store, setStore] = useState<Branch | null>(null);
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeMessage, setStoreMessage] = useState('');

  const checkApiHealth = useCallback(async () => {
    setApiHealth('checking');
    setApiMessage('');
    try {
      const { data } = await healthApi.check();
      setApiHealth('connected');
      setApiMessage(data.message);
    } catch {
      setApiHealth('disconnected');
      setApiMessage('');
    }
  }, []);

  useEffect(() => {
    checkApiHealth();
    systemApi.getVersion().then(({ data }) => setAppVersion(data.version)).catch(() => undefined);
    inventoryApi.branch().then(({ data }) => setStore(data)).catch(() => undefined);
  }, [checkApiHealth, t]);

  const saveStore = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!store) return;
    setStoreSaving(true);
    setStoreMessage('');
    try {
      const { data } = await inventoryApi.updateBranch(store);
      setStore(data);
      setStoreMessage(t('settings.storeSaved'));
    } catch (err) {
      setStoreMessage(apiErrorMessage(err, t('settings.storeSaveFailed')));
    } finally {
      setStoreSaving(false);
    }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    setBackupMessage('');
    try {
      const { data } = await systemApi.backupDatabase();
      setBackupMessage(
        t('settings.backupSuccess', {
          file: data.filename ?? '',
          size: formatBytes(data.size_bytes ?? 0),
        }),
      );
      if (window.smartshop?.openBackupsFolder) {
        await window.smartshop.openBackupsFolder();
      }
    } catch (err) {
      setBackupMessage(apiErrorMessage(err, t('settings.backupFailed')));
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <>
      <Header title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <main className="page-bg flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Language */}
          <Card hover>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Languages className="h-5 w-5 text-accent" />
                {t('common.language')}
              </CardTitle>
            </CardHeader>
            <p className="mb-4 text-sm text-brand-500">
              {language === 'en'
                ? 'Switch the entire application to Urdu (اردو)'
                : 'پوری ایپلیکیشن انگریزی میں تبدیل کریں'}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <LanguageToggle />
              <Select
                label={t('common.language')}
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'en' | 'ur')}
                options={[
                  { value: 'en', label: t('common.english') },
                  { value: 'ur', label: t('common.urdu') },
                ]}
                containerClassName="max-w-xs"
              />
            </div>
          </Card>

          {can('settings.store') && (
          <Card hover>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" /> {t('settings.storeInfo')}
              </CardTitle>
            </CardHeader>
            <form onSubmit={saveStore}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label={t('settings.storeName')} required value={store?.name ?? ''} onChange={(e) => store && setStore({ ...store, name: e.target.value })} />
                <Input label={t('settings.phone')} value={store?.phone ?? ''} onChange={(e) => store && setStore({ ...store, phone: e.target.value })} />
                <div className="sm:col-span-2">
                  <Input label={t('settings.address')} value={store?.address ?? ''} onChange={(e) => store && setStore({ ...store, address: e.target.value })} />
                </div>
                <Input label={t('settings.ntn')} value={store?.ntn ?? ''} onChange={(e) => store && setStore({ ...store, ntn: e.target.value })} />
                <div>
                  <Input label={t('settings.currency')} defaultValue="PKR (Rs.)" disabled />
                  <p className="mt-1 flex items-center gap-1 text-xs text-brand-500">
                    <MapPin className="h-3 w-3" /> {t('common.pakistan')}
                  </p>
                </div>
              </div>
              {storeMessage && <p role="status" className="mt-3 text-sm text-brand-600 dark:text-brand-300">{storeMessage}</p>}
              <Button variant="accent" size="sm" className="mt-4" type="submit" loading={storeSaving} disabled={!store}>{t('settings.saveChanges')}</Button>
            </form>
          </Card>
          )}

          {can('staff.manage') && <StaffCard />}
          {isOwner && <RolesCard />}

          <Card hover>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                {t('settings.appearance')}
              </CardTitle>
            </CardHeader>
            <Select
              label={t('settings.theme')}
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
              options={[
                { value: 'light', label: t('common.lightMode') },
                { value: 'dark', label: t('common.darkMode') },
              ]}
            />
          </Card>

          <Card hover>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" /> {t('settings.system')}
              </CardTitle>
            </CardHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-brand-100 p-4 dark:border-brand-800">
                <p className="text-sm text-brand-500">{t('settings.apiStatus')}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      apiHealth === 'connected'
                        ? 'success'
                        : apiHealth === 'disconnected'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {apiHealth === 'checking'
                      ? t('settings.apiChecking')
                      : apiHealth === 'connected'
                        ? t('settings.connected')
                        : t('settings.disconnected')}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={checkApiHealth}
                    disabled={apiHealth === 'checking'}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${apiHealth === 'checking' ? 'animate-spin' : ''}`} />
                    {t('settings.retryApi')}
                  </Button>
                </div>
                {apiMessage && (
                  <p className="mt-2 text-xs text-brand-500">{apiMessage}</p>
                )}
                {apiHealth === 'disconnected' && !apiMessage && (
                  <p className="mt-2 text-xs text-brand-500">{t('settings.apiDisconnectedHint')}</p>
                )}
              </div>
              <div className="rounded-xl border border-brand-100 p-4 dark:border-brand-800">
                <p className="text-sm text-brand-500">{t('settings.version')}</p>
                <p className="mt-1 font-semibold">v{appVersion} · {t('common.pakistan')}</p>
              </div>
            </div>
            {backupMessage && (
              <p className="mt-3 text-sm text-brand-600 dark:text-brand-300">{backupMessage}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              {can('backup.run') && (
                <Button variant="outline" size="sm" onClick={handleBackup} loading={backupLoading}>
                  {t('settings.backupDatabase')}
                </Button>
              )}
            </div>
          </Card>
        </div>
      </main>

    </>
  );
}
