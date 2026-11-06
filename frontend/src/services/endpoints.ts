import api from './api';
import type { PaginatedSuppliersResponse, SupplierApi, SupplierListParams } from './suppliers';
import type { ProductApi } from './products';
import type { Branch, DashboardData, RoleMatrix, Sale, Shift, Terminal, User } from '@/types';

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

export type UserInput = Partial<Omit<User, 'id' | 'permissions'>> & { password?: string };

export const authApi = {
  session: () => api.get<{ user: User | null }>('/auth/session/'),
  login: (email: string, password: string) => api.post<{ user: User }>('/auth/login/', { email, password }),
  logout: () => api.post('/auth/logout/'),
  users: () => api.get<User[]>('/auth/users/'),
  createUser: (data: UserInput) => api.post<User>('/auth/users/', data),
  updateUser: (id: number, data: UserInput) => api.patch<User>(`/auth/users/${id}/`, data),
  roles: () => api.get<RoleMatrix>('/auth/roles/'),
  updateRole: (role: string, permissions: string[]) => api.put<RoleMatrix>('/auth/roles/', { role, permissions }),
};

export const inventoryApi = {
  products: () => api.get<ProductApi[]>('/inventory/products/'),
  createProduct: (data: Record<string, unknown>) => api.post<ProductApi>('/inventory/products/', data),
  updateProduct: (id: string, data: Record<string, unknown>) => api.patch<ProductApi>(`/inventory/products/${id}/`, data),
  deleteProduct: (id: string) => api.delete(`/inventory/products/${id}/`),
  categories: () => api.get<string[]>('/inventory/categories/'),
  branch: () => api.get<Branch>('/inventory/branch/'),
  updateBranch: (data: Partial<Branch>) => api.patch<Branch>('/inventory/branch/', data),
};

export interface NewSale {
  client_uuid: string;
  terminal: number;
  discount: string;
  lines: { product: number; quantity: string }[];
  payments: { method: string; amount: string; reference?: string }[];
}

export interface SaleListParams {
  page?: number;
  search?: string;
  terminal?: string;
  from?: string;
  to?: string;
}

export const salesApi = {
  list: (params: SaleListParams) =>
    api.get<{ count: number; revenue: string; results: Sale[] }>('/sales/', { params }),
  create: (data: NewSale) => api.post<Sale>('/sales/', data),
  terminals: () => api.get<Terminal[]>('/sales/terminals/'),
  currentShift: (terminalId: number) => api.get<{ shift: Shift | null }>(`/sales/terminals/${terminalId}/shift/`),
  openShift: (terminal: number, openingCash: string) =>
    api.post<Shift>('/sales/shifts/', { terminal, opening_cash: openingCash }),
  closeShift: (shiftId: number, countedCash: string) =>
    api.post<Shift>(`/sales/shifts/${shiftId}/close/`, { counted_cash: countedCash }),
  dashboard: () => api.get<DashboardData>('/sales/dashboard/'),
};

export const auditApi = {
  cartCleared: (items: number, total: number) =>
    api.post('/audit/events/', { action: 'cart_cleared', details: { items, total } }),
};

export const suppliersApi = {
  getAll: (params?: SupplierListParams) =>
    api.get<PaginatedSuppliersResponse>('/suppliers/', { params }),
  getById: (id: string | number) => api.get<SupplierApi>(`/suppliers/${id}/`),
  create: (data: Record<string, unknown>) => api.post<SupplierApi>('/suppliers/', data),
  update: (id: string | number, data: Record<string, unknown>) =>
    api.patch<SupplierApi>(`/suppliers/${id}/`, data),
  delete: (id: string | number) => api.delete(`/suppliers/${id}/`),
  bulkDelete: (ids: number[]) =>
    api.post<{ message: string }>('/suppliers/bulk-delete/', { ids }),
};
