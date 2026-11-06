import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  Receipt,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Store,
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

interface NavItem {
  to: string;
  permission?: string;
  icon: LucideIcon;
  labelKey: string;
}

/** Grouped the way a shop works: the counter, the stockroom, the books. */
const navGroups: { labelKey?: string; items: NavItem[] }[] = [
  {
    items: [{ to: '/dashboard', permission: 'dashboard.view', icon: LayoutDashboard, labelKey: 'nav.dashboard' }],
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
      { to: '/expenses', permission: 'expenses.view', icon: Wallet, labelKey: 'nav.expenses' },
      { to: '/reports', permission: 'reports.view', icon: BarChart3, labelKey: 'nav.reports' },
      { to: '/insights', permission: 'insights.view', icon: Lightbulb, labelKey: 'nav.insights' },
    ],
  },
];

function initials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
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

  const closeMobile = () => setMobileSidebarOpen(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'group relative flex h-9 items-center gap-3 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
      collapsed ? 'justify-center px-0' : 'px-2.5',
      isActive
        ? 'bg-white/[0.09] text-white before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-accent-glow'
        : 'text-ink-muted hover:bg-white/[0.05] hover:text-white',
    );

  const groups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || can(item.permission)) }))
    .filter((group) => group.items.length > 0);

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col bg-ink text-white transition-[width] duration-200 dark:bg-[#041d10]',
        mobile ? 'w-[284px]' : collapsed ? 'w-[72px]' : 'w-[248px]',
      )}
    >
      {/* Brand */}
      <div className={cn('flex h-16 shrink-0 items-center gap-3', collapsed ? 'justify-center px-3' : 'px-4')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-ink">
          <Store className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">SmartShop</p>
            <p className="text-xs text-ink-muted">{t('nav.pointOfSale')}</p>
          </div>
        )}
        {mobile && (
          <button
            type="button"
            onClick={closeMobile}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-white/10 hover:text-white"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* The till is the one place staff go most: it gets its own button, not a list row. */}
      {can('pos.sell') && (
        <div className={cn('pb-3 pt-1', collapsed ? 'px-3' : 'px-3')}>
          <NavLink
            to="/pos"
            onClick={mobile ? closeMobile : undefined}
            aria-label={collapsed ? t('nav.pos') : undefined}
            aria-keyshortcuts="F2"
            title={collapsed ? t('nav.pos') : undefined}
            className={cn(
              'flex h-10 items-center gap-2.5 rounded-lg bg-accent-glow font-semibold text-ink transition-colors hover:bg-[#4fd690] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 dark:text-ink',
              collapsed ? 'justify-center' : 'px-3 text-sm',
            )}
          >
            <ShoppingCart className="h-[18px] w-[18px] shrink-0" strokeWidth={2.25} />
            {!collapsed && <span className="flex-1">{t('nav.pos')}</span>}
            {!collapsed && <span aria-hidden className="rounded bg-ink/10 px-1.5 py-0.5 text-2xs font-semibold">F2</span>}
          </NavLink>
        </div>
      )}

      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 scrollbar-none">
        {groups.map((group, index) => (
          <div key={group.labelKey ?? index}>
            {group.labelKey &&
              (collapsed ? (
                <div aria-hidden className="mx-2 mb-2 h-px bg-white/10" />
              ) : (
                <p className="mb-1.5 px-2.5 text-xs font-medium text-ink-muted/70">{t(group.labelKey)}</p>
              ))}
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, labelKey }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={mobile ? closeMobile : undefined}
                  aria-label={collapsed ? t(labelKey) : undefined}
                  title={collapsed ? t(labelKey) : undefined}
                  className={linkClass}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{t(labelKey)}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-white/10 p-3">
        <NavLink
          to="/settings"
          onClick={mobile ? closeMobile : undefined}
          aria-label={collapsed ? t('nav.settings') : undefined}
          title={collapsed ? t('nav.settings') : undefined}
          className={linkClass}
        >
          <Settings className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>{t('nav.settings')}</span>}
        </NavLink>

        <div className={cn('flex items-center gap-2.5 rounded-lg pt-2', collapsed ? 'flex-col' : 'px-1')}>
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white"
          >
            {initials(user?.full_name)}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">{user?.full_name}</p>
              <p className="truncate text-xs text-ink-muted">{user?.role && t(ROLE_LABEL_KEYS[user.role])}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => void logout()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label={t('common.logout')}
            title={t('common.logout')}
          >
            <LogOut className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>

        {!mobile && (
          <button
            type="button"
            onClick={toggleSidebar}
            className={cn(
              'mt-1 flex h-8 w-full items-center gap-2 rounded-lg text-xs text-ink-muted transition-colors hover:bg-white/[0.05] hover:text-white',
              collapsed ? 'justify-center' : 'px-2.5',
            )}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4 rtl:rotate-180" /> : <PanelLeftClose className="h-4 w-4 rtl:rotate-180" />}
            {!collapsed && <span>{t('nav.collapse')}</span>}
          </button>
        )}
      </div>
    </aside>
  );
}
