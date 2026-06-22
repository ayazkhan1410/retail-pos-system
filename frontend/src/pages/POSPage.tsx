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
} from 'lucide-react';
import { usePOSStore, useInventoryStore } from '@/store';
import { useKeyboardShortcut } from '@/hooks';
import { Button } from '@/components/ui';
import { PRODUCT_CATEGORIES } from '@/utils/mockData';
import { formatCurrency, cn } from '@/utils';
import { useTranslation } from '@/i18n';
import LanguageToggle from '@/components/layout/LanguageToggle';

const COUNTERS = [
  { id: '1', name: 'C1', active: true },
  { id: '2', name: 'C2', active: true },
];

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
    cartTotal,
    cartItemCount,
  } = usePOSStore();
  const { products } = useInventoryStore();

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [category, setCategory] = useState('All');
  const [productSearch, setProductSearch] = useState('');
  const [scanFlash, setScanFlash] = useState(false);
  const scannerRef = useRef<HTMLInputElement>(null);

  const focusScanner = useCallback(() => {
    window.requestAnimationFrame(() => scannerRef.current?.focus());
  }, []);

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase();
    return products.filter((p) => {
      const matchCat = category === 'All' || p.category === category;
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.barcode.includes(productSearch) ||
        p.sku.toLowerCase().includes(q) ||
        (p.aluCode?.toLowerCase().includes(q) ?? false);
      return matchCat && matchSearch && p.stock > 0;
    });
  }, [category, productSearch, products]);

  const flashScanOk = () => {
    setScanFlash(true);
    window.setTimeout(() => setScanFlash(false), 120);
  };

  const addProduct = useCallback(
    (productId: string) => {
      const product = products.find((p) => p.id === productId);
      if (product && product.stock > 0) {
        addToCart({ product, quantity: 1, discount: 0 });
        flashScanOk();
        setScannerInput('');
        setProductSearch('');
        focusScanner();
      }
    },
    [addToCart, focusScanner, products, setScannerInput],
  );

  const resolveAndAdd = useCallback(
    (query: string) => {
      const q = query.trim();
      if (!q) return false;

      const exact =
        products.find((p) => p.barcode === q && p.stock > 0) ||
        products.find((p) => p.sku === q && p.stock > 0) ||
        products.find((p) => p.aluCode === q && p.stock > 0);

      if (exact) {
        addToCart({ product: exact, quantity: 1, discount: 0 });
        flashScanOk();
        setScannerInput('');
        setProductSearch('');
        focusScanner();
        return true;
      }

      const qLower = q.toLowerCase();
      const matches = products.filter(
        (p) =>
          p.stock > 0 &&
          (p.name.toLowerCase().includes(qLower) ||
            p.barcode.includes(q) ||
            p.sku.toLowerCase().includes(qLower)),
      );

      if (matches.length === 1) {
        addToCart({ product: matches[0], quantity: 1, discount: 0 });
        flashScanOk();
        setScannerInput('');
        setProductSearch('');
        focusScanner();
        return true;
      }

      setProductSearch(q);
      setScannerInput('');
      return false;
    },
    [addToCart, focusScanner, products, setScannerInput],
  );

  const handleScannerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resolveAndAdd(scannerInput);
  };

  const handleCheckout = useCallback(
    async (method: string) => {
      if (cart.length === 0) return;
      setCheckoutLoading(true);
      await new Promise((r) => setTimeout(r, 200));
      clearCart();
      setCheckoutLoading(false);
      focusScanner();
      void method;
    },
    [cart.length, clearCart, focusScanner],
  );

  useEffect(() => {
    focusScanner();
  }, [focusScanner]);

  useKeyboardShortcut('f2', focusScanner);
  useKeyboardShortcut('f4', () => clearCart(), { ctrl: true });
  useKeyboardShortcut('f1', () => void handleCheckout('cash'));
  useKeyboardShortcut('f9', () => void handleCheckout('card'), { ctrl: true });

  const subtotal = cartTotal();
  const itemCount = cartItemCount();

  return (
    <div className="flex h-[100dvh] flex-col bg-pos-panel text-white">
      {/* Slim header */}
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-black/30 px-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/dashboard">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <span className="hidden text-sm font-bold sm:inline">{t('pos.title')}</span>
          <div className="flex gap-0.5 rounded-lg bg-white/5 p-0.5">
            {COUNTERS.map((counter) => (
              <button
                key={counter.id}
                type="button"
                onClick={() => setActiveCounter(counter)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-bold transition-all',
                  activeCounter.id === counter.id
                    ? 'bg-white text-brand-900'
                    : 'text-brand-400 hover:text-white',
                )}
              >
                {counter.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <LiveClock />
          <LanguageToggle compact />
          <span className="hidden text-xs text-brand-400 md:inline">
            {t('pos.todaySales')} <strong className="text-white">Rs. 1,48,250</strong>
          </span>
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
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>
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
                {activeCounter.name} · {itemCount} {t('common.items')}
              </p>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearCart();
                  focusScanner();
                }}
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
                    <th className="px-2 py-1.5 font-medium">Item</th>
                    <th className="px-2 py-1.5 text-center font-medium">Qty</th>
                    <th className="px-2 py-1.5 text-right font-medium">Amt</th>
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
                          {formatCurrency(item.product.price)}
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
                          <span className="min-w-[1.5rem] text-center text-xs font-bold">
                            {item.quantity}
                          </span>
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
                        {formatCurrency(item.product.price * item.quantity)}
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
                <span>{itemCount} items</span>
                <span className="mx-1.5">·</span>
                <span>{t('pos.discount')} Rs. 0</span>
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
              loading={checkoutLoading}
              disabled={cart.length === 0}
              onClick={() => void handleCheckout('cash')}
            >
              <Banknote className="h-5 w-5" /> {t('pos.cash')} <span className="text-white/70">(F1)</span>
            </Button>
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                className="h-9 border border-white/10 bg-white/10 text-xs text-white hover:bg-white/20"
                disabled={cart.length === 0}
                onClick={() => void handleCheckout('jazzcash')}
              >
                <Smartphone className="h-3.5 w-3.5" /> {t('pos.jazzcash')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-9 border border-white/10 bg-white/10 text-xs text-white hover:bg-white/20"
                disabled={cart.length === 0}
                onClick={() => void handleCheckout('easypaisa')}
              >
                <Smartphone className="h-3.5 w-3.5" /> {t('pos.easypaisa')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-9 border border-white/10 bg-white/10 text-xs text-white hover:bg-white/20"
                disabled={cart.length === 0}
                onClick={() => void handleCheckout('card')}
              >
                <CreditCard className="h-3.5 w-3.5" /> {t('pos.cardPay')}
              </Button>
            </div>
          </div>
        </div>

        {/* Products — compact backup when scan fails */}
        <div className="flex min-h-0 w-full flex-col lg:order-1 lg:w-[48%]">
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 px-2 py-1.5">
            {PRODUCT_CATEGORIES.map((cat) => (
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
                {cat}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5 sm:p-2">
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product.id)}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-left transition-colors hover:border-accent/40 hover:bg-white/10 active:scale-[0.98]"
                >
                  <p className="line-clamp-2 text-[11px] font-semibold leading-tight sm:text-xs">
                    {product.name}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-accent-glow">
                      {formatCurrency(product.price)}
                    </span>
                    <span className="text-[9px] text-brand-500">{product.stock}</span>
                  </div>
                </button>
              ))}
            </div>
            {filteredProducts.length === 0 && (
              <p className="py-8 text-center text-xs text-brand-500">No products found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
