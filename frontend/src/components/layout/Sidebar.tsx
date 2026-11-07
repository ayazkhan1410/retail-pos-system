import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ChevronsUpDown, Languages, LogOut, Moon, Search, Settings, Store, Sun, X } from 'lucide-react';
import { cn, ROLE_LABEL_KEYS } from '@/utils';
import { useAppStore, useAuthStore, useCan, useThemeStore } from '@/store';
import { useTranslation } from '@/i18n';
import { BrandMark } from '@/components/ui/Brand';
import { initialsOf } from '@/components/ui/Kit';
import { NAV_GROUPS } from '@/components/layout/navItems';
import CommandPalette from '@/components/layout/CommandPalette';
import { displayName, useStoreDetails } from '@/utils/storeDetails';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

const menuItemClass =
  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-sm text-brand-700 hover:bg-brand-100 hover:text-brand-900 focus-ring dark:text-brand-300 dark:hover:bg-brand-800 dark:hover:text-white';

export default function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const setMobileSidebarOpen = useAppStore((state) => state.setMobileSidebarOpen);
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { t, language, toggleLanguage } = useTranslation();
  const can = useCan();
  const navigate = useNavigate();
  const { details, refresh } = useStoreDetails();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [storeMenu, setStoreMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const storeRef = useOutsideClose(storeMenu, () => setStoreMenu(false));
  const userRef = useOutsideClose(userMenu, () => setUserMenu(false));

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ⌘K / Ctrl+K opens search from anywhere in the back office.
  useEffect(() => {
    if (mobile) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobile]);

  const closeMobile = () => mobile && setMobileSidebarOpen(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors focus-ring',
      isActive
        ? 'bg-white font-medium text-brand-900 shadow-soft ring-1 ring-brand-200 dark:bg-brand-900 dark:text-white dark:ring-brand-800'
        : 'text-brand-700 hover:bg-brand-100 hover:text-brand-900 dark:text-brand-400 dark:hover:bg-brand-900 dark:hover:text-white',
    );

  const groups = NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || can(item.permission)) }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className={cn('relative flex h-full w-[232px] flex-col border-e border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-[#0f1013]', mobile && 'w-[280px]')}>
      {/* Store block */}
      <div ref={storeRef} className="relative px-2.5 pt-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStoreMenu((open) => !open)}
            aria-expanded={storeMenu}
            aria-haspopup="menu"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-start transition-colors hover:bg-brand-100 focus-ring dark:hover:bg-brand-900"
          >
            <BrandMark size={30} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-brand-900 dark:text-white">{displayName(details)}</span>
              <span className="block truncate text-xs text-brand-500">{details.store_name ? details.name : t('nav.pointOfSale')}</span>
            </span>
            <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-brand-400" />
          </button>
          {mobile && (
            <button type="button" onClick={closeMobile} className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-500 hover:bg-brand-100" aria-label={t('common.close')}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {storeMenu && (
          <div role="menu" className="absolute inset-x-2.5 top-full z-30 mt-1 animate-fade-in rounded-lg border border-brand-200 bg-white p-1 shadow-elevated dark:border-brand-700 dark:bg-brand-900">
            <p className="px-2.5 pb-1 pt-1.5 text-xs text-brand-500">{details.address || t('pg.shell.oneBranch')}</p>
            {can('settings.store') && (
              <button type="button" role="menuitem" className={menuItemClass} onClick={() => { setStoreMenu(false); closeMobile(); navigate('/settings'); }}>
                <Store className="h-4 w-4" /> {t('pg.shell.storeSettings')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-2.5 pb-2 pt-2.5">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-brand-200 bg-white px-2.5 text-sm text-brand-400 shadow-soft transition-colors hover:border-brand-300 focus-ring dark:border-brand-800 dark:bg-brand-900"
        >
          <Search aria-hidden className="h-4 w-4" />
          <span className="flex-1 text-start">{t('pg.shell.search')}</span>
          {!mobile && <kbd aria-hidden>{isMac ? '⌘K' : 'Ctrl K'}</kbd>}
        </button>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-4 pt-1 scrollbar-none">
        {groups.map((group, index) => (
          <div key={group.labelKey ?? index}>
            {group.labelKey && <p className="mb-1 px-2.5 text-xs text-brand-500">{t(group.labelKey)}</p>}
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, labelKey, shortcut }) => (
                <NavLink key={to} to={to} onClick={closeMobile} aria-keyshortcuts={shortcut} className={linkClass}>
                  <Icon aria-hidden className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.8} />
                  <span className="flex-1 truncate">{t(labelKey)}</span>
                  {shortcut && <kbd aria-hidden>{shortcut}</kbd>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 px-2.5 pb-2">
        <NavLink to="/settings" onClick={closeMobile} className={linkClass}>
          <Settings aria-hidden className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.8} />
          <span>{t('nav.settings')}</span>
        </NavLink>
      </div>

      {/* User block */}
      <div ref={userRef} className="relative shrink-0 border-t border-brand-200 p-2.5 dark:border-brand-800">
        {userMenu && (
          <div role="menu" className="absolute inset-x-2.5 bottom-full z-30 mb-1 animate-fade-in rounded-lg border border-brand-200 bg-white p-1 shadow-elevated dark:border-brand-700 dark:bg-brand-900">
            <p className="truncate px-2.5 pb-1 pt-1.5 text-xs text-brand-500">{user?.email}</p>
            <button type="button" role="menuitem" className={menuItemClass} onClick={() => { toggleLanguage(); setUserMenu(false); }}>
              <Languages className="h-4 w-4" /> {language === 'en' ? 'اردو' : 'English'}
            </button>
            <button type="button" role="menuitem" className={menuItemClass} onClick={() => void logout()}>
              <LogOut className="h-4 w-4 rtl:rotate-180" /> {t('common.logout')}
            </button>
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setUserMenu((open) => !open)}
            aria-expanded={userMenu}
            aria-haspopup="menu"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-start transition-colors hover:bg-brand-100 focus-ring dark:hover:bg-brand-900"
          >
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-200 text-xs font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
              {initialsOf(user?.full_name || user?.email)}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium text-brand-900 dark:text-white">{user?.full_name || user?.email}</span>
              <span className="block truncate text-xs text-brand-500">{user?.role && t(ROLE_LABEL_KEYS[user.role])}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t('pg.shell.toggleTheme')}
            title={t('pg.shell.toggleTheme')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-brand-500 transition-colors hover:bg-brand-100 hover:text-brand-900 focus-ring dark:hover:bg-brand-900 dark:hover:text-white"
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </aside>
  );
}
