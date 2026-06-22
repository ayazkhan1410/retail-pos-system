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
  cost: number;
  stock: number;
  category: string;
  subCategory?: string;
  brand?: string;
  make?: string;
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
  saleRate?: string;
  salesTaxPercent?: number;
  discPercent?: number;
  discAmount?: number;
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
  discount: number;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  counterId: string;
  counterName: string;
  items: number;
  total: number;
  paymentMethod: string;
  createdAt: string;
  status: 'completed' | 'refunded' | 'void';
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
  contactPerson: string;
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

export interface Counter {
  id: string;
  name: string;
  active: boolean;
}

export type Theme = 'light' | 'dark';

export const PRODUCT_CATEGORIES_LIST = [
  'BATH ITEMS', 'BEVERAGE', 'BIRTHDAY', 'CAT FOOD', 'COSMETICS', 'CROCKERY',
  'DAIRY', 'GROCERY', 'BAKERY', 'SNACKS', 'CLEANING', 'STATIONERY',
] as const;
