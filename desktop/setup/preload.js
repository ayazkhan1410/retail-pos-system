const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tijoriSetup', {
  submit: submission => ipcRenderer.invoke('tijori:setup:submit', submission),
  onProgress: callback => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('tijori:setup:progress', listener);
    return () => ipcRenderer.removeListener('tijori:setup:progress', listener);
  },
});
