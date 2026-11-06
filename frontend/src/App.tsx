import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useTheme, useLanguage } from '@/hooks';
import DashboardLayout from '@/layouts/DashboardLayout';
import POSLayout from '@/layouts/POSLayout';
import LoginPage from '@/pages/LoginPage';
import POSPage from '@/pages/POSPage';
import { setSessionExpiredHandler } from '@/services';
import { homePath, useAuthStore } from '@/store';

// The till loads immediately; back-office pages and their charts load on demand.
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const InventoryPage = lazy(() => import('@/pages/InventoryPage'));
const PurchasesPage = lazy(() => import('@/pages/PurchasesPage'));
const SuppliersPage = lazy(() => import('@/pages/SuppliersPage'));
const SalesPage = lazy(() => import('@/pages/SalesPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const CustomersPage = lazy(() => import('@/pages/CustomersPage'));
const ExpensesPage = lazy(() => import('@/pages/ExpensesPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const InsightsPage = lazy(() => import('@/pages/InsightsPage'));

function Requires({ permission }: { permission: string }) {
  const user = useAuthStore((state) => state.user);
  return user?.permissions.includes(permission) ? <Outlet /> : <Navigate to={homePath(user)} replace />;
}

function Spinner() {
  return (
    <div className="flex h-[100dvh] flex-1 items-center justify-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

export default function App() {
  useTheme();
  useLanguage();
  const { user, loading, load, clear } = useAuthStore();

  useEffect(() => {
    setSessionExpiredHandler(clear);
    void load();
  }, [clear, load]);

  if (loading) return <Spinner />;
  if (!user) return <LoginPage />;

  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route element={<Requires permission="dashboard.view" />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
          <Route element={<Requires permission="products.edit" />}>
            <Route path="/inventory" element={<InventoryPage />} />
          </Route>
          <Route element={<Requires permission="suppliers.view" />}>
            <Route path="/suppliers" element={<SuppliersPage />} />
          </Route>
          <Route element={<Requires permission="purchases.view" />}>
            <Route path="/purchases" element={<PurchasesPage />} />
          </Route>
          <Route element={<Requires permission="sales.view" />}>
            <Route path="/sales" element={<SalesPage />} />
          </Route>
          <Route element={<Requires permission="customers.view" />}>
            <Route path="/customers" element={<CustomersPage />} />
          </Route>
          <Route element={<Requires permission="expenses.view" />}>
            <Route path="/expenses" element={<ExpensesPage />} />
          </Route>
          <Route element={<Requires permission="reports.view" />}>
            <Route path="/reports" element={<ReportsPage />} />
          </Route>
          <Route element={<Requires permission="insights.view" />}>
            <Route path="/insights" element={<InsightsPage />} />
          </Route>
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route element={<Requires permission="pos.sell" />}>
          <Route element={<POSLayout />}>
            <Route path="/pos" element={<POSPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to={homePath(user)} replace />} />
      </Routes>
    </Suspense>
  );
}
