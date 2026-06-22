import { Moon, Sun, Bell, Search, Menu } from 'lucide-react';
import { useThemeStore, useAppStore } from '@/store';
import { useTranslation } from '@/i18n';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import LanguageToggle from '@/components/layout/LanguageToggle';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function Header({ title, subtitle, actions }: HeaderProps) {
  const { theme, toggleTheme } = useThemeStore();
  const { setMobileSidebarOpen } = useAppStore();
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-10 flex min-h-[64px] flex-wrap items-center justify-between gap-3 border-b border-brand-200/60 bg-white/70 px-4 py-3 backdrop-blur-xl sm:min-h-[72px] sm:px-6 dark:border-brand-800/60 dark:bg-brand-950/70">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-200/80 text-brand-600 hover:bg-brand-100 lg:hidden dark:border-brand-700 dark:hover:bg-brand-800"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-bold tracking-tight text-gradient sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-xs text-brand-500 sm:text-sm">{subtitle}</p>}
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        <div className="hidden w-56 lg:block">
          <Input placeholder={t('common.searchProducts')} icon={<Search className="h-4 w-4" />} />
        </div>
        <LanguageToggle />
        {actions}
        <Button variant="outline" size="sm" onClick={toggleTheme} aria-label="Toggle theme" className="!px-2.5">
          {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
        <Button variant="outline" size="sm" aria-label="Notifications" className="relative !px-2.5 max-sm:hidden">
          <Bell className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent-glow" />
        </Button>
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-800 to-brand-900 text-xs font-bold text-white sm:flex dark:from-white dark:to-brand-200 dark:text-brand-900">
          AK
        </div>
      </div>
    </header>
  );
}
