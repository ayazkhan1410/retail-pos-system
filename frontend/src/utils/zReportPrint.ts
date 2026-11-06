import type { ZReport } from '@/services/endpoints';
import { escapeHtml } from './labelPrint';
import { formatCurrency, formatDate, formatTime } from './index';

export function printZReport(report: ZReport, storeName: string) {
  const payments = Object.entries(report.payments)
    .map(([method, amount]) => `<tr><td>${escapeHtml(method)}</td><td class="num">${escapeHtml(formatCurrency(Number(amount)))}</td></tr>`)
    .join('');
  const invoices = report.invoices
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.invoice_no)}</td><td>${escapeHtml(row.cashier)}</td><td class="num">${escapeHtml(formatCurrency(Number(row.total)))}</td></tr>`,
    )
    .join('');
  const difference = report.difference == null ? '—' : formatCurrency(Number(report.difference));
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Z-Report · ${escapeHtml(report.terminal)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 24px; }
  h1 { font-size: 20pt; margin: 0 0 4px; }
  .meta { color: #555; font-size: 10pt; margin-bottom: 18px; }
  h2 { font-size: 12pt; margin: 18px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  td { padding: 4px 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <h1>${escapeHtml(storeName)}</h1>
  <p class="meta">Z-Report · ${escapeHtml(report.terminal)} · ${escapeHtml(formatDate(report.opened_at))} ${escapeHtml(formatTime(report.opened_at))}</p>
  <h2>Cash drawer</h2>
  <table><tbody>
    <tr><td>Opening cash</td><td class="num">${escapeHtml(formatCurrency(Number(report.opening_cash)))}</td></tr>
    <tr><td>Expected cash</td><td class="num">${escapeHtml(formatCurrency(Number(report.expected_cash)))}</td></tr>
    <tr><td>Counted cash</td><td class="num">${escapeHtml(report.counted_cash == null ? '—' : formatCurrency(Number(report.counted_cash)))}</td></tr>
    <tr><td>Difference</td><td class="num">${escapeHtml(difference)}</td></tr>
  </tbody></table>
  <h2>Sales</h2>
  <table><tbody>
    <tr><td>Invoices</td><td class="num">${report.sales_count}</td></tr>
    <tr><td>Gross sales</td><td class="num">${escapeHtml(formatCurrency(Number(report.sales_total)))}</td></tr>
    <tr><td>Returns</td><td class="num">${escapeHtml(formatCurrency(Number(report.returns_total)))} (${report.returns_count})</td></tr>
    <tr><td>Net sales</td><td class="num">${escapeHtml(formatCurrency(Number(report.net_sales)))}</td></tr>
  </tbody></table>
  <h2>Payments</h2>
  <table><tbody>${payments || '<tr><td colspan="2">None</td></tr>'}</tbody></table>
  <h2>Invoices</h2>
  <table><tbody>${invoices || '<tr><td colspan="3">None</td></tr>'}</tbody></table>
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
