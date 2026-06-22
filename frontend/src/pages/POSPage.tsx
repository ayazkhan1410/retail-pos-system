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
  Keyboard,
  Clock,
  Search,
  Package,
  X,
  Wallet,
} from 'lucide-react';
import { usePOSStore, useInventoryStore } from '@/store';
import { useKeyboardShortcut } from '@/hooks';
import { Button } from '@/components/ui';
import { PRODUCT_CATEGORIES } from '@/utils/mockData';
import { formatCurrency, cn } from '@/utils';
import { useTranslation } from '@/i18n';
import LanguageToggle from '@/components/layout/LanguageToggle';

const COUNTERS = [
  { id: '1', name: 'Counter 1', active: true },
  { id: '2', name: 'Counter 2', active: true },
];

const CATEGORY_COLORS: Record<string, string> = {
  Grocery: 'bg-amber-500/20 text-amber-400',
  Dairy: 'bg-blue-500/20 text-blue-400',
  Bakery: 'bg-orange-500/20 text-orange-400',
  Beverages: 'bg-emerald-500/20 text-emerald-400',
};

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 text-sm text-brand-400">
      <Clock className="h-4 w-4" />
      {time.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })}
    </div>
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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [category, setCategory] = useState('All');
  const [productSearch, setProductSearch] = useState('');
  const scannerRef = useRef<HTMLInputElement>(null);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = category === 'All' || p.category === category;
      const matchSearch =
        !productSearch ||
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.barcode.includes(productSearch);
      return matchCat && matchSearch && p.stock > 0;
    });
  }, [category, productSearch, products]);

  const handleScan = useCallback(
    (barcode: string) => {
      const product = products.find((p) => p.barcode === barcode);
      if (product && product.stock > 0) {
        addToCart({ product, quantity: 1, discount: 0 });
        setScannerInput('');
      }
    },
    [addToCart, setScannerInput, products],
  );

  const handleScannerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scannerInput.trim()) handleScan(scannerInput.trim());
  };

  useEffect(() => {
    scannerRef.current?.focus();
  }, []);

  useKeyboardShortcut('f2', () => scannerRef.current?.focus());
  useKeyboardShortcut('f4', () => clearCart(), { ctrl: true });
  useKeyboardShortcut('f9', () => handleCheckout(), { ctrl: true });

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setCheckoutLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    clearCart();
    setCheckoutLoading(false);
    scannerRef.current?.focus();
  };

  const subtotal = cartTotal();

  return (
    <div className="flex h-[100dvh] flex-col bg-pos-panel text-white">
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/20 px-3 py-2 backdrop-blur-md sm:gap-4 sm:px-5 sm:py-0 sm:h-16">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link to="/dashboard">
            <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-light shadow-glow sm:h-10 sm:w-10">
              <Scan className="h-4 w-4 text-white sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold sm:text-base">{t('pos.title')}</p>
              <p className="truncate text-[10px] text-brand-400 sm:text-[11px]">{t('pos.subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:gap-4">
          <div className="hidden sm:block">
            <LiveClock />
          </div>
          <LanguageToggle compact />
          <div className="hidden items-center gap-1.5 rounded-xl bg-white/5 px-3 py-1.5 md:flex">
            <Wallet className="h-3.5 w-3.5 text-accent-glow" />
            <span className="text-xs text-brand-400">{t('pos.todaySales')}</span>
            <span className="text-sm font-bold">Rs. 1,48,250</span>
          </div>
          <div className="flex gap-1 rounded-xl bg-white/5 p-1">
            {COUNTERS.map((counter) => (
              <button
                key={counter.id}
                onClick={() => setActiveCounter(counter)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:text-sm',
                  activeCounter.id === counter.id
                    ? 'bg-white text-brand-900 shadow-lg'
                    : 'text-brand-400 hover:text-white',
                )}
              >
                {counter.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="hidden h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-brand-400 hover:bg-white/20 hover:text-white sm:flex"
          >
            <Keyboard className="h-4 w-4" />
          </button>
        </div>
      </header>

      {showShortcuts && (
        <div className="flex shrink-0 flex-wrap gap-3 border-b border-white/10 bg-black/30 px-3 py-2 text-xs text-brand-400 sm:gap-6 sm:px-5">
          <span><kbd className="rounded-md bg-white/10 px-2 py-0.5 font-mono">F2</kbd> {t('pos.shortcutsScanner')}</span>
          <span><kbd className="rounded-md bg-white/10 px-2 py-0.5 font-mono">Ctrl+F4</kbd> {t('pos.shortcutsClear')}</span>
          <span><kbd className="rounded-md bg-white/10 px-2 py-0.5 font-mono">Ctrl+F9</kbd> {t('pos.shortcutsCheckout')}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left — Scanner + Products */}
        <div className="flex min-h-0 flex-1 flex-col border-b border-white/10 lg:w-[58%] lg:border-b-0 lg:border-r">
          {/* Scanner */}
          <form onSubmit={handleScannerSubmit} className="shrink-0 border-b border-white/10 p-3 sm:p-5">
            <div className="relative">
              <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-accent/40 to-accent-glow/20 opacity-50 blur-sm" />
              <div className="relative flex items-center overflow-hidden rounded-2xl border border-white/20 bg-black/40 backdrop-blur-sm">
                <Scan className="ml-5 h-6 w-6 shrink-0 text-accent-glow animate-pulse-soft" />
                <input
                  ref={scannerRef}
                  value={scannerInput}
                  onChange={(e) => setScannerInput(e.target.value)}
                  placeholder={t('pos.scanPlaceholder')}
                  className="h-12 flex-1 bg-transparent px-3 text-base font-medium text-white placeholder:text-brand-500 focus:outline-none sm:h-16 sm:px-4 sm:text-lg"
                  autoFocus
                />
                {scannerInput && (
                  <button type="button" onClick={() => setScannerInput('')} className="mr-4 text-brand-500 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* Product filters */}
          <div className="shrink-0 space-y-3 border-b border-white/10 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder={t('pos.productSearch')}
                className="h-10 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 text-sm text-white placeholder:text-brand-500 focus:border-accent/50 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                    category === cat
                      ? 'bg-white text-brand-900'
                      : 'bg-white/5 text-brand-400 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart({ product, quantity: 1, discount: 0 })}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-all duration-200 hover:border-accent/40 hover:bg-white/10 hover:shadow-pos-glow active:scale-[0.98]"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
                    <Package className="h-6 w-6 text-brand-400 group-hover:text-accent-glow" />
                  </div>
                  <span className={cn('mb-2 inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase', CATEGORY_COLORS[product.category] || 'bg-white/10 text-brand-400')}>
                    {product.category}
                  </span>
                  <p className="line-clamp-2 text-sm font-semibold leading-snug">{product.name}</p>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="font-display text-lg font-bold text-white">{formatCurrency(product.price)}</span>
                    <span className="text-[11px] text-brand-500">{product.stock} {t('pos.stockLeft')}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right — Cart */}
        <div className="flex max-h-[45vh] min-h-[240px] flex-col bg-black/20 lg:max-h-none lg:w-[42%] lg:min-h-0">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-3 sm:px-5 sm:py-4">
            <div>
              <h2 className="font-display text-base font-bold sm:text-lg">{t('pos.currentBill')}</h2>
              <p className="text-sm text-brand-500">
                {activeCounter.name} · {cartItemCount()} {t('common.items')}
              </p>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> {t('pos.clearAll')}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5">
                  <Scan className="h-10 w-10 text-brand-600" />
                </div>
                <p className="text-lg font-semibold text-brand-300">{t('pos.scannerReady')}</p>
                <p className="mt-1 max-w-[200px] text-sm text-brand-500">{t('pos.scannerHint')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item, idx) => (
                  <div
                    key={item.product.id}
                    className="animate-slide-up flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-brand-400">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.product.name}</p>
                      <p className="text-xs text-brand-500">{formatCurrency(item.product.price)} × {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg bg-black/30 p-0.5">
                      <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="rounded-md p-1.5 hover:bg-white/10">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="rounded-md p-1.5 hover:bg-white/10">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="w-[72px] text-right text-sm font-bold">
                      {formatCurrency(item.product.price * item.quantity)}
                    </p>
                    <button onClick={() => removeFromCart(item.product.id)} className="text-brand-600 hover:text-red-400">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Checkout panel */}
          <div className="shrink-0 border-t border-white/10 bg-black/30 p-3 backdrop-blur-md sm:p-5">
            <div className="mb-3 space-y-2 text-sm sm:mb-4">
              <div className="flex justify-between text-brand-400">
                <span>{t('pos.subtotal')}</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-brand-400">
                <span>{t('pos.discount')}</span>
                <span>Rs. 0</span>
              </div>
              <div className="flex items-end justify-between border-t border-white/10 pt-3">
                <span className="text-brand-400">{t('pos.total')}</span>
                <span className="font-display text-2xl font-bold tracking-tight sm:text-4xl">{formatCurrency(subtotal)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="lg"
                className="border border-white/10 bg-white/10 text-white hover:bg-white/20"
                disabled={cart.length === 0}
                onClick={handleCheckout}
              >
                <Banknote className="h-4 w-4" /> {t('pos.cash')}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="border border-white/10 bg-white/10 text-white hover:bg-white/20"
                disabled={cart.length === 0}
                onClick={handleCheckout}
              >
                <Smartphone className="h-4 w-4" /> {t('pos.jazzcash')}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="border border-white/10 bg-white/10 text-white hover:bg-white/20"
                disabled={cart.length === 0}
                onClick={handleCheckout}
              >
                <Smartphone className="h-4 w-4" /> {t('pos.easypaisa')}
              </Button>
              <Button
                variant="accent"
                size="lg"
                loading={checkoutLoading}
                disabled={cart.length === 0}
                onClick={handleCheckout}
              >
                <CreditCard className="h-4 w-4" /> {t('pos.cardPay')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
