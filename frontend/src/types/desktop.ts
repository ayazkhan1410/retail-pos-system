export interface SmartShopDesktopApi {
  isDesktop: boolean;
  openBackupsFolder: () => Promise<void>;
}

declare global {
  interface Window {
    smartshop?: SmartShopDesktopApi;
  }
}

export {};
