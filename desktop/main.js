const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const http = require('http');

// Linux dev/client PCs often lack setuid chrome-sandbox; safe for local POS kiosk use.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}

const ROOT_DIR = path.join(__dirname, '..');
const APP_URL = process.env.SMARTSHOP_URL || 'http://localhost:3000';
const HEALTH_URL = 'http://localhost:8000/api/health-check/';

let mainWindow;

function execAsync(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: ROOT_DIR, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

function waitForHealth(maxAttempts = 60) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tick = () => {
      attempts += 1;
      const req = http.get(HEALTH_URL, (res) => {
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (attempts >= maxAttempts) {
        reject(new Error('SmartShop services did not start in time.'));
        return;
      }
      setTimeout(tick, 2000);
    };

    tick();
  });
}

async function startStack() {
  await execAsync('docker compose up -d --build');
  await waitForHealth();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'SmartShop POS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('apply-update', async () => {
  try {
    await execAsync('docker compose pull');
    await execAsync('docker compose up -d --build');
    await waitForHealth();
    return { success: true, message: 'Update installed successfully. Reloading...' };
  } catch (error) {
    return { success: false, message: error.message || 'Update failed.' };
  }
});

ipcMain.handle('open-backups-folder', async () => {
  const backupsPath = path.join(ROOT_DIR, 'backups');
  await shell.openPath(backupsPath);
});

app.whenReady().then(async () => {
  try {
    await startStack();
    createWindow();
  } catch (error) {
    console.error(error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
