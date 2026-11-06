import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Scan,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  ArrowLeft,
  Search,
  X,
  LogOut,
  Lock,
  WifiOff,
  Printer,
} from 'lucide-react';
import { homePath, usePOSStore, useInventoryStore, useAuthStore, useCan } from '@/store';
import { useKeyboardShortcut } from '@/hooks';
import { Button, Modal } from '@/components/ui';
import { formatCurrency, cn, newUuid } from '@/utils';
import { getExpiryStatus } from '@/utils/inventoryUtils';
import { printReceipt } from '@/utils/receiptPrint';
import { apiErrorMessage } from '@/services';
import { auditApi, customersApi, salesApi } from '@/services/endpoints';
import PaymentModal, { type PaymentResult } from '@/components/pos/PaymentModal';
import { CloseShiftModal, OpenShiftModal, ShiftSummaryModal } from '@/components/pos/ShiftModals';
import type { CartItem, Customer, PaymentMethod, Product, Sale, Shift, Terminal } from '@/types';
import { useTranslation } from '@/i18n';
import LanguageToggle from '@/components/layout/LanguageToggle';

const CATALOG_REFRESH_MS = 60_000;
const SYNC_INTERVAL_MS = 20_000;
const isExpired = (product: Product) => getExpiryStatus(product.expiryDate) === 'expired';

/** The receipt for a sale the server hasn't seen yet. The real invoice number is issued on sync. */
function offlineSale(uuid: string, counter: Terminal, cashier: string, cart: CartItem[], result: PaymentResult, subtotal: number): Sale {
  const total = subtotal - result.discount;
  const paid = result.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  return {
    id: 0,
    invoice_no: `OFFLINE-${uuid.slice(0, 8).toUpperCase()}`,
    terminal: counter.id,
    terminal_name: counter.name,
    cashier_name: cashier,
    customer: null,
    customer_name: '',
    is_offline: true,
    returned_total: '0',
    subtotal: subtotal.toFixed(2),
    discount: result.discount.toFixed(2),
    tax: '0',
    total: total.toFixed(2),
    change_due: Math.max(0, paid - total).toFixed(2),
    created_at: new Date().toISOString(),
    lines: cart.map((item, index) => ({
      id: index,
      returned_quantity: '0',
      name: item.product.name,
      barcode: item.product.barcode,
      quantity: String(item.quantity),
      unit_price: item.product.salePrice.toFixed(2),
      discount: '0',
      tax_rate: String(item.product.salesTaxPercent ?? 0),
      tax_amount: '0',
      line_total: (item.product.salePrice * item.quantity).toFixed(2),
    })),
    payments: result.payments.map((payment) => ({ ...payment, reference: payment.reference ?? '' })),
  };
}

function beep() {
  try {
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    tone.frequency.value = 220;
    tone.connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.2);
    tone.onended = () => void audio.close();
  } catch {
    // Sound is a bonus; the on-screen message still shows.
  }
}

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="tabular-nums text-xs text-brand-400">
      {time.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })}
    </span>
  );
}

export default function POSPage() {
  const { t } = useTranslation();
  const {
    activeCounter,
    cart,
    scannerInput,
    setActiveCounter,
    setScannerInput,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    syncCart,
    pendingSales,
    queueSale,
    syncPending,
    cartTotal,
    cartItemCount,
  } = usePOSStore();
  const { products, error: catalogFailed, fetchProducts, applySale } = useInventoryStore();
  const { user, logout } = useAuthStore();
  const can = useCan();

  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shift, setShift] = useState<Shift | null>(null);
  const [shiftLoaded, setShiftLoaded] = useState(false);
  const [closingShift, setClosingShift] = useState(false);
  const [closedShift, setClosedShift] = useState<Shift | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState('');
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [category, setCategory] = useState('All');
  const [productSearch, setProductSearch] = useState('');
  const [scanFlash, setScanFlash] = useState(false);
  const [notice, setNotice] = useState<{ text: string; kind: 'warning' | 'error' } | null>(null);
  const scannerRef = useRef<HTMLInputElement>(null);
  // Kept until the bill changes, so a retry after a lost reply can't charge the customer twice.
  const saleUuid = useRef(newUuid());

  const modalOpen = !!payMethod || !!completedSale || closingShift || !!closedShift || (shiftLoaded && !shift);

  const focusScanner = useCallback(() => {
    window.requestAnimationFrame(() => scannerRef.current?.focus());
  }, []);

  useEffect(() => {
    saleUuid.current = newUuid();
  }, [cart]);

  useEffect(() => {
    salesApi.terminals().then(({ data }) => {
      setTerminals(data);
      const saved = usePOSStore.getState().activeCounter;
      const current = data.find((terminal) => terminal.id === saved?.id) ?? data[0];
      if (current) setActiveCounter(current);
    }).catch(() => setNotice({ text: t('pos.catalogError'), kind: 'error' }));
    // Runs once on opening the till.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const load = () => fetchProducts().then(() => {
      if (!useInventoryStore.getState().error) syncCart(useInventoryStore.getState().products);
    });
    void load();
    const timer = window.setInterval(() => void load(), CATALOG_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [fetchProducts, syncCart]);

  useEffect(() => {
    if (can('customers.view')) customersApi.list().then(({ data }) => setCustomers(data)).catch(() => undefined);
    void syncPending();
    const timer = window.setInterval(() => void syncPending(), SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // Runs once on opening the till.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshShift = useCallback(async (terminalId: number) => {
    const { data } = await salesApi.currentShift(terminalId);
    setShift(data.shift);
    setShiftLoaded(true);
  }, []);

  useEffect(() => {
    if (activeCounter) void refreshShift(activeCounter.id).catch(() => setNotice({ text: t('pos.catalogError'), kind: 'error' }));
  }, [activeCounter, refreshShift, t]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(products.map((p) => p.category))).sort()],
    [products],
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase();
    return products.filter((p) => {
      const matchCat = category === 'All' || p.category === category;
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q);
      return matchCat && matchSearch && !isExpired(p);
    });
  }, [category, productSearch, products]);

  const flashScanOk = () => {
    setScanFlash(true);
    window.setTimeout(() => setScanFlash(false), 120);
  };

  const addProduct = useCallback(
    (product: Product) => {
      setScannerInput('');
      setProductSearch('');
      if (isExpired(product)) {
        setNotice({ text: t('pos.expiredItem', { name: product.name }), kind: 'error' });
        beep();
        focusScanner();
        return;
      }
      addToCart(product);
      flashScanOk();
      setNotice(
        product.stock <= 0
          ? { text: t('pos.outOfStockWarning', { name: product.name }), kind: 'warning' }
          : null,
      );
      focusScanner();
    },
    [addToCart, focusScanner, setScannerInput, t],
  );

  const resolveAndAdd = useCallback(
    (query: string) => {
      const q = query.trim();
      if (!q) return;

      const exact = products.find((p) => p.barcode.toLowerCase() === q.toLowerCase());
      if (exact) {
        addProduct(exact);
        return;
      }

      // By name only: a half-read barcode must never add the wrong item by itself.
      const byName = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
      if (byName.length === 1) {
        addProduct(byName[0]);
        return;
      }
      if (byName.length === 0) {
        setNotice({ text: t('pos.notFound', { code: q }), kind: 'error' });
        beep();
      }
      setProductSearch(q);
      setScannerInput('');
    },
    [addProduct, products, setScannerInput, t],
  );

  const handleScannerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resolveAndAdd(scannerInput);
  };

  const startPayment = useCallback(
    (method: PaymentMethod) => {
      if (cart.length === 0 || modalOpen) return;
      setPayError('');
      setPayMethod(method);
    },
    [cart.length, modalOpen],
  );

  const completeSale = async (result: PaymentResult) => {
    if (!activeCounter || submitting) return;
    setSubmitting(true);
    setPayError('');
    const payload = {
      client_uuid: saleUuid.current,
      terminal: activeCounter.id,
      discount: result.discount.toFixed(2),
      customer: result.customer,
      lines: cart.map((item) => ({ product: Number(item.product.id), quantity: String(item.quantity) })),
      payments: result.payments,
    };
    const afterSale = (sale: Sale) => {
      applySale(cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })));
      clearCart();
      setPayMethod(null);
      setCompletedSale(sale);
      setNotice(null);
    };
    try {
      const { data } = await salesApi.create(payload);
      afterSale(data);
      void refreshShift(activeCounter.id).catch(() => undefined);
    } catch (err) {
      const lostConnection = !(err as { response?: unknown }).response;
      const usesCredit = result.payments.some((payment) => payment.method === 'credit');
      if (lostConnection && !usesCredit) {
        // Server unreachable: finish the sale here and send it when the connection returns.
        queueSale({
          ...payload,
          offline: true,
          sold_at: new Date().toISOString(),
          lines: cart.map((item) => ({
            product: Number(item.product.id),
            quantity: String(item.quantity),
            unit_price: item.product.salePrice.toFixed(2),
          })),
        });
        afterSale(offlineSale(payload.client_uuid, activeCounter, user?.full_name ?? '', cart, result, subtotal));
      } else {
        setPayError(apiErrorMessage(err, t(lostConnection ? 'pos.creditNeedsConnection' : 'pos.saleFailed')));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const finishSale = useCallback(() => {
    setCompletedSale(null);
    focusScanner();
  }, [focusScanner]);

  const handleClearCart = useCallback(() => {
    if (cart.length === 0 || !window.confirm(t('pos.confirmClear'))) return;
    void auditApi.cartCleared(cartItemCount(), cartTotal()).catch(() => undefined);
    clearCart();
    setNotice(null);
    focusScanner();
  }, [cart.length, cartItemCount, cartTotal, clearCart, focusScanner, t]);

  const chooseCounter = (counter: Terminal) => {
    if (counter.id === activeCounter?.id) return;
    if (cart.length > 0) {
      setNotice({ text: t('pos.switchBlocked'), kind: 'warning' });
      return;
    }
    setShiftLoaded(false);
    setActiveCounter(counter);
  };

  const openShift = async (amount: string) => {
    if (!activeCounter) return;
    const { data } = await salesApi.openShift(activeCounter.id, amount);
    setShift(data);
    focusScanner();
  };

  const closeShift = async (amount: string) => {
    if (!shift) return;
    const { data } = await salesApi.closeShift(shift.id, amount);
    setClosingShift(false);
    setClosedShift(data);
    setShift(null);
  };

  useEffect(() => {
    if (!modalOpen) focusScanner();
  }, [focusScanner, modalOpen]);

  // Works wherever focus is, including after printing. Not a useKeyboardShortcut: it must not swallow Enter elsewhere.
  useEffect(() => {
    if (!completedSale) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.repeat) {
        event.preventDefault();
        finishSale();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [completedSale, finishSale]);

  useKeyboardShortcut('f2', focusScanner);
  useKeyboardShortcut('f4', handleClearCart, { ctrl: true });
  useKeyboardShortcut('f1', () => startPayment('cash'));
  useKeyboardShortcut('f9', () => startPayment('card'), { ctrl: true });

  const subtotal = cartTotal();
  const itemCount = cartItemCount();

  return (
    <div className="flex h-[100dvh] flex-col bg-pos-panel text-white">
      {/* Slim header */}
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-black/30 px-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          {homePath(user) !== '/pos' && (
            <Link
              to={homePath(user)}
              aria-label={t('pos.backToDashboard')}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Link>
          )}
          <span className="hidden text-sm font-bold sm:inline">{t('pos.title')}</span>
          <div className="flex gap-0.5 rounded-lg bg-white/5 p-0.5">
            {terminals.map((counter) => (
              <button
                key={counter.id}
                type="button"
                onClick={() => chooseCounter(counter)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-bold transition-all',
                  activeCounter?.id === counter.id
                    ? 'bg-white text-brand-900'
                    : 'text-brand-400 hover:text-white',
                )}
              >
                {counter.code}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <LiveClock />
          <LanguageToggle compact />
          {pendingSales.length > 0 && (
            <span role="status" className="flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-200">
              <WifiOff className="h-3.5 w-3.5" /> {t('pos.pendingSync', { count: pendingSales.length })}
            </span>
          )}
          {shift && (
            <>
              <span className="hidden text-xs text-brand-400 md:inline">
                {t('pos.shiftSales')} <strong className="text-white">{formatCurrency(Number(shift.sales_total))}</strong>
              </span>
              <button
                type="button"
                onClick={() => setClosingShift(true)}
                disabled={cart.length > 0 || pendingSales.length > 0}
                className="flex h-8 items-center gap-1 rounded-lg bg-white/10 px-2 text-xs font-medium text-white/80 hover:bg-white/20 disabled:opacity-40"
              >
                <Lock className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('pos.closeShift')}</span>
              </button>
            </>
          )}
          <span className="hidden max-w-[120px] truncate text-xs text-brand-400 lg:inline">{user?.full_name}</span>
          <button
            type="button"
            onClick={() => void logout()}
            aria-label={t('common.logout')}
            title={t('common.logout')}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Universal scan / search — always on top, full width */}
      <form onSubmit={handleScannerSubmit} className="shrink-0 border-b border-white/10 p-2">
        <div
          className={cn(
            'flex items-center overflow-hidden rounded-xl border bg-black/50 transition-colors',
            scanFlash ? 'border-emerald-400 bg-emerald-500/10' : 'border-accent/40',
          )}
        >
          <Scan className="ml-3 h-5 w-5 shrink-0 text-accent-glow" />
          <input
            ref={scannerRef}
            value={scannerInput}
            onChange={(e) => {
              setScannerInput(e.target.value);
              setProductSearch(e.target.value);
            }}
            placeholder={t('pos.scanPlaceholder')}
            aria-label={t('pos.scanPlaceholder')}
            className="h-11 flex-1 bg-transparent px-2 text-base font-medium text-white placeholder:text-brand-500 focus:outline-none"
            autoComplete="off"
            autoFocus
          />
          {(scannerInput || productSearch) && (
            <button
              type="button"
              onClick={() => {
                setScannerInput('');
                setProductSearch('');
                focusScanner();
              }}
              className="mr-2 rounded p-1 text-brand-500 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="submit"
            className="mr-1 flex h-9 items-center gap-1 rounded-lg bg-accent px-3 text-xs font-bold text-white hover:bg-accent-light"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('pos.addButton')}</span>
          </button>
        </div>
        {(notice || catalogFailed) && (
          <p
            role="alert"
            className={cn(
              'mt-1 rounded-md px-2 py-1 text-xs font-medium',
              notice?.kind === 'warning' ? 'bg-amber-500/20 text-amber-200' : 'bg-red-500/20 text-red-200',
            )}
          >
            {notice?.text ?? t('pos.catalogError')}
          </p>
        )}
        <p className="mt-1 hidden text-[10px] text-brand-500 sm:block">
          <kbd className="rounded bg-white/10 px-1 font-mono">F2</kbd> scan ·{' '}
          <kbd className="rounded bg-white/10 px-1 font-mono">F1</kbd> cash ·{' '}
          <kbd className="rounded bg-white/10 px-1 font-mono">Ctrl+F4</kbd> clear
        </p>
      </form>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Bill first on mobile stack order — primary for cashier */}
        <div className="flex min-h-0 w-full flex-col border-b border-white/10 bg-black/25 lg:order-2 lg:w-[52%] lg:border-b-0 lg:border-l">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="min-w-0">
              <h2 className="text-sm font-bold">{t('pos.currentBill')}</h2>
              <p className="text-[11px] text-brand-500">
                {activeCounter?.name} · {itemCount} {t('common.items')}
              </p>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={handleClearCart}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="h-3 w-3" /> {t('pos.clearAll')}
              </button>
            )}
          </div>

          {/* Compact cart table */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <Scan className="mb-2 h-8 w-8 text-brand-600" />
                <p className="text-sm font-medium text-brand-300">{t('pos.scannerReady')}</p>
                <p className="mt-0.5 text-xs text-brand-500">{t('pos.scannerHint')}</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-black/60 text-[10px] uppercase tracking-wide text-brand-500 backdrop-blur-sm">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">#</th>
                    <th className="px-2 py-1.5 font-medium">{t('pos.item')}</th>
                    <th className="px-2 py-1.5 text-center font-medium">{t('pos.qty')}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{t('pos.amount')}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {cart.map((item, idx) => (
                    <tr key={item.product.id} className="hover:bg-white/5">
                      <td className="px-2 py-1.5 text-xs text-brand-500">{idx + 1}</td>
                      <td className="max-w-[140px] px-2 py-1.5 sm:max-w-none">
                        <p className="truncate text-xs font-semibold leading-tight sm:text-sm">
                          {item.product.name}
                        </p>
                        <p className="text-[10px] text-brand-500">
                          {formatCurrency(item.product.salePrice)}
                          {item.quantity > item.product.stock && (
                            <span className="ml-1.5 text-amber-300">
                              {t('pos.moreThanStock', { stock: item.product.stock })}
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-1 py-1.5">
                        <div className="mx-auto flex w-fit items-center rounded-md bg-black/40">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                            className="rounded-l-md p-1 hover:bg-white/10"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          {item.product.qtyDecimal ? (
                            <input
                              type="number"
                              min={0}
                              step="0.001"
                              aria-label={t('pos.qty')}
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item.product.id, Number(e.target.value))}
                              className="w-14 bg-transparent text-center text-xs font-bold focus:outline-none"
                            />
                          ) : (
                            <span className="min-w-[1.5rem] text-center text-xs font-bold">
                              {item.quantity}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                            className="rounded-r-md p-1 hover:bg-white/10"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs font-bold sm:text-sm">
                        {formatCurrency(Math.round(item.product.salePrice * item.quantity * 100) / 100)}
                      </td>
                      <td className="px-1 py-1.5">
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-brand-600 hover:text-red-400"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Checkout — cash primary */}
          <div className="shrink-0 border-t border-white/10 bg-black/40 p-2 sm:p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <div className="text-[11px] text-brand-400">
                <span>{itemCount} {t('common.items')}</span>
                <span className="mx-1.5">·</span>
                <span>{t('pos.taxIncluded')}</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-brand-500">{t('pos.total')}</p>
                <p className="font-display text-2xl font-bold leading-none sm:text-3xl">
                  {formatCurrency(subtotal)}
                </p>
              </div>
            </div>
            <Button
              variant="accent"
              size="lg"
              className="mb-2 h-12 w-full text-base font-bold"
              disabled={cart.length === 0}
              onClick={() => startPayment('cash')}
            >
              <Banknote className="h-5 w-5" /> {t('pos.cash')} <span className="text-white/70">(F1)</span>
            </Button>
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                className="h-9 border border-white/10 bg-white/10 text-xs text-white hover:bg-white/20"
                disabled={cart.length === 0}
                onClick={() => startPayment('jazzcash')}
              >
                <Smartphone className="h-3.5 w-3.5" /> {t('pos.jazzcash')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-9 border border-white/10 bg-white/10 text-xs text-white hover:bg-white/20"
                disabled={cart.length === 0}
                onClick={() => startPayment('easypaisa')}
              >
                <Smartphone className="h-3.5 w-3.5" /> {t('pos.easypaisa')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-9 border border-white/10 bg-white/10 text-xs text-white hover:bg-white/20"
                disabled={cart.length === 0}
                onClick={() => startPayment('card')}
              >
                <CreditCard className="h-3.5 w-3.5" /> {t('pos.cardPay')}
              </Button>
            </div>
          </div>
        </div>

        {/* Products — compact backup when scan fails */}
        <div className="flex min-h-0 w-full flex-col lg:order-1 lg:w-[48%]">
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 px-2 py-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={cn(
                  'shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all',
                  category === cat
                    ? 'bg-white text-brand-900'
                    : 'bg-white/5 text-brand-400 hover:bg-white/10',
                )}
              >
                {cat === 'All' ? t('common.all') : cat}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5 sm:p-2">
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-left transition-colors hover:border-accent/40 hover:bg-white/10 active:scale-[0.98]"
                >
                  <p className="line-clamp-2 text-[11px] font-semibold leading-tight sm:text-xs">
                    {product.name}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-accent-glow">
                      {formatCurrency(product.salePrice)}
                    </span>
                    <span className={cn('text-[9px]', product.stock <= 0 ? 'font-bold text-red-400' : 'text-brand-500')}>{product.stock}</span>
                  </div>
                </button>
              ))}
            </div>
            {filteredProducts.length === 0 && (
              <p className="py-8 text-center text-xs text-brand-500">{t('pos.noProducts')}</p>
            )}
          </div>
        </div>
      </div>

      <div className="text-brand-900 dark:text-brand-50">
        <PaymentModal
          open={!!payMethod}
          total={subtotal}
          initialMethod={payMethod ?? 'cash'}
          canDiscount={can('pos.discount')}
          customers={customers}
          submitting={submitting}
          error={payError}
          onClose={() => {
            setPayMethod(null);
            focusScanner();
          }}
          onConfirm={(result) => void completeSale(result)}
        />

        <Modal
          open={!!completedSale}
          onClose={finishSale}
          title={t('pos.saleComplete')}
          size="sm"
          footer={
            <>
              <Button variant="outline" onClick={() => completedSale && void printReceipt(completedSale)}>
                <Printer className="h-4 w-4" /> {t('pos.printReceipt')}
              </Button>
              <Button variant="accent" autoFocus onClick={finishSale}>{t('pos.newSale')}</Button>
            </>
          }
        >
          {completedSale && (
            <div className="space-y-2 text-sm">
              <p dir="ltr" className="text-right font-mono text-xs text-brand-500 rtl:text-left" data-testid="invoice-no">{completedSale.invoice_no}</p>
              <div className="flex justify-between">
                <span className="text-brand-500">{t('pos.billTotal')}</span>
                <span className="font-bold">{formatCurrency(Number(completedSale.total))}</span>
              </div>
              <div className="flex items-baseline justify-between text-emerald-600">
                <span>{t('pos.changeDue')}</span>
                <span className="font-display text-3xl font-bold" data-testid="change-due">
                  {formatCurrency(Number(completedSale.change_due))}
                </span>
              </div>
            </div>
          )}
        </Modal>

        {shiftLoaded && !shift && !closedShift && activeCounter && (
          <OpenShiftModal
            counterName={activeCounter.name}
            canLeave={can('dashboard.view')}
            onOpen={openShift}
            onLogout={() => void logout()}
          />
        )}
        {closingShift && <CloseShiftModal onClose={() => setClosingShift(false)} onSubmit={closeShift} />}
        {closedShift && <ShiftSummaryModal shift={closedShift} onClose={() => setClosedShift(null)} />}
      </div>
    </div>
  );
}
