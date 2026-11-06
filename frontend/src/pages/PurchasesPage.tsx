import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Plus, Save, Trash2, Truck, X } from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Badge, Button, Card, CardTitle, Input, Select } from '@/components/ui';
import { apiErrorMessage } from '@/services';
import { purchasesApi, suppliersApi } from '@/services/endpoints';
import { mapSupplierFromApi } from '@/services/suppliers';
import { useCan, useInventoryStore } from '@/store';
import { useTranslation } from '@/i18n';
import { formatCurrency, localDate } from '@/utils';
import type { GRN, GRNLine, GRNPreview, Product, Supplier } from '@/types';

const emptyGrn = (): GRN => ({
  supplier: '',
  date: localDate(),
  po_no: '',
  payment_type: 'credit',
  disc_percent: '0',
  flat_disc: '0',
  freight: '0',
  sales_tax_percent: '0',
  expense: '0',
  disperse_discount: true,
  disperse_freight: false,
  disperse_tax: false,
  lines: [],
});

const LINE_NUMBERS = [
  ['cases', 'purchases.cases'],
  ['qty', 'purchases.qty'],
  ['free', 'purchases.free'],
  ['rate', 'purchases.rate'],
  ['disc', 'purchases.disc'],
  ['disc_percent', 'purchases.discPercent'],
  ['freight', 'purchases.lineFreight'],
] as const;

export default function PurchasesPage() {
  const { t } = useTranslation();
  const can = useCan();
  const { products, fetchProducts } = useInventoryStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [history, setHistory] = useState<GRN[]>([]);
  const [grn, setGrn] = useState<GRN>(emptyGrn);
  const [preview, setPreview] = useState<GRNPreview | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const previewRun = useRef(0);

  const readOnly = grn.status === 'posted' || !can('purchases.edit');
  const supplier = suppliers.find((item) => Number(item.id) === grn.supplier);

  const loadHistory = useCallback(() => {
    purchasesApi.list().then(({ data }) => setHistory(data.results)).catch(() => setError(t('purchases.loadError')));
  }, [t]);

  const loadSuppliers = useCallback(() => {
    suppliersApi.getAll({ status: 'active', page_size: 100, ordering: 'name' })
      .then(({ data }) => setSuppliers(data.results.map(mapSupplierFromApi)))
      .catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    void fetchProducts();
    loadSuppliers();
    loadHistory();
  }, [fetchProducts, loadHistory, loadSuppliers]);

  // Totals come from the server, so the screen can never disagree with what posting will do.
  useEffect(() => {
    if (!grn.supplier || grn.lines.length === 0 || readOnly) {
      setPreview(null);
      return undefined;
    }
    const run = ++previewRun.current;
    const timer = window.setTimeout(() => {
      purchasesApi.preview(grn)
        .then(({ data }) => {
          if (run === previewRun.current) {
            setPreview(data);
            setError('');
          }
        })
        .catch((err) => {
          if (run === previewRun.current) setError(apiErrorMessage(err, t('purchases.saveError')));
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [grn, readOnly, t]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase() === q).slice(0, 8);
  }, [products, search]);

  const set = <K extends keyof GRN>(key: K, value: GRN[K]) => setGrn((current) => ({ ...current, [key]: value }));
  const setLine = (index: number, patch: Partial<GRNLine>) =>
    setGrn((current) => ({ ...current, lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) }));

  const addProduct = (product: Product) => {
    setSearch('');
    setGrn((current) => ({
      ...current,
      lines: [...current.lines, {
        product: Number(product.id),
        product_name: product.name,
        barcode: product.barcode,
        cases: '0',
        qty: '1',
        free: '0',
        rate: String(product.cost),
        disc: '0',
        disc_percent: '0',
        freight: '0',
        retail: String(product.price),
        expiry_date: null,
      }],
    }));
  };

  const save = async (): Promise<number | undefined> => {
    const { data } = grn.id ? await purchasesApi.update(grn.id, grn) : await purchasesApi.create(grn);
    setGrn(data);
    return data.id;
  };

  const run = async (action: () => Promise<string>) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      setMessage(await action());
      loadHistory();
    } catch (err) {
      setError(apiErrorMessage(err, t('purchases.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = () => run(async () => {
    await save();
    return t('purchases.draftSaved');
  });

  const post = () => {
    if (!window.confirm(t('purchases.confirmPost'))) return;
    void run(async () => {
      const id = await save();
      const { data } = await purchasesApi.post(id!);
      setGrn(emptyGrn());
      await fetchProducts();
      loadSuppliers();
      return t('purchases.posted', { number: data.number ?? '', total: formatCurrency(Number(data.total)) });
    });
  };

  const removeDraft = () => {
    if (!grn.id || !window.confirm(t('purchases.confirmDelete'))) return;
    void run(async () => {
      await purchasesApi.remove(grn.id!);
      setGrn(emptyGrn());
      return t('purchases.draftDeleted');
    });
  };

  const totalQty = grn.lines.reduce((sum, line) => sum + Number(line.qty) + Number(line.free), 0);
  const shown = preview ?? (grn.status === 'posted' ? { subtotal: grn.subtotal ?? '0', total: grn.total ?? '0', discount: '0', tax: '0', lines: [] } : null);
  const lineFacts = (index: number) => preview?.lines[index] ?? (grn.lines[index].unit_cost
    ? { unit_cost: grn.lines[index].unit_cost!, margin_percent: grn.lines[index].margin_percent!, line_total: grn.lines[index].line_total!, previous_cost: '0', warnings: [] as string[] }
    : null);

  return (
    <>
      <Header
        title={`GRN — ${t('purchases.title')}`}
        subtitle={t('purchases.subtitle')}
        actions={!readOnly && (
          <div className="flex gap-2">
            {grn.id && (
              <Button variant="ghost" size="sm" onClick={removeDraft} disabled={saving}>
                <Trash2 className="h-4 w-4" /> {t('common.delete')}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void saveDraft()} disabled={!grn.supplier || grn.lines.length === 0} loading={saving}>
              <Save className="h-4 w-4" /> {t('purchases.draftSave')}
            </Button>
            <Button variant="accent" size="sm" onClick={post} disabled={!grn.supplier || grn.lines.length === 0 || saving}>
              {t('purchases.purchaseComplete')}
            </Button>
          </div>
        )}
      />

      <main className="page-bg flex-1 overflow-y-auto p-4 lg:p-6">
        {message && <p role="status" className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</p>}
        {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
        {grn.status === 'posted' && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-brand-100 px-4 py-2 text-sm dark:bg-brand-800/50">
            <span>{t('purchases.viewingPosted', { number: grn.number ?? '' })}</span>
            <Button variant="ghost" size="sm" onClick={() => setGrn(emptyGrn())}><X className="h-4 w-4" /></Button>
          </div>
        )}

        <Card hover className="mb-4" padding="sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select
              id="grn-supplier"
              label={t('purchases.selectSupplier')}
              value={String(grn.supplier)}
              disabled={readOnly}
              onChange={(e) => {
                const chosen = suppliers.find((item) => item.id === e.target.value);
                setGrn((current) => ({ ...current, supplier: e.target.value ? Number(e.target.value) : '', payment_type: chosen?.paymentType ?? current.payment_type }));
              }}
              options={[{ value: '', label: '—' }, ...suppliers.map((item) => ({ value: item.id, label: item.name })), ...(grn.status === 'posted' && grn.supplier_name ? [{ value: String(grn.supplier), label: grn.supplier_name }] : [])]}
            />
            <Input id="grn-po" label={t('purchases.poNo')} disabled={readOnly} value={grn.po_no} onChange={(e) => set('po_no', e.target.value)} />
            <Input id="grn-date" label={t('sales.date')} type="date" disabled={readOnly} value={grn.date} onChange={(e) => set('date', e.target.value)} />
            <Select id="grn-type" label={t('purchases.type')} disabled={readOnly} value={grn.payment_type} onChange={(e) => set('payment_type', e.target.value as GRN['payment_type'])} options={[{ value: 'credit', label: t('purchases.credit') }, { value: 'cash', label: t('pos.cash') }]} />
            <div>
              <p className="mb-2 text-sm font-medium text-brand-700 dark:text-brand-300">{t('purchases.currentBalance')}</p>
              <p className="font-display text-lg font-bold text-accent">{formatCurrency(supplier?.currentBalance ?? 0)}</p>
            </div>
          </div>
        </Card>

        <Card padding="none" hover className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 px-4 py-3 dark:border-brand-800">
            <CardTitle>{t('purchases.purchaseItems')}</CardTitle>
            {!readOnly && (
              <div className="relative w-full max-w-sm">
                <Input
                  id="grn-search"
                  aria-label={t('purchases.addLine')}
                  placeholder={t('purchases.searchProduct')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (matches[0]) addProduct(matches[0]);
                    }
                  }}
                  icon={<Plus className="h-4 w-4" />}
                />
                {matches.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-brand-200 bg-white shadow-elevated dark:border-brand-700 dark:bg-brand-900">
                    {matches.map((product) => (
                      <button key={product.id} type="button" onClick={() => addProduct(product)} className="flex w-full justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-brand-50 dark:hover:bg-brand-800">
                        <span className="truncate">{product.name}</span>
                        <span className="text-brand-500">{formatCurrency(product.cost)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-xs">
              <thead>
                <tr className="bg-brand-50/80 text-left font-semibold uppercase tracking-wider text-brand-500 dark:bg-brand-800/40">
                  <th className="px-2 py-2">{t('purchases.product')}</th>
                  {LINE_NUMBERS.map(([key, label]) => <th key={key} className="px-1 py-2 text-right">{t(label)}</th>)}
                  <th className="px-2 py-2 text-right">{t('purchases.cost')}</th>
                  <th className="px-2 py-2 text-right">{t('purchases.lineTotal')}</th>
                  <th className="px-1 py-2 text-right">{t('purchases.retail')}</th>
                  <th className="px-2 py-2 text-right">{t('purchases.margin')}</th>
                  <th className="px-1 py-2">{t('inventory.expiryDate')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {grn.lines.map((line, index) => {
                  const facts = lineFacts(index);
                  return (
                    <tr key={`${line.product}-${index}`} className="border-t border-brand-50 dark:border-brand-800/50">
                      <td className="px-2 py-1.5">
                        <p className="font-medium">{line.product_name}</p>
                        <p className="font-mono text-[10px] text-brand-500">{line.barcode}</p>
                        {facts?.warnings.includes('below_cost') && <Badge variant="danger"><AlertTriangle className="mr-1 inline h-3 w-3" />{t('purchases.warnBelowCost')}</Badge>}
                        {facts?.warnings.includes('cost_up') && <Badge variant="warning">{t('purchases.warnCostUp', { cost: formatCurrency(Number(facts.previous_cost)) })}</Badge>}
                      </td>
                      {LINE_NUMBERS.map(([key, label]) => (
                        <td key={key} className="px-1 py-1.5">
                          <input aria-label={`${line.product_name} ${t(label)}`} type="number" min={0} step="any" disabled={readOnly} value={line[key]} onChange={(e) => setLine(index, { [key]: e.target.value })} className="h-8 w-16 rounded-md border border-brand-200 bg-white px-1.5 text-right focus-ring dark:border-brand-700 dark:bg-brand-900" />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-semibold">{facts ? Number(facts.unit_cost).toFixed(2) : '—'}</td>
                      <td className="px-2 py-1.5 text-right font-bold">{facts ? formatCurrency(Number(facts.line_total)) : '—'}</td>
                      <td className="px-1 py-1.5">
                        <input aria-label={`${line.product_name} ${t('purchases.retail')}`} type="number" min={0} step="any" disabled={readOnly} value={line.retail} onChange={(e) => setLine(index, { retail: e.target.value })} className="h-8 w-16 rounded-md border border-brand-200 bg-white px-1.5 text-right focus-ring dark:border-brand-700 dark:bg-brand-900" />
                      </td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${facts && Number(facts.margin_percent) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{facts ? `${facts.margin_percent}%` : '—'}</td>
                      <td className="px-1 py-1.5">
                        <input aria-label={`${line.product_name} ${t('inventory.expiryDate')}`} type="date" disabled={readOnly} value={line.expiry_date ?? ''} onChange={(e) => setLine(index, { expiry_date: e.target.value || null })} className="h-8 rounded-md border border-brand-200 bg-white px-1 focus-ring dark:border-brand-700 dark:bg-brand-900" />
                      </td>
                      <td className="px-1 py-1.5">
                        {!readOnly && (
                          <button type="button" aria-label={t('common.delete')} className="text-brand-400 hover:text-red-500" onClick={() => set('lines', grn.lines.filter((_, i) => i !== index))}>
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {grn.lines.length === 0 && <p className="py-10 text-center text-sm text-brand-500"><Truck className="mx-auto mb-2 h-8 w-8 text-brand-300" />{t('purchases.noLines')}</p>}
          </div>
        </Card>

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <Card hover className="lg:col-span-2" padding="sm">
            <p className="mb-3 text-sm font-semibold">{t('purchases.adjustments')}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Input id="grn-disc" label={t('purchases.discPercentBill')} type="number" min={0} max={100} step="any" disabled={readOnly} value={grn.disc_percent} onChange={(e) => set('disc_percent', e.target.value)} />
              </div>
              <div>
                <Input id="grn-flat" label={t('purchases.flatDisc')} type="number" min={0} step="any" disabled={readOnly} value={grn.flat_disc} onChange={(e) => set('flat_disc', e.target.value)} />
                <label className="mt-1 flex items-center gap-2 text-xs text-brand-500">
                  <input type="checkbox" disabled={readOnly} checked={grn.disperse_discount} onChange={(e) => set('disperse_discount', e.target.checked)} className="accent-accent" /> {t('purchases.disperse')}
                </label>
              </div>
              <div>
                <Input id="grn-freight" label={t('purchases.billFreight')} type="number" min={0} step="any" disabled={readOnly} value={grn.freight} onChange={(e) => set('freight', e.target.value)} />
                <label className="mt-1 flex items-center gap-2 text-xs text-brand-500">
                  <input type="checkbox" disabled={readOnly} checked={grn.disperse_freight} onChange={(e) => set('disperse_freight', e.target.checked)} className="accent-accent" /> {t('purchases.disperse')}
                </label>
              </div>
              <div>
                <Input id="grn-tax" label={t('purchases.salesTax')} type="number" min={0} max={100} step="any" disabled={readOnly} value={grn.sales_tax_percent} onChange={(e) => set('sales_tax_percent', e.target.value)} />
                <label className="mt-1 flex items-center gap-2 text-xs text-brand-500">
                  <input type="checkbox" disabled={readOnly} checked={grn.disperse_tax} onChange={(e) => set('disperse_tax', e.target.checked)} className="accent-accent" /> {t('purchases.disperse')}
                </label>
              </div>
              <Input id="grn-expense" label={t('purchases.expense')} type="number" min={0} step="any" disabled={readOnly} value={grn.expense} onChange={(e) => set('expense', e.target.value)} />
            </div>
          </Card>
          <Card hover padding="sm" className="flex flex-col justify-between">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-brand-500">{t('purchases.totalQty')}</span><span className="font-bold">{totalQty}</span></div>
              <div className="flex justify-between"><span className="text-brand-500">{t('purchases.subtotal')}</span><span>{formatCurrency(Number(shown?.subtotal ?? 0))}</span></div>
              {Number(shown?.discount) > 0 && <div className="flex justify-between text-emerald-600"><span>{t('purchases.discount')}</span><span>-{formatCurrency(Number(shown?.discount))}</span></div>}
              {Number(shown?.tax) > 0 && <div className="flex justify-between"><span>{t('purchases.salesTax')}</span><span>+{formatCurrency(Number(shown?.tax))}</span></div>}
            </div>
            <div className="mt-4 rounded-xl border-2 border-amber-400/60 bg-amber-100/80 p-4 dark:bg-amber-950/30">
              <p className="text-sm font-medium text-brand-600 dark:text-brand-300">{t('purchases.grandTotal')}</p>
              <p className="font-display text-3xl font-bold" data-testid="grn-total">{formatCurrency(Number(shown?.total ?? 0))}</p>
            </div>
          </Card>
        </div>

        <Card padding="none" hover>
          <div className="border-b border-brand-100 px-4 py-3 dark:border-brand-800"><CardTitle>{t('purchases.history')}</CardTitle></div>
          {history.length === 0 && <p className="py-6 text-center text-sm text-brand-500">{t('purchases.noHistory')}</p>}
          <div className="divide-y divide-brand-100 dark:divide-brand-800">
            {history.map((item) => (
              <button key={item.id} type="button" onClick={() => { setGrn(item); setMessage(''); setError(''); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm hover:bg-brand-50/60 dark:hover:bg-brand-800/30">
                <span dir="ltr" className="w-28 font-mono text-xs font-semibold">{item.number ?? t('purchases.draft')}</span>
                <span className="min-w-0 flex-1 truncate">{item.supplier_name} · {item.date}</span>
                <Badge variant={item.status === 'posted' ? 'success' : 'warning'}>{item.status === 'posted' ? t('purchases.statusPosted') : t('purchases.draft')}</Badge>
                <span className="font-bold">{formatCurrency(Number(item.total))}</span>
              </button>
            ))}
          </div>
        </Card>
      </main>
    </>
  );
}
