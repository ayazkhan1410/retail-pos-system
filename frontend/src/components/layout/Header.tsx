import { Moon, Sun, Menu } from 'lucide-react';
import { useThemeStore, useAppStore } from '@/store';
import LanguageToggle from '@/components/layout/LanguageToggle';
import NotificationBell from '@/components/layout/NotificationBell';
import { iconButtonClass } from '@/components/layout/styles';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function Header({ title, subtitle, actions }: HeaderProps) {
  const { theme, toggleTheme } = useThemeStore();
  const { setMobileSidebarOpen } = useAppStore();

  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-brand-200 bg-white/90 backdrop-blur-md dark:border-brand-800 dark:bg-brand-950/90">
      <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-7">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className={`${iconButtonClass} lg:hidden`}
          aria-label="Open menu"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold tracking-tight text-brand-900 dark:text-white">{title}</h1>
          {subtitle && <p className="truncate text-[13px] text-brand-500 dark:text-brand-400">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <LanguageToggle compact />
          </div>
          <NotificationBell />
          <button type="button" onClick={toggleTheme} aria-label="Toggle theme" className={iconButtonClass}>
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>

        {actions && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:border-s sm:border-brand-200 sm:ps-3 dark:sm:border-brand-800">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
