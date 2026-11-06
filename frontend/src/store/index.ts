import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme, CartItem, Terminal, Supplier, Product, User } from '@/types';
import { authApi, inventoryApi, salesApi, type NewSale } from '@/services/endpoints';
import { mapProductFromApi, mapProductToApi } from '@/services/products';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'smartshop-theme' },
  ),
);

interface AuthState {
  user: User | null;
  loading: boolean;
  load: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  switchPin: (pin: string) => Promise<void>;
  logout: () => Promise<void>;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  load: async () => {
    try {
      const { data } = await authApi.session();
      set({ user: data.user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
  login: async (email, password) => {
    const { data } = await authApi.login(email, password);
    set({ user: data.user });
  },
  switchPin: async (pin) => {
    const { data } = await authApi.switchPin(pin);
    set({ user: data.user });
  },
  logout: async () => {
    await authApi.logout();
    get().clear();
  },
  clear: () => {
    usePOSStore.getState().clearCart();
    set({ user: null });
  },
}));

/** Permission check for hiding UI. The server enforces the same rules on every request. */
export function useCan() {
  const permissions = useAuthStore((state) => state.user?.permissions);
  return (code: string) => !!permissions?.includes(code);
}

/** Where someone lands after login: the first area their role can use. */
export function homePath(user: User | null): string {
  const can = (code: string) => !!user?.permissions.includes(code);
  if (can('dashboard.view')) return '/dashboard';
  if (can('pos.sell')) return '/pos';
  if (can('products.edit')) return '/inventory';
  if (can('sales.view')) return '/sales';
  return '/settings';
}

const lineAmount = (item: CartItem) => Math.round(item.product.salePrice * item.quantity * 100) / 100;

interface POSState {
  activeCounter: Terminal | null;
  cart: CartItem[];
  scannerInput: string;
  setActiveCounter: (counter: Terminal) => void;
  setScannerInput: (value: string) => void;
  addToCart: (product: Product) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  replaceCart: (cart: CartItem[]) => void;
  syncCart: (products: Product[]) => void;
  pendingSales: NewSale[];
  queueSale: (sale: NewSale) => void;
  syncPending: () => Promise<void>;
  cartTotal: () => number;
  cartItemCount: () => number;
}

export const usePOSStore = create<POSState>()(
  persist(
    (set, get) => ({
      activeCounter: null,
      cart: [],
      scannerInput: '',
      pendingSales: [],
      queueSale: (sale) => set({ pendingSales: [...get().pendingSales, sale] }),
      syncPending: async () => {
        for (const sale of get().pendingSales) {
          try {
            await salesApi.create(sale);
          } catch (err) {
            // Still offline, or logged out: keep it and try again later. A rejected sale also stays,
            // visibly counted on the till, because deleting a real sale is never the right fallback.
            if (!(err as { response?: unknown }).response || (err as { response?: { status?: number } }).response?.status === 403) return;
            continue;
          }
          set({ pendingSales: get().pendingSales.filter((item) => item.client_uuid !== sale.client_uuid) });
        }
      },
      setActiveCounter: (counter) => set({ activeCounter: counter }),
      setScannerInput: (value) => set({ scannerInput: value }),
      addToCart: (product) => {
        const cart = get().cart;
        if (cart.some((c) => c.product.id === product.id)) {
          set({
            cart: cart.map((c) =>
              c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c,
            ),
          });
        } else {
          set({ cart: [...cart, { product, quantity: 1 }] });
        }
      },
      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          set({ cart: get().cart.filter((c) => c.product.id !== productId) });
        } else {
          set({
            cart: get().cart.map((c) =>
              c.product.id === productId ? { ...c, quantity } : c,
            ),
          });
        }
      },
      removeFromCart: (productId) =>
        set({ cart: get().cart.filter((c) => c.product.id !== productId) }),
      clearCart: () => set({ cart: [], scannerInput: '' }),
      replaceCart: (cart) => set({ cart, scannerInput: '' }),
      // A saved bill can outlive a price change, and the server always charges the current price.
      syncCart: (products) => {
        const byId = new Map(products.map((p) => [p.id, p]));
        set({
          cart: get().cart.flatMap((c) => {
            const product = byId.get(c.product.id);
            return product ? [{ ...c, product }] : [];
          }),
        });
      },
      cartTotal: () => get().cart.reduce((sum, item) => sum + lineAmount(item), 0),
      cartItemCount: () => get().cart.reduce((sum, item) => sum + item.quantity, 0),
    }),
    {
      name: 'smartshop-pos-draft-v2',
      partialize: ({ activeCounter, cart, pendingSales }) => ({ activeCounter, cart, pendingSales }),
    },
  ),
);

interface AppState {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
}));

export type SupplierFormData = Omit<Supplier, 'id' | 'totalPurchases' | 'createdAt'>;

export type ProductFormData = Omit<Product, 'id' | 'status' | 'salePrice'>;

interface InventoryState {
  products: Product[];
  categories: string[];
  loading: boolean;
  error: boolean;
  fetchProducts: (opts?: { includeInactive?: boolean }) => Promise<void>;
  addProduct: (data: ProductFormData) => Promise<Product>;
  updateProduct: (id: string, data: ProductFormData) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  applySale: (lines: { productId: string; quantity: number }[]) => void;
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      products: [],
      categories: [],
      loading: true,
      error: false,
      fetchProducts: async (opts) => {
        try {
          const [products, categories] = await Promise.all([
            inventoryApi.products({ includeInactive: opts?.includeInactive }),
            inventoryApi.categories(),
          ]);
          set({
            products: products.data.map(mapProductFromApi),
            categories: categories.data,
            loading: false,
            error: false,
          });
        } catch {
          // Keep last good catalog so POS can reload while the server is down.
          set({ loading: false, error: get().products.length === 0 });
        }
      },
      addProduct: async (data) => {
        const response = await inventoryApi.createProduct(mapProductToApi(data));
        const product = mapProductFromApi(response.data);
        set({ products: [...get().products, product] });
        return product;
      },
      updateProduct: async (id, data) => {
        const existing = get().products.find((p) => p.id === id);
        const response = await inventoryApi.updateProduct(id, mapProductToApi(data, existing));
        const updated = mapProductFromApi(response.data);
        set({ products: get().products.map((p) => (p.id === id ? updated : p)) });
      },
      deleteProduct: async (id) => {
        await inventoryApi.deleteProduct(id);
        set({
          products: get().products.map((p) => (p.id === id ? { ...p, active: false } : p)),
        });
      },
      applySale: (lines) => {
        const sold = new Map(lines.map((line) => [line.productId, line.quantity]));
        set({
          products: get().products.map((p) => (sold.has(p.id) ? { ...p, stock: p.stock - sold.get(p.id)! } : p)),
        });
      },
    }),
    {
      name: 'smartshop-catalog-v1',
      partialize: ({ products, categories }) => ({ products, categories }),
      onRehydrateStorage: () => (state) => {
        if (state && state.products.length > 0) {
          state.loading = false;
        }
      },
    },
  ),
);
