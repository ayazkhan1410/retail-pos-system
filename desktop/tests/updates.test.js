const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { installUpdateChecks } = require('../runtime/updates');

function fixture(t, response = 1) {
  const app = Object.assign(new EventEmitter(), { isPackaged: true });
  const updater = new EventEmitter();
  const calls = [];
  const messages = [];
  const timers = {
    setTimeout: () => 1, setInterval: () => 2,
    clearTimeout: () => calls.push('clear-timeout'), clearInterval: () => calls.push('clear-interval'),
  };
  const runtime = {
    beforeUpdate: async () => { calls.push('backup'); }, start: async () => { calls.push('restart'); },
  };
  updater.quitAndInstall = (silent, restart) => {
    calls.push('install');
    assert.equal(silent, false);
    assert.equal(restart, true);
  };
  updater.checkForUpdates = async () => { calls.push('check'); };
  const dialog = { showMessageBox: async options => {
    messages.push(options);
    if (options.type === 'question') calls.push('confirm');
    return { response };
  } };
  const api = installUpdateChecks({
    app, updater, timers, dialog, runtime,
    notify: () => { calls.push('notify'); return true; },
    beforeInstall: () => { calls.push('prepare-quit'); },
    afterFailedInstall: () => { calls.push('restore-quit'); },
  });
  t.after(() => api.dispose());
  return { calls, messages, updater, app, runtime, api };
}

test('download gives a passive notice and normal quits never trigger an install', async t => {
  const f = fixture(t, 0);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  await f.api.check();
  f.updater.emit('update-downloaded', { version: '0.2.0' });
  f.updater.emit('update-downloaded', { version: '0.2.0' });
  assert.deepEqual(f.calls, ['check', 'notify']);
  await f.api.offerInstall();
  assert.equal(f.messages[0].defaultId, 0);
  assert.equal(f.messages[0].cancelId, 0);
  assert.deepEqual(f.calls, ['check', 'notify', 'confirm']);
});

test('an accepted update gets exactly one backup before installation', async t => {
  const f = fixture(t);
  f.updater.emit('update-downloaded', { version: '0.2.0' });
  await Promise.all([f.api.offerInstall(), f.api.offerInstall()]);
  assert.deepEqual(f.calls, ['notify','confirm','backup','prepare-quit','install']);
});

test('a backup failure keeps the update pending and allows a safe retry', async t => {
  const f = fixture(t);
  f.updater.emit('update-downloaded', { version: '0.2.0' });
  const success = f.runtime.beforeUpdate;
  f.runtime.beforeUpdate = async () => { throw new Error('disk full'); };
  await f.api.offerInstall();
  assert.deepEqual(f.calls, ['notify','confirm','restart','restore-quit']);
  assert.match(f.messages.at(-1).message, /backup/);
  f.runtime.beforeUpdate = success;
  await f.api.offerInstall();
  assert.deepEqual(f.calls.slice(-4), ['confirm','backup','prepare-quit','install']);
});

test('installer error restores the service and ordinary quit behavior', async t => {
  const f = fixture(t);
  let restarted;
  f.runtime.start = () => { f.calls.push('restart'); return new Promise(resolve => { restarted = resolve; }); };
  f.updater.emit('update-downloaded', { version: '0.2.0' });
  f.updater.quitAndInstall = () => f.updater.emit('error', new Error('installer unavailable'));
  await f.api.offerInstall();
  assert.equal(f.api.blocksQuit(), true);
  restarted();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.api.blocksQuit(), false);
  assert.deepEqual(f.calls, ['notify','confirm','backup','prepare-quit','restart','restore-quit']);
  assert.match(f.messages.at(-1).message, /installer/);
});

test('the app waits for an in-progress backup before quitting', async t => {
  const f = fixture(t);
  assert.equal(f.api.blocksQuit(), false);
  let finish;
  f.runtime.beforeUpdate = () => new Promise(resolve => { finish = resolve; });
  f.updater.emit('update-downloaded', { version: '0.2.0' });
  const operation = f.api.offerInstall();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.api.blocksQuit(), true);
  let prevented = false;
  f.app.emit('before-quit', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  finish();
  await operation;
  assert.equal(f.api.blocksQuit(), false);
});
