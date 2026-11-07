import { clsx, type ClassValue } from 'clsx';

export const ROLE_LABEL_KEYS: Record<string, string> = {
  owner: 'settings.roleOwner',
  manager: 'settings.roleManager',
  cashier: 'settings.roleCashier',
  stock_keeper: 'settings.roleStockKeeper',
  accountant: 'settings.roleAccountant',
};

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrencyCompact(amount: number): string {
  if (amount >= 100000) return `Rs. ${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(1)}K`;
  return formatCurrency(amount);
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date));
}

/** Clock time only — used under Today / Yesterday activity sections. */
export function formatTime(date: string): string {
  return new Intl.DateTimeFormat('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date));
}

/** Calendar day key in the shop browser timezone (YYYY-MM-DD). */
export function localDayKey(date: string | Date): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return localDate(value);
}

export function getStockStatus(stock: number): 'in_stock' | 'low_stock' | 'out_of_stock' {
  if (stock <= 0) return 'out_of_stock';
  if (stock <= 10) return 'low_stock';
  return 'in_stock';
}

/** Today in the shop's own timezone. toISOString() would give yesterday before 5 AM in Pakistan. */
export function localDate(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** crypto.randomUUID only exists on HTTPS or localhost; counters reach the shop server over plain HTTP. */
export function newUuid(): string {
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
  );
}

/** "Rs 81k", "Rs 1.24M" — for tight spaces. Full figures stay on formatCurrency. */
export function formatMoneyShort(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}Rs ${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 10_000) return `${sign}Rs ${Math.round(abs / 1000)}k`;
  return `${sign}${formatCurrency(abs)}`;
}

/** Number() for API money that may arrive as a string or number; never NaN. */
export function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** "8:40 pm" in the shop's 12-hour style. */
export function clockTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true })
    .format(typeof date === 'string' ? new Date(date) : date)
    .toLowerCase();
}

/** "6 Nov", or "6 Nov 2025" when not this year. */
export function shortDate(date: string | Date): string {
  const value = typeof date === 'string' ? new Date(date.length === 10 ? `${date}T00:00:00` : date) : date;
  const sameYear = value.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(value);
}
