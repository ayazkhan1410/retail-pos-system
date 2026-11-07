import { displayName, loadStoreDetails } from './storeDetails';
import type { FinancialReport } from '@/types';
import { escapeHtml } from './labelPrint';
import { formatCurrency, formatDate } from './index';

const loadStore = loadStoreDetails;

function section(title: string, rows: [string, string][]) {
  if (rows.length === 0) return '';
  const body = rows
    .map(
      ([label, value]) =>
        `<tr><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <table><tbody>${body}</tbody></table>
    </section>`;
}

export type ReportPrintLabels = {
  documentTitle: string;
  period: string;
  printedAt: string;
  profitLoss: string;
  position: string;
  topProducts: string;
  byCategory: string;
  byCashier: string;
  expenseBreakdown: string;
  netSales: string;
  grossProfit: string;
  expenses: string;
  netProfit: string;
  grossSales: string;
  returns: string;
  costOfGoods: string;
  stockValue: string;
  supplierPayable: string;
  customerReceivable: string;
  taxCollected: string;
  discounts: string;
  invoices: string;
  footer: string;
};

export async function printFinancialReport(
  report: FinancialReport,
  range: { from: string; to: string },
  labels: ReportPrintLabels,
  options?: {
    money?: (value: string | number) => string;
    expenseRows?: [string, string][];
  },
) {
  const money = options?.money ?? ((value: string | number) => formatCurrency(Number(value)));
  const expenseRows =
    options?.expenseRows
    ?? report.expenses_by_category.map((row) => [row.category, money(row.amount)] as [string, string]);

  const store = await loadStore();
  const printed = formatDate(new Date().toISOString());

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(labels.documentTitle)} — ${escapeHtml(displayName(store))}</title>
  <style>
    @page { size: A4; margin: 14mm 16mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font: 11px/1.45 "Segoe UI", system-ui, sans-serif;
      color: #152019;
      background: #fff;
    }
    .sheet { max-width: 180mm; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 14px;
      border-bottom: 2px solid #01411c;
      margin-bottom: 16px;
    }
    .brand h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #01411c;
    }
    .brand p { color: #4c5852; margin-top: 2px; }
    .meta { text-align: right; color: #4c5852; font-size: 10.5px; }
    .meta strong { display: block; color: #152019; font-size: 12px; margin-bottom: 4px; }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 18px;
    }
    .kpi {
      border: 1px solid #dfe5e2;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f7f9f8;
    }
    .kpi .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #67746d; }
    .kpi .value { margin-top: 4px; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; }
    section h2 {
      font-size: 12px;
      font-weight: 700;
      color: #01411c;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #dfe5e2;
    }
    table { width: 100%; border-collapse: collapse; }
    td {
      padding: 4px 0;
      border-bottom: 1px solid #eef2f0;
      vertical-align: top;
    }
    td.num {
      text-align: right;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      padding-inline-start: 12px;
    }
    footer {
      margin-top: 22px;
      padding-top: 10px;
      border-top: 1px solid #dfe5e2;
      color: #67746d;
      font-size: 10px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header>
      <div class="brand">
        <h1>${escapeHtml(displayName(store))}</h1>
        ${store.address ? `<p>${escapeHtml(store.address)}</p>` : ''}
        ${store.phone ? `<p>${escapeHtml(store.phone)}</p>` : ''}
        ${store.ntn ? `<p>NTN: ${escapeHtml(store.ntn)}</p>` : ''}
      </div>
      <div class="meta">
        <strong>${escapeHtml(labels.documentTitle)}</strong>
        <div>${escapeHtml(labels.period)}: ${escapeHtml(range.from)} → ${escapeHtml(range.to)}</div>
        <div>${escapeHtml(labels.printedAt)}: ${escapeHtml(printed)}</div>
      </div>
    </header>

    <div class="kpis">
      <div class="kpi"><div class="label">${escapeHtml(labels.netSales)}</div><div class="value">${escapeHtml(money(report.net_sales))}</div></div>
      <div class="kpi"><div class="label">${escapeHtml(labels.grossProfit)}</div><div class="value">${escapeHtml(`${money(report.gross_profit)} · ${report.gross_margin_percent}%`)}</div></div>
      <div class="kpi"><div class="label">${escapeHtml(labels.expenses)}</div><div class="value">${escapeHtml(money(report.expenses))}</div></div>
      <div class="kpi"><div class="label">${escapeHtml(labels.netProfit)}</div><div class="value">${escapeHtml(money(report.net_profit))}</div></div>
    </div>

    <div class="grid">
      ${section(labels.profitLoss, [
        [labels.grossSales, money(report.gross_sales)],
        [labels.returns, `-${money(report.returns)}`],
        [labels.netSales, money(report.net_sales)],
        [labels.costOfGoods, `-${money(report.cost_of_goods)}`],
        [labels.grossProfit, money(report.gross_profit)],
        [labels.expenses, `-${money(report.expenses)}`],
        [labels.netProfit, money(report.net_profit)],
      ])}
      ${section(labels.position, [
        [labels.stockValue, money(report.stock_value)],
        [labels.supplierPayable, money(report.supplier_payable)],
        [labels.customerReceivable, money(report.customer_receivable)],
        [labels.taxCollected, money(report.tax_collected)],
        [labels.discounts, money(report.discounts)],
        [labels.invoices, String(report.invoices)],
      ])}
      ${section(
        labels.topProducts,
        report.top_products.map((row) => [`${row.name} (${Number(row.units)})`, money(row.revenue)] as [string, string]),
      )}
      ${section(
        labels.byCategory,
        report.by_category.map((row) => [row.category || '—', money(row.revenue)] as [string, string]),
      )}
      ${section(
        labels.byCashier,
        report.by_cashier.map((row) => [`${row.name} (${row.invoices})`, money(row.revenue)] as [string, string]),
      )}
      ${section(labels.expenseBreakdown, expenseRows)}
    </div>

    <footer>
      <span>${escapeHtml(labels.footer)}</span>
      <span>${escapeHtml(displayName(store))}</span>
    </footer>
  </div>
</body>
</html>`;

  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  window.focus();
  window.setTimeout(() => frame.remove(), 60_000);
}
