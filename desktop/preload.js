const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smartshop', {
  isDesktop: true,
  applyUpdate: () => ipcRenderer.invoke('apply-update'),
  openBackupsFolder: () => ipcRenderer.invoke('open-backups-folder'),
  onUpdateProgress: (callback) => {
    const listener = (_event, payload) => {
      callback(payload);
    };
    ipcRenderer.on('update-progress', listener);
    return () => {
      ipcRenderer.removeListener('update-progress', listener);
    };
  },
});
