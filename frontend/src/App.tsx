import { Routes, Route, Navigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import DashboardLayout from '@/layouts/DashboardLayout';
import POSLayout from '@/layouts/POSLayout';
import DashboardPage from '@/pages/DashboardPage';
import POSPage from '@/pages/POSPage';
import InventoryPage from '@/pages/InventoryPage';
import PurchasesPage from '@/pages/PurchasesPage';
import SuppliersPage from '@/pages/SuppliersPage';
import SalesPage from '@/pages/SalesPage';
import SettingsPage from '@/pages/SettingsPage';

export default function App() {
  useTheme();
  useLanguage();

  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route element={<POSLayout />}>
        <Route path="/pos" element={<POSPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
