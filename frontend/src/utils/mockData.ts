import type { Product, Invoice, Supplier } from '@/types';

const today = new Date();
const daysFromNow = (days: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};
const daysAgo = (days: number) => daysFromNow(-days);

export const MOCK_PRODUCTS: Product[] = [
  { id: '1', itemNo: '80219562', aluCode: 'RICE-001', active: true, name: 'Super Basmati Rice 5kg', barcode: 'RICE-001', sku: 'RICE-001', price: 1850, cost: 1520, stock: 45, category: 'GROCERY', status: 'in_stock', uom: 'PCS', threshHold: 10, createdAt: daysAgo(120) },
  { id: '2', itemNo: '80219563', aluCode: 'OIL-001', active: true, name: 'Dalda Cooking Oil 1L', barcode: 'OIL-001', sku: 'OIL-001', price: 520, cost: 445, stock: 8, category: 'GROCERY', status: 'low_stock', uom: 'LTR', threshHold: 15, expiryDate: daysFromNow(12), trackExpiry: true, createdAt: daysAgo(90) },
  { id: '3', aluCode: 'ATT-001', active: true, name: 'Ashrafi Atta 2kg', barcode: 'ATT-001', sku: 'ATT-001', price: 280, cost: 235, stock: 120, category: 'GROCERY', status: 'in_stock', expiryDate: daysFromNow(45), trackExpiry: true, createdAt: daysAgo(60) },
  { id: '4', aluCode: 'DAL-001', active: true, name: 'Maash Dal 1kg', barcode: 'DAL-001', sku: 'DAL-001', price: 380, cost: 320, stock: 0, category: 'GROCERY', status: 'out_of_stock', createdAt: daysAgo(200) },
  { id: '5', aluCode: 'SUG-001', active: true, name: 'Shakkar 1kg', barcode: 'SUG-001', sku: 'SUG-001', price: 165, cost: 140, stock: 200, category: 'GROCERY', status: 'in_stock', createdAt: daysAgo(30) },
  { id: '6', aluCode: 'SLT-001', active: true, name: 'National Salt 800g', barcode: 'SLT-001', sku: 'SLT-001', price: 55, cost: 42, stock: 350, category: 'GROCERY', status: 'in_stock', createdAt: daysAgo(15) },
  { id: '7', aluCode: 'MLK-001', active: true, name: "Olper's Milk 1L", barcode: 'MLK-001', sku: 'MLK-001', price: 290, cost: 255, stock: 22, category: 'DAIRY', status: 'in_stock', expiryDate: daysFromNow(5), trackExpiry: true, createdAt: daysAgo(7) },
  { id: '8', aluCode: 'BRD-001', active: true, name: 'Bake Parlour Bread', barcode: 'BRD-001', sku: 'BRD-001', price: 120, cost: 95, stock: 5, category: 'BAKERY', status: 'low_stock', threshHold: 8, expiryDate: daysFromNow(2), trackExpiry: true, createdAt: daysAgo(3) },
  { id: '9', aluCode: 'TEA-001', active: true, name: 'Tapal Danedar 475g', barcode: 'TEA-001', sku: 'TEA-001', price: 890, cost: 780, stock: 34, category: 'BEVERAGE', status: 'in_stock', createdAt: daysAgo(45) },
  { id: '10', aluCode: 'SPR15', active: true, name: 'Sprite 1.5 LTR', barcode: 'SPR15', sku: 'SPR15', price: 140, cost: 125, stock: 48, category: 'BEVERAGE', status: 'in_stock', trackExpiry: true, expiryDate: daysFromNow(180), createdAt: daysAgo(20) },
  { id: '11', aluCode: 'NESMO', active: true, name: 'Nescafe Mocha 210ml', barcode: 'NESMO', sku: 'NESMO', price: 140, cost: 125, stock: 36, category: 'BEVERAGE', status: 'in_stock', trackExpiry: true, expiryDate: daysAgo(3), createdAt: daysAgo(50) },
];

export const MOCK_INVOICES: Invoice[] = [
  { id: '1', invoiceNo: 'INV-2024-0847', counterId: '1', counterName: 'Counter 1', items: 5, total: 4250, paymentMethod: 'JazzCash', createdAt: '2024-06-22T10:30:00', status: 'completed' },
  { id: '2', invoiceNo: 'INV-2024-0846', counterId: '2', counterName: 'Counter 2', items: 3, total: 1890, paymentMethod: 'Cash', createdAt: '2024-06-22T10:15:00', status: 'completed' },
  { id: '3', invoiceNo: 'INV-2024-0845', counterId: '1', counterName: 'Counter 1', items: 8, total: 7340, paymentMethod: 'Card', createdAt: '2024-06-22T09:45:00', status: 'completed' },
  { id: '4', invoiceNo: 'INV-2024-0844', counterId: '2', counterName: 'Counter 2', items: 2, total: 1520, paymentMethod: 'Easypaisa', createdAt: '2024-06-22T09:20:00', status: 'completed' },
  { id: '5', invoiceNo: 'INV-2024-0843', counterId: '1', counterName: 'Counter 1', items: 12, total: 12560, paymentMethod: 'Cash', createdAt: '2024-06-21T18:30:00', status: 'completed' },
];

export const MOCK_SUPPLIERS: Supplier[] = [
  {
    id: '1',
    name: 'Metro Cash & Carry',
    contactPerson: 'Ahmed Khan',
    phone: '+92 300 1234567',
    email: 'orders@metro.pk',
    address: 'Thokar Niaz Baig, Multan Road',
    city: 'Lahore',
    ntn: '1234567-8',
    bankAccount: 'PK12 MEZN 0001 2345 6789 0123',
    notes: 'Weekly delivery — Mondays & Thursdays',
    status: 'active',
    paymentType: 'credit',
    currentBalance: 934238.90,
    totalPurchases: 2450000,
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    name: 'Imtiaz Super Market',
    contactPerson: 'Sara Malik',
    phone: '+92 321 9876543',
    email: 'supply@imtiaz.pk',
    address: 'DHA Phase 5, Main Boulevard',
    city: 'Karachi',
    ntn: '9876543-2',
    bankAccount: 'PK45 HABB 0000 1122 3344 5566',
    status: 'active',
    paymentType: 'credit',
    currentBalance: 128000,
    totalPurchases: 1280000,
    createdAt: '2024-02-20',
  },
  {
    id: '3',
    name: 'Dairyland Distributors',
    contactPerson: 'Bilal Hussain',
    phone: '+92 333 5551234',
    email: 'sales@dairyland.pk',
    address: 'Ferozepur Road, Near Kalma Chowk',
    city: 'Lahore',
    ntn: '5544332-1',
    status: 'active',
    paymentType: 'cash',
    currentBalance: 0,
    totalPurchases: 890000,
    createdAt: '2024-03-10',
  },
];

export const MOCK_KPIS = [
  { labelKey: 'dashboard.kpiTodaySales', value: 'Rs. 1,48,250', change: 12.5, trend: 'up' as const, icon: 'sales' as const },
  { labelKey: 'dashboard.kpiTransactions', value: '127', change: 8.2, trend: 'up' as const, icon: 'receipt' as const },
  { labelKey: 'dashboard.kpiLowStock', value: '14', change: -3.1, trend: 'down' as const, icon: 'alert' as const },
  { labelKey: 'dashboard.kpiActiveCounters', value: '2 / 2', change: 0, trend: 'neutral' as const, icon: 'counter' as const },
];

export const SALES_CHART_DATA = [
  { day: 'Mon', counter1: 142000, counter2: 128000 },
  { day: 'Tue', counter1: 155000, counter2: 131000 },
  { day: 'Wed', counter1: 148000, counter2: 139500 },
  { day: 'Thu', counter1: 162000, counter2: 144000 },
  { day: 'Fri', counter1: 181000, counter2: 152000 },
  { day: 'Sat', counter1: 212000, counter2: 185000 },
  { day: 'Sun', counter1: 198000, counter2: 168000 },
];

export const TOP_PRODUCTS = [
  { name: 'Super Basmati Rice 5kg', sales: 245, revenue: 453250 },
  { name: 'Dalda Cooking Oil 1L', sales: 189, revenue: 98280 },
  { name: 'Olper\'s Milk 1L', sales: 156, revenue: 45240 },
  { name: 'Shakkar 1kg', sales: 312, revenue: 51480 },
  { name: 'Ashrafi Atta 2kg', sales: 198, revenue: 55440 },
];

export const PRODUCT_CATEGORIES = ['All', 'Grocery', 'Dairy', 'Bakery', 'Beverages'];
