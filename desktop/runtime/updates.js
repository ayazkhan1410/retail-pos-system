const FIRST_CHECK_MS = 60_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function desktopNotice(version, open) {
  const { Notification } = require('electron');
  if (!Notification.isSupported()) return false;
  const notice = new Notification({
    title: 'Tijori POS update ready',
    body: 'Version ' + version + ' is ready. Select this notification when all counters can restart.',
  });
  notice.on('click', open);
  notice.show();
  return true;
}

function installUpdateChecks({
  app, dialog, window, runtime, beforeInstall, afterFailedInstall,
  updater, notify = desktopNotice, timers = globalThis,
}) {
  if (!app.isPackaged) return { check: async () => {}, offerInstall: async () => {}, blocksQuit: () => false, dispose: () => {} };
  updater ??= require('electron-updater').autoUpdater;
  updater.autoInstallOnAppQuit = false;
  updater.autoDownload = true;
  let phase = 'idle';
  let available = null;
  let checking = false;
  let disposed = false;

  function message(options) {
    return window && !window.isDestroyed()
      ? dialog.showMessageBox(window, options)
      : dialog.showMessageBox(options);
  }

  async function check() {
    if (disposed || checking || phase !== 'idle') return;
    checking = true;
    try {
      const result = await updater.checkForUpdates();
      // Downloads can reject independently of the feed check (e.g. the till goes offline).
      await result?.downloadPromise;
    } catch {
      // The updater logs network and feed errors. The next scheduled check retries.
    } finally {
      checking = false;
    }
  }

  async function recover() {
    if (phase === 'recovering' || disposed) return;
    const interruptedBackup = phase === 'backup';
    phase = 'recovering';
    let ready = false;
    try {
      await runtime.start();
      ready = true;
    } catch {
      // The diagnostic log in the service contains the startup failure.
    } finally {
      try {
        await afterFailedInstall?.();
      } finally {
        phase = 'idle';
      }
    }
    if (!disposed) await message({
      type: 'error', title: 'Tijori POS update',
      message: interruptedBackup ? 'Tijori could not prepare the backup and stop the shop safely.' : 'The update installer could not start.',
      detail: ready ? 'The shop service is running again. You can continue selling and retry the update later.'
        : 'The shop service could not restart. Reopen Tijori and check the service logs.',
      buttons: ['OK'],
    });
  }

  async function offerInstall() {
    if (disposed || !available || phase !== 'idle') return;
    phase = 'asking';
    try {
      const { response } = await message({
        type: 'question', title: 'Tijori POS update', message: 'Install Tijori POS ' + available.version + '?',
        detail: 'Finish sales on every counter before continuing. Tijori will pause the shop service, back up the database, and restart for the update.',
        buttons: ['Later', 'Back up and install'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (response !== 1 || disposed) { phase = 'idle'; return; }
      phase = 'backup';
      await runtime.beforeUpdate();
      await beforeInstall?.();
      phase = 'installing';
      // The installer gets a fresh backup on every explicit attempt.
      updater.quitAndInstall(false, true);
    } catch {
      if (phase === 'asking') { phase = 'idle'; return; }
      await recover();
    }
  }

  function downloaded(info) {
    if (disposed || !info?.version || available?.version === info.version) return;
    available = info;
    const open = () => { void offerInstall().catch(() => {}); };
    try {
      if (notify(info.version, open)) return;
    } catch {
      // The native desktop notification may be disabled for this Windows user.
    }
    open();
  }

  function onError() {
    // electron-updater reports some installer launch failures through its 'error' event.
    if (phase === 'installing') void recover().catch(() => {});
  }

  const blocksQuit = () => phase === 'backup' || phase === 'recovering';
  function preventInterruptedBackup(event) { if (blocksQuit()) event.preventDefault(); }

  const first = timers.setTimeout(() => void check(), FIRST_CHECK_MS);
  const recurring = timers.setInterval(() => void check(), CHECK_INTERVAL_MS);
  first.unref?.();
  recurring.unref?.();
  updater.on('update-downloaded', downloaded);
  updater.on('error', onError);
  app.on('before-quit', preventInterruptedBackup);
  function dispose() {
    disposed = true;
    timers.clearTimeout(first);
    timers.clearInterval(recurring);
    updater.off('update-downloaded', downloaded);
    updater.off('error', onError);
    app.off('before-quit', preventInterruptedBackup);
  }
  return { check, offerInstall, blocksQuit, dispose };
}

module.exports = { installUpdateChecks };
