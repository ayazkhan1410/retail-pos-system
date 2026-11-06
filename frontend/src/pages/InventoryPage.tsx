import { useEffect, useRef, useState, useMemo } from 'react';
import { Plus, Search, Pencil, Trash2, Package, AlertTriangle, Filter, X, Printer, Scale, Upload, Ban } from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Card, Button, Input, Badge, StockBadge, Modal, Select } from '@/components/ui';
import { formatCurrency, cn } from '@/utils';
import {
  emptyInventoryFilters,
  filterProducts,
  countByStockStatus,
  deriveStockStatus,
  formatDateOnly,
  getExpiryStatus,
  type InventoryFilters,
  type StockFilter,
  type ExpiryFilter,
} from '@/utils/inventoryUtils';
import ProductForm, { type ProductFormSubmitResult } from '@/components/inventory/ProductForm';
import LabelPrintModal from '@/components/inventory/LabelPrintModal';
import { apiErrorMessage, inventoryApi } from '@/services';
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
  const { products, loading, error: loadFailed, fetchProducts, addProduct, updateProduct, deleteProduct } = useInventoryStore();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [counted, setCounted] = useState('');
  const [adjustReason, setAdjustReason] = useState('count');
  const [importResult, setImportResult] = useState('');
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);
  const [filters, setFilters] = useState<InventoryFilters>(emptyInventoryFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);

  const stats = useMemo(() => countByStockStatus(products), [products]);
  const filtered = useMemo(() => filterProducts(products, filters), [products, filters]);
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
    filters.category !== 'all' ||
    filters.expiryFrom ||
    filters.expiryTo;

  const applyStockQuickFilter = (status: StockFilter) => {
    setFilters((prev) => ({
      ...prev,
      stockStatus: prev.stockStatus === status ? 'all' : status,
      expiryFilter: 'all',
    }));
  };

  const applyExpiryQuickFilter = (expiry: ExpiryFilter) => {
    setFilters((prev) => ({
      ...prev,
      expiryFilter: prev.expiryFilter === expiry ? 'all' : expiry,
      stockStatus: 'all',
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
    if (!window.confirm(t('inventory.confirmDelete', { name: product.name }))) return;
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
    if (!window.confirm(t('inventory.confirmWriteOff', { name: product.name }))) return;
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

  const statCards = [
    { key: 'total', label: t('inventory.totalProducts'), value: stats.total, icon: Package, onClick: () => clearFilters() },
    { key: 'low', label: t('inventory.lowStock'), value: stats.low_stock, color: 'text-amber-600', onClick: () => applyStockQuickFilter('low_stock') },
    { key: 'out', label: t('inventory.outOfStock'), value: stats.out_of_stock, color: 'text-red-600', onClick: () => applyStockQuickFilter('out_of_stock') },
    { key: 'expiring', label: t('inventory.expiringSoon'), value: stats.expiringSoon, color: 'text-orange-600', onClick: () => applyExpiryQuickFilter('expiring_soon') },
    { key: 'expired', label: t('inventory.expired'), value: stats.expired, color: 'text-red-700', onClick: () => applyExpiryQuickFilter('expired') },
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
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {statCards.map((s) => (
            <button key={s.key} type="button" onClick={s.onClick} className="text-left">
              <Card
                padding="sm"
                hover
                className={cn(
                  'flex items-center gap-4 transition-all',
                  (s.key === 'low' && filters.stockStatus === 'low_stock') ||
                  (s.key === 'out' && filters.stockStatus === 'out_of_stock') ||
                  (s.key === 'expiring' && filters.expiryFilter === 'expiring_soon') ||
                  (s.key === 'expired' && filters.expiryFilter === 'expired')
                    ? 'ring-2 ring-accent/40'
                    : '',
                )}
              >
                {'icon' in s && s.icon && (
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
                    <s.icon className="h-5 w-5 text-accent" />
                  </div>
                )}
                <div>
                  <p className="text-sm text-brand-500">{s.label}</p>
                  <p className={cn('font-display text-2xl font-bold', s.color)}>{s.value}</p>
                </div>
              </Card>
            </button>
          ))}
        </div>

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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50/50 text-left text-xs font-semibold uppercase tracking-wider text-brand-500 dark:border-brand-800 dark:bg-brand-800/30">
                  <th className="px-4 py-3 sm:px-6">{t('inventory.itemCode')}</th>
                  <th className="px-4 py-3 sm:px-6">{t('inventory.itemDescription')}</th>
                  <th className="px-4 py-3 text-right sm:px-6">{t('inventory.qtyOnHand')}</th>
                  {can('products.view_cost') && <th className="px-4 py-3 text-right sm:px-6">{t('inventory.cost')}</th>}
                  <th className="px-4 py-3 text-right sm:px-6">{t('inventory.rate')}</th>
                  <th className="px-4 py-3 sm:px-6">{t('inventory.category')}</th>
                  <th className="px-4 py-3 sm:px-6">{t('inventory.expiryDate')}</th>
                  <th className="px-4 py-3 sm:px-6">{t('inventory.status')}</th>
                  <th className="w-20 px-4 py-3 sm:px-6" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const status = deriveStockStatus(product);
                  return (
                    <tr
                      key={product.id}
                      className="border-b border-brand-50 transition-colors hover:bg-brand-50/80 dark:border-brand-800/40 dark:hover:bg-brand-800/20"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-medium sm:px-6">{getItemCode(product)}</td>
                      <td className="px-4 py-3 font-medium sm:px-6">{product.name}</td>
                      <td className="px-4 py-3 text-right font-semibold sm:px-6">{product.stock}</td>
                      {can('products.view_cost') && <td className="px-4 py-3 text-right text-brand-500 sm:px-6">{formatCurrency(product.cost)}</td>}
                      <td className="px-4 py-3 text-right font-semibold sm:px-6">{formatCurrency(product.price)}</td>
                      <td className="px-4 py-3 sm:px-6"><Badge>{product.category}</Badge></td>
                      <td className="px-4 py-3 sm:px-6"><ExpiryCell expiryDate={product.expiryDate} /></td>
                      <td className="px-4 py-3 sm:px-6"><StockBadge status={status} /></td>
                      <td className="px-4 py-3 sm:px-6">
                        <div className="flex gap-1">
                          {can('stock.adjust') && (
                            <Button variant="ghost" size="sm" aria-label={t('inventory.adjustStock')} title={t('inventory.adjustStock')} onClick={() => { setError(''); setCounted(String(product.stock)); setAdjustReason('count'); setAdjusting(product); }}>
                              <Scale className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {can('stock.adjust') && getExpiryStatus(product.expiryDate) === 'expired' && (
                            <Button variant="ghost" size="sm" aria-label={t('inventory.writeOff')} title={t('inventory.writeOff')} className="text-red-500" onClick={() => void writeOff(product)}>
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => openLabelPrint(product)} title={t('inventory.printLabel')}>
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setError(''); setEditingProduct(product); setModalOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => void handleDelete(product)} className="text-red-500 hover:text-red-600">
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
