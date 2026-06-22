import JsBarcode from 'jsbarcode';
import { LABEL_DPI, LABEL_HEIGHT_MM, LABEL_WIDTH_MM } from './barcode';
import { formatCurrency } from '@/utils';
import type { Product } from '@/types';

export interface LabelPrintOptions {
  copies?: number;
  showPrice?: boolean;
}

function getItemCode(product: Product): string {
  return product.aluCode || product.sku || product.barcode;
}

function buildLabelSvg(code: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, code, {
    format: 'CODE128',
    width: 1.4,
    height: 36,
    displayValue: true,
    fontSize: 11,
    margin: 0,
    textMargin: 2,
  });
  return svg.outerHTML;
}

function shouldShowPrice(price: number): boolean {
  return price > 0;
}

export function printProductLabels(product: Product, options: LabelPrintOptions = {}) {
  const copies = Math.max(1, options.copies ?? 1);
  const code = getItemCode(product);
  const barcodeSvg = buildLabelSvg(code);
  const showPrice = options.showPrice ?? shouldShowPrice(product.price);
  const priceLine = showPrice ? formatCurrency(product.price) : '';

  const labels = Array.from({ length: copies }, () => `
    <div class="label">
      <div class="name">${escapeHtml(product.name)}</div>
      ${priceLine ? `<div class="price">${escapeHtml(priceLine)}</div>` : ''}
      <div class="barcode">${barcodeSvg}</div>
    </div>
  `).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Label — ${escapeHtml(product.name)}</title>
  <style>
    @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; }
    .label {
      width: ${LABEL_WIDTH_MM}mm;
      height: ${LABEL_HEIGHT_MM}mm;
      padding: 1.5mm 2mm;
      overflow: hidden;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .name {
      font-size: 8pt;
      font-weight: 700;
      line-height: 1.1;
      max-height: 9mm;
      overflow: hidden;
    }
    .price {
      font-size: 9pt;
      font-weight: 700;
    }
    .barcode svg { width: 100%; height: auto; max-height: 11mm; }
    @media screen {
      body { padding: 8px; background: #eee; }
      .label { background: #fff; border: 1px dashed #999; margin-bottom: 8px; }
    }
  </style>
</head>
<body>${labels}</body>
</html>`;

  const win = window.open('', '_blank', 'width=420,height=320');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { LABEL_DPI, LABEL_WIDTH_MM, LABEL_HEIGHT_MM };
