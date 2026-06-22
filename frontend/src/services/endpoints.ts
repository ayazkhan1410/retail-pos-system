import api from './api';

export const healthApi = {
  check: () => api.get('/health'),
};

export const productsApi = {
  getAll: (params?: Record<string, string>) => api.get('/products', { params }),
  getById: (id: string) => api.get(`/products/${id}`),
  getByBarcode: (barcode: string) => api.get(`/products/barcode/${barcode}`),
  create: (data: unknown) => api.post('/products', data),
  update: (id: string, data: unknown) => api.patch(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
};

export const salesApi = {
  getAll: (params?: Record<string, string>) => api.get('/sales', { params }),
  getById: (id: string) => api.get(`/sales/${id}`),
  create: (data: unknown) => api.post('/sales', data),
  getByCounter: (counterId: string, params?: Record<string, string>) =>
    api.get(`/sales/counter/${counterId}`, { params }),
};

export const purchasesApi = {
  getAll: (params?: Record<string, string>) => api.get('/purchases', { params }),
  getById: (id: string) => api.get(`/purchases/${id}`),
  create: (data: unknown) => api.post('/purchases', data),
  update: (id: string, data: unknown) => api.patch(`/purchases/${id}`, data),
};

export const suppliersApi = {
  getAll: (params?: Record<string, string>) => api.get('/suppliers', { params }),
  getById: (id: string) => api.get(`/suppliers/${id}`),
  create: (data: unknown) => api.post('/suppliers', data),
  update: (id: string, data: unknown) => api.patch(`/suppliers/${id}`, data),
  delete: (id: string) => api.delete(`/suppliers/${id}`),
};

export const inventoryApi = {
  getStock: () => api.get('/inventory/stock'),
  adjust: (data: unknown) => api.post('/inventory/adjust', data),
};

export const dashboardApi = {
  getKPIs: () => api.get('/dashboard/kpis'),
  getSalesChart: (period?: string) => api.get('/dashboard/sales-chart', { params: { period } }),
  getTopProducts: () => api.get('/dashboard/top-products'),
};
