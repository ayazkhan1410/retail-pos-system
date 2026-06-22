import { useState } from 'react';
import { Search, Download, Eye, Receipt } from 'lucide-react';
import { Header } from '@/layouts/DashboardLayout';
import { Card, Button, Input, Select, Badge } from '@/components/ui';
import { MOCK_INVOICES } from '@/utils/mockData';
import { formatCurrency, formatDate } from '@/utils';

export default function SalesPage() {
  const [search, setSearch] = useState('');
  const [counterFilter, setCounterFilter] = useState('all');

  const filtered = MOCK_INVOICES.filter((inv) => {
    const matchSearch = inv.invoiceNo.toLowerCase().includes(search.toLowerCase()) || inv.counterName.toLowerCase().includes(search.toLowerCase());
    const matchCounter = counterFilter === 'all' || inv.counterId === counterFilter;
    return matchSearch && matchCounter;
  });

  const totalRevenue = filtered.reduce((sum, inv) => sum + inv.total, 0);

  return (
    <>
      <Header
        title="Sales"
        subtitle="Invoice history aur counter-wise analytics"
        actions={
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />

      <main className="page-bg flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Total Revenue', value: formatCurrency(totalRevenue), sub: 'PKR' },
            { label: 'Invoices', value: String(filtered.length), sub: 'completed' },
            { label: 'Avg. Bill', value: filtered.length > 0 ? formatCurrency(totalRevenue / filtered.length) : 'Rs. 0', sub: 'per invoice' },
          ].map((s) => (
            <Card key={s.label} hover className="relative overflow-hidden">
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-accent/5" />
              <p className="text-sm text-brand-500">{s.label}</p>
              <p className="mt-1 font-display text-2xl font-bold">{s.value}</p>
              <p className="mt-0.5 text-xs text-brand-400">{s.sub}</p>
            </Card>
          ))}
        </div>

        <Card padding="none" hover>
          <div className="flex flex-wrap items-center gap-3 border-b border-brand-100 p-4 dark:border-brand-800">
            <div className="min-w-[200px] flex-1">
              <Input placeholder="Invoice search..." value={search} onChange={(e) => setSearch(e.target.value)} icon={<Search className="h-4 w-4" />} />
            </div>
            <Select
              value={counterFilter}
              onChange={(e) => setCounterFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Counters' },
                { value: '1', label: 'Counter 1' },
                { value: '2', label: 'Counter 2' },
              ]}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50/50 text-left text-xs font-semibold uppercase tracking-wider text-brand-500 dark:border-brand-800 dark:bg-brand-800/30">
                  <th className="px-6 py-4">Invoice</th>
                  <th className="px-6 py-4">Counter</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Items</th>
                  <th className="px-6 py-4 text-right">Total (PKR)</th>
                  <th className="px-6 py-4">Payment</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-brand-50 transition-colors hover:bg-brand-50/80 dark:border-brand-800/40 dark:hover:bg-brand-800/20">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-brand-400" />
                        <span className="font-mono text-xs font-semibold">{invoice.invoiceNo}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4"><Badge>{invoice.counterName}</Badge></td>
                    <td className="px-6 py-4 text-brand-500">{formatDate(invoice.createdAt)}</td>
                    <td className="px-6 py-4 text-right">{invoice.items}</td>
                    <td className="px-6 py-4 text-right font-bold">{formatCurrency(invoice.total)}</td>
                    <td className="px-6 py-4"><Badge variant="info">{invoice.paymentMethod}</Badge></td>
                    <td className="px-6 py-4"><Badge variant="success">{invoice.status}</Badge></td>
                    <td className="px-6 py-4">
                      <Button variant="ghost" size="sm"><Eye className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </>
  );
}
