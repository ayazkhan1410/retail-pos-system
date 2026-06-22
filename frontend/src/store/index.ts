import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme, CartItem, Counter, Supplier, Product } from '@/types';
import { MOCK_SUPPLIERS, MOCK_PRODUCTS } from '@/utils/mockData';
import { deriveStockStatus } from '@/utils/inventoryUtils';

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

interface POSState {
  activeCounter: Counter;
  cart: CartItem[];
  scannerInput: string;
  setActiveCounter: (counter: Counter) => void;
  setScannerInput: (value: string) => void;
  addToCart: (item: CartItem) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  cartTotal: () => number;
  cartItemCount: () => number;
}

export const usePOSStore = create<POSState>()(
  persist(
    (set, get) => ({
      activeCounter: { id: '1', name: 'Counter 1', active: true },
      cart: [],
      scannerInput: '',
      setActiveCounter: (counter) => set({ activeCounter: counter }),
      setScannerInput: (value) => set({ scannerInput: value }),
      addToCart: (item) => {
        const cart = get().cart;
        const existing = cart.find((c) => c.product.id === item.product.id);
        if (existing) {
          set({
            cart: cart.map((c) =>
              c.product.id === item.product.id
                ? { ...c, quantity: c.quantity + item.quantity }
                : c,
            ),
          });
        } else {
          set({ cart: [...cart, item] });
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
      cartTotal: () =>
        get().cart.reduce(
          (sum, item) => sum + item.product.price * item.quantity - item.discount,
          0,
        ),
      cartItemCount: () => get().cart.reduce((sum, item) => sum + item.quantity, 0),
    }),
    { name: 'smartshop-pos-draft' },
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

interface SupplierState {
  suppliers: Supplier[];
  addSupplier: (data: SupplierFormData) => void;
  updateSupplier: (id: string, data: SupplierFormData) => void;
  deleteSupplier: (id: string) => void;
  getSupplierById: (id: string) => Supplier | undefined;
}

export const useSupplierStore = create<SupplierState>()(
  persist(
    (set, get) => ({
      suppliers: MOCK_SUPPLIERS,
      addSupplier: (data) => {
        const newSupplier: Supplier = {
          ...data,
          id: crypto.randomUUID(),
          totalPurchases: 0,
          createdAt: new Date().toISOString().split('T')[0],
        };
        set({ suppliers: [...get().suppliers, newSupplier] });
      },
      updateSupplier: (id, data) => {
        set({
          suppliers: get().suppliers.map((s) =>
            s.id === id ? { ...s, ...data } : s,
          ),
        });
      },
      deleteSupplier: (id) => {
        set({ suppliers: get().suppliers.filter((s) => s.id !== id) });
      },
      getSupplierById: (id) => get().suppliers.find((s) => s.id === id),
    }),
    { name: 'smartshop-suppliers' },
  ),
);

export type ProductFormData = Omit<Product, 'id' | 'status'>;

interface InventoryState {
  products: Product[];
  addProduct: (data: ProductFormData) => void;
  updateProduct: (id: string, data: ProductFormData) => void;
  deleteProduct: (id: string) => void;
}

function toProduct(data: ProductFormData, existing?: Product): Product {
  const today = new Date().toISOString().split('T')[0];
  return {
    ...data,
    id: existing?.id ?? crypto.randomUUID(),
    status: deriveStockStatus(data),
    createdAt: existing?.createdAt ?? data.createdAt ?? today,
    updatedAt: today,
  };
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      products: MOCK_PRODUCTS,
      addProduct: (data) => {
        set({ products: [...get().products, toProduct(data)] });
      },
      updateProduct: (id, data) => {
        const existing = get().products.find((p) => p.id === id);
        if (!existing) return;
        set({
          products: get().products.map((p) =>
            p.id === id ? toProduct(data, existing) : p,
          ),
        });
      },
      deleteProduct: (id) => {
        set({ products: get().products.filter((p) => p.id !== id) });
      },
    }),
    { name: 'smartshop-inventory' },
  ),
);
