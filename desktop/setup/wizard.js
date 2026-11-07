const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BrowserWindow, ipcMain } = require('electron');
const { SetupError, readConfig, runSetup } = require('./bootstrap');

async function openSetupWizard({ configPath, runtime, onReady }) {
  const page = path.join(__dirname, '..', 'setup.html');
  const expectedURL = pathToFileURL(page).href;
  const wizard = new BrowserWindow({
    width: 800, height: 780, minWidth: 540, minHeight: 600, autoHideMenuBar: true,
    title: 'Tijori POS', backgroundColor: '#f6f6f9',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false },
  });
  let running = false;
  let result = null;
  const closed = new Promise(resolve => wizard.once('closed', () => {
    ipcMain.removeHandler('tijori:setup:submit');
    resolve(result);
  }));
  wizard.on('close', event => {
    if (running) event.preventDefault();
  });
  wizard.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  wizard.webContents.on('will-navigate', event => event.preventDefault());
  ipcMain.handle('tijori:setup:submit', async (event, submission) => {
    if (event.sender !== wizard.webContents || event.senderFrame !== wizard.webContents.mainFrame ||
        event.senderFrame.url !== expectedURL) throw new Error('Invalid setup request.');
    if (running) return { ok: false, code: 'busy' };
    running = true;
    try {
      const config = await runSetup({ configPath, runtime, submission, onProgress: update => {
        wizard.webContents.send('tijori:setup:progress', update);
      } });
      await onReady(config);
      result = config;
      setImmediate(() => { if (!wizard.isDestroyed()) wizard.close(); });
      return { ok: true };
    } catch (error) {
      return error instanceof SetupError
        ? { ok: false, code: error.code, detail: error.detail }
        : { ok: false, code: 'launch' };
    } finally {
      running = false;
    }
  });
  try {
    await wizard.loadFile(page);
  } catch (error) {
    wizard.destroy();
    throw error;
  }
  return closed;
}

module.exports = { openSetupWizard, readConfig };
