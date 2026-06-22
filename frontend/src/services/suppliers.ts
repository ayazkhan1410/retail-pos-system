import type { Supplier } from '@/types';
import type { SupplierFormData } from '@/store';

export interface SupplierApi {
  id: number;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  ntn?: string | null;
  bank_account?: string | null;
  credit_balance?: string | number | null;
  payment_type?: string | null;
  status?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PaginatedSuppliersResponse {
  count: number;
  page: number;
  page_size: number;
  results: SupplierApi[];
}

export interface SupplierListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  payment_type?: string;
  city?: string;
  ordering?: string;
}

export function mapSupplierFromApi(data: SupplierApi): Supplier {
  return {
    id: String(data.id),
    name: data.name,
    phone: data.phone ?? '',
    email: data.email ?? '',
    address: data.address ?? '',
    city: data.city ?? '',
    ntn: data.ntn ?? '',
    bankAccount: data.bank_account ?? undefined,
    notes: data.notes ?? undefined,
    status: (data.status === 'inactive' ? 'inactive' : 'active'),
    paymentType: (data.payment_type === 'cash' ? 'cash' : 'credit'),
    currentBalance: Number(data.credit_balance ?? 0),
    totalPurchases: 0,
    createdAt: data.created_at?.split('T')[0] ?? '',
  };
}

export function mapSupplierToApi(data: SupplierFormData): Record<string, unknown> {
  return {
    name: data.name.trim(),
    phone: data.phone || null,
    email: data.email || null,
    address: data.address || null,
    city: data.city || null,
    ntn: data.ntn || null,
    bank_account: data.bankAccount || null,
    credit_balance: data.currentBalance,
    payment_type: data.paymentType,
    status: data.status,
    notes: data.notes || null,
  };
}
