import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Building2,
  Phone,
  Mail,
  MapPin,
  Eye,
} from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Card, Button, Input, Badge, Modal } from '@/components/ui';
import SupplierForm from '@/components/suppliers/SupplierForm';
import { useSupplierStore } from '@/store';
import { formatCurrency } from '@/utils';
import type { Supplier } from '@/types';

export default function SuppliersPage() {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = useSupplierStore();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);

  const filtered = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
      s.city.toLowerCase().includes(search.toLowerCase()) ||
      s.phone.includes(search),
  );

  const activeCount = suppliers.filter((s) => s.status === 'active').length;

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

  const handleSubmit = (data: Parameters<typeof addSupplier>[0]) => {
    if (editingSupplier) {
      updateSupplier(editingSupplier.id, data);
    } else {
      addSupplier(data);
    }
    setModalOpen(false);
    setEditingSupplier(null);
  };

  return (
    <>
      <Header
        title="Suppliers"
        subtitle={`${suppliers.length} suppliers · ${activeCount} active`}
        actions={
          <Button variant="accent" size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Supplier
          </Button>
        }
      />

      <main className="page-bg flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card hover className="flex items-center gap-4" padding="sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
              <Building2 className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-brand-500">Total Suppliers</p>
              <p className="font-display text-2xl font-bold">{suppliers.length}</p>
            </div>
          </Card>
          <Card hover padding="sm">
            <p className="text-sm text-brand-500">Active Suppliers</p>
            <p className="font-display text-2xl font-bold text-emerald-600">{activeCount}</p>
          </Card>
          <Card hover padding="sm">
            <p className="text-sm text-brand-500">Total Purchases</p>
            <p className="font-display text-2xl font-bold">
              {formatCurrency(suppliers.reduce((sum, s) => sum + s.totalPurchases, 0))}
            </p>
          </Card>
        </div>

        <Card padding="none" hover>
          <div className="border-b border-brand-100 p-4 dark:border-brand-800">
            <div className="max-w-md">
              <Input
                placeholder="Search by name, contact, city, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search className="h-4 w-4" />}
              />
            </div>
          </div>

          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((supplier) => (
              <div
                key={supplier.id}
                className="group rounded-2xl border border-brand-100 bg-brand-50/30 p-5 transition-all hover:border-accent/30 hover:shadow-card dark:border-brand-800 dark:bg-brand-800/20"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-accent/5">
                    <Building2 className="h-6 w-6 text-accent" />
                  </div>
                  <Badge variant={supplier.status === 'active' ? 'success' : 'default'}>
                    {supplier.status}
                  </Badge>
                </div>

                <h3 className="mt-4 font-display text-lg font-bold">{supplier.name}</h3>
                <p className="text-sm text-brand-500">{supplier.contactPerson}</p>

                <div className="mt-4 space-y-2 text-sm text-brand-600 dark:text-brand-400">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span>{supplier.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{supplier.email || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{supplier.city}</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-brand-100 pt-4 dark:border-brand-800">
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-brand-500">Payment Type</p>
                      <Badge variant={supplier.paymentType === 'credit' ? 'warning' : 'default'}>
                        {supplier.paymentType === 'credit' ? 'Credit' : 'Cash'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-brand-500">Current Balance</p>
                      <p className="font-semibold text-accent">{formatCurrency(supplier.currentBalance)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-brand-500">Total Purchases</p>
                      <p className="font-semibold">{formatCurrency(supplier.totalPurchases)}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openView(supplier)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(supplier)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSupplier(supplier.id)}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <Building2 className="mx-auto h-12 w-12 text-brand-300" />
              <p className="mt-3 font-medium">No suppliers found</p>
              <Button variant="accent" size="sm" className="mt-4" onClick={openAdd}>
                <Plus className="h-4 w-4" /> Add First Supplier
              </Button>
            </div>
          )}
        </Card>
      </main>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="accent" type="submit" form="supplier-form">
              {editingSupplier ? 'Save Changes' : 'Add Supplier'}
            </Button>
          </>
        }
      >
        <SupplierForm supplier={editingSupplier} onSubmit={handleSubmit} />
      </Modal>

      <Modal
        open={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        title="Supplier Details"
        size="lg"
        footer={
          <>
            <Link to="/purchases">
              <Button variant="accent" size="sm">Create Purchase</Button>
            </Link>
            <Button variant="outline" onClick={() => setViewModalOpen(false)}>Close</Button>
          </>
        }
      >
        {viewingSupplier && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: 'Company Name', value: viewingSupplier.name },
              { label: 'Contact Person', value: viewingSupplier.contactPerson },
              { label: 'Phone', value: viewingSupplier.phone },
              { label: 'Email', value: viewingSupplier.email || '—' },
              { label: 'City', value: viewingSupplier.city },
              { label: 'NTN / STRN', value: viewingSupplier.ntn || '—' },
              { label: 'Address', value: viewingSupplier.address, full: true },
              { label: 'Bank Account', value: viewingSupplier.bankAccount || '—', full: true },
              { label: 'Payment Type', value: viewingSupplier.paymentType === 'credit' ? 'Credit' : 'Cash' },
              { label: 'Current Balance', value: formatCurrency(viewingSupplier.currentBalance) },
              { label: 'Total Purchases', value: formatCurrency(viewingSupplier.totalPurchases) },
              { label: 'Status', value: viewingSupplier.status },
            ].map((item) => (
              <div key={item.label} className={item.full ? 'sm:col-span-2' : ''}>
                <p className="text-xs font-medium text-brand-500">{item.label}</p>
                <p className="mt-1 font-medium">{item.value}</p>
              </div>
            ))}
            {viewingSupplier.notes && (
              <div className="sm:col-span-2 rounded-xl bg-brand-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs font-medium text-brand-500">Notes</p>
                <p className="mt-1 text-sm">{viewingSupplier.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
