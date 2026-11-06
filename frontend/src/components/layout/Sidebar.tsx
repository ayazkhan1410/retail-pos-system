import { NavLink } from 'react-router-dom';
import {
  Home,
  ScanBarcode,
  Package,
  Truck,
  Receipt,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
  X,
  LogOut,
  Users,
  Wallet,
  BarChart3,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';
import { cn, ROLE_LABEL_KEYS } from '@/utils';
import { useAppStore, useAuthStore, useCan } from '@/store';
import { useTranslation } from '@/i18n';
import { BrandMark, BrandWordmark } from '@/components/ui/Brand';

interface NavItem {
  to: string;
  permission?: string;
  icon: LucideIcon;
  labelKey: string;
  shortcut?: string;
}

/** Grouped the way a shop works: selling, stock, money. */
const navGroups: { labelKey?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: '/dashboard', permission: 'dashboard.view', icon: Home, labelKey: 'nav.dashboard' },
      { to: '/pos', permission: 'pos.sell', icon: ScanBarcode, labelKey: 'nav.pos', shortcut: 'F2' },
    ],
  },
  {
    labelKey: 'nav.groupCounter',
    items: [
      { to: '/sales', permission: 'sales.view', icon: Receipt, labelKey: 'nav.sales' },
      { to: '/customers', permission: 'customers.view', icon: Users, labelKey: 'nav.customers' },
    ],
  },
  {
    labelKey: 'nav.groupStock',
    items: [
      { to: '/inventory', permission: 'products.edit', icon: Package, labelKey: 'nav.inventory' },
      { to: '/purchases', permission: 'purchases.view', icon: Truck, labelKey: 'nav.purchases' },
      { to: '/suppliers', permission: 'suppliers.view', icon: Building2, labelKey: 'nav.suppliers' },
    ],
  },
  {
    labelKey: 'nav.groupAccounts',
    items: [
      { to: '/reports', permission: 'reports.view', icon: BarChart3, labelKey: 'nav.reports' },
      { to: '/expenses', permission: 'expenses.view', icon: Wallet, labelKey: 'nav.expenses' },
      { to: '/insights', permission: 'insights.view', icon: Lightbulb, labelKey: 'nav.insights' },
    ],
  },
];

function initials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Store name as last loaded for receipts; shown under the logo so staff see which shop they're in. */
function cachedStoreName(): string | null {
  try {
    const raw = localStorage.getItem('smartshop-store-details');
    const name = raw ? (JSON.parse(raw) as { name?: string }).name : null;
    return name?.trim() || null;
  } catch {
    return null;
  }
}

interface SidebarProps {
  mobile?: boolean;
}

export default function Sidebar({ mobile = false }: SidebarProps) {
  const { sidebarCollapsed, toggleSidebar, setMobileSidebarOpen } = useAppStore();
  const { user, logout } = useAuthStore();
  const can = useCan();
  const { t } = useTranslation();
  const collapsed = !mobile && sidebarCollapsed;
  const storeName = cachedStoreName();

  const closeMobile = () => setMobileSidebarOpen(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'group flex h-8 items-center gap-2.5 rounded-lg text-sm font-medium transition-colors focus-ring',
      collapsed ? 'justify-center px-0' : 'px-2.5',
      isActive
        ? 'bg-white text-brand-900 shadow-soft ring-1 ring-brand-200 dark:bg-brand-900 dark:text-white dark:ring-brand-800'
        : 'text-brand-700 hover:bg-brand-100 hover:text-brand-900 dark:text-brand-400 dark:hover:bg-brand-900 dark:hover:text-white',
    );

  const groups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || can(item.permission)) }))
    .filter((group) => group.items.length > 0);

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col border-e border-brand-200 bg-brand-50 transition-[width] duration-200 dark:border-brand-800 dark:bg-[#0f1013]',
        mobile ? 'w-[280px]' : collapsed ? 'w-[68px]' : 'w-[240px]',
      )}
    >
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5', collapsed ? 'justify-center px-3' : 'px-4')}>
        <BrandMark size={28} />
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <BrandWordmark className="h-[15px] text-brand-900 dark:text-white" />
            <p className="mt-0.5 truncate text-xs text-brand-500">{storeName ?? t('nav.pointOfSale')}</p>
          </div>
        )}
        <span className="sr-only">Tijori</span>
        {mobile && (
          <button
            type="button"
            onClick={closeMobile}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-500 hover:bg-brand-100 hover:text-brand-900 dark:hover:bg-brand-900"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-4 pt-1 scrollbar-none">
        {groups.map((group, index) => (
          <div key={group.labelKey ?? index}>
            {group.labelKey &&
              (collapsed ? (
                <div aria-hidden className="mx-2 mb-2 h-px bg-brand-200 dark:bg-brand-800" />
              ) : (
                <p className="mb-1 px-2.5 text-xs font-medium text-brand-400">{t(group.labelKey)}</p>
              ))}
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, labelKey, shortcut }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={mobile ? closeMobile : undefined}
                  aria-label={collapsed ? t(labelKey) : undefined}
                  aria-keyshortcuts={shortcut}
                  title={collapsed ? t(labelKey) : undefined}
                  className={linkClass}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  {!collapsed && <span className="flex-1 truncate">{t(labelKey)}</span>}
                  {!collapsed && shortcut && <kbd aria-hidden>{shortcut}</kbd>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-0.5 px-2.5 pb-2">
        <NavLink
          to="/settings"
          onClick={mobile ? closeMobile : undefined}
          aria-label={collapsed ? t('nav.settings') : undefined}
          title={collapsed ? t('nav.settings') : undefined}
          className={linkClass}
        >
          <Settings className="h-4 w-4 shrink-0 opacity-80" />
          {!collapsed && <span>{t('nav.settings')}</span>}
        </NavLink>
        {!mobile && (
          <button
            type="button"
            onClick={toggleSidebar}
            className={cn(
              'flex h-8 w-full items-center gap-2.5 rounded-lg text-sm text-brand-500 transition-colors hover:bg-brand-100 hover:text-brand-900 dark:hover:bg-brand-900 dark:hover:text-white',
              collapsed ? 'justify-center' : 'px-2.5',
            )}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4 rtl:rotate-180" /> : <PanelLeftClose className="h-4 w-4 rtl:rotate-180" />}
            {!collapsed && <span>{t('nav.collapse')}</span>}
          </button>
        )}
      </div>

      <div className={cn('flex shrink-0 items-center gap-2.5 border-t border-brand-200 p-3 dark:border-brand-800', collapsed && 'flex-col')}>
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-200 text-xs font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-200"
        >
          {initials(user?.full_name)}
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{user?.full_name}</p>
            <p className="truncate text-xs text-brand-500">{user?.role && t(ROLE_LABEL_KEYS[user.role])}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-brand-500 transition-colors hover:bg-brand-100 hover:text-brand-900 focus-ring dark:hover:bg-brand-900 dark:hover:text-white"
          aria-label={t('common.logout')}
          title={t('common.logout')}
        >
          <LogOut className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>
    </aside>
  );
}
