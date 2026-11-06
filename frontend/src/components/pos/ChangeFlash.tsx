import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { formatCurrency } from '@/utils';

const DURATION_MS = 5000;

interface ChangeFlashProps {
  amount: number;
  invoiceNo?: string;
  onDone: () => void;
}

/** Full-screen change reminder — auto-dismisses after 5s, or sooner via X. */
export default function ChangeFlash({ amount, invoiceNo, onDone }: ChangeFlashProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - started;
      const left = Math.max(0, 100 - (elapsed / DURATION_MS) * 100);
      setProgress(left);
      if (elapsed >= DURATION_MS) {
        onDone();
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-6">
      <div
        role="dialog"
        aria-live="assertive"
        className="relative flex h-[min(92vh,40rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border-2 border-emerald-400/50 bg-brand-950 shadow-elevated sm:h-[min(88vh,44rem)]"
      >
        <button
          type="button"
          onClick={onDone}
          className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 sm:right-5 sm:top-5"
          aria-label={t('common.close')}
        >
          <X className="h-6 w-6 sm:h-7 sm:w-7" />
        </button>

        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center sm:gap-6 sm:px-10 sm:py-14">
          {invoiceNo && (
            <p dir="ltr" className="font-mono text-sm text-brand-400 sm:text-base">{invoiceNo}</p>
          )}
          <p className="text-base font-bold uppercase tracking-[0.25em] text-emerald-400 sm:text-xl">
            {t('pos.changeDue')}
          </p>
          <p
            dir="ltr"
            className="w-full max-w-full px-2 text-center font-display font-black leading-none tracking-tight text-emerald-400 tabular-nums"
            style={{ fontSize: 'clamp(2.75rem, 14vw, 8.5rem)' }}
            data-testid="change-flash"
          >
            {formatCurrency(amount)}
          </p>
          <p className="max-w-lg text-base text-brand-300 sm:text-lg">{t('pos.changeFlashHint')}</p>
        </div>

        <div className="h-2.5 w-full shrink-0 bg-brand-800">
          <div
            className="h-full bg-emerald-400 transition-[width] duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
