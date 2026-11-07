/** Response shapes for the design pages' endpoints. Money comes as a number (aggregates) or a string (serializers). */

export type Money = number | string;

export type OverviewPeriod = 'today' | 'yesterday' | '7d' | '30d';

export interface MoneyBlock {
  gross_sales: Money;
  net_sales: Money;
  net_profit: Money;
  bills: number;
  avg_bill: Money;
  returns_count: number;
  returns_amount: Money;
}

export interface OverviewRegister {
  id: number;
  name: string;
  status: 'open' | 'closed' | 'idle';
  cashier: string;
  since: string | null;
  bills: number;
  sales_total: Money;
  offline_bills: number;
  difference: Money | null;
}

export type AttentionItem =
  | { kind: 'reorder'; product_id: number; title: string; stock: Money; days_left: number | null; supplier: string }
  | { kind: 'expiring'; product_id: number; title: string; stock: Money; days_left: number }
  | { kind: 'short'; shift_id: number; title: string; amount: Money; closed_at: string };

export interface Heat {
  heatmap: number[][];
  peak: { weekday: string; hour: number; count: number };
}

export interface Overview {
  period: OverviewPeriod;
  from: string;
  to: string;
  compare_from: string;
  compare_to: string;
  money: MoneyBlock;
  previous_money: MoneyBlock;
  changes: { gross_sales: number | null; net_profit: number | null; bills: number; customers: number };
  margin_percent: number | null;
  customers: { served: number; identified: number; returning: number; new: number; walk_in: number };
  khata: { outstanding: Money; customers: number; over_limit: number; change: Money };
  trend: { granularity: 'hour' | 'day'; points: { label: number | string; current: Money | null; previous: Money }[] };
  registers: OverviewRegister[];
  payment_mix: { method: string; amount: Money; share: number }[];
  basket_sizes: { label: string; count: number }[];
  top_areas: { area: string; bills: number; share: number }[];
  busy_times: Heat & { weeks: number };
  top_products: { name: string; units: Money; revenue: Money }[];
  categories: { category: string; revenue: Money }[];
  attention: AttentionItem[];
}

export type OrderStatus = 'paid' | 'khata' | 'offline' | 'part_returned' | 'returned';

export interface OrdersSummary {
  from: string;
  to: string;
  orders: number;
  orders_change: number;
  revenue: Money;
  avg_bill: Money;
  avg_bill_change: number | null;
  returns_count: number;
  returns_amount: Money;
  returns_share: number;
  offline_count: number;
  offline_terminals: string[];
  cashiers: { cashier_id: number; cashier__full_name: string | null }[];
}

export type CustomerSegment = 'regular' | 'khata' | 'over_limit' | 'at_risk' | 'new';

export interface CustomerSummary {
  customers: number;
  khata_total: Money;
  active_this_month: number;
  active_change: number | null;
  returning_rate: number;
  returning_change: number;
  avg_visits_per_month: number;
  over_limit_count: number;
  over_limit_total: Money;
  counts: Record<CustomerSegment, number>;
  areas: string[];
}

export interface CustomerProfile {
  id: number;
  lifetime_spend: Money;
  visits: number;
  avg_bill: Money;
  monthly_spend: { month: string; spend: Money }[];
  usual_weekday: number | null;
  usual_hour: number | null;
  often_buys: { product_id: number; name: string; times: number; interval_days: number | null }[];
}

export interface PurchaseSummary {
  month_total: Money;
  month_deliveries: number;
  drafts: number;
  drafts_total: Money;
  cost_changes: number;
  cost_up: number;
  cost_down: number;
  owed_total: Money;
  suppliers_owed: number;
}

export interface ExpenseSummary {
  month: string;
  total: Money;
  previous_total: Money;
  change: number | null;
  share_of_sales: number | null;
  from_drawers: Money;
  by_category: { category: string; amount: Money; share: number }[];
}

export interface ReportPnl {
  from: string;
  to: string;
  invoices: number;
  gross_before_discounts: Money;
  gross_sales: Money;
  returns: Money;
  discounts: Money;
  net_sales: Money;
  cost_of_goods: Money;
  gross_profit: Money;
  gross_margin_percent: number;
  expenses: Money;
  stock_written_off: Money;
  net_profit: Money;
  net_profit_after_write_offs: Money;
  previous_net_profit_after_write_offs: Money;
  tax_collected: Money;
  margin_by_category: { category: string; net_sales: Money; margin_percent: number }[];
  expenses_by_category: { category: string; amount: Money }[];
  payments: { method: string; amount: Money }[];
  by_cashier: { name: string; revenue: Money; invoices: number }[];
  top_products: { name: string; units: Money; revenue: Money }[];
  stock_value: Money;
  supplier_payable: Money;
  customer_receivable: Money;
}

export interface TrendRow { month: string; net_sales: Money; net_profit: Money }

export interface SalesSection {
  days: { day: string; bills: number; gross_sales: Money; discounts: Money; returns: Money; net_sales: Money; avg_bill: Money }[];
  payments: { method: string; amount: Money }[];
  top_products: { name: string; units: Money; revenue: Money }[];
}

export interface StockSection {
  categories: { category: string; products: number; units: Money; cost_value: Money; retail_value: Money }[];
  cost_value: Money;
  retail_value: Money;
  units: Money;
}

export interface TaxSection {
  rates: { tax_rate: Money; taxable: Money; tax: Money }[];
  collected: Money;
  returned: Money;
  net_tax: Money;
}

export interface CashiersSection {
  cashiers: { id: number; name: string; bills: number; sales: Money; discounts: Money; returns: Money; cash_difference: Money; shifts: number; avg_bill: Money }[];
}

export interface KhataSection {
  buckets: string[];
  totals: Record<string, Money>;
  customers: { id: number; name: string; phone: string; balance: Money; credit_limit: Money; oldest_days: number | null; buckets: Record<string, Money> }[];
  truncated: boolean;
}

export interface Analytics extends Heat {
  window_days: number;
  identified_customers: number;
  new_customers: number;
  named_bill_share: number;
  returning_rate: number;
  returning_change: number;
  avg_spend_per_month: Money;
  avg_spend_change: number | null;
  at_risk: number;
  returning_by_month: { month: string; rate: number | null; last_year: number | null }[];
  cohorts: { month: string; customers: number; retention: (number | null)[] }[];
  visit_buckets: { label: string; count: number; share: number }[];
  areas: { area: string; customers: number; revenue: Money }[];
  segments: { key: 'loyal' | 'regular' | 'new' | 'at_risk'; count: number; revenue: Money; revenue_share: number }[];
}

export interface SupplierRow {
  id: number;
  name: string;
  contact_person: string | null;
  payment_terms_days: number | null;
  last_delivery: string | null;
  bought_this_year: Money | null;
  due_date: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  ntn: string | null;
  bank_account: string | null;
  payment_type: 'credit' | 'cash' | null;
  status: 'active' | 'inactive' | null;
  credit_balance: Money;
  notes: string | null;
  created_at: string;
}

export interface SupplierPage {
  count: number;
  page: number;
  page_size: number;
  results: SupplierRow[];
  total_owed: Money;
  suppliers_owed: number;
  cities: string[];
}
