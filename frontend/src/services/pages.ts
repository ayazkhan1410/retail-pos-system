/** API calls behind the design pages (Home, Orders, Customers, Purchases, Suppliers, Expenses, Reports, Analytics, Settings). */
import api from './api';
import type { Customer, Expense, Terminal } from '@/types';
import type {
  Analytics,
  CashiersSection,
  CustomerProfile,
  CustomerSegment,
  CustomerSummary,
  ExpenseSummary,
  KhataSection,
  OrdersSummary,
  Overview,
  OverviewPeriod,
  PurchaseSummary,
  ReportPnl,
  SalesSection,
  StockSection,
  SupplierPage,
  TaxSection,
  TrendRow,
} from '@/types/pages';

const clean = <T extends Record<string, unknown>>(params: T) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value != null)) as Partial<T>;

export interface RangeParams { from?: string; to?: string }

export const overviewApi = {
  get: (period: OverviewPeriod) => api.get<Overview>('/finance/overview/', { params: { period } }),
};

export const ordersApi = {
  summary: (params: Record<string, string | undefined>) => api.get<OrdersSummary>('/sales/summary/', { params: clean(params) }),
};

export interface CustomerQuery {
  search?: string;
  segment?: CustomerSegment | '';
  area?: string;
  ordering?: 'name' | 'last_visit' | '-last_visit' | 'balance' | '';
  page?: number;
  page_size?: number;
}

export const customerPagesApi = {
  list: (query: CustomerQuery) =>
    api.get<{ count: number; results: Customer[] }>('/customers/', { params: clean({ ...query }) }),
  get: (id: number) => api.get<Customer>(`/customers/${id}/`),
  summary: () => api.get<CustomerSummary>('/customers/summary/'),
  profile: (id: number) => api.get<CustomerProfile>(`/customers/${id}/profile/`),
};

export const purchasePagesApi = {
  summary: () => api.get<PurchaseSummary>('/purchases/summary/'),
};

export interface SupplierQuery { search?: string; city?: string; balance?: 'owed' | 'settled' | ''; page?: number; page_size?: number; ordering?: string }

export const supplierPagesApi = {
  list: (query: SupplierQuery) => api.get<SupplierPage>('/suppliers/', { params: clean({ ...query }) }),
};

export const expensePagesApi = {
  list: (params: RangeParams & { search?: string }) => api.get<Expense[]>('/finance/expenses/', { params: clean({ ...params }) }),
  summary: (month: string) => api.get<ExpenseSummary>('/finance/expenses/summary/', { params: { month } }),
};

export const reportPagesApi = {
  pnl: (range: RangeParams) => api.get<ReportPnl>('/finance/report/', { params: clean({ ...range }) }),
  trend: (months = 6) => api.get<TrendRow[]>('/finance/report/trend/', { params: { months } }),
  sales: (range: RangeParams) => api.get<SalesSection>('/finance/report/sales/', { params: clean({ ...range }) }),
  stock: () => api.get<StockSection>('/finance/report/stock/'),
  tax: (range: RangeParams) => api.get<TaxSection>('/finance/report/tax/', { params: clean({ ...range }) }),
  cashiers: (range: RangeParams) => api.get<CashiersSection>('/finance/report/cashiers/', { params: clean({ ...range }) }),
  khata: () => api.get<KhataSection>('/finance/report/khata/'),
};

export const analyticsApi = {
  get: (days: 30 | 90 | 365) => api.get<Analytics>('/finance/analytics/', { params: { days } }),
};

export const terminalsApi = {
  list: (includeInactive = false) =>
    api.get<Terminal[]>('/sales/terminals/', { params: includeInactive ? { include_inactive: '1' } : {} }),
  create: (data: { code: string; name: string }) => api.post<Terminal>('/sales/terminals/', data),
  update: (id: number, data: Partial<Pick<Terminal, 'name' | 'code' | 'active'>>) => api.patch<Terminal>(`/sales/terminals/${id}/`, data),
};
