import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban, MoreHorizontal, PackageSearch, Pencil, Plus, Printer, Scale, SlidersHorizontal, Trash2, Upload } from 'lucide-react';
import PageShell from '@/components/layout/PageShell';
import { Button, EmptyState, Input, Modal, Select, SkeletonRows, confirmAction } from '@/components/ui';
import { Avatar, FilterSelect, PageHeading, Pager, Pill, SearchField, Tabs } from '@/components/ui/Kit';
import ProductForm, { type ProductFormSubmitResult } from '@/components/inventory/ProductForm';
import LabelPrintModal from '@/components/inventory/LabelPrintModal';
import { apiErrorMessage, inventoryApi } from '@/services';
import { mapProductFromApi } from '@/services/products';
import { useCan, useInventoryStore } from '@/store';
import { useTranslation } from '@/i18n';
import type { Product } from '@/types';
import { cn, formatCurrency, formatMoneyShort } from '@/utils';
import {
  countByStockStatus,
  deriveStockStatus,
  emptyInventoryFilters,
  filterProducts,
  getExpiryStatus,
  productMarginPercent,
  stockFillPercent,
  type InventoryFilters,
} from '@/utils/inventoryUtils';
import { printLabelBatch } from '@/utils/labelPrint';

const PAGE_SIZE = 10;
type Tab = 'all' | 'low' | 'out' | 'expiring' | 'expired' | 'inactive';
type Margin = '' | 'negative' | 'under10' | '10to20' | 'over20';

const TAB_FILTERS: Record<Tab, Partial<InventoryFilters>> = {
  all: {},
  low: { stockStatus: 'low_stock' },
  out: { stockStatus: 'out_of_stock' },
  expiring: { expiryFilter: 'expiring_soon' },
  expired: { expiryFilter: 'expired' },
  inactive: { activity: 'inactive' },
};

function marginMatches(margin: number | null, filter: Margin) {
  if (!filter) return true;
  if (margin == null) return false;
  if (filter === 'negative') return margin < 0;
  if (filter === 'under10') return margin >= 0 && margin < 10;
  if (filter === '10to20') return margin >= 10 && margin <= 20;
  return margin > 20;
}

function expiryLabel(date?: string) {
  if (!date) return '—';
  const value = new Date(`${date}T00:00:00`);
  const soon = (value.getTime() - Date.now()) / 86_400_000 < 60;
  return new Intl.DateTimeFormat('en-GB', soon ? { day: 'numeric', month: 'short' } : { month: 'short', year: 'numeric' }).format(value);
}

export default function InventoryPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [searchParams] = useSearchParams();
  const { products, loading, error: loadFailed, fetchProducts, addProduct, updateProduct, deleteProduct } = useInventoryStore();
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState(() => (searchParams.get('search') ?? searchParams.get('q') ?? '').trim());
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [margin, setMargin] = useState<Margin>('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [expiryFrom, setExpiryFrom] = useState('');
  const [expiryTo, setExpiryTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchHits, setSearchHits] = useState<Product[] | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [counted, setCounted] = useState('');
  const [adjustReason, setAdjustReason] = useState('count');
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);
  const [importResult, setImportResult] = useState('');
  const importInput = useRef<HTMLInputElement>(null);
  const canCost = can('products.view_cost');

  useEffect(() => {
    void fetchProducts({ includeInactive: true });
  }, [fetchProducts]);

  // Deep links: ?search=barcode from the ⌘K search, ?edit=id from Home → Mark down.
  useEffect(() => {
    const q = (searchParams.get('search') ?? searchParams.get('q') ?? '').trim();
    if (q) setSearch(q);
  }, [searchParams]);
  const editId = searchParams.get('edit');
  useEffect(() => {
    if (!editId || products.length === 0) return;
    const product = products.find((item) => item.id === editId);
    if (product) {
      setEditingProduct(product);
      setModalOpen(true);
    }
  }, [editId, products]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSearchHits(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      inventoryApi.searchProducts(q, { includeInactive: true, limit: 200 })
        .then(({ data }) => !cancelled && setSearchHits(data.results.map(mapProductFromApi)))
        // Search service down: the local filter below still matches by name and barcode.
        .catch(() => !cancelled && setSearchHits(null));
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  const stats = useMemo(() => countByStockStatus(products), [products]);
  const stockValue = useMemo(
    () => products.filter((p) => p.active && p.stock > 0).reduce((sum, p) => sum + p.stock * p.cost, 0),
    [products],
  );
  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))).filter(Boolean).sort(), [products]);
  const suppliers = useMemo(() => Array.from(new Set(products.map((p) => p.supplierName ?? ''))).filter(Boolean).sort(), [products]);

  const filtered = useMemo(() => {
    const filters: InventoryFilters = {
      ...emptyInventoryFilters,
      ...TAB_FILTERS[tab],
      search: searchHits ? '' : search,
      category: category || 'all',
      expiryFrom,
      expiryTo,
    };
    return filterProducts(searchHits ?? products, filters)
      .filter((p) => !supplier || p.supplierName === supplier)
      .filter((p) => marginMatches(productMarginPercent(p), margin));
  }, [category, expiryFrom, expiryTo, margin, products, search, searchHits, supplier, tab]);

  useEffect(() => setPage(1), [tab, search, category, supplier, margin, expiryFrom, expiryTo]);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allOnPage = pageRows.length > 0 && pageRows.every((p) => selected.has(p.id));

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const togglePage = () => setSelected((current) => {
    const next = new Set(current);
    pageRows.forEach((p) => (allOnPage ? next.delete(p.id) : next.add(p.id)));
    return next;
  });

  const openEdit = (product: Product | null) => {
    setError('');
    setEditingProduct(product);
    setModalOpen(true);
  };

  const handleSubmit = async (data: ProductFormSubmitResult) => {
    const { shouldPrintLabel, ...productData } = data;
    setSaving(true);
    setError('');
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, productData);
      } else {
        const created = await addProduct(productData);
        if (shouldPrintLabel) setLabelProduct(created);
      }
      setModalOpen(false);
      setEditingProduct(null);
    } catch (err) {
      setError(apiErrorMessage(err, t('inventory.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product: Product) => {
    if (!(await confirmAction({ title: t('inventory.confirmDelete', { name: product.name }), tone: 'danger' }))) return;
    setError('');
    try {
      await deleteProduct(product.id);
    } catch (err) {
      setError(apiErrorMessage(err, t('inventory.deleteError')));
    }
  };

  const submitAdjust = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adjusting) return;
    setSaving(true);
    setError('');
    try {
      await inventoryApi.adjustStock(adjusting.id, Number(counted), adjustReason);
      setAdjusting(null);
      await fetchProducts({ includeInactive: true });
    } catch (err) {
      setError(apiErrorMessage(err, t('inventory.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const writeOff = async (product: Product) => {
    if (!(await confirmAction({ title: t('inventory.confirmWriteOff', { name: product.name }), tone: 'danger' }))) return;
    try {
      await inventoryApi.writeOffExpired(product.id);
      await fetchProducts({ includeInactive: true });
    } catch (err) {
      setError(apiErrorMessage(err, t('inventory.saveError')));
    }
  };

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    setImportResult('');
    setError('');
    try {
      const { data } = await inventoryApi.importProducts(file);
      const firstError = data.errors[0] ? ` ${t('inventory.importFirstError', { row: data.errors[0].row, error: data.errors[0].error })}` : '';
      setImportResult(t('inventory.importResult', { created: data.created, failed: data.error_count }) + firstError);
      await fetchProducts({ includeInactive: true });
    } catch (err) {
      setError(apiErrorMessage(err, t('inventory.saveError')));
    }
    if (importInput.current) importInput.current.value = '';
  };

  const printSelected = () => {
    const chosen = products.filter((p) => selected.has(p.id));
    if (chosen.length === 1) setLabelProduct(chosen[0]);
    else printLabelBatch(chosen.map((product) => ({ product, copies: 1 })));
  };

  const tabs = [
    { value: 'all' as const, label: t('pg.common.all'), count: stats.total },
    { value: 'low' as const, label: t('pg.products.low'), count: stats.low_stock },
    { value: 'out' as const, label: t('pg.products.out'), count: stats.out_of_stock },
    { value: 'expiring' as const, label: t('pg.products.expiringSoon'), count: stats.expiringSoon },
    { value: 'expired' as const, label: t('pg.products.expired'), count: stats.expired },
    { value: 'inactive' as const, label: t('pg.products.inactive'), count: stats.inactive },
  ];

  const statusPill = (product: Product) => {
    if (!product.active) return <Pill tone="muted">{t('pg.products.inactive')}</Pill>;
    const expiry = getExpiryStatus(product.expiryDate);
    if (expiry === 'expired') return <Pill tone="danger">{t('pg.products.expired')}</Pill>;
    const status = deriveStockStatus(product);
    if (status === 'out_of_stock') return <Pill tone="danger">{t('pg.products.outShort')}</Pill>;
    if (expiry === 'expiring_soon') return <Pill tone="danger">{t('pg.products.expiring')}</Pill>;
    if (status === 'low_stock') return <Pill tone="warn">{t('pg.products.lowShort')}</Pill>;
    return <Pill tone="success">{t('pg.products.inStock')}</Pill>;
  };

  return (
    <PageShell crumb={t('nav.inventory')}>
      <PageHeading
        title={t('nav.inventory')}
        subtitle={canCost
          ? t('pg.products.subtitle', { count: stats.total.toLocaleString(), value: formatMoneyShort(stockValue) })
          : t('pg.products.subtitleNoCost', { count: stats.total.toLocaleString() })}
        actions={
          <>
            <input ref={importInput} type="file" accept=".csv,text/csv" className="hidden" aria-label={t('inventory.importCsv')} onChange={(e) => void importCsv(e.target.files?.[0])} />
            <Button variant="outline" title={t('inventory.importHint')} onClick={() => importInput.current?.click()}>
              <Upload className="h-4 w-4" /> {t('inventory.importCsv')}
            </Button>
            <Button variant="outline" onClick={printSelected} disabled={selected.size === 0} title={selected.size === 0 ? t('pg.products.selectToPrint') : undefined}>
              {selected.size > 0 ? t('pg.products.printCount', { count: selected.size }) : t('pg.products.printLabels')}
            </Button>
            <Button onClick={() => openEdit(null)}><Plus className="h-4 w-4" /> {t('inventory.addProduct')}</Button>
          </>
        }
      />

      {(loadFailed || (error && !modalOpen && !adjusting)) && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error || t('inventory.loadError')}
        </p>
      )}
      {importResult && <p role="status" className="rounded-lg border border-brand-200 bg-white px-4 py-3 text-sm dark:border-brand-700 dark:bg-brand-900">{importResult}</p>}

      <Tabs value={tab} items={tabs} onChange={setTab} label={t('pg.products.views')} />

      <div className="flex flex-wrap items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder={t('pg.products.search')} className="w-full sm:w-72" />
        <FilterSelect label={t('pg.products.category')} value={category} onChange={setCategory} options={[{ value: '', label: t('pg.products.category') }, ...categories.map((value) => ({ value, label: value }))]} />
        <FilterSelect label={t('pg.products.supplier')} value={supplier} onChange={setSupplier} options={[{ value: '', label: t('pg.products.supplier') }, ...suppliers.map((value) => ({ value, label: value }))]} />
        {canCost && (
          <FilterSelect
            label={t('pg.products.margin')}
            value={margin}
            onChange={(value) => setMargin(value as Margin)}
            options={[
              { value: '', label: t('pg.products.margin') },
              { value: 'negative', label: t('pg.products.marginNegative') },
              { value: 'under10', label: t('pg.products.marginUnder10') },
              { value: '10to20', label: t('pg.products.margin10to20') },
              { value: 'over20', label: t('pg.products.marginOver20') },
            ]}
          />
        )}
        <div className="flex-1" />
        <Button variant="outline" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen}>
          <SlidersHorizontal className="h-4 w-4" /> {t('pg.products.moreFilters')}
        </Button>
      </div>
      {moreOpen && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-800 dark:bg-brand-900/50">
          <div className="w-44"><Input id="expiry-from" type="date" label={t('inventory.expiryFrom')} value={expiryFrom} onChange={(e) => setExpiryFrom(e.target.value)} /></div>
          <div className="w-44"><Input id="expiry-to" type="date" label={t('inventory.expiryTo')} value={expiryTo} onChange={(e) => setExpiryTo(e.target.value)} /></div>
          <Button variant="ghost" onClick={() => { setExpiryFrom(''); setExpiryTo(''); setCategory(''); setSupplier(''); setMargin(''); setSearch(''); setTab('all'); }}>
            {t('inventory.clearFilters')}
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-brand-800 dark:bg-brand-900">
        {loading && products.length === 0 ? (
          <SkeletonRows rows={8} columns={8} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={PackageSearch} title={t('inventory.noResults')} />
        ) : (
          <div className="relative overflow-x-auto" data-note="relative keeps the sr-only header inside the scroll area on phones">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-brand-200 text-[13px] text-brand-500 dark:border-brand-800">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label={t('pg.products.selectPage')} className="h-4 w-4 rounded border-brand-300 accent-[rgb(var(--accent))]" />
                  </th>
                  <th className="px-2 py-3 text-start font-normal">{t('pg.home.product')}</th>
                  <th className="px-4 py-3 text-start font-normal">{t('pg.products.category')}</th>
                  <th className="px-4 py-3 text-start font-normal">{t('pg.products.onHand')}</th>
                  {canCost && <th className="px-4 py-3 text-end font-normal">{t('pg.products.cost')}</th>}
                  <th className="px-4 py-3 text-end font-normal">{t('pg.products.price')}</th>
                  {canCost && <th className="px-4 py-3 text-end font-normal">{t('pg.products.margin')}</th>}
                  <th className="px-4 py-3 text-start font-normal">{t('pg.products.expiry')}</th>
                  <th className="px-4 py-3 text-start font-normal">{t('pg.orders.status')}</th>
                  <th className="w-10 px-2 py-3"><span className="sr-only">{t('inventory.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((product) => {
                  const status = deriveStockStatus(product);
                  const marginValue = productMarginPercent(product);
                  const fill = stockFillPercent(product);
                  const expired = getExpiryStatus(product.expiryDate) === 'expired';
                  return (
                    <tr key={product.id} className={cn('border-b border-brand-100 last:border-0 dark:border-brand-800', !product.active && 'opacity-60', selected.has(product.id) && 'bg-accent-soft/40')}>
                      <td className="px-4 py-2.5">
                        <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggle(product.id)} aria-label={t('pg.products.select', { name: product.name })} className="h-4 w-4 rounded border-brand-300 accent-[rgb(var(--accent))]" />
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={product.name} muted={!product.active || status === 'out_of_stock'} />
                          <div className="min-w-0">
                            <p className="truncate text-brand-900 dark:text-white">{product.name}</p>
                            <p className="num text-[13px] text-brand-500">{product.barcode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-brand-600 dark:text-brand-300">{product.category}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="num w-10 font-semibold text-brand-900 dark:text-white">{product.stock}</span>
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-800" aria-hidden>
                            <span className={cn('block h-full rounded-full', status === 'out_of_stock' ? 'bg-transparent' : status === 'low_stock' ? 'bg-amber-500' : 'bg-accent')} style={{ width: `${status === 'low_stock' ? Math.max(fill, 6) : fill}%` }} />
                          </span>
                        </div>
                      </td>
                      {canCost && <td className="num px-4 py-2.5 text-end text-brand-600 dark:text-brand-300">{formatCurrency(product.cost)}</td>}
                      <td className="num px-4 py-2.5 text-end font-semibold text-brand-900 dark:text-white">{formatCurrency(product.salePrice || product.price)}</td>
                      {canCost && (
                        <td className={cn('num px-4 py-2.5 text-end', marginValue != null && marginValue < 0 ? 'text-red-600 dark:text-red-400' : 'text-brand-600 dark:text-brand-300')}>
                          {marginValue == null ? '—' : `${Math.round(marginValue)}%`}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-2.5 text-brand-600 dark:text-brand-300">{expiryLabel(product.expiryDate)}</td>
                      <td className="px-4 py-2.5">{statusPill(product)}</td>
                      <td className="relative px-2 py-2.5">
                        <button
                          type="button"
                          onClick={() => setMenuFor((current) => (current === product.id ? null : product.id))}
                          aria-label={t('pg.products.actionsFor', { name: product.name })}
                          aria-expanded={menuFor === product.id}
                          className="rounded-md p-1.5 text-brand-400 hover:bg-brand-100 hover:text-brand-900 focus-ring dark:hover:bg-brand-800 dark:hover:text-white"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {menuFor === product.id && (
                          <>
                            <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={() => setMenuFor(null)} />
                            <div role="menu" className="absolute end-2 top-10 z-30 w-48 animate-fade-in rounded-lg border border-brand-200 bg-white p-1 text-sm shadow-elevated dark:border-brand-700 dark:bg-brand-900">
                              <MenuItem icon={Pencil} label={t('common.edit')} onClick={() => { setMenuFor(null); openEdit(product); }} />
                              {can('stock.adjust') && (
                                <MenuItem icon={Scale} label={t('inventory.adjustStock')} onClick={() => { setMenuFor(null); setError(''); setCounted(String(product.stock)); setAdjustReason('count'); setAdjusting(product); }} />
                              )}
                              <MenuItem icon={Printer} label={t('inventory.printLabel')} onClick={() => { setMenuFor(null); setLabelProduct(product); }} />
                              {can('stock.adjust') && expired && (
                                <MenuItem icon={Ban} label={t('inventory.writeOff')} danger onClick={() => { setMenuFor(null); void writeOff(product); }} />
                              )}
                              {product.active && (
                                <MenuItem icon={Trash2} label={t('pg.products.deactivate')} danger onClick={() => { setMenuFor(null); void handleDelete(product); }} />
                              )}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingProduct ? t('inventory.editProduct') : t('inventory.addNewProduct')}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="product-form" loading={saving}>
              {editingProduct ? t('inventory.saveChanges') : t('inventory.addProduct')}
            </Button>
          </>
        }
      >
        {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
        <ProductForm product={editingProduct} onSubmit={(data) => void handleSubmit(data)} />
      </Modal>

      <Modal
        open={!!adjusting}
        onClose={() => setAdjusting(null)}
        preventClose={saving}
        title={adjusting ? t('inventory.adjustTitle', { name: adjusting.name }) : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjusting(null)}>{t('common.cancel')}</Button>
            <Button type="submit" form="adjust-form" loading={saving}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="adjust-form" onSubmit={submitAdjust} className="space-y-3">
          <Input id="adjust-counted" label={t('inventory.countedQty')} type="number" min={0} step="any" required autoFocus value={counted} onChange={(e) => setCounted(e.target.value)} />
          <Select
            id="adjust-reason"
            label={t('sales.reason')}
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            options={[
              { value: 'count', label: t('inventory.reasonCount') },
              { value: 'damage', label: t('inventory.reasonDamage') },
              { value: 'adjustment', label: t('inventory.reasonOther') },
            ]}
          />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </form>
      </Modal>

      <LabelPrintModal product={labelProduct} open={!!labelProduct} onClose={() => setLabelProduct(null)} />
    </PageShell>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start hover:bg-brand-100 dark:hover:bg-brand-800',
        danger ? 'text-red-600 dark:text-red-400' : 'text-brand-700 dark:text-brand-200',
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

