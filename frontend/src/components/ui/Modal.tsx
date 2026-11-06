import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  preventClose?: boolean;
}

const sizeMap = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

/** Open dialogs, newest last. Escape only closes the one on top (a confirm over a form, say). */
const stack: string[] = [];

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  preventClose = false,
}: ModalProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const preventRef = useRef(preventClose);
  preventRef.current = preventClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    stack.push(id);
    document.body.style.overflow = 'hidden';

    // Focus the first field the caller marked, else the panel, so screen readers land inside.
    window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (panel && !panel.contains(document.activeElement)) panel.focus();
    });

    const handler = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (event.key === 'Escape' && !preventRef.current) {
        event.stopPropagation();
        onCloseRef.current();
      }
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);

    return () => {
      document.removeEventListener('keydown', handler);
      const index = stack.lastIndexOf(id);
      if (index >= 0) stack.splice(index, 1);
      if (stack.length === 0) document.body.style.overflow = '';
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open, id]);

  if (!open) return null;

  const handleClose = () => {
    if (!preventClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div aria-hidden className="absolute inset-0 animate-fade-in bg-brand-950/55 backdrop-blur-[2px]" onClick={handleClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full animate-slide-up flex-col rounded-t-2xl border border-brand-200 bg-white text-brand-900 shadow-elevated outline-none sm:max-h-[min(88dvh,56rem)] sm:animate-scale-in sm:rounded-2xl dark:border-brand-800 dark:bg-brand-900 dark:text-brand-50',
          sizeMap[size],
        )}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-brand-200 sm:hidden dark:bg-brand-700" />
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-title`} className="truncate text-base font-semibold tracking-tight sm:text-lg">{title}</h2>
            {description && <p id={`${id}-desc`} className="mt-1 text-sm text-brand-500 dark:text-brand-400">{description}</p>}
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            disabled={preventClose}
            className="-me-1.5 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-brand-400 transition-colors hover:bg-brand-100 hover:text-brand-700 focus-ring disabled:opacity-40 dark:hover:bg-brand-800 dark:hover:text-brand-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-brand-100 bg-brand-50/60 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end sm:rounded-b-2xl sm:px-6 dark:border-brand-800 dark:bg-brand-900/60">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
