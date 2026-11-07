import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, FileText, Package, Search, User as UserIcon, type LucideIcon } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useCan, useInventoryStore } from '@/store';
import { customersApi, salesApi } from '@/services/endpoints';
import { cn, formatCurrency } from '@/utils';
import { NAV_GROUPS } from '@/components/layout/navItems';

interface Hit {
  key: string;
  group: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  go: () => void;
}

const REMOTE_LIMIT = 5;

/** ⌘K / Ctrl+K: jump to a page, product, customer or invoice. Only offers what the user's role can open. */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const can = useCan();
  const navigate = useNavigate();
  const products = useInventoryStore((state) => state.products);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<Hit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setRemote([]);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const q = query.trim().toLowerCase();

  const local = useMemo<Hit[]>(() => {
    const pages: Hit[] = NAV_GROUPS.flatMap((group) => group.items)
      .filter((item) => !item.permission || can(item.permission))
      .filter((item) => !q || t(item.labelKey).toLowerCase().includes(q))
      .map((item) => ({ key: `page-${item.to}`, group: t('pg.shell.pages'), icon: item.icon, label: t(item.labelKey), go: () => go(item.to) }));
    const items: Hit[] = q.length >= 2 && can('products.edit')
      ? products
          .filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q))
          .slice(0, 6)
          .map((p) => ({
            key: `product-${p.id}`, group: t('pg.shell.products'), icon: Package, label: p.name,
            hint: `${p.barcode} · ${formatCurrency(p.salePrice)}`, go: () => go(`/inventory?search=${encodeURIComponent(p.barcode)}`),
          }))
      : [];
    return [...pages, ...items];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go/navigate are stable for this purpose
  }, [q, products, t]);

  useEffect(() => {
    if (!open || q.length < 2) {
      setRemote([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const hits: Hit[] = [];
      const jobs: Promise<void>[] = [];
      if (can('customers.view')) {
        jobs.push(customersApi.list({ search: q, page_size: REMOTE_LIMIT }).then(({ data }) => {
          for (const c of data.results) {
            hits.push({ key: `customer-${c.id}`, group: t('pg.shell.customers'), icon: UserIcon, label: c.name, hint: c.phone ?? '', go: () => go(`/customers?id=${c.id}`) });
          }
        }).catch(() => undefined));
      }
      if (can('sales.view') && q.length >= 3) {
        jobs.push(salesApi.list({ search: q, page_size: REMOTE_LIMIT }).then(({ data }) => {
          for (const s of data.results) {
            hits.push({
              key: `sale-${s.id}`, group: t('pg.shell.orders'), icon: FileText, label: s.invoice_no,
              hint: `${s.customer_name || t('pg.orders.walkIn')} · ${formatCurrency(Number(s.total))}`,
              go: () => go(`/sales?search=${encodeURIComponent(s.invoice_no)}`),
            });
          }
        }).catch(() => undefined));
      }
      await Promise.all(jobs);
      if (!cancelled) setRemote(hits);
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search only re-runs on the query
  }, [open, q]);

  const hits = [...local, ...remote];

  useEffect(() => {
    setActive(0);
  }, [q]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, hits.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && hits[active]) {
      event.preventDefault();
      hits[active].go();
    }
  };

  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKeyDown}>
      <button type="button" aria-label={t('common.close')} className="absolute inset-0 animate-fade-in bg-brand-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={t('pg.shell.search')} className="relative w-full max-w-xl animate-scale-in overflow-hidden rounded-xl border border-brand-200 bg-white shadow-elevated dark:border-brand-700 dark:bg-brand-900">
        <div className="flex items-center gap-2.5 border-b border-brand-200 px-4 dark:border-brand-800">
          <Search aria-hidden className="h-4 w-4 text-brand-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('pg.shell.searchPlaceholder')}
            aria-label={t('pg.shell.search')}
            role="combobox"
            aria-expanded
            aria-controls="command-results"
            aria-activedescendant={hits[active] ? `cmd-${hits[active].key}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm text-brand-900 outline-none placeholder:text-brand-400 dark:text-white"
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="command-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
          {hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-brand-500">{t('pg.shell.noResults')}</li>}
          {hits.map((hit, index) => {
            const header = hit.group !== lastGroup ? hit.group : null;
            lastGroup = hit.group;
            const Icon = hit.icon;
            return (
              <li key={hit.key} role="presentation">
                {header && <p className="px-3 pb-1 pt-2.5 text-xs font-medium text-brand-400">{header}</p>}
                <button
                  type="button"
                  id={`cmd-${hit.key}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={hit.go}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm', index === active ? 'bg-brand-100 dark:bg-brand-800' : '')}
                >
                  <Icon aria-hidden className="h-4 w-4 shrink-0 text-brand-500" />
                  <span className="min-w-0 flex-1 truncate text-brand-900 dark:text-white">{hit.label}</span>
                  {hit.hint && <span className="truncate text-xs text-brand-500">{hit.hint}</span>}
                  {index === active && <CornerDownLeft aria-hidden className="h-3.5 w-3.5 text-brand-400" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
