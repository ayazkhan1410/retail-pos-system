import {
  BarChart3,
  Box,
  Building2,
  CreditCard,
  Home,
  LineChart,
  ReceiptText,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  permission?: string;
  icon: LucideIcon;
  labelKey: string;
  shortcut?: string;
}

/** Grouped the way a shop works: selling, stock, money. Shared by the sidebar and the ⌘K palette. */
export const NAV_GROUPS: { labelKey?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: '/dashboard', permission: 'dashboard.view', icon: Home, labelKey: 'nav.dashboard' },
      { to: '/pos', permission: 'pos.sell', icon: CreditCard, labelKey: 'nav.pos', shortcut: 'F2' },
    ],
  },
  {
    labelKey: 'nav.groupCounter',
    items: [
      { to: '/sales', permission: 'sales.view', icon: ReceiptText, labelKey: 'nav.sales' },
      { to: '/customers', permission: 'customers.view', icon: Users, labelKey: 'nav.customers' },
    ],
  },
  {
    labelKey: 'nav.groupStock',
    items: [
      { to: '/inventory', permission: 'products.edit', icon: Box, labelKey: 'nav.inventory' },
      { to: '/purchases', permission: 'purchases.view', icon: Truck, labelKey: 'nav.purchases' },
      { to: '/suppliers', permission: 'suppliers.view', icon: Building2, labelKey: 'nav.suppliers' },
    ],
  },
  {
    labelKey: 'nav.groupAccounts',
    items: [
      { to: '/reports', permission: 'reports.view', icon: BarChart3, labelKey: 'nav.reports' },
      { to: '/expenses', permission: 'expenses.view', icon: Wallet, labelKey: 'nav.expenses' },
      { to: '/insights', permission: 'insights.view', icon: LineChart, labelKey: 'nav.insights' },
    ],
  },
];
