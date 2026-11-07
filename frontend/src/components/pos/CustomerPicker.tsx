import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui';
import { Avatar, SearchField } from '@/components/ui/Kit';
import { useTranslation } from '@/i18n';
import { customersApi } from '@/services/endpoints';
import type { Customer } from '@/types';
import { cn, formatCurrency } from '@/utils';

const LIMIT = 30;

/** F6 on the till: pick who the bill is for, from the cached list first and the server for anyone else. */
export default function CustomerPicker({ open, customers, onClose, onPick }: {
  open: boolean; customers: Customer[]; onClose: () => void; onPick: (customer: Customer) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Customer[] | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setRemote(null);
    setActive(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (!open || q.length < 2) {
      setRemote(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      customersApi.list({ search: q, page_size: LIMIT })
        .then(({ data }) => !cancelled && setRemote(data.results))
        .catch(() => !cancelled && setRemote(null));
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, q]);

  const rows = useMemo(() => {
    const local = customers.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')));
    const merged = [...local];
    for (const c of remote ?? []) if (!merged.some((m) => m.id === c.id)) merged.push(c);
    return merged.slice(0, LIMIT);
  }, [customers, q, remote]);

  useEffect(() => setActive(0), [q]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, rows.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && rows[active]) {
      event.preventDefault();
      onPick(rows[active]);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('pg.register.pickCustomer')} description={t('pg.register.pickCustomerHint')} size="md">
      <div onKeyDown={onKeyDown}>
        <SearchField inputRef={inputRef} value={query} onChange={setQuery} placeholder={t('pg.register.searchCustomer')} />
        <ul role="listbox" className="mt-3 max-h-[50vh] divide-y divide-brand-100 overflow-y-auto dark:divide-brand-800">
          {rows.length === 0 && <li className="py-6 text-center text-sm text-brand-500">{t('pg.shell.noResults')}</li>}
          {rows.map((customer, index) => {
            const owes = Number(customer.balance);
            return (
              <li key={customer.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onPick(customer)}
                  className={cn('flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-start', index === active && 'bg-brand-100 dark:bg-brand-800')}
                >
                  <Avatar name={customer.name} round />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-brand-900 dark:text-white">{customer.name}</span>
                    <span dir="ltr" className="block truncate text-xs text-brand-500 rtl:text-end">{customer.phone || t('pg.common.none')}</span>
                  </span>
                  {owes > 0 && <span className="num text-xs text-amber-700 dark:text-amber-300">{t('pg.register.owes', { amount: formatCurrency(owes) })}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
