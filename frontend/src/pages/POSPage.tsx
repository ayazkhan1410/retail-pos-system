import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ScanBarcode,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Smartphone,
  ArrowLeft,
  CornerDownLeft,
  X,
  LogOut,
  Lock,
  WifiOff,
  Printer,
  KeyRound,
  Moon,
  Sun,
  CheckCircle2,
  PackageSearch,
  Pause,
  Play,
  ReceiptText,
  LayoutGrid,
  SplitSquareHorizontal,
} from 'lucide-react';
import { homePath, usePOSStore, useInventoryStore, useAuthStore, useCan, useThemeStore } from '@/store';
import { useKeyboardShortcut } from '@/hooks';
import { Button, Modal, EmptyState, BrandMark, confirmAction, toast, useConfirmStore } from '@/components/ui';
import { formatCurrency, cn, newUuid } from '@/utils';
import { getExpiryStatus } from '@/utils/inventoryUtils';
import { printReceipt } from '@/utils/receiptPrint';
import { apiErrorMessage } from '@/services';
import { auditApi, customersApi, inventoryApi, salesApi, type HeldBill } from '@/services/endpoints';
import { mapProductFromApi } from '@/services/products';
import CashQuickModal from '@/components/pos/CashQuickModal';
import ChangeFlash from '@/components/pos/ChangeFlash';
import PaymentModal, { type PaymentResult } from '@/components/pos/PaymentModal';
import PinSwitchModal from '@/components/pos/PinSwitchModal';
import { CloseShiftModal, ShiftSummaryModal } from '@/components/pos/ShiftModals';
import type { CartItem, Customer, PaymentMethod, Product, Sale, Shift, Terminal } from '@/types';
import { useTranslation } from '@/i18n';
import LanguageToggle from '@/components/layout/LanguageToggle';

const CATALOG_REFRESH_MS = 60_000;
const SYNC_INTERVAL_MS = 20_000;
const LOW_STOCK = 10;
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
    <span className="hidden text-sm tabular-nums text-brand-500 md:inline">
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
    replaceCart,
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
  /** Cash uses the fast tender popup unless cashier opens the full payment form. */
  const [fullPayForm, setFullPayForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState('');
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  /** Cash change shown full-screen for a few seconds after Take. */
  const [changeFlash, setChangeFlash] = useState<{ amount: number; invoiceNo: string } | null>(null);
  const [category, setCategory] = useState('All');
  const [productSearch, setProductSearch] = useState('');
  const [searchHits, setSearchHits] = useState<Product[] | null>(null);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [holdsOpen, setHoldsOpen] = useState(false);
  const [holdBusy, setHoldBusy] = useState(false);
  const [scanFlash, setScanFlash] = useState(false);
  const [notice, setNotice] = useState<{ text: string; kind: 'warning' | 'error' } | null>(null);
  const [pinSwitchOpen, setPinSwitchOpen] = useState(false);
  /** Phones show the bill or the products; the charge bar stays visible either way. */
  const [mobilePane, setMobilePane] = useState<'bill' | 'products'>('bill');
  /** Last line touched by a scan or tap, so it can highlight and scroll into view. */
  const [lastAdded, setLastAdded] = useState<{ id: string; n: number } | null>(null);
  const confirmOpen = useConfirmStore((state) => !!state.request);
  const { theme, toggleTheme } = useThemeStore();
  const scannerRef = useRef<HTMLInputElement>(null);
  const billListRef = useRef<HTMLDivElement>(null);
  // Kept until the bill changes, so a retry after a lost reply can't charge the customer twice.
  const saleUuid = useRef(newUuid());
  /** Prevents double auto-open while the open request is in flight. */
  const autoOpenedFor = useRef<number | null>(null);

  const modalOpen = !!payMethod || !!completedSale || !!changeFlash || closingShift || !!closedShift || confirmOpen;

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
    if (can('customers.view')) {
      customersApi.list({ page_size: 200 }).then(({ data }) => setCustomers(data.results)).catch(() => undefined);
    }
    void syncPending();
    const timer = window.setInterval(() => void syncPending(), SYNC_INTERVAL_MS);
    const onOnline = () => void syncPending();
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
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

  const sellableProducts = useMemo(() => products.filter((p) => p.active), [products]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(sellableProducts.map((p) => p.category))).sort()],
    [sellableProducts],
  );

  useEffect(() => {
    const q = productSearch.trim();
    if (q.length < 2) {
      setSearchHits(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void inventoryApi
        .searchProducts(q, { limit: 48 })
        .then(({ data }) => {
          if (!cancelled) setSearchHits(data.results.map(mapProductFromApi).filter((p) => !isExpired(p)));
        })
        .catch(() => {
          if (!cancelled) setSearchHits([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [productSearch]);

  const filteredProducts = useMemo(() => {
    const base = (searchHits ?? sellableProducts).filter((p) => !isExpired(p));
    if (category === 'All') return base;
    return base.filter((p) => p.category === category);
  }, [category, searchHits, sellableProducts]);

  const refreshHolds = useCallback(async () => {
    if (!activeCounter) {
      setHeldBills([]);
      return;
    }
    try {
      const { data } = await salesApi.heldBills(activeCounter.id);
      setHeldBills(data);
    } catch {
      setHeldBills([]);
    }
  }, [activeCounter]);

  useEffect(() => {
    void refreshHolds();
  }, [refreshHolds]);

  const holdCurrentBill = async () => {
    if (!activeCounter || cart.length === 0 || holdBusy) return;
    setHoldBusy(true);
    try {
      await salesApi.holdBill({
        terminal: activeCounter.id,
        label: t('pos.heldBillDefault', { count: heldBills.length + 1 }),
        lines: cart.map((item) => ({
          product_id: Number(item.product.id),
          quantity: String(item.quantity),
          name: item.product.name,
          barcode: item.product.barcode,
          unit_price: item.product.salePrice.toFixed(2),
        })),
      });
      clearCart();
      await refreshHolds();
      toast(t('pos.billHeld'));
      focusScanner();
    } catch (err) {
      setNotice({ text: apiErrorMessage(err, t('pos.holdFailed')), kind: 'error' });
    } finally {
      setHoldBusy(false);
    }
  };

  const recallHeldBill = async (bill: HeldBill) => {
    if (holdBusy) return;
    if (cart.length > 0) {
      const ok = await confirmAction({
        title: t('pos.recallReplaceTitle'),
        body: t('pos.recallReplaceBody'),
        confirmLabel: t('pos.recallBill'),
      });
      if (!ok) return;
    }
    setHoldBusy(true);
    try {
      const items: CartItem[] = bill.lines.map((line) => {
        const existing = products.find((product) => Number(product.id) === line.product_id);
        const product = existing ?? {
          id: String(line.product_id),
          active: true,
          name: line.name,
          barcode: line.barcode,
          sku: line.barcode,
          price: Number(line.unit_price),
          salePrice: Number(line.unit_price),
          cost: 0,
          stock: 0,
          category: '',
          status: 'in_stock' as const,
        };
        return { product, quantity: Number(line.quantity) };
      });
      replaceCart(items);
      await salesApi.deleteHeldBill(bill.id);
      setHoldsOpen(false);
      await refreshHolds();
      setMobilePane('bill');
      focusScanner();
    } catch (err) {
      setNotice({ text: apiErrorMessage(err, t('pos.recallFailed')), kind: 'error' });
    } finally {
      setHoldBusy(false);
    }
  };

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
      setLastAdded((prev) => ({ id: product.id, n: (prev?.n ?? 0) + 1 }));
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

      const needle = q.toLowerCase();
      const exact = sellableProducts.find(
        (p) =>
          p.barcode.toLowerCase() === needle
          || (p.extraBarcodes ?? []).some((code) => code.toLowerCase() === needle),
      );
      if (exact) {
        addProduct(exact);
        setMobilePane('bill');
        return;
      }

      // By name only: a half-read barcode must never add the wrong item by itself.
      const byName = sellableProducts.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
      if (byName.length === 1) {
        addProduct(byName[0]);
        setMobilePane('bill');
        return;
      }
      if (byName.length === 0) {
        setNotice({ text: t('pos.notFound', { code: q }), kind: 'error' });
        beep();
      }
      setProductSearch(q);
      setScannerInput('');
    },
    [addProduct, sellableProducts, setScannerInput, t],
  );

  const handleScannerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resolveAndAdd(scannerInput);
  };

  const startPayment = useCallback(
    (method: PaymentMethod) => {
      if (cart.length === 0 || modalOpen || !shift) return;
      setPayError('');
      setFullPayForm(method !== 'cash');
      setPayMethod(method);
    },
    [cart.length, modalOpen, shift],
  );

  /** Card, wallets, split and khata all go through the full payment form. */
  const startFullPayment = useCallback(() => {
    if (cart.length === 0 || modalOpen || !shift) return;
    setPayError('');
    setFullPayForm(true);
    setPayMethod('cash');
  }, [cart.length, modalOpen, shift]);

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
      setFullPayForm(false);
      setNotice(null);
      const cashOnly = result.payments.length > 0 && result.payments.every((p) => p.method === 'cash');
      if (result.print) {
        void printReceipt(sale);
      }
      if (cashOnly) {
        setCompletedSale(null);
        setChangeFlash({ amount: Number(sale.change_due), invoiceNo: sale.invoice_no });
      } else {
        setCompletedSale(sale);
      }
    };
    try {
      const { data } = await salesApi.create(payload);
      afterSale(data);
      void refreshShift(activeCounter.id).catch(() => undefined);
    } catch (err) {
      const lostConnection = !(err as { response?: unknown }).response;
      if (lostConnection) {
        // Server unreachable: finish here (cash or khata) and sync when back online.
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
        setPayError(apiErrorMessage(err, t('pos.saleFailed')));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const finishSale = useCallback(() => {
    setCompletedSale(null);
    focusScanner();
  }, [focusScanner]);

  const handleClearCart = useCallback(async () => {
    if (cart.length === 0 || useConfirmStore.getState().request) return;
    const confirmed = await confirmAction({
      title: t('pos.clearBillTitle'),
      body: t('pos.confirmClear'),
      confirmLabel: t('pos.clearAll'),
      tone: 'danger',
    });
    if (!confirmed) {
      focusScanner();
      return;
    }
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
    autoOpenedFor.current = null;
    setShiftLoaded(false);
    setActiveCounter(counter);
  };

  const openShift = useCallback(async (amount: string) => {
    if (!activeCounter) return;
    const { data } = await salesApi.openShift(activeCounter.id, amount);
    setShift(data);
    focusScanner();
  }, [activeCounter, focusScanner]);

  // Auto-open with Rs 0 so a rush is never blocked by the opening-cash popup.
  // Close-shift still counts the drawer for accountability.
  useEffect(() => {
    if (!activeCounter || !shiftLoaded || shift || closedShift) return;
    if (autoOpenedFor.current === activeCounter.id) return;
    autoOpenedFor.current = activeCounter.id;
    void openShift('0').catch(() => {
      autoOpenedFor.current = null;
      setNotice({ text: t('pos.shiftOpenFailed'), kind: 'error' });
    });
  }, [activeCounter, closedShift, openShift, shift, shiftLoaded, t]);

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

  // Bring the line that just changed into view; long bills scroll.
  useEffect(() => {
    if (!lastAdded) return;
    billListRef.current
      ?.querySelector<HTMLElement>(`[data-line="${CSS.escape(lastAdded.id)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [lastAdded]);

  // Say once when sales queued offline have all reached the server.
  const pendingCount = pendingSales.length;
  const prevPending = useRef(pendingCount);
  useEffect(() => {
    if (prevPending.current > 0 && pendingCount === 0) toast(t('pos.allSynced'));
    prevPending.current = pendingCount;
  }, [pendingCount, t]);

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

  // A scanner just types, so a click elsewhere must not swallow the next scan.
  useEffect(() => {
    if (modalOpen) return;
    const handler = (event: KeyboardEvent) => {
      const typingElsewhere = (event.target as HTMLElement).closest?.('input, select, textarea');
      if (!typingElsewhere && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        scannerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalOpen]);

  useKeyboardShortcut('f2', focusScanner);
  useKeyboardShortcut('f4', () => void handleClearCart(), { ctrl: true });
  useKeyboardShortcut('f1', () => startPayment('cash'));
  useKeyboardShortcut('f9', () => startPayment('card'), { ctrl: true });

  const subtotal = cartTotal();
  const itemCount = cartItemCount();
  const empty = cart.length === 0;
  const tillReady = !!shift;
  const inCart = new Map(cart.map((item) => [item.product.id, item.quantity]));
  const barButton =
    'flex h-8 items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-white px-2.5 text-sm font-medium text-brand-700 shadow-soft transition-colors hover:bg-brand-50 hover:text-brand-900 focus-ring disabled:cursor-not-allowed disabled:opacity-45 dark:border-brand-800 dark:bg-brand-900 dark:text-brand-200 dark:hover:bg-brand-800 dark:hover:text-white';
  const payButton =
    'flex h-10 items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-white px-2 text-sm font-medium text-brand-800 shadow-soft transition-colors hover:bg-brand-50 focus-ring disabled:cursor-not-allowed disabled:opacity-45 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100 dark:hover:bg-brand-800';

  return (
    <div className="flex h-[100dvh] flex-col bg-brand-50 text-brand-900 dark:bg-brand-950 dark:text-brand-50">
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_minmax(380px,30vw)] lg:grid-rows-[minmax(0,1fr)_auto] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        {/* Left: register bar, scanner, catalogue */}
        <div className="flex min-h-0 flex-col lg:row-span-2">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-brand-200 bg-white px-3 sm:gap-3 sm:px-5 dark:border-brand-800 dark:bg-brand-950">
            {homePath(user) !== '/pos' ? (
              <Link to={homePath(user)} aria-label={t('pos.backToDashboard')} title={t('pos.backToDashboard')} className={cn(barButton, 'w-8 px-0')}>
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              </Link>
            ) : (
              <BrandMark size={28} />
            )}
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">{activeCounter?.name ?? t('pos.title')}</p>
              <p className="hidden truncate text-xs text-brand-500 sm:block">
                {user?.full_name}
                {shift && <> · {t('pos.shiftSales')} <span className="tabular-nums">{formatCurrency(Number(shift.sales_total))}</span></>}
              </p>
            </div>
            {terminals.length > 1 && (
              <div role="group" aria-label={t('pos.counter')} className="ms-1 flex rounded-lg bg-brand-100 p-0.5 dark:bg-brand-900">
                {terminals.map((counter) => (
                  <button
                    key={counter.id}
                    type="button"
                    onClick={() => chooseCounter(counter)}
                    aria-pressed={activeCounter?.id === counter.id}
                    title={counter.name}
                    className={cn(
                      'h-7 rounded-md px-2.5 text-xs font-semibold transition-colors',
                      activeCounter?.id === counter.id
                        ? 'bg-white text-brand-900 shadow-soft ring-1 ring-brand-200 dark:bg-brand-800 dark:text-white dark:ring-brand-700'
                        : 'text-brand-500 hover:text-brand-900 dark:hover:text-white',
                    )}
                  >
                    {counter.code}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1" />
            {pendingSales.length > 0 ? (
              <span role="status" className="flex h-7 items-center gap-1.5 rounded-md bg-amber-50 px-2 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <WifiOff className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('pos.pendingSync', { count: pendingSales.length })}</span>
                <span className="sm:hidden">{pendingSales.length}</span>
              </span>
            ) : (
              <span className="hidden h-7 items-center gap-1.5 rounded-md bg-emerald-50 px-2 text-xs font-medium text-emerald-700 sm:flex dark:bg-emerald-500/10 dark:text-emerald-300">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t('pos.online')}
              </span>
            )}
            <LiveClock />
            <div className="hidden md:block"><LanguageToggle compact /></div>
            <button type="button" onClick={toggleTheme} aria-label="Toggle theme" className={cn(barButton, 'w-8 px-0')}>
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => setPinSwitchOpen(true)} aria-label={t('pos.switchCashier')} title={t('pos.switchCashier')} className={cn(barButton, 'w-8 px-0')}>
              <KeyRound className="h-4 w-4" />
            </button>
            {shift && (
              <button
                type="button"
                onClick={() => setClosingShift(true)}
                disabled={cart.length > 0 || pendingSales.length > 0}
                title={cart.length > 0 || pendingSales.length > 0 ? t('pos.closeShiftBlocked') : undefined}
                className={barButton}
              >
                <Lock className="h-4 w-4" /> <span className="hidden sm:inline">{t('pos.closeShift')}</span>
              </button>
            )}
            <button type="button" onClick={() => void logout()} aria-label={t('common.logout')} title={t('common.logout')} className={cn(barButton, 'w-8 px-0')}>
              <LogOut className="h-4 w-4 rtl:rotate-180" />
            </button>
          </header>
          <PinSwitchModal open={pinSwitchOpen} onClose={() => setPinSwitchOpen(false)} />

          <div className="shrink-0 px-3 pt-3 sm:px-5 sm:pt-4">
            <form onSubmit={handleScannerSubmit}>
              <div
                className={cn(
                  'flex h-12 items-center rounded-xl border bg-white transition-[border-color,box-shadow] duration-100 dark:bg-brand-900',
                  scanFlash
                    ? 'border-emerald-500 shadow-[0_0_0_4px_rgb(16_185_129/0.15)]'
                    : 'border-brand-200 focus-within:border-accent focus-within:shadow-[0_0_0_4px_rgb(var(--accent)/0.12)] dark:border-brand-700',
                )}
              >
                <ScanBarcode className={cn('ms-3.5 h-5 w-5 shrink-0', scanFlash ? 'text-emerald-600' : 'text-accent')} />
                <input
                  ref={scannerRef}
                  value={scannerInput}
                  onChange={(e) => {
                    setScannerInput(e.target.value);
                    setProductSearch(e.target.value);
                    if (e.target.value) setMobilePane('products');
                  }}
                  placeholder={t('pos.scanPlaceholder')}
                  aria-label={t('pos.scanPlaceholder')}
                  aria-keyshortcuts="F2"
                  className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] text-brand-900 placeholder:text-brand-400 focus:outline-none dark:text-white"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
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
                    aria-label={t('pos.clearSearch')}
                    className="me-1 flex h-8 w-8 items-center justify-center rounded-lg text-brand-400 hover:bg-brand-100 hover:text-brand-700 dark:hover:bg-brand-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <button type="submit" className="me-1.5 flex h-9 items-center gap-1.5 rounded-lg bg-brand-900 px-3 text-sm font-medium text-white hover:bg-brand-800 dark:bg-white dark:text-brand-900">
                  <CornerDownLeft className="h-4 w-4 rtl:-scale-x-100" />
                  <span className="hidden sm:inline">{t('pos.addButton')}</span>
                </button>
              </div>
            </form>
            {(notice || catalogFailed) && (
              <p
                role="alert"
                className={cn(
                  'mt-2 rounded-lg px-3 py-2 text-sm font-medium',
                  notice?.kind === 'warning'
                    ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
                    : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200',
                )}
              >
                {notice?.text ?? t('pos.catalogError')}
              </p>
            )}

            <div role="tablist" aria-label={t('pos.currentBill')} className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-brand-100 p-1 lg:hidden dark:bg-brand-900">
              {([
                ['bill', ReceiptText, `${t('pos.currentBill')}${itemCount ? ` · ${itemCount}` : ''}`],
                ['products', LayoutGrid, t('pos.products')],
              ] as const).map(([pane, Icon, label]) => (
                <button
                  key={pane}
                  type="button"
                  role="tab"
                  aria-selected={mobilePane === pane}
                  onClick={() => setMobilePane(pane)}
                  className={cn(
                    'flex h-8 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors',
                    mobilePane === pane ? 'bg-white text-brand-900 shadow-soft dark:bg-brand-800 dark:text-white' : 'text-brand-500',
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            <div className={cn('mt-3 gap-1 overflow-x-auto pb-1 scrollbar-none lg:flex', mobilePane === 'products' ? 'flex' : 'hidden')}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  aria-pressed={category === cat}
                  className={cn(
                    'h-8 shrink-0 rounded-lg px-3 text-sm font-medium transition-colors',
                    category === cat
                      ? 'bg-white text-brand-900 shadow-soft ring-1 ring-brand-200 dark:bg-brand-800 dark:text-white dark:ring-brand-700'
                      : 'text-brand-600 hover:bg-white hover:text-brand-900 dark:text-brand-400 dark:hover:bg-brand-900 dark:hover:text-white',
                  )}
                >
                  {cat === 'All' ? t('common.all') : cat}
                </button>
              ))}
            </div>
          </div>

          <section
            aria-label={t('pos.products')}
            className={cn('min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2 sm:px-5 lg:block', mobilePane === 'products' ? 'block' : 'hidden')}
          >
            {filteredProducts.length === 0 ? (
              <EmptyState icon={PackageSearch} title={t('pos.noProducts')} description={productSearch ? t('pos.noProductsHint') : undefined} />
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filteredProducts.map((product) => {
                  const qty = inCart.get(product.id);
                  const out = product.stock <= 0;
                  const low = !out && product.stock <= LOW_STOCK;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addProduct(product)}
                      className={cn(
                        'relative flex min-h-[112px] flex-col rounded-xl bg-white p-3 text-start shadow-soft transition-[box-shadow,transform] duration-100 active:scale-[0.98] focus-ring dark:bg-brand-900',
                        qty ? 'ring-2 ring-brand-900 dark:ring-white' : 'ring-1 ring-brand-200 hover:ring-brand-300 dark:ring-brand-800 dark:hover:ring-brand-700',
                        out && 'opacity-60',
                      )}
                    >
                      {qty !== undefined && (
                        <span className="absolute end-2.5 top-2.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-brand-900 px-1.5 text-xs font-semibold tabular-nums text-white dark:bg-white dark:text-brand-900">
                          {qty}
                        </span>
                      )}
                      <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-xs font-semibold text-brand-600 dark:bg-brand-800 dark:text-brand-300">
                        {product.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}
                      </span>
                      <span className="mt-auto line-clamp-2 pt-2 text-[13px] font-medium leading-snug">{product.name}</span>
                      <span className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="num text-sm font-semibold">{formatCurrency(product.salePrice)}</span>
                        <span className={cn('text-xs tabular-nums', out ? 'font-medium text-red-600 dark:text-red-400' : low ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-brand-400')}>
                          {product.stock} {t('pos.stockLeft')}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="hidden shrink-0 items-center gap-4 border-t border-brand-200 bg-white px-5 py-2 text-xs text-brand-500 xl:flex dark:border-brand-800 dark:bg-brand-950">
            {[
              ['F2', t('pos.shortcutsScanner')],
              ['F1', t('pos.charge')],
              ['Ctrl F9', t('pos.cardShort')],
              ['Ctrl F4', t('pos.shortcutsClear')],
            ].map(([key, label]) => (
              <span key={key} className="flex items-center gap-1.5"><kbd>{key}</kbd>{label}</span>
            ))}
          </div>
        </div>

        {/* Right: the sale */}
        <section
          aria-label={t('pos.currentBill')}
          className={cn(
            'min-h-0 flex-col border-brand-200 bg-white lg:col-start-2 lg:row-start-1 lg:flex lg:border-s dark:border-brand-800 dark:bg-brand-950',
            mobilePane === 'bill' ? 'flex' : 'hidden',
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-brand-200 px-4 sm:px-5 dark:border-brand-800">
            <h2 className="text-[15px] font-semibold">
              {t('pos.currentBill')}
              <span className="ms-2 text-sm font-normal text-brand-500"><span className="tabular-nums">{itemCount}</span> {t('common.items')}</span>
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  void refreshHolds();
                  setHoldsOpen(true);
                }}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-brand-800"
              >
                <Play className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('pos.heldBills')}</span>
                {heldBills.length > 0 && <span className="tabular-nums">({heldBills.length})</span>}
              </button>
              {!empty && (
                <>
                  <button
                    type="button"
                    disabled={holdBusy || !tillReady}
                    onClick={() => void holdCurrentBill()}
                    className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-100 disabled:opacity-45 dark:text-brand-300 dark:hover:bg-brand-800"
                  >
                    <Pause className="h-3.5 w-3.5" /> {t('pos.holdBill')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleClearCart()}
                    aria-keyshortcuts="Control+F4"
                    className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-brand-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t('pos.clearAll')}
                  </button>
                </>
              )}
            </div>
          </div>

          <div ref={billListRef} className="min-h-0 flex-1 overflow-y-auto">
            {empty ? (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-6 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <ScanBarcode className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold">{t('pos.scannerReady')}</p>
                <p className="mt-1 max-w-[16rem] text-sm text-brand-500">{t('pos.scannerHint')}</p>
              </div>
            ) : (
              <ul>
                {cart.map((item) => {
                  const flash = lastAdded?.id === item.product.id;
                  return (
                    <li
                      key={flash ? `${item.product.id}-${lastAdded?.n}` : item.product.id}
                      data-line={item.product.id}
                      className={cn(
                        'flex items-center gap-3 border-b border-brand-100 px-4 py-3 sm:px-5 dark:border-brand-800/70',
                        flash && 'animate-row-in shadow-[inset_2px_0_0_rgb(var(--accent))]',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.product.name}</p>
                        <p className="mt-0.5 truncate text-xs text-brand-500">
                          <span className="tabular-nums">{formatCurrency(item.product.salePrice)}</span>
                          {item.quantity > item.product.stock && (
                            <span className="ms-2 font-medium text-amber-700 dark:text-amber-300">{t('pos.moreThanStock', { stock: item.product.stock })}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center rounded-lg border border-brand-200 dark:border-brand-700">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          aria-label={t('pos.decreaseQty', { name: item.product.name })}
                          className="flex h-8 w-8 items-center justify-center rounded-s-lg text-brand-500 hover:bg-brand-100 hover:text-brand-900 dark:hover:bg-brand-800 dark:hover:text-white"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        {item.product.qtyDecimal ? (
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            inputMode="decimal"
                            aria-label={t('pos.qty')}
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.product.id, Number(e.target.value))}
                            className="h-8 w-16 border-x border-brand-200 bg-transparent text-center text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent/40 dark:border-brand-700"
                          />
                        ) : (
                          <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          aria-label={t('pos.increaseQty', { name: item.product.name })}
                          className="flex h-8 w-8 items-center justify-center rounded-e-lg text-brand-500 hover:bg-brand-100 hover:text-brand-900 dark:hover:bg-brand-800 dark:hover:text-white"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="num w-[5.5rem] shrink-0 text-end text-sm font-semibold">
                        {formatCurrency(Math.round(item.product.salePrice * item.quantity * 100) / 100)}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.id)}
                        aria-label={t('pos.removeItem', { name: item.product.name })}
                        className="-me-1.5 shrink-0 rounded-md p-1.5 text-brand-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Totals and charge: always visible, under the sale on desktop, pinned at the bottom on phones */}
        <div className="shrink-0 border-t border-brand-200 bg-brand-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 lg:col-start-2 lg:row-start-2 lg:border-s dark:border-brand-800 dark:bg-[#0f1013]">
          <div className="flex justify-between py-0.5 text-sm text-brand-500">
            <span>{t('pos.subtotal')}</span>
            <span className="tabular-nums">{formatCurrency(subtotal)}</span>
          </div>
          <p className="py-0.5 text-xs text-brand-400">{t('pos.taxIncluded')}</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[15px] font-semibold">{t('pos.total')}</span>
            <span className="num text-[34px] font-semibold leading-none" aria-live="polite">{formatCurrency(subtotal)}</span>
          </div>
          <button
            type="button"
            disabled={empty || !tillReady}
            onClick={() => startPayment('cash')}
            aria-keyshortcuts="F1"
            className="mt-3 flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-brand-900 text-base font-semibold text-white shadow-soft transition-[background-color,transform] hover:bg-brand-800 active:scale-[0.99] focus-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 dark:bg-white dark:text-brand-900 dark:hover:bg-brand-100"
          >
            {t('pos.charge')} <span className="num">{formatCurrency(subtotal)}</span>
            <kbd className="border-white/20 bg-white/10 text-white/80 dark:border-brand-300 dark:bg-brand-100 dark:text-brand-600">F1</kbd>
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={empty || !tillReady} onClick={() => startPayment('jazzcash')} className={payButton}>
              <Smartphone className="h-4 w-4 shrink-0" /> <span className="truncate">{t('pos.jazzcash')}</span>
            </button>
            <button type="button" disabled={empty || !tillReady} onClick={() => startPayment('easypaisa')} className={payButton}>
              <Smartphone className="h-4 w-4 shrink-0" /> <span className="truncate">{t('pos.easypaisa')}</span>
            </button>
            <button type="button" disabled={empty || !tillReady} onClick={() => startPayment('card')} aria-keyshortcuts="Control+F9" className={payButton}>
              <CreditCard className="h-4 w-4 shrink-0" /> <span className="truncate">{t('pos.cardPay')}</span>
            </button>
            <button type="button" disabled={empty || !tillReady} onClick={startFullPayment} className={payButton}>
              <SplitSquareHorizontal className="h-4 w-4 shrink-0" /> <span className="truncate">{t('pos.split')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="text-brand-900 dark:text-brand-50">
        <CashQuickModal
          open={payMethod === 'cash' && !fullPayForm}
          total={subtotal}
          submitting={submitting}
          error={payError}
          onClose={() => {
            setPayMethod(null);
            setFullPayForm(false);
            focusScanner();
          }}
          onNeedMoreOptions={() => setFullPayForm(true)}
          onConfirm={(result) => void completeSale(result)}
        />

        <PaymentModal
          open={!!payMethod && (payMethod !== 'cash' || fullPayForm)}
          total={subtotal}
          initialMethod={payMethod ?? 'cash'}
          canDiscount={can('pos.discount')}
          customers={customers}
          submitting={submitting}
          error={payError}
          onClose={() => {
            setPayMethod(null);
            setFullPayForm(false);
            focusScanner();
          }}
          onConfirm={(result) => void completeSale(result)}
        />

        {changeFlash && (
          <ChangeFlash
            amount={changeFlash.amount}
            invoiceNo={changeFlash.invoiceNo}
            onDone={() => {
              setChangeFlash(null);
              focusScanner();
            }}
          />
        )}

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
              <Button variant="primary" autoFocus onClick={finishSale}>{t('pos.newSale')}</Button>
            </>
          }
        >
          {completedSale && (
            <div className="text-sm">
              <div className="flex flex-col items-center rounded-xl bg-emerald-50 px-4 py-5 text-center dark:bg-emerald-500/10">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                <p className="mt-3 text-sm font-medium text-emerald-800 dark:text-emerald-200">{t('pos.changeDue')}</p>
                <p className="num mt-1 text-4xl font-semibold text-emerald-700 dark:text-emerald-300" data-testid="change-due">
                  {formatCurrency(Number(completedSale.change_due))}
                </p>
              </div>
              <dl className="mt-4 space-y-2">
                <div className="flex justify-between gap-3">
                  <dt className="text-brand-500">{t('pos.billTotal')}</dt>
                  <dd className="num font-semibold">{formatCurrency(Number(completedSale.total))}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-brand-500">{t('pos.invoice')}</dt>
                  <dd dir="ltr" className="font-medium tabular-nums" data-testid="invoice-no">{completedSale.invoice_no}</dd>
                </div>
              </dl>
              {completedSale.is_offline && (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('pos.offlineSaleNote')}
                </p>
              )}
            </div>
          )}
        </Modal>

        {closingShift && <CloseShiftModal onClose={() => setClosingShift(false)} onSubmit={closeShift} />}
        {closedShift && (
          <ShiftSummaryModal
            shift={closedShift}
            onClose={() => {
              autoOpenedFor.current = null;
              setClosedShift(null);
            }}
          />
        )}

        <Modal
          open={holdsOpen}
          onClose={() => setHoldsOpen(false)}
          title={t('pos.heldBills')}
          size="md"
          footer={<Button variant="outline" onClick={() => setHoldsOpen(false)}>{t('common.close')}</Button>}
        >
          {heldBills.length === 0 ? (
            <EmptyState title={t('pos.noHeldBills')} compact />
          ) : (
            <ul className="divide-y divide-brand-100 dark:divide-brand-800">
              {heldBills.map((bill) => (
                <li key={bill.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{bill.label || t('pos.heldBill')}</p>
                    <p className="text-xs text-brand-500">
                      {bill.item_count} {t('common.items')} · {formatCurrency(Number(bill.subtotal))}
                      {bill.held_by_name ? ` · ${bill.held_by_name}` : ''}
                    </p>
                  </div>
                  <Button variant="accent" size="sm" loading={holdBusy} onClick={() => void recallHeldBill(bill)}>
                    {t('pos.recallBill')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      </div>
    </div>
  );
}
