export interface SmartShopDesktopApi {
  isDesktop: boolean;
  applyUpdate: () => Promise<{ success: boolean; message: string }>;
  openBackupsFolder: () => Promise<void>;
}

declare global {
  interface Window {
    smartshop?: SmartShopDesktopApi;
  }
}

export {};
