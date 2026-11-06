import type { Customer, LedgerEntry } from '@/types';
import { escapeHtml } from './labelPrint';
import { formatCurrency, formatDate } from './index';

export function printKhataStatement(customer: Customer, entries: LedgerEntry[], storeName: string) {
  const rows = entries
    .map(
      (entry) =>
        `<tr>
          <td>${escapeHtml(formatDate(entry.created_at))}</td>
          <td>${escapeHtml(entry.kind)}${entry.reference ? ` · ${escapeHtml(entry.reference)}` : ''}</td>
          <td class="num">${escapeHtml(formatCurrency(Number(entry.delta)))}</td>
        </tr>`,
    )
    .join('');
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Khata · ${escapeHtml(customer.name)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 24px; }
  h1 { font-size: 18pt; margin: 0 0 4px; }
  .meta { color: #555; font-size: 10pt; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  th, td { padding: 6px 4px; border-bottom: 1px solid #e5e5e5; text-align: left; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .balance { margin-top: 16px; font-size: 14pt; font-weight: 700; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <h1>${escapeHtml(storeName)}</h1>
  <p class="meta">Customer statement · ${escapeHtml(customer.name)}${customer.phone ? ` · ${escapeHtml(customer.phone)}` : ''}</p>
  <p class="balance">Balance due: ${escapeHtml(formatCurrency(Number(customer.balance)))}</p>
  <table>
    <thead><tr><th>Date</th><th>Entry</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="3">No ledger entries</td></tr>'}</tbody>
  </table>
  <script>window.onload=()=>{window.print();}</script>
</body></html>`;
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    document.body.removeChild(frame);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => document.body.removeChild(frame), 60_000);
}

export function khataWhatsAppText(customer: Customer, storeName: string): string {
  return `${storeName}\nKhata statement for ${customer.name}${customer.phone ? ` (${customer.phone})` : ''}\nBalance due: ${formatCurrency(Number(customer.balance))}\nPlease settle at your earliest convenience.`;
}
