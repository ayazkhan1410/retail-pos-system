const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT_DIR = path.join(__dirname, '..');
const APP_URL = process.env.SMARTSHOP_URL || 'http://localhost:3000';
const HEALTH_URL = 'http://localhost:8000/api/health-check/';

let mainWindow;
let splashWindow;

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

function setSplashProgress(percent, message) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents
    .executeJavaScript(
      `window.setLoadingProgress(${percent}, ${JSON.stringify(message)})`,
    )
    .catch(() => undefined);
}

function sendUpdateProgress(percent, message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('update-progress', { percent, message });
}

function bumpAppVersionInEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  const latestMatch = content.match(/^LATEST_APP_VERSION=(.+)$/m);
  if (!latestMatch) return;

  const latest = latestMatch[1].trim();
  const updated = content.replace(/^APP_VERSION=.*$/m, `APP_VERSION=${latest}`);
  fs.writeFileSync(envPath, updated);
}

function waitForHealth(maxAttempts = 60, onProgress) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tick = () => {
      attempts += 1;
      if (onProgress) {
        const percent = 40 + Math.round((attempts / maxAttempts) * 55);
        onProgress(Math.min(percent, 95), 'Waiting for SmartShop services…');
      }

      const req = http.get(HEALTH_URL, (res) => {
        if (res.statusCode === 200) {
          if (onProgress) onProgress(100, 'Ready');
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
  setSplashProgress(8, 'Starting Docker services…');
  await execAsync('docker compose up -d');
  setSplashProgress(35, 'Services are starting…');
  await waitForHealth(60, setSplashProgress);
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 400,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });

  splashWindow.loadFile(path.join(__dirname, 'loading.html'));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'SmartShop POS',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('apply-update', async () => {
  try {
    sendUpdateProgress(5, 'Downloading latest images…');
    await execAsync('docker compose pull');

    sendUpdateProgress(35, 'Updating application version…');
    bumpAppVersionInEnv();

    sendUpdateProgress(50, 'Rebuilding and restarting services…');
    await execAsync('docker compose up -d --build');

    await waitForHealth(60, (percent, message) => {
      sendUpdateProgress(percent, message);
    });

    sendUpdateProgress(100, 'Update complete');
    return { success: true, message: 'Update installed successfully. Reloading…' };
  } catch (error) {
    return { success: false, message: error.message || 'Update failed.' };
  }
});

ipcMain.handle('open-backups-folder', async () => {
  const backupsPath = path.join(ROOT_DIR, 'backups');
  await shell.openPath(backupsPath);
});

app.whenReady().then(async () => {
  createSplash();
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
