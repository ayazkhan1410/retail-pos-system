import type { Product } from '@/types';

export type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
export type ExpiryFilter = 'all' | 'expiring_soon' | 'expired' | 'no_expiry';
export type ActivityFilter = 'active' | 'inactive';

export const EXPIRING_SOON_DAYS = 30;

/** Margin % on till price (salePrice), rounded to 1 decimal. Null when price is zero. */
export function productMarginPercent(product: Pick<Product, 'cost' | 'salePrice' | 'price'>): number | null {
  const sell = product.salePrice > 0 ? product.salePrice : product.price;
  if (!(sell > 0)) return null;
  return Math.round(((sell - product.cost) / sell) * 1000) / 10;
}

/** Fill level for on-hand bar — relative to max level or a soft stock ceiling. */
export function stockFillPercent(product: Pick<Product, 'stock' | 'maxLevel' | 'threshHold' | 'minLevel'>): number {
  const ceiling =
    product.maxLevel && product.maxLevel > 0
      ? product.maxLevel
      : Math.max((product.threshHold ?? product.minLevel ?? 10) * 3, product.stock, 1);
  return Math.max(0, Math.min(100, Math.round((product.stock / ceiling) * 100)));
}

export function deriveStockStatus(product: Pick<Product, 'stock' | 'threshHold' | 'minLevel'>): Product['status'] {
  if (product.stock <= 0) return 'out_of_stock';
  const threshold = product.threshHold ?? product.minLevel ?? 10;
  if (product.stock <= threshold) return 'low_stock';
  return 'in_stock';
}

export type ExpiryStatus = 'none' | 'ok' | 'expiring_soon' | 'expired';

export function getExpiryStatus(expiryDate?: string, today = new Date()): ExpiryStatus {
  if (!expiryDate) return 'none';
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return 'none';

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfExpiry = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());

  if (startOfExpiry < startOfToday) return 'expired';

  const soonLimit = new Date(startOfToday);
  soonLimit.setDate(soonLimit.getDate() + EXPIRING_SOON_DAYS);
  if (startOfExpiry <= soonLimit) return 'expiring_soon';

  return 'ok';
}

export function formatDateOnly(date?: string): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

export function isDateInRange(value: string | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (from && date < new Date(from)) return false;
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    if (date > end) return false;
  }
  return true;
}

export interface InventoryFilters {
  search: string;
  stockStatus: StockFilter;
  expiryFilter: ExpiryFilter;
  activity: ActivityFilter;
  category: string;
  expiryFrom: string;
  expiryTo: string;
  addedFrom: string;
  addedTo: string;
}

export const emptyInventoryFilters: InventoryFilters = {
  search: '',
  stockStatus: 'all',
  expiryFilter: 'all',
  activity: 'active',
  category: 'all',
  expiryFrom: '',
  expiryTo: '',
  addedFrom: '',
  addedTo: '',
};

export function filterProducts(products: Product[], filters: InventoryFilters): Product[] {
  const q = filters.search.trim().toLowerCase();

  return products.filter((product) => {
    const status = deriveStockStatus(product);
    const expiryStatus = getExpiryStatus(product.expiryDate);

    if (filters.activity === 'active' && !product.active) return false;
    if (filters.activity === 'inactive' && product.active) return false;

    if (q) {
      const matchesSearch =
        product.name.toLowerCase().includes(q) ||
        product.barcode.includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        (product.aluCode?.toLowerCase().includes(q) ?? false);
      if (!matchesSearch) return false;
    }

    if (filters.stockStatus !== 'all' && status !== filters.stockStatus) return false;

    if (filters.expiryFilter === 'expired' && expiryStatus !== 'expired') return false;
    if (filters.expiryFilter === 'expiring_soon' && expiryStatus !== 'expiring_soon') return false;
    if (filters.expiryFilter === 'no_expiry' && expiryStatus !== 'none') return false;

    if (filters.category !== 'all' && product.category !== filters.category) return false;

    if (!isDateInRange(product.expiryDate, filters.expiryFrom, filters.expiryTo)) return false;
    if (!isDateInRange(product.createdAt, filters.addedFrom, filters.addedTo)) return false;

    return true;
  });
}

export function countByStockStatus(products: Product[]) {
  return products.reduce(
    (acc, product) => {
      if (!product.active) {
        acc.inactive += 1;
        return acc;
      }
      const status = deriveStockStatus(product);
      acc[status] += 1;
      acc.total += 1;
      if (getExpiryStatus(product.expiryDate) === 'expiring_soon') acc.expiringSoon += 1;
      if (getExpiryStatus(product.expiryDate) === 'expired') acc.expired += 1;
      return acc;
    },
    { total: 0, inactive: 0, in_stock: 0, low_stock: 0, out_of_stock: 0, expiringSoon: 0, expired: 0 },
  );
}
