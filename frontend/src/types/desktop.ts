export interface UpdateProgressPayload {
  percent: number;
  message: string;
}

export interface SmartShopDesktopApi {
  isDesktop: boolean;
  applyUpdate: () => Promise<{ success: boolean; message: string }>;
  openBackupsFolder: () => Promise<void>;
  onUpdateProgress?: (callback: (payload: UpdateProgressPayload) => void) => () => void;
}

declare global {
  interface Window {
    smartshop?: SmartShopDesktopApi;
  }
}

export {};
