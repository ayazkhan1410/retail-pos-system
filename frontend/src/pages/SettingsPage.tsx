import { Header } from '@/layouts/DashboardLayout';
import { Card, CardHeader, CardTitle, Button, Input, Select, Badge } from '@/components/ui';
import { useThemeStore } from '@/store';
import { useTranslation } from '@/i18n';
import LanguageToggle from '@/components/layout/LanguageToggle';
import { Shield, Store, Bell, Database, Moon, Sun, MapPin, Languages } from 'lucide-react';

export default function SettingsPage() {
  const { theme, setTheme } = useThemeStore();
  const { t, language, setLanguage } = useTranslation();

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
                <Badge variant="success" className="mt-2">{t('settings.connected')}</Badge>
              </div>
              <div className="rounded-xl border border-brand-100 p-4 dark:border-brand-800">
                <p className="text-sm text-brand-500">{t('settings.version')}</p>
                <p className="mt-1 font-semibold">v0.1.0 · {t('common.pakistan')}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <Button variant="outline" size="sm">{t('settings.backupDatabase')}</Button>
              <Button variant="outline" size="sm">{t('settings.checkUpdates')}</Button>
            </div>
          </Card>
        </div>
      </main>
    </>
  );
}
