const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smartshop', {
  isDesktop: true,
  applyUpdate: () => ipcRenderer.invoke('apply-update'),
  openBackupsFolder: () => ipcRenderer.invoke('open-backups-folder'),
});
