import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils';
import Button from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  preventClose?: boolean;
}

const sizeMap = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function Modal({ open, onClose, title, children, footer, size = 'md', preventClose = false }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose) onClose();
    };
    if (open) {
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose, preventClose]);

  if (!open) return null;

  const handleClose = () => {
    if (!preventClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div
        className={cn(
          'relative w-full rounded-2xl border border-brand-200 bg-white shadow-elevated dark:border-brand-800 dark:bg-brand-900',
          sizeMap[size],
        )}
      >
        <div className="flex items-center justify-between border-b border-brand-100 px-4 py-3 dark:border-brand-800 sm:px-6 sm:py-4">
          <h2 className="min-w-0 flex-1 truncate pr-2 font-display text-base font-semibold sm:text-lg">{title}</h2>
          <Button variant="ghost" size="sm" onClick={handleClose} aria-label="Close" disabled={preventClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[min(70vh,100dvh-8rem)] overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-brand-100 px-4 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6 dark:border-brand-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
