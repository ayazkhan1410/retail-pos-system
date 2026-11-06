import { inventoryApi } from '@/services/endpoints';
import type { Branch, Sale } from '@/types';
import { escapeHtml } from './labelPrint';
import { formatCurrency, formatDate } from './index';

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  card: 'Card',
  credit: 'On credit (khata)',
};

function row(label: string, value: string, bold = false) {
  const tag = bold ? 'strong' : 'span';
  return `<div class="row"><${tag}>${escapeHtml(label)}</${tag}><${tag}>${escapeHtml(value)}</${tag}></div>`;
}

const STORE_CACHE = 'smartshop-store-details';

async function loadStore(): Promise<Pick<Branch, 'name' | 'address' | 'phone' | 'ntn'>> {
  try {
    const { data } = await inventoryApi.branch();
    localStorage.setItem(STORE_CACHE, JSON.stringify(data));
    return data;
  } catch {
    return JSON.parse(localStorage.getItem(STORE_CACHE) ?? 'null') ?? { name: 'Tijori POS', address: '', phone: '', ntn: '' };
  }
}

export async function printReceipt(sale: Sale) {
  const store = await loadStore();
  const lines = sale.lines.map((line) => `
    <div class="item">${escapeHtml(line.name)}</div>
    ${row(`${Number(line.quantity)} x ${formatCurrency(Number(line.unit_price))}`, formatCurrency(Number(line.line_total)))}
  `).join('');
  const payments = sale.payments
    .map((p) => row(METHOD_LABELS[p.method] ?? p.method, formatCurrency(Number(p.amount))))
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(sale.invoice_no)}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 80mm; padding: 3mm; font: 11px/1.4 Arial, sans-serif; color: #000; }
    h1 { font-size: 15px; text-align: center; }
    .center { text-align: center; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .item { margin-top: 3px; font-weight: 700; }
    hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
    .total { font-size: 15px; }
  </style></head><body>
    <h1>${escapeHtml(store.name)}</h1>
    ${store.address ? `<p class="center">${escapeHtml(store.address)}</p>` : ''}
    ${store.phone ? `<p class="center">${escapeHtml(store.phone)}</p>` : ''}
    ${store.ntn ? `<p class="center">NTN: ${escapeHtml(store.ntn)}</p>` : ''}
    <hr/>
    ${row('Invoice', sale.invoice_no)}
    ${row('Date', formatDate(sale.created_at))}
    ${row('Counter', sale.terminal_name)}
    ${row('Cashier', sale.cashier_name)}
    ${sale.customer_name ? row('Customer', sale.customer_name) : ''}
    ${sale.is_offline ? '<p class="center">Saved offline: invoice number issued on sync</p>' : ''}
    <hr/>
    ${lines}
    <hr/>
    ${row('Subtotal', formatCurrency(Number(sale.subtotal)))}
    ${Number(sale.discount) ? row('Discount', `-${formatCurrency(Number(sale.discount))}`) : ''}
    <div class="total">${row('TOTAL', formatCurrency(Number(sale.total)), true)}</div>
    ${Number(sale.tax) ? row('Sales tax included', formatCurrency(Number(sale.tax))) : ''}
    <hr/>
    ${payments}
    ${Number(sale.change_due) ? row('Change', formatCurrency(Number(sale.change_due))) : ''}
    <hr/>
    <p class="center">Thank you for shopping with us</p>
  </body></html>`;

  // A hidden frame, because this runs after a network call and browsers block pop-ups opened that late.
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  window.focus(); // Give the keyboard back to the till.
  window.setTimeout(() => frame.remove(), 60_000);
}
