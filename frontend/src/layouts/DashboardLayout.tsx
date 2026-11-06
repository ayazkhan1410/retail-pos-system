import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/layout';
import { useKeyboardShortcut } from '@/hooks';
import { useAppStore, useCan } from '@/store';

export default function DashboardLayout() {
  const { mobileSidebarOpen, setMobileSidebarOpen } = useAppStore();
  const can = useCan();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // F2 is "start scanning" everywhere: on the till it focuses the scanner, here it opens the till.
  useKeyboardShortcut('f2', () => {
    if (can('pos.sell')) navigate('/pos');
  });

  // A route change from the drawer closes it, including browser back.
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname, setMobileSidebarOpen]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileSidebarOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileSidebarOpen, setMobileSidebarOpen]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-white dark:bg-brand-950">
      {/* Desktop sidebar */}
      <div className="hidden shrink-0 lg:block">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 animate-fade-in bg-brand-950/55 backdrop-blur-[2px]"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute inset-y-0 start-0 z-50 h-full animate-fade-in shadow-elevated">
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
