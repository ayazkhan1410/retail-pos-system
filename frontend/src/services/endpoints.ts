import api from './api';
import type { PaginatedSuppliersResponse, SupplierApi, SupplierListParams } from './suppliers';
import type { ProductApi } from './products';
import type {
  AppNotification, Branch, Customer, DashboardData, Expense, FinancialReport, GRN, GRNPreview, Insights, LedgerEntry,
  NotificationListResponse, RoleMatrix, Sale, Shift, Terminal, User,
} from '@/types';

export interface HealthCheckResponse {
  status: string;
  message: string;
}

export const healthApi = {
  check: () => api.get<HealthCheckResponse>('/health-check/'),
};

export interface AppVersionResponse {
  version: string;
}

export interface BackupResponse {
  status: string;
  message: string;
  filename?: string;
  size_bytes?: number;
  created_at?: string;
}

export const systemApi = {
  getVersion: () => api.get<AppVersionResponse>('/system/version/'),
  backupDatabase: () => api.post<BackupResponse>('/system/backup/'),
};

export type UserInput = Partial<Omit<User, 'id' | 'permissions' | 'has_pin'>> & {
  password?: string;
  pin?: string;
};

export const authApi = {
  session: () => api.get<{ user: User | null; pin_sign_in?: boolean }>('/auth/session/'),
  pinLogin: (pin: string) => api.post<{ user: User }>('/auth/pin-login/', { pin }),
  login: (email: string, password: string) => api.post<{ user: User }>('/auth/login/', { email, password }),
  logout: () => api.post('/auth/logout/'),
  switchPin: (pin: string) => api.post<{ user: User }>('/auth/switch-pin/', { pin }),
  users: () => api.get<User[]>('/auth/users/'),
  createUser: (data: UserInput) => api.post<User>('/auth/users/', data),
  updateUser: (id: number, data: UserInput) => api.patch<User>(`/auth/users/${id}/`, data),
  roles: () => api.get<RoleMatrix>('/auth/roles/'),
  updateRole: (role: string, permissions: string[]) => api.put<RoleMatrix>('/auth/roles/', { role, permissions }),
};

export const inventoryApi = {
  products: (opts?: { includeInactive?: boolean }) =>
    api.get<ProductApi[]>('/inventory/products/', {
      params: opts?.includeInactive ? { include_inactive: '1' } : undefined,
    }),
  searchProducts: (q: string, opts?: { includeInactive?: boolean; limit?: number }) =>
    api.get<{ results: ProductApi[]; count: number }>('/inventory/products/search/', {
      params: {
        q,
        limit: opts?.limit ?? 40,
        ...(opts?.includeInactive ? { include_inactive: '1' } : {}),
      },
    }),
  createProduct: (data: Record<string, unknown>) => api.post<ProductApi>('/inventory/products/', data),
  updateProduct: (id: string, data: Record<string, unknown>) => api.patch<ProductApi>(`/inventory/products/${id}/`, data),
  deleteProduct: (id: string) => api.delete(`/inventory/products/${id}/`),
  adjustStock: (id: string, counted: number, reason: string) =>
    api.post<ProductApi>(`/inventory/products/${id}/adjust/`, { counted, reason }),
  writeOffExpired: (id: string) => api.post<ProductApi>(`/inventory/products/${id}/write-off-expired/`),
  importProducts: (file: File) => {
    const body = new FormData();
    body.append('file', file);
    return api.post<{ created: number; error_count: number; errors: { row: number; error: string }[] }>(
      '/inventory/products/import/', body, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 },
    );
  },
  categories: () => api.get<string[]>('/inventory/categories/'),
  branch: () => api.get<Branch>('/inventory/branch/'),
  updateBranch: (data: Partial<Branch>) => api.patch<Branch>('/inventory/branch/', data),
};

export type HeldBillLine = {
  product_id: number;
  quantity: string;
  name: string;
  barcode: string;
  unit_price: string;
};

export type HeldBill = {
  id: number;
  terminal: number;
  terminal_name: string;
  held_by: number;
  held_by_name: string;
  label: string;
  customer: number | null;
  customer_name: string;
  discount: string;
  lines: HeldBillLine[];
  item_count: number;
  subtotal: string;
  created_at: string;
  updated_at: string;
};

export type ZReport = {
  shift_id: number;
  terminal: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  opening_cash: string;
  expected_cash: string;
  counted_cash: string | null;
  difference: string | null;
  sales_count: number;
  sales_total: string;
  returns_count: number;
  returns_total: string;
  net_sales: string;
  payments: Record<string, string>;
  invoices: { invoice_no: string; total: string; cashier: string; created_at: string }[];
};

export interface NewSale {
  client_uuid: string;
  terminal: number;
  discount: string;
  customer?: number | null;
  offline?: boolean;
  sold_at?: string;
  lines: { product: number; quantity: string; unit_price?: string }[];
  payments: { method: string; amount: string; reference?: string }[];
}

export interface SaleListParams {
  page?: number;
  page_size?: number;
  search?: string;
  terminal?: string;
  cashier?: string;
  method?: string;
  status?: string;
  from?: string;
  to?: string;
}

export const salesApi = {
  list: (params: SaleListParams) =>
    api.get<{ count: number; revenue: string; results: Sale[] }>('/sales/', { params }),
  create: (data: NewSale) => api.post<Sale>('/sales/', data),
  createReturn: (data: {
    client_uuid: string;
    sale?: number | null;
    terminal?: number;
    method: string;
    reason?: string;
    lines: Array<
      | { sale_line: number; quantity: string; restock: boolean }
      | { product: number; quantity: string; restock: boolean; unit_price?: string }
    >;
  }) => api.post<{ return: { id: number; number: string; total: string }; sale: Sale | null }>('/sales/returns/', data),
  terminals: () => api.get<Terminal[]>('/sales/terminals/'),
  currentShift: (terminalId: number) => api.get<{ shift: Shift | null }>(`/sales/terminals/${terminalId}/shift/`),
  openShift: (terminal: number, openingCash: string) =>
    api.post<Shift>('/sales/shifts/', { terminal, opening_cash: openingCash }),
  closeShift: (shiftId: number, countedCash: string) =>
    api.post<Shift>(`/sales/shifts/${shiftId}/close/`, { counted_cash: countedCash }),
  zReport: (shiftId: number) => api.get<ZReport>(`/sales/shifts/${shiftId}/z-report/`),
  heldBills: (terminalId: number) => api.get<HeldBill[]>('/sales/held/', { params: { terminal: terminalId } }),
  holdBill: (data: {
    terminal: number;
    label?: string;
    customer?: number | null;
    discount?: string;
    lines: HeldBillLine[];
  }) => api.post<HeldBill>('/sales/held/', data),
  deleteHeldBill: (id: number) => api.delete(`/sales/held/${id}/`),
  dashboard: () => api.get<DashboardData>('/sales/dashboard/'),
};

export type ActivityItem = {
  id: number;
  action: string;
  target: string;
  user: string;
  created_at: string;
  details?: Record<string, unknown>;
};

export const auditApi = {
  cartCleared: (items: number, total: number) =>
    api.post('/audit/events/', { action: 'cart_cleared', details: { items, total } }),
  activity: (params?: { page?: number; page_size?: number }) =>
    api.get<{ count: number; next: string | null; previous: string | null; results: ActivityItem[] }>(
      '/audit/activity/',
      { params: { page: params?.page, page_size: params?.page_size ?? 8 } },
    ),
};

export const suppliersApi = {
  getAll: (params?: SupplierListParams) =>
    api.get<PaginatedSuppliersResponse>('/suppliers/', { params }),
  getById: (id: string | number) => api.get<SupplierApi>(`/suppliers/${id}/`),
  create: (data: Record<string, unknown>) => api.post<SupplierApi>('/suppliers/', data),
  update: (id: string | number, data: Record<string, unknown>) =>
    api.patch<SupplierApi>(`/suppliers/${id}/`, data),
  delete: (id: string | number) => api.delete(`/suppliers/${id}/`),
  ledger: (id: string | number) => api.get<LedgerEntry[]>(`/suppliers/${id}/ledger/`),
  pay: (id: string | number, data: { amount: string; method: string; reference: string }) =>
    api.post<SupplierApi>(`/suppliers/${id}/ledger/`, data),
  bulkDelete: (ids: number[]) =>
    api.post<{ message: string }>('/suppliers/bulk-delete/', { ids }),
};

export const customersApi = {
  list: (params?: { search?: string; page?: number; page_size?: number }) =>
    api.get<{ count: number; next: string | null; previous: string | null; results: Customer[] }>('/customers/', {
      params: {
        search: params?.search || undefined,
        page: params?.page,
        page_size: params?.page_size,
      },
    }),
  create: (data: Record<string, unknown>) => api.post<Customer>('/customers/', data),
  update: (id: number, data: Record<string, unknown>) => api.patch<Customer>(`/customers/${id}/`, data),
  ledger: (id: number) => api.get<LedgerEntry[]>(`/customers/${id}/ledger/`),
  collect: (id: number, data: { amount: string; method: string; reference: string; terminal?: number | null }) =>
    api.post<Customer>(`/customers/${id}/ledger/`, data),
};

export interface PurchaseReturnPayload {
  supplier: number;
  grn?: number | null;
  date: string;
  reason?: string;
  lines: { product: number; quantity: string; rate: string }[];
}

export interface PurchaseReturnRow {
  id: number;
  number: string | null;
  status: 'draft' | 'posted';
  supplier: number;
  supplier_name: string;
  grn: number | null;
  grn_number?: string;
  date: string;
  reason: string;
  total: string;
  lines: { product: number; product_name: string; barcode: string; quantity: string; rate: string; line_total: string }[];
}

export const purchasesApi = {
  list: () => api.get<{ results: GRN[] }>('/purchases/'),
  create: (data: GRN) => api.post<GRN>('/purchases/', data),
  update: (id: number, data: GRN) => api.put<GRN>(`/purchases/${id}/`, data),
  remove: (id: number) => api.delete(`/purchases/${id}/`),
  post: (id: number) => api.post<GRN>(`/purchases/${id}/post/`),
  void: (id: number, reason = '') => api.post<GRN>(`/purchases/${id}/void/`, { reason }),
  preview: (data: GRN) => api.post<GRNPreview>('/purchases/preview/', data),
  listReturns: () => api.get<{ results: PurchaseReturnRow[] }>('/purchases/returns/'),
  createReturn: (data: PurchaseReturnPayload) => api.post<PurchaseReturnRow>('/purchases/returns/', data),
  postReturn: (id: number) => api.post<PurchaseReturnRow>(`/purchases/returns/${id}/post/`),
  removeReturn: (id: number) => api.delete(`/purchases/returns/${id}/`),
};

export const financeApi = {
  expenses: () => api.get<Expense[]>('/finance/expenses/'),
  addExpense: (data: Record<string, unknown>) => api.post<Expense>('/finance/expenses/', data),
  deleteExpense: (id: number) => api.delete(`/finance/expenses/${id}/`),
  report: (from: string, to: string) => api.get<FinancialReport>('/finance/report/', { params: { from, to } }),
  insights: () => api.get<Insights>('/finance/insights/'),
};

export const notificationsApi = {
  list: (params?: { page?: number; page_size?: number; unread?: boolean }) =>
    api.get<NotificationListResponse>('/notifications/', {
      params: {
        page: params?.page,
        page_size: params?.page_size,
        unread: params?.unread ? '1' : undefined,
      },
    }),
  unreadCount: () => api.get<{ unread_count: number }>('/notifications/unread-count/'),
  markRead: (ids: number[]) => api.post<{ updated: number }>('/notifications/mark-read/', { ids }),
  markAllRead: () => api.post<{ updated: number }>('/notifications/mark-all-read/'),
};

export type { AppNotification };
