import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Plus, Save, Trash2, Truck, Undo2, X } from 'lucide-react';
import PageShell from '@/components/layout/PageShell';
import { Badge, Button, Card, CardTitle, Input, Select, confirmAction } from '@/components/ui';
import { KpiStrip, LinkButton, PageHeading, Pill } from '@/components/ui/Kit';
import { purchasePagesApi } from '@/services/pages';
import type { PurchaseSummary } from '@/types/pages';
import { cn, num, shortDate } from '@/utils';
import { apiErrorMessage } from '@/services';
import { purchasesApi, suppliersApi } from '@/services/endpoints';
import { mapSupplierFromApi } from '@/services/suppliers';
import { useCan, useInventoryStore } from '@/store';
import { useTranslation } from '@/i18n';
import { formatCurrency, localDate } from '@/utils';
import PurchaseReturnPanel from '@/components/purchases/PurchaseReturnPanel';
import type { GRN, GRNLine, GRNPreview, Product, Supplier } from '@/types';

const emptyGrn = (): GRN => ({
  supplier: '',
  date: localDate(),
  po_no: '',
  supplier_invoice_no: '',
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

function lineFor(product: Product): GRNLine {
  return {
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
  };
}

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
  const [tab, setTab] = useState<'grn' | 'returns'>('grn');
  /** The design's landing list, or the full GRN editor. */
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [summary, setSummary] = useState<PurchaseSummary | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const previewRun = useRef(0);

  const readOnly = grn.status === 'posted' || grn.status === 'voided' || !can('purchases.edit');
  const supplier = suppliers.find((item) => Number(item.id) === grn.supplier);

  const loadHistory = useCallback(() => {
    purchasesApi.list().then(({ data }) => {
      setHistory(data.results);
      setSelectedId((current) => (data.results.some((item) => item.id === current) ? current : data.results[0]?.id ?? null));
    }).catch(() => setError(t('purchases.loadError')));
    purchasePagesApi.summary().then(({ data }) => setSummary(data)).catch(() => undefined);
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

  // Home → Needs attention → Reorder: start a delivery for that product from its supplier.
  const reorderId = searchParams.get('reorder');
  useEffect(() => {
    if (!reorderId || products.length === 0 || !can('purchases.edit')) return;
    const product = products.find((item) => item.id === reorderId);
    if (!product) return;
    const next = emptyGrn();
    const supplierId = product.supplierId ? Number(product.supplierId) : '';
    next.supplier = suppliers.some((item) => Number(item.id) === supplierId) ? supplierId : '';
    next.lines = [lineFor(product)];
    setGrn(next);
    setMode('edit');
    setTab('grn');
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the catalogue and suppliers are in
  }, [reorderId, products.length, suppliers.length]);

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
    setGrn((current) => ({ ...current, lines: [...current.lines, lineFor(product)] }));
  };

  const startNew = () => {
    setGrn(emptyGrn());
    setMessage('');
    setError('');
    setTab('grn');
    setMode('edit');
  };

  const openGrn = (item: GRN) => {
    setGrn(item);
    setMessage('');
    setError('');
    setTab('grn');
    setMode('edit');
  };

  const postFromList = async (item: GRN) => {
    if (!item.id || !(await confirmAction({ title: t('purchases.confirmPost') }))) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await purchasesApi.post(item.id);
      setMessage(t('purchases.posted', { number: data.number ?? '', total: formatCurrency(Number(data.total)) }));
      await fetchProducts();
      loadSuppliers();
      loadHistory();
    } catch (err) {
      setError(apiErrorMessage(err, t('purchases.saveError')));
    } finally {
      setSaving(false);
    }
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

  const post = async () => {
    if (!(await confirmAction({ title: t('purchases.confirmPost') }))) return;
    void run(async () => {
      const id = await save();
      const { data } = await purchasesApi.post(id!);
      setGrn(emptyGrn());
      setMode('list');
      setSelectedId(data.id ?? null);
      await fetchProducts();
      loadSuppliers();
      return t('purchases.posted', { number: data.number ?? '', total: formatCurrency(Number(data.total)) });
    });
  };

  const voidPosted = async () => {
    if (!grn.id || grn.status !== 'posted') return;
    if (!(await confirmAction({ title: t('purchases.confirmVoid'), tone: 'danger' }))) return;
    void run(async () => {
      const { data } = await purchasesApi.void(grn.id!, t('purchases.voidDefaultReason'));
      setGrn(data);
      await fetchProducts();
      loadSuppliers();
      return t('purchases.voided', { number: data.number ?? '' });
    });
  };

  const removeDraft = async () => {
    if (!grn.id || !(await confirmAction({ title: t('purchases.confirmDelete'), tone: 'danger' }))) return;
    void run(async () => {
      await purchasesApi.remove(grn.id!);
      setGrn(emptyGrn());
      setMode('list');
      return t('purchases.draftDeleted');
    });
  };

  const totalQty = grn.lines.reduce((sum, line) => sum + Number(line.qty) + Number(line.free), 0);
  const shown = preview ?? (grn.status === 'posted' ? { subtotal: grn.subtotal ?? '0', total: grn.total ?? '0', discount: '0', tax: '0', lines: [] } : null);
  const lineFacts = (index: number) => preview?.lines[index] ?? (grn.lines[index].unit_cost
    ? { unit_cost: grn.lines[index].unit_cost!, margin_percent: grn.lines[index].margin_percent!, line_total: grn.lines[index].line_total!, previous_cost: '0', warnings: [] as string[] }
    : null);

  return (
    <PageShell crumb={t('nav.purchases')} subCrumb={tab === 'returns' ? t('pg.purchases.supplierReturns') : mode === 'edit' ? (grn.number ?? (grn.id ? t('purchases.draft') : t('pg.purchases.newDelivery'))) : undefined}>
      {mode === 'list' && tab === 'grn' ? (
        <PurchaseList
          history={history}
          summary={summary}
          selectedId={selectedId}
          onSelect={setSelectedId}
          showAll={showAll}
          onShowAll={() => setShowAll((value) => !value)}
          canEdit={can('purchases.edit')}
          busy={saving}
          message={message}
          error={error}
          onReceive={startNew}
          onEdit={openGrn}
          onPost={(item) => void postFromList(item)}
          onReturns={() => setTab('returns')}
        />
      ) : (
      <>
      <PageHeading
        title={tab === 'returns' ? t('pg.purchases.supplierReturns') : grn.number ? `${grn.number} · ${grn.supplier_name ?? ''}` : t('pg.purchases.receiveGoods')}
        subtitle={tab === 'returns' ? t('pg.purchases.returnsSubtitle') : t('purchases.subtitle')}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { setTab('grn'); setMode('list'); setMessage(''); setError(''); loadHistory(); }}>
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('pg.purchases.backToList')}
            </Button>
            {tab === 'grn' && !readOnly && (
              <>
                {grn.id && (
                  <Button variant="ghost" size="sm" onClick={removeDraft} disabled={saving}>
                    <Trash2 className="h-4 w-4" /> {t('common.delete')}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => void saveDraft()} disabled={!grn.supplier || grn.lines.length === 0} loading={saving}>
                  <Save className="h-4 w-4" /> {t('purchases.draftSave')}
                </Button>
                <Button size="sm" onClick={post} disabled={!grn.supplier || grn.lines.length === 0 || saving}>
                  {t('pg.purchases.postToStock')}
                </Button>
              </>
            )}
          </div>
        )}
      />

      <div>
        {tab === 'returns' ? <PurchaseReturnPanel /> : (
          <>
        {message && <p role="status" className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</p>}
        {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
        {(grn.status === 'posted' || grn.status === 'voided') && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-xl bg-brand-100 px-4 py-2 text-sm dark:bg-brand-800/50">
            <span>
              {grn.status === 'voided'
                ? t('purchases.viewingVoided', { number: grn.number ?? '' })
                : t('purchases.viewingPosted', { number: grn.number ?? '' })}
            </span>
            <div className="flex items-center gap-1">
              {grn.status === 'posted' && can('purchases.edit') && (
                <Button variant="ghost" size="sm" onClick={voidPosted} disabled={saving}>
                  {t('purchases.voidGrn')}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setGrn(emptyGrn())}><X className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        <Card hover className="mb-4" padding="sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
            <Input id="grn-invoice" label={t('pg.purchases.supplierInvoice')} maxLength={50} disabled={readOnly} value={grn.supplier_invoice_no ?? ''} onChange={(e) => set('supplier_invoice_no', e.target.value)} />
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
                <tr className="bg-brand-50/80 text-left font-medium text-brand-500 dark:bg-brand-800/40">
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
            <div className="mt-4 rounded-xl bg-brand-900 p-4 text-white dark:bg-brand-800">
              <p className="text-sm font-medium text-brand-300">{t('purchases.grandTotal')}</p>
              <p className="num mt-1 text-[32px] font-semibold leading-none" data-testid="grn-total">{formatCurrency(Number(shown?.total ?? 0))}</p>
            </div>
          </Card>
        </div>

          </>
        )}
      </div>
      </>
      )}
    </PageShell>
  );
}

const GRN_TONE = { draft: 'muted', posted: 'success', voided: 'danger' } as const;

function PurchaseList({
  history, summary, selectedId, onSelect, showAll, onShowAll, canEdit, busy, message, error, onReceive, onEdit, onPost, onReturns,
}: {
  history: GRN[];
  summary: PurchaseSummary | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  showAll: boolean;
  onShowAll: () => void;
  canEdit: boolean;
  busy: boolean;
  message: string;
  error: string;
  onReceive: () => void;
  onEdit: (grn: GRN) => void;
  onPost: (grn: GRN) => void;
  onReturns: () => void;
}) {
  const { t } = useTranslation();
  const rows = showAll ? history : history.slice(0, 8);
  const selected = history.find((item) => item.id === selectedId) ?? null;
  return (
    <>
      <PageHeading
        title={t('nav.purchases')}
        subtitle={t('pg.purchases.subtitle')}
        actions={
          <>
            <Button variant="outline" onClick={onReturns}><Undo2 className="h-4 w-4" /> {t('pg.purchases.supplierReturns')}</Button>
            {canEdit && <Button onClick={onReceive}><Plus className="h-4 w-4" /> {t('pg.purchases.receiveGoods')}</Button>}
          </>
        }
      />
      {message && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</p>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {summary && (
        <KpiStrip
          items={[
            { key: 'month', label: t('pg.common.thisMonth'), value: formatMoneyShortSafe(num(summary.month_total)), hint: t('pg.purchases.deliveries', { count: summary.month_deliveries }) },
            { key: 'drafts', label: t('pg.purchases.drafts'), value: summary.drafts, hint: t('pg.purchases.notPosted', { amount: formatCurrency(num(summary.drafts_total)) }) },
            { key: 'costs', label: t('pg.purchases.costChanges'), value: summary.cost_changes, hint: t('pg.purchases.upDown', { up: summary.cost_up, down: summary.cost_down }) },
            { key: 'owed', label: t('pg.purchases.owed'), value: formatCurrency(num(summary.owed_total)), hint: t('pg.purchases.suppliers', { count: summary.suppliers_owed }) },
          ]}
        />
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-brand-800 dark:bg-brand-900">
          <header className="flex items-center justify-between px-5 pb-3 pt-4">
            <h2 className="text-[15px] font-semibold text-brand-900 dark:text-white">{t('pg.purchases.recent')}</h2>
            {history.length > 8 && <LinkButton onClick={onShowAll}>{showAll ? t('pg.purchases.fewer') : t('pg.common.all')}</LinkButton>}
          </header>
          {history.length === 0 ? (
            <p className="border-t border-brand-100 px-5 py-10 text-center text-sm text-brand-500 dark:border-brand-800"><Truck className="mx-auto mb-2 h-8 w-8 text-brand-300" />{t('purchases.noHistory')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-y border-brand-100 text-[13px] text-brand-500 dark:border-brand-800">
                    <th className="px-5 py-2.5 text-start font-normal">GRN</th>
                    <th className="px-3 py-2.5 text-start font-normal">{t('pg.products.supplier')}</th>
                    <th className="px-3 py-2.5 text-start font-normal">{t('pg.purchases.date')}</th>
                    <th className="px-3 py-2.5 text-start font-normal">{t('pg.orders.status')}</th>
                    <th className="px-5 py-2.5 text-end font-normal">{t('pg.orders.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => item.id && onSelect(item.id)}
                      aria-selected={item.id === selectedId}
                      className={cn('cursor-pointer border-b border-brand-100 last:border-0 dark:border-brand-800', item.id === selectedId ? 'bg-accent-soft/60 dark:bg-accent-soft/40' : 'hover:bg-brand-50 dark:hover:bg-brand-800/40')}
                    >
                      <td dir="ltr" className="px-5 py-3 font-medium tabular-nums text-brand-900 dark:text-white">{item.number ?? t('purchases.draft')}</td>
                      <td className="max-w-[14rem] truncate px-3 py-3 text-brand-800 dark:text-brand-200">{item.supplier_name}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-brand-500">{shortDate(item.date)}</td>
                      <td className="px-3 py-3"><Pill tone={GRN_TONE[item.status ?? 'draft']}>{t(`pg.purchases.st_${item.status ?? 'draft'}`)}</Pill></td>
                      <td className="num px-5 py-3 text-end font-semibold text-brand-900 dark:text-white">{formatCurrency(num(item.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {selected ? <GrnPanel grn={selected} canEdit={canEdit} busy={busy} onEdit={onEdit} onPost={onPost} /> : null}
      </div>
    </>
  );
}

function formatMoneyShortSafe(value: number) {
  return value >= 1_000_000 ? `Rs ${(value / 1_000_000).toFixed(2)}M` : formatCurrency(value);
}

function GrnPanel({ grn, canEdit, busy, onEdit, onPost }: { grn: GRN; canEdit: boolean; busy: boolean; onEdit: (grn: GRN) => void; onPost: (grn: GRN) => void }) {
  const { t } = useTranslation();
  const changes = grn.lines.filter((line) => line.previous_cost != null && line.unit_cost != null && num(line.previous_cost) !== num(line.unit_cost));
  const meta = [
    t(`pg.purchases.st_${grn.status ?? 'draft'}`),
    grn.supplier_invoice_no && t('pg.purchases.invoice', { number: grn.supplier_invoice_no }),
    grn.created_by_name && t('pg.purchases.receivedBy', { name: grn.created_by_name }),
  ].filter(Boolean).join(' · ');
  return (
    <section aria-label={grn.number ?? t('purchases.draft')} className="overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-brand-800 dark:bg-brand-900">
      <header className="flex items-start justify-between gap-3 border-b border-brand-100 px-5 py-4 dark:border-brand-800">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-brand-900 dark:text-white"><span dir="ltr">{grn.number ?? t('purchases.draft')}</span> · {grn.supplier_name}</h2>
          <p className="truncate text-[13px] text-brand-500">{meta}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(grn)}>{grn.status === 'draft' && canEdit ? t('common.edit') : t('pg.common.view')}</Button>
          {grn.status === 'draft' && canEdit && <Button size="sm" loading={busy} onClick={() => onPost(grn)}>{t('pg.purchases.postToStock')}</Button>}
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-sm">
          <thead>
            <tr className="border-b border-brand-100 text-[13px] text-brand-500 dark:border-brand-800">
              <th className="px-5 py-2.5 text-start font-normal">{t('pg.purchases.item')}</th>
              <th className="px-3 py-2.5 text-end font-normal">{t('purchases.qty')}</th>
              <th className="px-3 py-2.5 text-end font-normal">{t('pg.purchases.costChange')}</th>
              <th className="px-5 py-2.5 text-end font-normal">{t('purchases.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {grn.lines.map((line, index) => {
              const before = line.previous_cost == null ? null : num(line.previous_cost);
              const after = num(line.unit_cost);
              const moved = before != null && before !== after;
              return (
                <tr key={line.id ?? index} className="border-b border-brand-100 last:border-0 dark:border-brand-800">
                  <td className="px-5 py-3">
                    <p className="text-brand-900 dark:text-white">{line.product_name}</p>
                    <p className="text-[13px] text-brand-500">{line.expiry_date ? t('pg.purchases.expires', { date: shortDate(line.expiry_date) }) : line.barcode}</p>
                  </td>
                  <td className="num px-3 py-3 text-end text-brand-800 dark:text-brand-200">{num(line.qty) + num(line.free)}</td>
                  <td className={cn('num whitespace-nowrap px-3 py-3 text-end', moved ? (after > before! ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400') : 'text-brand-700 dark:text-brand-300')}>
                    {moved ? `${formatCurrency(before!)} → ${Math.round(after * 100) / 100}` : formatCurrency(after)}
                  </td>
                  <td className="num px-5 py-3 text-end font-semibold text-brand-900 dark:text-white">{formatCurrency(num(line.line_total))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {grn.status === 'draft' && changes.length > 0 && (
        <p className="mx-5 my-4 rounded-lg bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          {t('pg.purchases.costNote', { count: changes.length })}
        </p>
      )}
      {grn.status === 'voided' && grn.void_reason && (
        <p className="mx-5 my-4 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:bg-red-500/10 dark:text-red-300">{grn.void_reason}</p>
      )}
    </section>
  );
}
