import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Building2,
} from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Card, Button, Input, Badge, Modal } from '@/components/ui';
import SupplierForm from '@/components/suppliers/SupplierForm';
import { apiErrorMessage } from '@/services';
import { suppliersApi } from '@/services/endpoints';
import { useTranslation } from '@/i18n';
import { useCan } from '@/store';
import { mapSupplierFromApi, mapSupplierToApi } from '@/services/suppliers';
import { formatCurrency } from '@/utils';
import type { Supplier } from '@/types';
import type { SupplierFormData } from '@/store';

const PAGE_SIZE = 20;

export default function SuppliersPage() {
  const { t } = useTranslation();
  const can = useCan();
  const mainRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadActiveCount = useCallback(async (searchTerm: string) => {
    try {
      const activeRes = await suppliersApi.getAll({
        page: 1,
        page_size: 1,
        status: 'active',
        search: searchTerm || undefined,
      });
      setActiveCount(activeRes.data.count);
    } catch {
      setActiveCount(0);
    }
  }, []);

  const loadPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setInitialLoading(true);
      setError(null);

      try {
        const listRes = await suppliersApi.getAll({
          page: pageNum,
          page_size: PAGE_SIZE,
          search: debouncedSearch || undefined,
          ordering: '-created_at',
        });

        const mapped = listRes.data.results.map(mapSupplierFromApi);
        setSuppliers((prev) => (append ? [...prev, ...mapped] : mapped));
        setTotalCount(listRes.data.count);
        setHasMore(pageNum * PAGE_SIZE < listRes.data.count);

        if (!append) {
          await loadActiveCount(debouncedSearch);
        }
      } catch {
        setError('Failed to load suppliers. Please try again.');
        if (!append) {
          setSuppliers([]);
          setTotalCount(0);
          setActiveCount(0);
        }
        setHasMore(false);
      } finally {
        setInitialLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch, loadActiveCount],
  );

  useEffect(() => {
    setPage(1);
    void loadPage(1, false);
  }, [debouncedSearch, loadPage]);

  useEffect(() => {
    if (page === 1) return;
    void loadPage(page, true);
  }, [page, loadPage]);

  useEffect(() => {
    const root = mainRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasMore || initialLoading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setPage((current) => current + 1);
        }
      },
      { root, rootMargin: '160px', threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, initialLoading, loadingMore, suppliers.length]);

  const reloadFromStart = () => {
    setSuppliers([]);
    setHasMore(true);
    setPage(1);
    void loadPage(1, false);
  };

  const openAdd = () => {
    setEditingSupplier(null);
    setModalOpen(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setModalOpen(true);
  };

  const openView = (supplier: Supplier) => {
    setViewingSupplier(supplier);
    setViewModalOpen(true);
  };

  const handleSubmit = async (data: SupplierFormData) => {
    setSaving(true);
    setError(null);
    try {
      const payload = mapSupplierToApi(data);
      if (editingSupplier) {
        await suppliersApi.update(editingSupplier.id, payload);
      } else {
        await suppliersApi.create(payload);
      }
      setModalOpen(false);
      setEditingSupplier(null);
      reloadFromStart();
    } catch (err) {
      setError(apiErrorMessage(err, editingSupplier ? 'Failed to update supplier.' : 'Failed to create supplier.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    if (!window.confirm(`Delete supplier "${supplier.name}"?`)) return;
    setError(null);
    try {
      await suppliersApi.delete(supplier.id);
      reloadFromStart();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to delete supplier.'));
    }
  };

  return (
    <>
      <Header
        title={t('suppliers.title')}
        subtitle={t('suppliers.subtitle', { total: totalCount, active: activeCount })}
        actions={can('suppliers.edit') && (
          <Button variant="accent" size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" /> {t('suppliers.addSupplier')}
          </Button>
        )}
      />

      <main ref={mainRef} className="page-bg flex-1 overflow-y-auto p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Card hover className="flex items-center gap-3" padding="sm">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
              <Building2 className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-xs text-brand-500">{t('suppliers.totalSuppliers')}</p>
              <p className="font-display text-xl font-bold">{totalCount}</p>
            </div>
          </Card>
          <Card hover padding="sm">
            <p className="text-xs text-brand-500">{t('suppliers.activeSuppliers')}</p>
            <p className="font-display text-xl font-bold text-emerald-600">{activeCount}</p>
          </Card>
        </div>

        <Card padding="none" hover>
          <div className="border-b border-brand-100 p-3 dark:border-brand-800">
            <div className="max-w-sm">
              <Input
                placeholder={t('suppliers.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search className="h-4 w-4" />}
              />
            </div>
          </div>

          {initialLoading ? (
            <div className="py-10 text-center text-sm text-brand-500">{t('common.loading')}</div>
          ) : suppliers.length === 0 ? (
            <div className="py-10 text-center">
              <Building2 className="mx-auto h-10 w-10 text-brand-300" />
              <p className="mt-2 text-sm font-medium">{t('suppliers.noSuppliers')}</p>
              {can('suppliers.edit') && (
                <Button variant="accent" size="sm" className="mt-3" onClick={openAdd}>
                  <Plus className="h-4 w-4" /> {t('suppliers.addFirst')}
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-brand-100 dark:divide-brand-800">
              {suppliers.map((supplier) => (
                <div
                  key={supplier.id}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-brand-50/60 dark:hover:bg-brand-800/30"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                    <Building2 className="h-4 w-4 text-accent" />
                  </div>

                  <div
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => openView(supplier)}
                    onKeyDown={(e) => e.key === 'Enter' && openView(supplier)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold hover:text-accent">
                        {supplier.name}
                      </h3>
                      <Badge variant={supplier.status === 'active' ? 'success' : 'default'}>
                        {supplier.status}
                      </Badge>
                    </div>
                  </div>

                  {can('suppliers.edit') && <div className="flex shrink-0 gap-0.5">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(supplier)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                      onClick={() => void handleDelete(supplier)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>}
                </div>
              ))}
            </div>
          )}

          <div ref={sentinelRef} className="h-1" />

          {loadingMore && (
            <div className="border-t border-brand-100 py-3 text-center text-xs text-brand-500 dark:border-brand-800">
              Loading more…
            </div>
          )}

          {!initialLoading && suppliers.length > 0 && !hasMore && (
            <div className="border-t border-brand-100 py-2 text-center text-xs text-brand-400 dark:border-brand-800">
              All {totalCount} suppliers loaded
            </div>
          )}
        </Card>
      </main>

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editingSupplier ? t('suppliers.editSupplier') : t('suppliers.addNewSupplier')}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button variant="accent" type="submit" form="supplier-form" disabled={saving}>
              {saving ? t('common.loading') : editingSupplier ? t('inventory.saveChanges') : t('suppliers.addSupplier')}
            </Button>
          </>
        }
      >
        <SupplierForm supplier={editingSupplier} onSubmit={handleSubmit} />
      </Modal>

      <Modal
        open={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        title={t('suppliers.supplierDetails')}
        size="lg"
        footer={
          <>
            {can('purchases.edit') && (
              <Link to="/purchases">
                <Button variant="accent" size="sm">{t('suppliers.createPurchase')}</Button>
              </Link>
            )}
            <Button variant="outline" onClick={() => setViewModalOpen(false)}>{t('common.close')}</Button>
          </>
        }
      >
        {viewingSupplier && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: t('suppliers.companyName'), value: viewingSupplier.name },
              { label: t('suppliers.contactPerson'), value: viewingSupplier.contactPerson || '—' },
              { label: t('suppliers.phone'), value: viewingSupplier.phone || '—' },
              { label: t('suppliers.email'), value: viewingSupplier.email || '—' },
              { label: t('suppliers.city'), value: viewingSupplier.city || '—' },
              { label: t('suppliers.ntn'), value: viewingSupplier.ntn || '—' },
              { label: t('suppliers.address'), value: viewingSupplier.address || '—', full: true },
              { label: t('suppliers.bankAccount'), value: viewingSupplier.bankAccount || '—', full: true },
              { label: 'Payment Type', value: viewingSupplier.paymentType === 'credit' ? 'Credit' : 'Cash' },
              { label: 'Current Balance', value: formatCurrency(viewingSupplier.currentBalance) },
              { label: 'Status', value: viewingSupplier.status },
            ].map((item) => (
              <div key={item.label} className={item.full ? 'sm:col-span-2' : ''}>
                <p className="text-xs font-medium text-brand-500">{item.label}</p>
                <p className="mt-1 font-medium">{item.value}</p>
              </div>
            ))}
            {viewingSupplier.notes && (
              <div className="sm:col-span-2 rounded-xl bg-brand-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs font-medium text-brand-500">{t('suppliers.notes')}</p>
                <p className="mt-1 text-sm">{viewingSupplier.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
