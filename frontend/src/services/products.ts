import type { Product } from '@/types';
import type { ProductFormData } from '@/store';
import { deriveStockStatus } from '@/utils/inventoryUtils';

export interface ProductApi {
  id: number;
  active: boolean;
  barcode: string;
  name: string;
  long_desc: string;
  category: string;
  supplier: number | null;
  supplier_name: string;
  sub_category: string;
  brand: string;
  make: string;
  attributes: string;
  size: string;
  colour: string;
  design_model: string;
  department: string;
  season: string;
  item_type: string;
  uom: string;
  case_unit: string;
  box_pcs: number | null;
  weight: string | null;
  lead_time_days: number | null;
  costing_method: 'recent_cost' | 'manual_cost';
  cost?: string;
  price: string;
  sale_price: string;
  stock: string;
  sales_tax_percent: string;
  pct_code: string;
  disc_percent: string;
  disc_amount: string;
  disc_start: string | null;
  disc_end: string | null;
  threshold: string;
  min_level: string | null;
  max_level: string | null;
  qty_decimal: boolean;
  unorderable: boolean;
  is_style_item: boolean;
  oem_barcode: boolean;
  track_expiry: boolean;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
}

const optionalNumber = (value: string | number | null) => (value === null ? undefined : Number(value));
const blankToNull = <T,>(value: T | undefined | '') => (value === undefined || value === '' ? null : value);

export function mapProductFromApi(data: ProductApi): Product {
  const product: Omit<Product, 'status'> = {
    id: String(data.id),
    itemNo: String(data.id),
    active: data.active,
    name: data.name,
    longDesc: data.long_desc,
    barcode: data.barcode,
    sku: data.barcode,
    aluCode: data.barcode,
    price: Number(data.price),
    salePrice: Number(data.sale_price),
    cost: Number(data.cost ?? 0),
    stock: Number(data.stock),
    category: data.category,
    subCategory: data.sub_category,
    brand: data.brand,
    make: data.make,
    attributes: data.attributes,
    supplierId: data.supplier ? String(data.supplier) : undefined,
    supplierName: data.supplier_name,
    department: data.department,
    season: data.season,
    size: data.size,
    colour: data.colour,
    designModel: data.design_model,
    itemType: data.item_type,
    uom: data.uom,
    caseUnit: data.case_unit,
    boxPcs: optionalNumber(data.box_pcs),
    weight: optionalNumber(data.weight),
    leadTime: optionalNumber(data.lead_time_days),
    costingMethod: data.costing_method,
    salesTaxPercent: Number(data.sales_tax_percent),
    pctCode: data.pct_code,
    discPercent: Number(data.disc_percent),
    discAmount: Number(data.disc_amount),
    discStart: data.disc_start ?? undefined,
    discEnd: data.disc_end ?? undefined,
    threshHold: Number(data.threshold),
    minLevel: optionalNumber(data.min_level),
    maxLevel: optionalNumber(data.max_level),
    qtyDecimal: data.qty_decimal,
    unorderable: data.unorderable,
    isStyleItem: data.is_style_item,
    oemBarcode: data.oem_barcode,
    trackExpiry: data.track_expiry,
    expiryDate: data.expiry_date ?? undefined,
    createdAt: data.created_at.split('T')[0],
    updatedAt: data.updated_at.split('T')[0],
  };
  return { ...product, status: deriveStockStatus(product) };
}

export function mapProductToApi(data: ProductFormData, existing?: Product): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    active: data.active,
    barcode: data.barcode,
    name: data.name,
    long_desc: data.longDesc ?? '',
    category: data.category,
    supplier: blankToNull(data.supplierId),
    sub_category: data.subCategory ?? '',
    brand: data.brand ?? '',
    make: data.make ?? '',
    attributes: data.attributes ?? '',
    size: data.size ?? '',
    colour: data.colour ?? '',
    design_model: data.designModel ?? '',
    department: data.department ?? '',
    season: data.season ?? '',
    item_type: data.itemType ?? '',
    uom: data.uom ?? '',
    case_unit: data.caseUnit ?? '',
    box_pcs: blankToNull(data.boxPcs),
    weight: blankToNull(data.weight),
    lead_time_days: blankToNull(data.leadTime),
    costing_method: data.costingMethod ?? 'recent_cost',
    cost: data.cost,
    price: data.price,
    sales_tax_percent: data.salesTaxPercent ?? 0,
    pct_code: data.pctCode ?? '',
    disc_percent: data.discPercent ?? 0,
    disc_amount: data.discAmount ?? 0,
    disc_start: blankToNull(data.discStart),
    disc_end: blankToNull(data.discEnd),
    threshold: data.threshHold ?? 10,
    min_level: blankToNull(data.minLevel),
    max_level: blankToNull(data.maxLevel),
    qty_decimal: data.qtyDecimal ?? false,
    unorderable: data.unorderable ?? false,
    is_style_item: data.isStyleItem ?? false,
    oem_barcode: data.oemBarcode ?? false,
    track_expiry: data.trackExpiry ?? false,
    expiry_date: blankToNull(data.expiryDate),
  };
  // Only send stock when it was really edited: a stale form must not undo sales made since it opened.
  if (!existing || existing.stock !== data.stock) payload.stock = data.stock;
  return payload;
}
