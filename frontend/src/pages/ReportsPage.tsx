import { useEffect, useState } from 'react';
import { Header } from '@/layouts/DashboardLayout';
import { Button, Card, CardHeader, CardTitle, Input } from '@/components/ui';
import { financeApi } from '@/services/endpoints';
import { useTranslation } from '@/i18n';
import { formatCurrency, localDate } from '@/utils';
import { printFinancialReport } from '@/utils/reportPrint';
import type { FinancialReport } from '@/types';

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDate(date);
};

function Table({ title, rows }: { title: string; rows: [string, string][] }) {
  const { t } = useTranslation();
  return (
    <Card hover>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      {rows.length === 0 && <p className="py-4 text-center text-sm text-brand-500">{t('dashboard.noData')}</p>}
      <dl className="divide-y divide-brand-100 text-sm dark:divide-brand-800">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 py-1.5">
            <dt className="truncate">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(localDate());
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    setFailed(false);
    financeApi.report(from, to).then(({ data }) => setReport(data)).catch(() => setFailed(true));
  }, [from, to]);

  const money = (value: string | number) => formatCurrency(Number(value));

  const handlePrint = async () => {
    if (!report || printing) return;
    setPrinting(true);
    try {
      await printFinancialReport(
        report,
        { from, to },
        {
          documentTitle: t('reports.printTitle'),
          period: t('reports.printPeriod'),
          printedAt: t('reports.printedAt'),
          profitLoss: t('reports.profitLoss'),
          position: t('reports.position'),
          topProducts: t('reports.topProducts'),
          byCategory: t('reports.byCategory'),
          byCashier: t('reports.byCashier'),
          expenseBreakdown: t('reports.expenseBreakdown'),
          netSales: t('reports.netSales'),
          grossProfit: t('reports.grossProfit'),
          expenses: t('reports.expenses'),
          netProfit: t('reports.netProfit'),
          grossSales: t('reports.grossSales'),
          returns: t('reports.returns'),
          costOfGoods: t('reports.costOfGoods'),
          stockValue: t('reports.stockValue'),
          supplierPayable: t('reports.supplierPayable'),
          customerReceivable: t('reports.customerReceivable'),
          taxCollected: t('reports.taxCollected'),
          discounts: t('reports.discounts'),
          invoices: t('sales.invoices'),
          footer: t('reports.printFooter'),
        },
        {
          money,
          expenseRows: report.expenses_by_category.map((row) => [
            t(`expenses.cat_${row.category}`),
            money(row.amount),
          ]),
        },
      );
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <Header
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={(
          <Button variant="outline" size="sm" disabled={!report || printing} onClick={() => void handlePrint()}>
            {printing ? t('common.loading') : t('reports.print')}
          </Button>
        )}
      />
      <main className="page-bg flex-1 space-y-4 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <Card hover padding="sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
            <Input id="report-from" label={t('sales.from')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input id="report-to" label={t('sales.to')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </Card>
        {failed && <p role="alert" className="text-sm text-red-600">{t('reports.loadError')}</p>}
        {report && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [t('reports.netSales'), money(report.net_sales)],
                [t('reports.grossProfit'), `${money(report.gross_profit)} · ${report.gross_margin_percent}%`],
                [t('reports.expenses'), money(report.expenses)],
                [t('reports.netProfit'), money(report.net_profit)],
              ].map(([label, value]) => (
                <Card key={label} hover padding="sm">
                  <p className="text-xs text-brand-500">{label}</p>
                  <p className="mt-1 font-display text-2xl font-bold" data-testid={label}>{value}</p>
                </Card>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Table title={t('reports.profitLoss')} rows={[
                [t('reports.grossSales'), money(report.gross_sales)],
                [t('reports.returns'), `-${money(report.returns)}`],
                [t('reports.netSales'), money(report.net_sales)],
                [t('reports.costOfGoods'), `-${money(report.cost_of_goods)}`],
                [t('reports.grossProfit'), money(report.gross_profit)],
                [t('reports.expenses'), `-${money(report.expenses)}`],
                [t('reports.netProfit'), money(report.net_profit)],
              ]} />
              <Table title={t('reports.position')} rows={[
                [t('reports.stockValue'), money(report.stock_value)],
                [t('reports.supplierPayable'), money(report.supplier_payable)],
                [t('reports.customerReceivable'), money(report.customer_receivable)],
                [t('reports.taxCollected'), money(report.tax_collected)],
                [t('reports.discounts'), money(report.discounts)],
                [t('sales.invoices'), String(report.invoices)],
              ]} />
              <Table title={t('reports.topProducts')} rows={report.top_products.map((row) => [`${row.name} (${Number(row.units)})`, money(row.revenue)])} />
              <Table title={t('reports.byCategory')} rows={report.by_category.map((row) => [row.category, money(row.revenue)])} />
              <Table title={t('reports.byCashier')} rows={report.by_cashier.map((row) => [`${row.name} (${row.invoices})`, money(row.revenue)])} />
              <Table title={t('reports.expenseBreakdown')} rows={report.expenses_by_category.map((row) => [t(`expenses.cat_${row.category}`), money(row.amount)])} />
            </div>
          </>
        )}
      </main>
    </>
  );
}
