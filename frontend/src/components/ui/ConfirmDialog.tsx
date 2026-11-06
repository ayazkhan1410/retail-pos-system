import { create } from 'zustand';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { cn } from '@/utils';
import Modal from './Modal';
import Button from './Button';

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger for anything that deletes, voids or throws away work. */
  tone?: 'default' | 'danger';
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (value: boolean) => void }) | null;
  ask: (options: ConfirmOptions) => Promise<boolean>;
  settle: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  ask: (options) =>
    new Promise<boolean>((resolve) => {
      // A second request replaces the first, which counts as cancelled.
      get().request?.resolve(false);
      set({ request: { ...options, resolve } });
    }),
  settle: (value) => {
    get().request?.resolve(value);
    set({ request: null });
  },
}));

/** Drop-in replacement for window.confirm that matches the app and works on tablets. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(options);
}

export function ConfirmHost() {
  const { t } = useTranslation();
  const request = useConfirmStore((state) => state.request);
  const settle = useConfirmStore((state) => state.settle);
  const danger = request?.tone === 'danger';
  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <Modal
      open={!!request}
      onClose={() => settle(false)}
      title={request?.title ?? ''}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => settle(false)}>
            {request?.cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'accent'}
            autoFocus
            data-testid="confirm-accept"
            onClick={() => settle(true)}
          >
            {request?.confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      {request?.body && (
        <div className="flex gap-3">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              danger ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' : 'bg-accent-soft text-accent',
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <p className="pt-1.5 text-sm text-brand-600 dark:text-brand-300">{request.body}</p>
        </div>
      )}
    </Modal>
  );
}
