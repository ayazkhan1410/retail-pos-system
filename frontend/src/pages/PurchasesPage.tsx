import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Building2, ExternalLink, Save } from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Card, CardTitle, Button, Input, Select } from '@/components/ui';
import { useSupplierStore } from '@/store';
import { useTranslation } from '@/i18n';
import { formatCurrency } from '@/utils';
import type { GRNLine } from '@/types';

const SAMPLE_LINES: GRNLine[] = [
  { id: '1', alu: 'SPR15', productName: 'Sprite 1.5 LTR', cases: 2, qty: 12, free: 0, disc: 0, discPercent: 0, freight: 0, rate: 125.83, cost: 125.15, totalAmount: 1509.96, totalDiscPercent: 0, lineTotal: 1502.76, marginPercent: 10.95, retail: 140 },
  { id: '2', alu: 'SPR15M', productName: 'Sprite Mint 1.5 LTR', cases: 1, qty: 6, free: 0, disc: 0, discPercent: 0, freight: 0, rate: 125.83, cost: 125.15, totalAmount: 754.98, totalDiscPercent: 0, lineTotal: 751.38, marginPercent: 10.5, retail: 140 },
  { id: '3', alu: 'CC15', productName: 'Coca Cola 1.5 LTR', cases: 3, qty: 18, free: 1, disc: 0, discPercent: 0, freight: 0, rate: 125.83, cost: 125.15, totalAmount: 2264.94, totalDiscPercent: 0, lineTotal: 2254.14, marginPercent: 11.2, retail: 140 },
  { id: '4', alu: 'NESMO', productName: 'Nescafe Mocha 210ml', cases: 5, qty: 30, free: 0, disc: 0, discPercent: 0, freight: 0, rate: 75.38, cost: 75.15, totalAmount: 2261.40, totalDiscPercent: 0, lineTotal: 2254.50, marginPercent: 10.27, retail: 85 },
];

function calcGrandTotal(
  lines: GRNLine[],
  flatDisc: number,
  freight: number,
  expense: number,
  salesTaxPercent: number,
) {
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const tax = (subtotal * salesTaxPercent) / 100;
  return Math.max(0, subtotal - flatDisc + freight + expense + tax);
}

export default function PurchasesPage() {
  const { t } = useTranslation();
  const { suppliers, getSupplierById } = useSupplierStore();
  const activeSuppliers = suppliers.filter((s) => s.status === 'active');

  const [supplierId, setSupplierId] = useState(activeSuppliers[0]?.id ?? '');
  const [poNo, setPoNo] = useState('');
  const [wkNo] = useState('4821');
  const [type, setType] = useState<'credit' | 'cash'>('credit');
  const [autoRates, setAutoRates] = useState(true);
  const [filterSupplierInventory, setFilterSupplierInventory] = useState(false);
  const [lines] = useState<GRNLine[]>(SAMPLE_LINES);
  const [flatDisc, setFlatDisc] = useState(5000);
  const [discPercent, setDiscPercent] = useState(0);
  const [freight, setFreight] = useState(0);
  const [salesTaxPercent, setSalesTaxPercent] = useState(0);
  const [expense, setExpense] = useState(0);
  const [disperseDiscount, setDisperseDiscount] = useState(true);
  const [disperseFreight, setDisperseFreight] = useState(false);
  const [disperseSalesTax, setDisperseSalesTax] = useState(false);

  const selectedSupplier = getSupplierById(supplierId);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const totalRetail = lines.reduce((s, l) => s + l.retail * l.qty, 0);
  const grandTotal = useMemo(
    () => calcGrandTotal(lines, flatDisc, freight, expense, salesTaxPercent),
    [lines, flatDisc, freight, expense, salesTaxPercent],
  );

  return (
    <>
      <Header
        title={`GRN — ${t('purchases.title')}`}
        subtitle={t('purchases.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Save className="h-4 w-4" /> {t('purchases.draftSave')}
            </Button>
            <Button variant="accent" size="sm" disabled={!supplierId}>
              {t('purchases.purchaseComplete')}
            </Button>
          </div>
        }
      />

      <main className="page-bg flex-1 overflow-y-auto p-4 lg:p-6">
        {/* GRN Header */}
        <Card hover className="mb-4" padding="sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <Input label="Wk No" value={wkNo} disabled />
            <Input label="PO No" value={poNo} onChange={(e) => setPoNo(e.target.value)} placeholder="451012172" />
            <Input label="Date" type="date" defaultValue={new Date().toISOString().split('T')[0]} />
            <Select
              label={t('purchases.selectSupplier')}
              value={supplierId}
              onChange={(e) => { setSupplierId(e.target.value); const s = getSupplierById(e.target.value); if (s) setType(s.paymentType); }}
              options={activeSuppliers.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Select
              label="Type"
              value={type}
              onChange={(e) => setType(e.target.value as 'credit' | 'cash')}
              options={[{ value: 'credit', label: 'Credit' }, { value: 'cash', label: 'Cash' }]}
            />
            <div>
              <p className="mb-2 text-sm font-medium text-brand-700 dark:text-brand-300">Current Bal (PKR)</p>
              <p className="font-display text-lg font-bold text-accent">
                {formatCurrency(selectedSupplier?.currentBalance ?? 0)}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={filterSupplierInventory} onChange={(e) => setFilterSupplierInventory(e.target.checked)} className="accent-accent" />
              Filter Supplier Inventory
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoRates} onChange={(e) => setAutoRates(e.target.checked)} className="accent-accent" />
              Auto Rates
            </label>
            <Link to="/suppliers">
              <Button variant="ghost" size="sm"><ExternalLink className="h-3.5 w-3.5" /> {t('purchases.manageSuppliers')}</Button>
            </Link>
          </div>
          {selectedSupplier && (
            <div className="mt-3 flex flex-wrap gap-4 rounded-xl bg-accent/5 p-3 text-sm dark:bg-accent/10">
              <span><Building2 className="mr-1 inline h-4 w-4 text-accent" />{selectedSupplier.name}</span>
              <span>{selectedSupplier.phone}</span>
              <span>{selectedSupplier.city}</span>
              {selectedSupplier.ntn && <span>NTN: {selectedSupplier.ntn}</span>}
            </div>
          )}
        </Card>

        {/* Line items grid */}
        <Card padding="none" hover className="mb-4">
          <div className="border-b border-brand-100 px-4 py-3 dark:border-brand-800">
            <div className="flex items-center justify-between">
              <CardTitle>{t('purchases.purchaseItems')}</CardTitle>
              <Button variant="accent" size="sm"><Plus className="h-4 w-4" /> {t('purchases.addLine')}</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <p className="mb-2 px-4 text-xs text-brand-500 lg:hidden">Swipe horizontally to view all columns →</p>
            <table className="w-full min-w-[1200px] text-xs">
              <thead>
                <tr className="bg-brand-50/80 text-left font-semibold uppercase tracking-wider text-brand-500 dark:bg-brand-800/40">
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">ALU</th>
                  <th className="px-2 py-2 min-w-[140px]">{t('purchases.product')}</th>
                  <th className="px-2 py-2 text-right">Cases</th>
                  <th className="px-2 py-2 text-right">{t('purchases.qty')}</th>
                  <th className="px-2 py-2 text-right">Free</th>
                  <th className="px-2 py-2 text-right">Disc</th>
                  <th className="px-2 py-2 text-right">Disc%</th>
                  <th className="px-2 py-2 text-right">Freight</th>
                  <th className="px-2 py-2 text-right">Rate</th>
                  <th className="px-2 py-2 text-right">Cost</th>
                  <th className="px-2 py-2 text-right">T.Amt</th>
                  <th className="px-2 py-2 text-right">T.Disc%</th>
                  <th className="px-2 py-2 text-right">{t('purchases.lineTotal')}</th>
                  <th className="px-2 py-2 text-right">Margin%</th>
                  <th className="px-2 py-2 text-right">Retail</th>
                  <th className="px-2 py-2">Expiry</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={line.id} className="border-t border-brand-50 hover:bg-brand-50/50 dark:border-brand-800/50">
                    <td className="px-2 py-2 text-brand-400">{i + 1}</td>
                    <td className="px-2 py-2 font-mono">{line.alu}</td>
                    <td className="px-2 py-2 font-medium">{line.productName}</td>
                    <td className="px-2 py-2 text-right">{line.cases}</td>
                    <td className="px-2 py-2 text-right font-semibold">{line.qty}</td>
                    <td className="px-2 py-2 text-right">{line.free}</td>
                    <td className="px-2 py-2 text-right">{line.disc}</td>
                    <td className="px-2 py-2 text-right">{line.discPercent}%</td>
                    <td className="px-2 py-2 text-right">{line.freight}</td>
                    <td className="px-2 py-2 text-right">{line.rate.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right">{line.cost.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(line.totalAmount)}</td>
                    <td className="px-2 py-2 text-right">{line.totalDiscPercent}%</td>
                    <td className="px-2 py-2 text-right font-bold">{formatCurrency(line.lineTotal)}</td>
                    <td className="px-2 py-2 text-right text-emerald-600">{line.marginPercent}%</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(line.retail)}</td>
                    <td className="px-2 py-2 text-brand-400">—</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-200 bg-brand-50/50 font-bold dark:border-brand-700 dark:bg-brand-800/30">
                  <td colSpan={13} className="px-2 py-2 text-right">Grid Total</td>
                  <td className="px-2 py-2 text-right">{formatCurrency(subtotal)}</td>
                  <td colSpan={2} className="px-2 py-2 text-right text-brand-500">Retail: {formatCurrency(totalRetail)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* Footer adjustments */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card hover className="lg:col-span-2" padding="sm">
            <p className="mb-3 text-sm font-semibold">{t('purchases.grandTotal')} Adjustments</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Input label="Disc % (-)" type="number" value={discPercent} onChange={(e) => setDiscPercent(Number(e.target.value))} />
                <label className="mt-1 flex items-center gap-2 text-xs text-brand-500">
                  <input type="checkbox" checked={disperseDiscount} onChange={(e) => setDisperseDiscount(e.target.checked)} className="accent-accent" />
                  Disperse on all items
                </label>
              </div>
              <div>
                <Input label="Flat Disc (-) PKR" type="number" value={flatDisc} onChange={(e) => setFlatDisc(Number(e.target.value))} className="border-amber-300/50" />
              </div>
              <div>
                <Input label="Freight (+) PKR" type="number" value={freight} onChange={(e) => setFreight(Number(e.target.value))} />
                <label className="mt-1 flex items-center gap-2 text-xs text-brand-500">
                  <input type="checkbox" checked={disperseFreight} onChange={(e) => setDisperseFreight(e.target.checked)} className="accent-accent" />
                  Disperse on all items
                </label>
              </div>
              <div>
                <Input label="S.Tax % (+)" type="number" value={salesTaxPercent} onChange={(e) => setSalesTaxPercent(Number(e.target.value))} />
                <label className="mt-1 flex items-center gap-2 text-xs text-brand-500">
                  <input type="checkbox" checked={disperseSalesTax} onChange={(e) => setDisperseSalesTax(e.target.checked)} className="accent-accent" />
                  Disperse S.Tax
                </label>
              </div>
              <Input label="Expense (+) PKR" type="number" value={expense} onChange={(e) => setExpense(Number(e.target.value))} />
            </div>
          </Card>

          <Card hover padding="sm" className="flex flex-col justify-between bg-gradient-to-br from-amber-50 to-white dark:from-brand-800/50 dark:to-brand-900">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-brand-500">Total Qty</span><span className="font-bold">{totalQty}</span></div>
              <div className="flex justify-between"><span className="text-brand-500">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between text-emerald-600"><span>Flat Disc (-)</span><span>-{formatCurrency(flatDisc)}</span></div>
              {freight > 0 && <div className="flex justify-between"><span>Freight (+)</span><span>+{formatCurrency(freight)}</span></div>}
              {expense > 0 && <div className="flex justify-between"><span>Expense (+)</span><span>+{formatCurrency(expense)}</span></div>}
            </div>
            <div className="mt-4 rounded-xl border-2 border-amber-400/60 bg-amber-100/80 p-4 dark:bg-amber-950/30">
              <p className="text-sm font-medium text-brand-600">Total Amount (PKR)</p>
              <p className="font-display text-3xl font-bold">{formatCurrency(grandTotal)}</p>
              <p className="mt-1 text-xs text-brand-500">
                Example: {formatCurrency(subtotal)} − {formatCurrency(flatDisc)} = {formatCurrency(subtotal - flatDisc)}
              </p>
            </div>
          </Card>
        </div>
      </main>
    </>
  );
}
