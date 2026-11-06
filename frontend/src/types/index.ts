export interface Product {
  id: string;
  itemNo?: string;
  active: boolean;
  name: string;
  longDesc?: string;
  barcode: string;
  sku: string;
  aluCode?: string;
  price: number;
  /** Shelf price after the item's own running discount. */
  salePrice: number;
  cost: number;
  stock: number;
  category: string;
  subCategory?: string;
  brand?: string;
  make?: string;
  attributes?: string;
  season?: string;
  supplierId?: string;
  supplierName?: string;
  department?: string;
  size?: string;
  colour?: string;
  designModel?: string;
  itemType?: string;
  uom?: string;
  caseUnit?: string;
  boxPcs?: number;
  weight?: number;
  leadTime?: number;
  costingMethod?: 'recent_cost' | 'manual_cost';
  salesTaxPercent?: number;
  pctCode?: string;
  discPercent?: number;
  discAmount?: number;
  discStart?: string;
  discEnd?: string;
  threshHold?: number;
  minLevel?: number;
  maxLevel?: number;
  qtyDecimal?: boolean;
  unorderable?: boolean;
  isStyleItem?: boolean;
  oemBarcode?: boolean;
  trackExpiry?: boolean;
  expiryDate?: string;
  createdAt?: string;
  updatedAt?: string;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  ntn: string;
  bankAccount?: string;
  notes?: string;
  status: 'active' | 'inactive';
  paymentType: 'credit' | 'cash';
  currentBalance: number;
  totalPurchases: number;
  createdAt: string;
}

export interface KPIData {
  labelKey: string;
  value: string;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  icon?: 'sales' | 'receipt' | 'alert' | 'counter';
}

export type UserRole = 'owner' | 'manager' | 'cashier' | 'stock_keeper' | 'accountant';

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  employee_code: string | null;
  role: UserRole;
  is_active: boolean;
  permissions: string[];
}

export interface Branch {
  id: number;
  code: string;
  name: string;
  address: string;
  phone: string;
  ntn: string;
}

export interface Terminal {
  id: number;
  code: string;
  name: string;
}

export interface Shift {
  id: number;
  terminal: number;
  terminal_name: string;
  opened_by_name: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: string;
  expected_cash: string | null;
  counted_cash: string | null;
  sales_total: string;
  sales_count: number;
}

export type PaymentMethod = 'cash' | 'jazzcash' | 'easypaisa' | 'card' | 'credit';

export interface SaleLine {
  id: number;
  returned_quantity: string;
  name: string;
  barcode: string;
  quantity: string;
  unit_price: string;
  discount: string;
  tax_rate: string;
  tax_amount: string;
  line_total: string;
}

export interface Sale {
  id: number;
  invoice_no: string;
  terminal: number;
  terminal_name: string;
  cashier_name: string;
  customer: number | null;
  customer_name: string;
  is_offline: boolean;
  returned_total: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  change_due: string;
  created_at: string;
  lines: SaleLine[];
  payments: { method: PaymentMethod; amount: string; reference: string }[];
}

export interface DashboardData {
  today_revenue: string;
  today_count: number;
  yesterday_revenue: string;
  open_counters: number;
  total_counters: number;
  stock: { out: number; low: number; ok: number };
  counters: string[];
  sales_by_day: ({ day: string } & Record<string, string | number>)[];
  top_products: { name: string; units: string; revenue: string }[];
  payment_methods: { method: PaymentMethod; amount: string }[];
  peak_hours: { hour: number; count: number }[];
  recent_activity: { id: number; action: string; target: string; user: string; created_at: string }[];
  recent_shifts: (Shift & { difference: string })[];
}

export type Theme = 'light' | 'dark';

export interface SupplierApiOption {
  id: number;
  name: string;
}

export interface RoleMatrix {
  permissions: string[];
  roles: Record<string, string[]>;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  address: string;
  credit_limit: string;
  balance: string;
  active: boolean;
}

export interface LedgerEntry {
  id: number;
  delta: string;
  kind: string;
  method: string;
  reference: string;
  user_name: string;
  created_at: string;
}

export interface Expense {
  id: number;
  category: string;
  amount: string;
  date: string;
  method: string;
  note: string;
  user_name: string;
}

export interface FinancialReport {
  invoices: number;
  gross_sales: string;
  returns: string;
  discounts: string;
  net_sales: string;
  cost_of_goods: string;
  gross_profit: string;
  gross_margin_percent: string | number;
  expenses: string;
  net_profit: string;
  tax_collected: string;
  stock_value: string;
  supplier_payable: string;
  customer_receivable: string;
  expenses_by_category: { category: string; amount: string }[];
  payments: { method: string; amount: string }[];
  by_category: { category: string; revenue: string }[];
  by_cashier: { name: string; revenue: string; invoices: number }[];
  top_products: { name: string; units: string; revenue: string }[];
}

export interface Insights {
  reorder: { id: number; name: string; supplier: string; stock: string; daily_sales: string; days_left: string | null; order_quantity: string; order_cost: string }[];
  expiry: { id: number; name: string; quantity: string; expiry_date: string; days_left: number; value_at_cost: string; suggested_markdown: number | null }[];
  dead_stock: { id: number; name: string; stock: string; value_at_cost: string; last_sold: string | null }[];
  staff: { name: string; sales: string; invoices: number; discounts: string; returns: string; cleared_carts: number; cash_difference: string; flags: string[] }[];
}

export interface GRNLine {
  id?: number;
  product: number;
  product_name?: string;
  barcode?: string;
  cases: string;
  qty: string;
  free: string;
  rate: string;
  disc: string;
  disc_percent: string;
  freight: string;
  retail: string;
  expiry_date: string | null;
  unit_cost?: string;
  margin_percent?: string;
  line_total?: string;
}

export interface GRN {
  id?: number;
  number?: string | null;
  status?: 'draft' | 'posted';
  supplier: number | '';
  supplier_name?: string;
  date: string;
  po_no: string;
  payment_type: 'credit' | 'cash';
  disc_percent: string;
  flat_disc: string;
  freight: string;
  sales_tax_percent: string;
  expense: string;
  disperse_discount: boolean;
  disperse_freight: boolean;
  disperse_tax: boolean;
  subtotal?: string;
  total?: string;
  lines: GRNLine[];
}

export interface GRNPreview {
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  lines: { line_total: string; unit_cost: string; margin_percent: string; previous_cost: string; warnings: string[] }[];
}
