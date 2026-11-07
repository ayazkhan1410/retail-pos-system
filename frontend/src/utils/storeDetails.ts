import { create } from 'zustand';
import { inventoryApi } from '@/services/endpoints';
import type { Branch } from '@/types';

export type StoreDetails = Pick<Branch, 'name' | 'store_name' | 'address' | 'phone' | 'ntn' | 'receipt_footer'>;

/** Same key earlier versions used, so a till that is offline still prints the last-known header. */
const CACHE_KEY = 'smartshop-store-details';
const FALLBACK: StoreDetails = { name: '', store_name: '', address: '', phone: '', ntn: '', receipt_footer: '' };

function readCache(): StoreDetails {
  try {
    return { ...FALLBACK, ...(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') ?? {}) };
  } catch {
    return FALLBACK;
  }
}

function writeCache(details: StoreDetails) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(details));
  } catch {
    // Private mode or full storage: printing still works with what was fetched.
  }
}

/** Trading name for headers: the store name, or the branch name for installs that never set one. */
export function displayName(details: StoreDetails): string {
  return details.store_name?.trim() || details.name?.trim() || 'Tijori';
}

interface StoreDetailsState {
  details: StoreDetails;
  refresh: () => Promise<StoreDetails>;
  set: (details: StoreDetails) => void;
}

export const useStoreDetails = create<StoreDetailsState>((set) => ({
  details: readCache(),
  refresh: async () => {
    try {
      const { data } = await inventoryApi.branch();
      writeCache(data);
      set({ details: data });
      return data;
    } catch {
      return readCache();
    }
  },
  set: (details) => {
    writeCache(details);
    set({ details });
  },
}));

export const loadStoreDetails = () => useStoreDetails.getState().refresh();
