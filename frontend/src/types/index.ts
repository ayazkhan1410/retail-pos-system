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

export interface GRNLine {
  id: string;
  alu: string;
  productName: string;
  cases: number;
  qty: number;
  free: number;
  disc: number;
  discPercent: number;
  freight: number;
  rate: number;
  cost: number;
  totalAmount: number;
  totalDiscPercent: number;
  lineTotal: number;
  marginPercent: number;
  retail: number;
  expiryDate?: string;
  previousCost?: number;
}

export interface GRNPurchase {
  id?: string;
  wkNo?: string;
  poNo?: string;
  date: string;
  supplierId: string;
  type: 'credit' | 'cash';
  currentBalance?: number;
  autoRates: boolean;
  filterSupplierInventory: boolean;
  lines: GRNLine[];
  discPercent: number;
  flatDisc: number;
  freight: number;
  salesTaxPercent: number;
  expense: number;
  disperseDiscount: boolean;
  disperseFreight: boolean;
  disperseSalesTax: boolean;
  status: 'draft' | 'completed';
}

export interface PurchaseLine {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  previousCost: number;
  newCost: number;
}

export interface Purchase {
  id: string;
  supplier: string;
  lines: PurchaseLine[];
  totalDiscount: number;
  subtotal: number;
  total: number;
  createdAt: string;
  status: 'draft' | 'completed';
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

export type PaymentMethod = 'cash' | 'jazzcash' | 'easypaisa' | 'card';

export interface SaleLine {
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
