// Dashboard analytics demo data

export const DEMOGRAPHICS_DATA = [
  { ageGroup: '18-25', customers: 28, fill: '#01411C' },
  { ageGroup: '26-35', customers: 42, fill: '#0f5c2e' },
  { ageGroup: '36-45', customers: 35, fill: '#22c55e' },
  { ageGroup: '46-55', customers: 22, fill: '#71717a' },
  { ageGroup: '55+', customers: 15, fill: '#a1a1aa' },
];

export const TOP_AREAS_DATA = [
  { area: 'Gulberg', customers: 342, percentage: 28 },
  { area: 'DHA Phase 5', customers: 256, percentage: 21 },
  { area: 'Model Town', customers: 198, percentage: 16 },
  { area: 'Johar Town', customers: 167, percentage: 14 },
  { area: 'Bahria Town', customers: 134, percentage: 11 },
  { area: 'Others', customers: 122, percentage: 10 },
];

export const PAYMENT_METHODS_DATA = [
  { name: 'Cash', value: 42, color: '#18181b' },
  { name: 'JazzCash', value: 28, color: '#01411C' },
  { name: 'Easypaisa', value: 18, color: '#0f5c2e' },
  { name: 'Card', value: 12, color: '#71717a' },
];

export const PEAK_HOURS_DATA = [
  { hour: '8AM', sales: 12 },
  { hour: '9AM', sales: 28 },
  { hour: '10AM', sales: 45 },
  { hour: '11AM', sales: 62 },
  { hour: '12PM', sales: 78 },
  { hour: '1PM', sales: 55 },
  { hour: '2PM', sales: 38 },
  { hour: '3PM', sales: 42 },
  { hour: '4PM', sales: 58 },
  { hour: '5PM', sales: 85 },
  { hour: '6PM', sales: 92 },
  { hour: '7PM', sales: 76 },
  { hour: '8PM', sales: 48 },
  { hour: '9PM', sales: 22 },
];

export const RECENT_ACTIVITY = [
  { id: 1, type: 'sale', desc: 'INV-2024-0847', amount: 4250, counter: 'Counter 1', time: '2 min ago', method: 'JazzCash' },
  { id: 2, type: 'sale', desc: 'INV-2024-0846', amount: 1890, counter: 'Counter 2', time: '5 min ago', method: 'Cash' },
  { id: 3, type: 'stock', desc: 'Low stock: Dalda Oil', amount: 0, counter: '', time: '12 min ago', method: '' },
  { id: 4, type: 'sale', desc: 'INV-2024-0845', amount: 7340, counter: 'Counter 1', time: '18 min ago', method: 'Card' },
  { id: 5, type: 'purchase', desc: 'Metro Cash & Carry', amount: 125000, counter: '', time: '1 hr ago', method: '' },
];

export const CUSTOMER_INSIGHTS = {
  newCustomers: 34,
  returningCustomers: 93,
  avgBasketSize: 4.2,
  retentionRate: 73,
  growth: 15.8,
};

export const COUNTER_PERFORMANCE = [
  { counter: 'Counter 1', sales: 84200, transactions: 68, avgBill: 1238 },
  { counter: 'Counter 2', sales: 64050, transactions: 59, avgBill: 1086 },
];
