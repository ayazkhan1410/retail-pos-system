import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  Receipt,
  Settings,
  ChevronLeft,
  Zap,
  Building2,
  X,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { cn, ROLE_LABEL_KEYS } from '@/utils';
import { useAppStore, useAuthStore, useCan } from '@/store';
import { useTranslation } from '@/i18n';

const navItems: { to: string; permission?: string; icon: LucideIcon; labelKey: string; highlight?: boolean }[] = [
  { to: '/dashboard', permission: 'dashboard.view', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { to: '/pos', permission: 'pos.sell', icon: ShoppingCart, labelKey: 'nav.pos', highlight: true },
  { to: '/inventory', permission: 'products.edit', icon: Package, labelKey: 'nav.inventory' },
  { to: '/suppliers', permission: 'suppliers.view', icon: Building2, labelKey: 'nav.suppliers' },
  { to: '/purchases', permission: 'purchases.view', icon: Truck, labelKey: 'nav.purchases' },
  { to: '/sales', permission: 'sales.view', icon: Receipt, labelKey: 'nav.sales' },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings' },
];

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

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col border-r border-brand-200/80 bg-white/90 backdrop-blur-xl transition-all duration-300 dark:border-brand-800/80 dark:bg-brand-950/90',
        mobile ? 'w-[280px]' : collapsed ? 'w-[76px]' : 'w-[260px]',
      )}
    >
      <div className="flex h-[72px] items-center justify-between gap-3 px-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-light shadow-glow">
            <Zap className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div>
              <p className="font-display text-base font-bold tracking-tight">SmartShop</p>
              <p className="text-[11px] font-medium text-accent">{t('nav.pointOfSale')}</p>
            </div>
          )}
        </div>
        {mobile && (
          <button
            type="button"
            onClick={closeMobile}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-brand-500 hover:bg-brand-100 dark:hover:bg-brand-800"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {navItems.filter((item) => !item.permission || can(item.permission)).map(({ to, icon: Icon, labelKey, highlight }) => (
          <NavLink
            key={to}
            to={to}
            onClick={mobile ? closeMobile : undefined}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-brand-900 text-white shadow-card dark:bg-white dark:text-brand-900'
                  : 'text-brand-600 hover:bg-brand-100/80 dark:text-brand-400 dark:hover:bg-brand-800/50',
                highlight && !isActive && 'ring-1 ring-accent/20',
              )
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span>{t(labelKey)}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="mx-3 mt-3 flex items-center gap-2 border-t border-brand-200/80 pt-3 dark:border-brand-800/80">
        {!collapsed && (
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-semibold">{user?.full_name}</p>
            <p className="truncate text-xs text-brand-500">{user?.role && t(ROLE_LABEL_KEYS[user.role])}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-brand-500 hover:bg-brand-100 hover:text-red-600 dark:hover:bg-brand-800"
          aria-label={t('common.logout')}
          title={t('common.logout')}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      {!mobile && (
        <button
          onClick={toggleSidebar}
          className="m-3 flex h-9 items-center justify-center rounded-xl border border-brand-200/80 text-brand-400 transition-all hover:bg-brand-100 hover:text-brand-600 dark:border-brand-800 dark:hover:bg-brand-800 dark:hover:text-brand-200"
          aria-label="Toggle sidebar"
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform duration-300', collapsed && 'rotate-180')} />
        </button>
      )}
    </aside>
  );
}
