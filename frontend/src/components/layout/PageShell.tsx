import { type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { useAppStore } from '@/store';
import { cn } from '@/utils';
import NotificationBell from '@/components/layout/NotificationBell';
import SyncPill from '@/components/layout/SyncPill';
import { iconButtonClass } from '@/components/layout/styles';

interface PageShellProps {
  /** Breadcrumb: the page, then an optional current view ("Home / Today"). */
  crumb: string;
  subCrumb?: string;
  /** Buttons in the top bar (Export, Open register). Page-level actions usually go in PageHeading instead. */
  barActions?: ReactNode;
  children: ReactNode;
  /** Wider pages (Home, Analytics) use the full width; forms stay narrow. */
  className?: string;
}

/** The back-office frame from the design: a slim top bar with breadcrumb, sync state and alerts, then the page. */
export default function PageShell({ crumb, subCrumb, barActions, children, className }: PageShellProps) {
  const setMobileSidebarOpen = useAppStore((state) => state.setMobileSidebarOpen);
  return (
    <>
      <header className="sticky top-0 z-20 shrink-0 border-b border-brand-200 bg-white/95 backdrop-blur dark:border-brand-800 dark:bg-brand-950/95">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-7">
          <button type="button" onClick={() => setMobileSidebarOpen(true)} className={cn(iconButtonClass, 'lg:hidden')} aria-label="Open menu">
            <Menu className="h-[18px] w-[18px]" />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-3 text-[15px]">
            <span className="truncate font-medium text-brand-900 dark:text-white">{crumb}</span>
            {subCrumb && (
              <>
                <span aria-hidden className="text-brand-300 dark:text-brand-600">/</span>
                <span className="truncate text-brand-500 dark:text-brand-400">{subCrumb}</span>
              </>
            )}
          </nav>
          <SyncPill className="hidden sm:inline-flex" />
          <NotificationBell />
          {barActions && <div className="hidden items-center gap-2 md:flex">{barActions}</div>}
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className={cn('mx-auto w-full max-w-[1440px] space-y-5 px-4 pb-10 pt-6 sm:px-7', className)}>{children}</div>
      </main>
    </>
  );
}
