const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ShopService } = require('./runtime/service');
const { openSetupWizard, readConfig } = require('./setup/wizard');
const { writeRecord } = require('./setup/bootstrap');

let register;
let service;
let backups;
let origin;
let finishing = false;
let stopping = false;
let updates;

async function showRegister(url, config) {
  origin = new URL(url).origin;
  register = new BrowserWindow({
    width: 1400, height: 900, minWidth: 960, minHeight: 640, title: 'Tijori POS',
    autoHideMenuBar: true, backgroundColor: '#f6f6f9', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged },
  });
  register.webContents.setWindowOpenHandler(({ url: target }) => {
    // Receipts and labels print in blank child windows.
    if (target === 'about:blank') return { action: 'allow', overrideBrowserWindowOptions: {
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: undefined },
    } };
    return { action: 'deny' };
  });
  register.webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin !== origin) event.preventDefault();
  });
  try {
    const target = new URL('/login', origin);
    if (config?.language) target.searchParams.set('setupLanguage', config.language);
    await register.loadURL(target.href);
    register.show();
    if (service) configureUpdates();
  } catch (error) {
    register.destroy();
    throw error;
  }
}

async function run() {
  if (!app.isPackaged) {
    // Source development uses the already-running Vite/Django stack.
    backups = path.join(__dirname, '..', 'backups');
    return showRegister(process.env.SMARTSHOP_URL || 'http://localhost:3000');
  }
  service = new ShopService(process.resourcesPath);
  const configPath = path.join(app.getPath('appData'), 'Tijori', 'config.json');
  const machine = await service.inspect();
  backups = path.join(machine.dataDir, 'backups');
  async function enter(config) {
    const actual = await service.start();
    await writeRecord(configPath, { ...config, ...actual });
    await showRegister('http://127.0.0.1:' + actual.port, config);
  }
  if (machine.shop) {
    const saved = await readConfig(configPath);
    await enter({ version: 1, language: saved?.language || 'en', ...machine.shop });
    return;
  }
  // A retained Windows profile can survive an explicit uninstall-and-delete-data.
  await fs.rm(configPath, { force: true });
  if (!machine.consent) await fs.rm(path.join(path.dirname(configPath), 'setup-pending.json'), { force: true });
  const config = await openSetupWizard({ configPath, runtime: service, onReady: enter });
  if (!config) app.quit();
}

function configureUpdates() {
  if (updates) return;
  const { installUpdateChecks } = require('./runtime/updates');
  updates = installUpdateChecks({
    app, dialog, window: register, runtime: service,
    beforeInstall: async () => { await service.stop(); finishing = true; },
    afterFailedInstall: async () => { finishing = false; },
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Tijori', submenu: [
    { label: 'Connect another counter', click: async () => {
      const port = new URL(origin).port;
      const urls = Object.values(os.networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal)
        .map(item => 'http://' + item.address + ':' + port);
      const { response } = await dialog.showMessageBox(register, {
        title: 'Tijori POS', message: 'Connect another counter',
        detail: urls.length ? 'Open a shop-network address in Chrome on the other till.\n\n' + urls.join('\n')
          : 'Connect this computer to the shop network first.',
        buttons: urls.length ? ['Copy addresses', 'Close'] : ['Close'],
      });
      if (urls.length && response === 0) clipboard.writeText(urls.join('\n'));
    } },
    { label: 'Check for updates', click: async () => { await updates.check(); await updates.offerInstall(); } },
    { type: 'separator' }, { role: 'quit' },
  ] }]));
  register.setAutoHideMenuBar(false);
  register.setMenuBarVisibility(true);
}

ipcMain.handle('open-backups-folder', async event => {
  if (!register || event.sender !== register.webContents ||
      event.senderFrame !== register.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) {
    throw new Error('Unknown window.');
  }
  const error = await shell.openPath(backups);
  if (error) throw new Error(error);
});
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(run).catch(error => {
    dialog.showErrorBox('Tijori POS', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (finishing || !service) return;
    if (updates?.blocksQuit()) { event.preventDefault(); return; }
    event.preventDefault();
    if (stopping) return;
    stopping = true;
    updates?.dispose();
    service.stop().catch(error => dialog.showErrorBox('Tijori POS', error.message)).finally(() => {
      finishing = true;
      app.quit();
    });
  });
}
