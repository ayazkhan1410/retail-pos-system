const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smartshop', {
  isDesktop: true,
  openBackupsFolder: () => ipcRenderer.invoke('open-backups-folder'),
});
