import { useEffect, useState, useCallback, useRef } from 'react';
import { Header } from '@/layouts/DashboardLayout';
import { Card, CardHeader, CardTitle, Button, Input, Select, Badge, Modal } from '@/components/ui';
import { useThemeStore } from '@/store';
import { useTranslation } from '@/i18n';
import { healthApi, systemApi, type UpdateCheckResponse } from '@/services';
import LanguageToggle from '@/components/layout/LanguageToggle';
import '@/types/desktop';
import { Shield, Store, Bell, Database, Moon, Sun, MapPin, Languages, RefreshCw } from 'lucide-react';

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
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResponse | null>(null);
  const [updateApplying, setUpdateApplying] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const updateDismissedRef = useRef(false);

  useEffect(() => {
    updateDismissedRef.current = updateDismissed;
  }, [updateDismissed]);

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

  const handleCheckUpdates = useCallback(async (options?: { auto?: boolean }) => {
    const isAuto = options?.auto ?? false;
    setUpdateLoading(true);
    if (!isAuto) setStatusMessage('');
    try {
      const { data } = await systemApi.checkUpdates();
      if (data.update_available) {
        setUpdateInfo(data);
        if (!isAuto || !updateDismissedRef.current) {
          setUpdateModalOpen(true);
        }
      } else {
        setUpdateInfo(null);
        setUpdateDismissed(false);
        if (!isAuto) {
          setStatusMessage(t('settings.upToDate'));
        }
      }
    } catch {
      if (!isAuto) {
        setStatusMessage(t('settings.updateCheckFailed'));
      }
    } finally {
      setUpdateLoading(false);
    }
  }, [t]);

  useEffect(() => {
    checkApiHealth();
    systemApi.getVersion().then(({ data }) => setAppVersion(data.version)).catch(() => undefined);
    handleCheckUpdates({ auto: true });
  }, [checkApiHealth, handleCheckUpdates]);

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
    } catch {
      setBackupMessage(t('settings.backupFailed'));
    } finally {
      setBackupLoading(false);
    }
  };

  const handleDismissUpdate = () => {
    if (updateApplying) return;
    setUpdateModalOpen(false);
    setUpdateDismissed(true);
  };

  const handleApplyUpdate = async () => {
    setUpdateApplying(true);
    try {
      if (window.smartshop?.applyUpdate) {
        const result = await window.smartshop.applyUpdate();
        setStatusMessage(result.message);
        if (result.success) {
          setUpdateDismissed(false);
          setUpdateInfo(null);
          setTimeout(() => window.location.reload(), 2000);
          return;
        }
      } else {
        setStatusMessage(t('settings.updateDesktopOnly'));
      }
    } catch {
      setStatusMessage(t('settings.updateFailed'));
    }
    setUpdateApplying(false);
  };

  return (
    <>
      <Header title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <main className="page-bg flex-1 overflow-y-auto p-4 sm:p-6">
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
                className="max-w-xs"
              />
            </div>
          </Card>

          <Card hover className="overflow-hidden">
            <div className="bg-gradient-to-r from-accent/10 to-transparent p-6">
              <CardHeader className="mb-0">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-accent" /> {t('settings.licenseStatus')}
                </CardTitle>
                <Badge variant="success">{t('common.active')}</Badge>
              </CardHeader>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              {[
                { label: t('settings.plan'), value: 'SmartShop POS Pro' },
                { label: t('settings.validUntil'), value: '15 July 2026' },
                { label: t('settings.installationId'), value: 'SS-PK-8f3a-2b1c' },
                { label: t('settings.lastSynced'), value: t('settings.justNow') },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-brand-100 p-4 dark:border-brand-800">
                  <p className="text-xs font-medium text-brand-500">{item.label}</p>
                  <p className="mt-1 font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-brand-100 px-6 py-4 dark:border-brand-800">
              <Button variant="outline" size="sm">{t('settings.syncLicense')}</Button>
            </div>
          </Card>

          <Card hover>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" /> {t('settings.storeInfo')}
              </CardTitle>
            </CardHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={t('settings.storeName')} defaultValue="Smart Mart Lahore" />
              <Input label={t('settings.phone')} defaultValue="+92 300 1234567" />
              <Input label={t('settings.address')} defaultValue="Main Boulevard, Gulberg III, Lahore" className="sm:col-span-2" />
              <Input label={t('settings.ntn')} defaultValue="1234567-8" />
              <div>
                <Input label={t('settings.currency')} defaultValue="PKR (Rs.)" disabled />
                <p className="mt-1 flex items-center gap-1 text-xs text-brand-500">
                  <MapPin className="h-3 w-3" /> {t('common.pakistan')}
                </p>
              </div>
            </div>
            <Button variant="accent" size="sm" className="mt-4">{t('settings.saveChanges')}</Button>
          </Card>

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
                <Bell className="h-5 w-5" /> {t('settings.notifications')}
              </CardTitle>
            </CardHeader>
            <div className="space-y-2">
              {[
                { label: t('settings.lowStockAlerts'), enabled: true },
                { label: t('settings.dailySalesSummary'), enabled: true },
                { label: t('settings.purchaseConfirmations'), enabled: false },
              ].map((item) => (
                <label key={item.label} className="flex cursor-pointer items-center justify-between rounded-xl border border-brand-100 p-4 transition-colors hover:bg-brand-50 dark:border-brand-800 dark:hover:bg-brand-800/30">
                  <span className="text-sm font-medium">{item.label}</span>
                  <input type="checkbox" defaultChecked={item.enabled} className="h-4 w-4 rounded accent-accent" />
                </label>
              ))}
            </div>
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
            {statusMessage && (
              <p className="mt-3 text-sm text-brand-600 dark:text-brand-300">{statusMessage}</p>
            )}
            {updateInfo?.update_available && updateDismissed && !updateModalOpen && (
              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-brand-700 dark:text-brand-200">
                  {t('settings.updateAvailableBanner', {
                    latest: updateInfo.latest_version,
                  })}
                </p>
                <Button variant="accent" size="sm" onClick={() => setUpdateModalOpen(true)}>
                  {t('settings.updateShowDetails')}
                </Button>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={handleBackup} loading={backupLoading}>
                {t('settings.backupDatabase')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleCheckUpdates()} loading={updateLoading}>
                {t('settings.checkUpdates')}
              </Button>
            </div>
          </Card>
        </div>
      </main>

      <Modal
        open={updateModalOpen}
        onClose={handleDismissUpdate}
        preventClose={updateApplying}
        title={
          updateApplying
            ? t('settings.updateInstallingTitle')
            : t('settings.updateAvailableTitle')
        }
        size="sm"
        footer={
          updateApplying ? undefined : (
            <>
              <Button variant="outline" onClick={handleDismissUpdate}>
                {t('settings.updateLater')}
              </Button>
              <Button variant="accent" onClick={handleApplyUpdate}>
                {t('settings.updateNow')}
              </Button>
            </>
          )
        }
      >
        {updateApplying ? (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <RefreshCw className="h-10 w-10 animate-spin text-accent" />
            <p className="text-sm text-brand-600 dark:text-brand-300">
              {t('settings.updateInstallingBody')}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-brand-600 dark:text-brand-300">
              {t('settings.updateAvailableBody', {
                current: updateInfo?.current_version ?? appVersion,
                latest: updateInfo?.latest_version ?? '',
              })}
            </p>
            {updateInfo?.release_notes && (
              <p className="mt-3 rounded-xl bg-brand-50 p-3 text-xs text-brand-500 dark:bg-brand-800/40">
                {updateInfo.release_notes}
              </p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
