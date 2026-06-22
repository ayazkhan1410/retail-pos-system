import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout';
import { useAppStore } from '@/store';

export default function DashboardLayout() {
  const { mobileSidebarOpen, setMobileSidebarOpen } = useAppStore();

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-brand-100 dark:bg-brand-950">
      {/* Desktop sidebar */}
      <div className="hidden shrink-0 lg:block">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute inset-y-0 left-0 z-50 h-full shadow-elevated">
            <Sidebar mobile />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

export { default as Header } from '@/components/layout/Header';
