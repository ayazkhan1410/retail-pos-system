import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, AlertTriangle, Filter, X, Printer, Scale, Upload, Ban } from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Card, Button, Input, Badge, StockBadge, Modal, Select, StatStrip, confirmAction, type StatItem } from '@/components/ui';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { cn, formatCurrency } from '@/utils';
import {
  emptyInventoryFilters,
  filterProducts,
  countByStockStatus,
  deriveStockStatus,
  formatDateOnly,
  getExpiryStatus,
  productMarginPercent,
  stockFillPercent,
  type InventoryFilters,
  type StockFilter,
  type ExpiryFilter,
} from '@/utils/inventoryUtils';
import ProductForm, { type ProductFormSubmitResult } from '@/components/inventory/ProductForm';
import LabelPrintModal from '@/components/inventory/LabelPrintModal';
import { apiErrorMessage, inventoryApi } from '@/services';
import { mapProductFromApi } from '@/services/products';
import { useCan, useInventoryStore } from '@/store';
import { useTranslation } from '@/i18n';
import type { Product } from '@/types';

function getItemCode(product: Product) {
  return product.aluCode || product.sku || product.barcode;
}

function ExpiryCell({ expiryDate }: { expiryDate?: string }) {
  const status = getExpiryStatus(expiryDate);
  if (!expiryDate) return <span className="text-brand-400">—</span>;

  return (
    <div className="flex flex-col gap-1">
      <span>{formatDateOnly(expiryDate)}</span>
      {status === 'expired' && <Badge variant="danger">Expired</Badge>}
      {status === 'expiring_soon' && <Badge variant="warning">Expiring Soon</Badge>}
    </div>
  );
}

export default function InventoryPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [searchParams] = useSearchParams();
  const { products, loading, error: loadFailed, fetchProducts, addProduct, updateProduct, deleteProduct } = useInventoryStore();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [counted, setCounted] = useState('');
  const [adjustReason, setAdjustReason] = useState('count');
  const [importResult, setImportResult] = useState('');
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchProducts({ includeInactive: true });
  }, [fetchProducts]);
  const [filters, setFilters] = useState<InventoryFilters>(() => {
    const q = searchParams.get('q')?.trim() ?? '';
    return q ? { ...emptyInventoryFilters, search: q } : emptyInventoryFilters;
  });

  useEffect(() => {
    const q = searchParams.get('q')?.trim() ?? '';
    if (q) setFilters((prev) => ({ ...prev, search: q }));
  }, [searchParams]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);

  const [searchHits, setSearchHits] = useState<Product[] | null>(null);

  useEffect(() => {
    const q = filters.search.trim();
    if (q.length < 2) {
      setSearchHits(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void inventoryApi
        .searchProducts(q, { includeInactive: true, limit: 100 })
        .then(({ data }) => {
          if (!cancelled) setSearchHits(data.results.map(mapProductFromApi));
        })
        .catch(() => {
          // ES down / 503 — fall back to in-memory catalogue filter.
          if (!cancelled) setSearchHits(null);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filters.search]);

  const stats = useMemo(() => countByStockStatus(products), [products]);
  const filtered = useMemo(() => {
    const source = searchHits ?? products;
    // Elasticsearch already ranked by text; keep stock/category/expiry filters client-side.
    return filterProducts(source, searchHits ? { ...filters, search: '' } : filters);
  }, [filters, products, searchHits]);
  const ROW_CHUNK = 50;
  const [visibleRows, setVisibleRows] = useState(ROW_CHUNK);
  useEffect(() => {
    setVisibleRows(ROW_CHUNK);
  }, [filters, products.length]);
  const visibleProducts = useMemo(() => filtered.slice(0, visibleRows), [filtered, visibleRows]);
  const hasMoreRows = visibleRows < filtered.length;
  const revealMoreRows = useCallback(() => {
    if (!hasMoreRows) return;
    setVisibleRows((count) => Math.min(count + ROW_CHUNK, filtered.length));
  }, [hasMoreRows, filtered.length]);
  const rowSentinelRef = useInfiniteScroll(hasMoreRows, revealMoreRows);
  const categories = useMemo(
    () => ['all', ...Array.from(new Set(products.map((p) => p.category)))],
    [products],
  );

  const setFilter = <K extends keyof InventoryFilters>(key: K, value: InventoryFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => setFilters(emptyInventoryFilters);

  const hasActiveFilters =
    filters.search ||
    filters.stockStatus !== 'all' ||
    filters.expiryFilter !== 'all' ||
    filters.activity !== 'active' ||
    filters.category !== 'all' ||
    filters.expiryFrom ||
    filters.expiryTo;

  const applyStockQuickFilter = (status: StockFilter) => {
    setFilters((prev) => ({
      ...prev,
      activity: 'active',
      stockStatus: prev.stockStatus === status && prev.activity === 'active' ? 'all' : status,
      expiryFilter: 'all',
    }));
  };

  const applyExpiryQuickFilter = (expiry: ExpiryFilter) => {
    setFilters((prev) => ({
      ...prev,
      activity: 'active',
      expiryFilter: prev.expiryFilter === expiry && prev.activity === 'active' ? 'all' : expiry,
      stockStatus: 'all',
    }));
  };

  const applyInactiveQuickFilter = () => {
    setFilters((prev) => ({
      ...emptyInventoryFilters,
      activity: prev.activity === 'inactive' ? 'active' : 'inactive',
    }));
  };

  const handleSubmit = async (data: ProductFormSubmitResult) => {
    const { shouldPrintLabel, ...productData } = data;
    setSaving(true);
    setError('');
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, productData);
      } else {
        const newProduct = await addProduct(productData);
        if (shouldPrintLabel) {
          setLabelProduct(newProduct);
          setLabelModalOpen(true);
        }
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
      await fetchProducts();
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
      await fetchProducts();
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
      await fetchProducts();
    } catch (err) {
      setError(apiErrorMessage(err, t('inventory.saveError')));
    }
    if (importInput.current) importInput.current.value = '';
  };

  const openLabelPrint = (product: Product) => {
    setLabelProduct(product);
    setLabelModalOpen(true);
  };

  const statCards: StatItem[] = [
    {
      key: 'total',
      label: t('inventory.totalProducts'),
      value: stats.total,
      onClick: () => clearFilters(),
      active: filters.activity === 'active' && filters.stockStatus === 'all' && filters.expiryFilter === 'all' && !filters.search && filters.category === 'all',
    },
    { key: 'low', label: t('inventory.lowStock'), value: stats.low_stock, tone: stats.low_stock ? 'warn' : 'default', onClick: () => applyStockQuickFilter('low_stock'), active: filters.activity === 'active' && filters.stockStatus === 'low_stock' },
    { key: 'out', label: t('inventory.outOfStock'), value: stats.out_of_stock, tone: stats.out_of_stock ? 'danger' : 'default', onClick: () => applyStockQuickFilter('out_of_stock'), active: filters.activity === 'active' && filters.stockStatus === 'out_of_stock' },
    { key: 'expiring', label: t('inventory.expiringSoon'), value: stats.expiringSoon, tone: stats.expiringSoon ? 'warn' : 'default', onClick: () => applyExpiryQuickFilter('expiring_soon'), active: filters.activity === 'active' && filters.expiryFilter === 'expiring_soon' },
    { key: 'expired', label: t('inventory.expired'), value: stats.expired, tone: stats.expired ? 'danger' : 'default', onClick: () => applyExpiryQuickFilter('expired'), active: filters.activity === 'active' && filters.expiryFilter === 'expired' },
    { key: 'inactive', label: t('inventory.inactive'), value: stats.inactive, onClick: applyInactiveQuickFilter, active: filters.activity === 'inactive' },
  ];

  return (
    <>
      <Header
        title={t('inventory.title')}
        subtitle={t('inventory.subtitle', { total: stats.total, low: stats.low_stock, out: stats.out_of_stock })}
        actions={
          <>
          <input ref={importInput} type="file" accept=".csv,text/csv" className="hidden" aria-label={t('inventory.importCsv')} onChange={(e) => void importCsv(e.target.files?.[0])} />
          <Button variant="outline" size="sm" title={t('inventory.importHint')} onClick={() => importInput.current?.click()}>
            <Upload className="h-4 w-4" /> {t('inventory.importCsv')}
          </Button>
          <Button variant="accent" size="sm" onClick={() => { setError(''); setEditingProduct(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4" /> {t('inventory.addProduct')}
          </Button>
          </>
        }
      />

      <main className="page-bg flex-1 overflow-y-auto p-4 sm:p-6">
        {(loadFailed || (error && !modalOpen && !adjusting)) && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error || t('inventory.loadError')}
          </p>
        )}
        {importResult && <p role="status" className="mb-4 rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm dark:border-brand-700 dark:bg-brand-900">{importResult}</p>}
        <StatStrip className="mb-6" items={statCards} />

        <Card padding="none" hover>
          <div className="space-y-4 border-b border-brand-100 p-4 dark:border-brand-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-200">
                <Filter className="h-4 w-4" />
                {t('inventory.filters')}
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" /> {t('inventory.clearFilters')}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label={t('inventory.search')}
                placeholder={t('inventory.searchPlaceholder')}
                value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)}
                icon={<Search className="h-4 w-4" />}
              />
              <Select
                label={t('inventory.stockStatus')}
                value={filters.stockStatus}
                onChange={(e) => setFilter('stockStatus', e.target.value as StockFilter)}
                options={[
                  { value: 'all', label: t('inventory.allStock') },
                  { value: 'in_stock', label: t('inventory.inStock') },
                  { value: 'low_stock', label: t('inventory.lowStock') },
                  { value: 'out_of_stock', label: t('inventory.outOfStock') },
                ]}
              />
              <Select
                label={t('inventory.expiryStatus')}
                value={filters.expiryFilter}
                onChange={(e) => setFilter('expiryFilter', e.target.value as ExpiryFilter)}
                options={[
                  { value: 'all', label: t('inventory.allExpiry') },
                  { value: 'expiring_soon', label: t('inventory.expiringSoon') },
                  { value: 'expired', label: t('inventory.expired') },
                  { value: 'no_expiry', label: t('inventory.noExpiry') },
                ]}
              />
              <Select
                label={t('inventory.category')}
                value={filters.category}
                onChange={(e) => setFilter('category', e.target.value)}
                options={categories.map((c) => ({
                  value: c,
                  label: c === 'all' ? t('inventory.allCategories') : c,
                }))}
              />
              <Input
                label={t('inventory.expiryFrom')}
                type="date"
                value={filters.expiryFrom}
                onChange={(e) => setFilter('expiryFrom', e.target.value)}
              />
              <Input
                label={t('inventory.expiryTo')}
                type="date"
                value={filters.expiryTo}
                onChange={(e) => setFilter('expiryTo', e.target.value)}
              />
            </div>

            <p className="text-xs text-brand-500">
              {t('inventory.showingResults', { count: filtered.length, total: products.length })}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr className="text-start">
                  <th>{t('inventory.itemCode')}</th>
                  <th>{t('inventory.itemDescription')}</th>
                  <th className="text-end">{t('inventory.qtyOnHand')}</th>
                  {can('products.view_cost') && <th className="text-end">{t('inventory.cost')}</th>}
                  <th className="text-end">{t('inventory.rate')}</th>
                  {can('products.view_cost') && <th className="text-end">{t('inventory.margin')}</th>}
                  <th>{t('inventory.category')}</th>
                  <th>{t('inventory.expiryDate')}</th>
                  <th>{t('inventory.status')}</th>
                  <th className="w-px"><span className="sr-only">{t('inventory.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.map((product) => {
                  const status = deriveStockStatus(product);
                  const margin = productMarginPercent(product);
                  const fill = stockFillPercent(product);
                  return (
                    <tr key={product.id} className={cn(!product.active && 'opacity-60')}>
                      <td className="num whitespace-nowrap text-xs text-brand-500 dark:text-brand-400">{getItemCode(product)}</td>
                      <td className="min-w-[11rem] font-medium">
                        {product.name}
                        {!product.active && (
                          <span className="ms-2 text-xs font-normal text-brand-400">{t('inventory.inactive')}</span>
                        )}
                      </td>
                      <td className="min-w-[5.5rem] text-end">
                        <p className="font-semibold tabular-nums">{product.stock}</p>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-800" aria-hidden>
                          <span
                            className={cn(
                              'block h-full rounded-full',
                              status === 'out_of_stock' ? 'bg-red-500' : status === 'low_stock' ? 'bg-amber-500' : 'bg-emerald-500',
                            )}
                            style={{ width: `${fill}%` }}
                          />
                        </span>
                      </td>
                      {can('products.view_cost') && <td className="num whitespace-nowrap text-end text-brand-500">{formatCurrency(product.cost)}</td>}
                      <td className="num whitespace-nowrap text-end font-semibold">{formatCurrency(product.salePrice || product.price)}</td>
                      {can('products.view_cost') && (
                        <td className={cn('num whitespace-nowrap text-end font-semibold', margin != null && margin < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
                          {margin == null ? '—' : `${margin}%`}
                        </td>
                      )}
                      <td><Badge>{product.category}</Badge></td>
                      <td className="whitespace-nowrap"><ExpiryCell expiryDate={product.expiryDate} /></td>
                      <td>{product.active ? <StockBadge status={status} /> : <Badge>{t('inventory.inactive')}</Badge>}</td>
                      <td>
                        <div className="flex justify-end gap-0.5">
                          {can('stock.adjust') && (
                            <Button variant="ghost" size="sm" iconOnly aria-label={t('inventory.adjustStock')} title={t('inventory.adjustStock')} onClick={() => { setError(''); setCounted(String(product.stock)); setAdjustReason('count'); setAdjusting(product); }}>
                              <Scale className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {can('stock.adjust') && getExpiryStatus(product.expiryDate) === 'expired' && (
                            <Button variant="ghost" size="sm" iconOnly aria-label={t('inventory.writeOff')} title={t('inventory.writeOff')} className="text-red-500" onClick={() => void writeOff(product)}>
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" iconOnly onClick={() => openLabelPrint(product)} title={t('inventory.printLabel')} aria-label={t('inventory.printLabel')}>
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" iconOnly aria-label={t('common.edit')} title={t('common.edit')} onClick={() => { setError(''); setEditingProduct(product); setModalOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" iconOnly aria-label={t('common.delete')} title={t('common.delete')} onClick={() => void handleDelete(product)} className="text-red-500 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {loading && <p className="py-16 text-center text-sm text-brand-500">{t('common.loading')}</p>}
            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center py-16 text-center">
                <AlertTriangle className="mb-3 h-10 w-10 text-brand-300" />
                <p className="font-medium">{t('inventory.noResults')}</p>
                {hasActiveFilters && (
                  <Button variant="accent" size="sm" className="mt-4" onClick={clearFilters}>
                    {t('inventory.clearFilters')}
                  </Button>
                )}
              </div>
            )}
            <div ref={rowSentinelRef} className="h-8" aria-hidden />
            {hasMoreRows && (
              <p className="px-4 py-2 text-center text-xs text-brand-400">
                {t('inventory.showingResults', { count: visibleProducts.length, total: filtered.length })}
              </p>
            )}
          </div>
        </Card>
      </main>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingProduct ? t('inventory.editProduct') : t('inventory.addNewProduct')}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="accent" type="submit" form="product-form" loading={saving}>
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
            <Button variant="accent" type="submit" form="adjust-form" loading={saving}>{t('common.save')}</Button>
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

      <LabelPrintModal
        product={labelProduct}
        open={labelModalOpen}
        onClose={() => {
          setLabelModalOpen(false);
          setLabelProduct(null);
        }}
      />
    </>
  );
}
