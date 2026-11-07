const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { readConfig, runSetup } = require('../setup/bootstrap');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tijori-setup-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const submission = {
    storeName: 'دکان', branchName: 'M.A. Road', ownerName: 'Test Owner',
    ownerEmail: 'owner@example.test', ntn: '', address: '', phone: '', receiptFooter: '',
    counters: 1, language: 'ur', confirmMigration: true,
    password: 'Test value only', confirmPassword: 'Test value only',
  };
  const calls = [];
  const progress = [];
  const configPath = path.join(directory, 'config.json');
  let status = { ok: true, configured: false };
  const runtime = {
    initializePostgres: async () => { calls.push('initialize'); },
    migrate: async () => { calls.push('migrate'); },
    setupStatus: async () => { calls.push('status'); return status; },
    setupShop: async (fields, password) => {
      calls.push('setup');
      assert.equal(password, submission.password);
      assert.ok(!Object.hasOwn(fields, 'password'));
      status = { ok: true, configured: true, branch: '01', store: fields.storeName, owner_email: fields.ownerEmail, counters: fields.counters };
      return { ok: true };
    },
    getConfig: async () => ({ port: 8000, dataDir: directory, appVersion: '1.0.0' }),
  };
  const run = () => runSetup({ configPath, runtime, submission, onProgress: update => progress.push(update) });
  return { run, configPath, directory, submission, runtime, calls, progress };
}

test('first launch provisions a store, saves nonsecret settings and skips setup on reentry', async t => {
  const f = await fixture(t);
  assert.equal(await readConfig(f.configPath), null);
  const config = await f.run();
  assert.deepEqual(f.calls, ['initialize', 'migrate', 'status', 'setup']);
  assert.equal(config.language, 'ur');
  assert.equal(config.port, 8000);
  assert.deepEqual(await readConfig(f.configPath), config);
  assert.deepEqual(f.progress.map(update => update.percent), [10, 30, 65, 90, 100]);
  assert.deepEqual(await fs.readdir(f.directory), ['config.json']);
  assert.ok(!(await fs.readFile(f.configPath, 'utf8')).includes(f.submission.password));
  assert.deepEqual(await f.run(), config);
  assert.equal(f.calls.length, 4);
});

test('refuses missing consent, a mismatched password and an invalid counter count before database access', async t => {
  const f = await fixture(t);
  for (const [field, value, code] of [['confirmMigration', false, 'consent'], ['confirmPassword', '', 'password'], ['counters', 21, 'counters']]) {
    const original = f.submission[field];
    f.submission[field] = value;
    await assert.rejects(f.run(), { code });
    f.submission[field] = original;
  }
  assert.deepEqual(f.calls, []);
  assert.deepEqual(await fs.readdir(f.directory), []);
});

test('backend failure leaves setup retryable and keeps the password out of the intent', async t => {
  const f = await fixture(t);
  const setupShop = f.runtime.setupShop;
  f.runtime.setupShop = async () => {
    throw Object.assign(new Error('private backend diagnostic'), { userMessage: 'This password is too common.' });
  };
  await assert.rejects(f.run(), { code: 'shop', detail: 'This password is too common.' });
  assert.equal(await readConfig(f.configPath), null);
  assert.ok(!(await fs.readFile(path.join(f.directory, 'setup-pending.json'), 'utf8')).includes(f.submission.password));
  f.runtime.setupShop = setupShop;
  await f.run();
  assert.equal(f.calls.filter(call => call === 'migrate').length, 1);
});

test('recovers committed owner after failure to save settings, without a second account creation', async t => {
  const f = await fixture(t);
  const getConfig = f.runtime.getConfig;
  f.runtime.getConfig = async () => { throw new Error('interrupted'); };
  await assert.rejects(f.run(), { code: 'storage' });
  assert.equal(await readConfig(f.configPath), null);
  f.runtime.getConfig = getConfig;
  const config = await f.run();
  assert.equal(config.storeName, f.submission.storeName);
  assert.equal(f.calls.filter(call => call === 'setup').length, 1);
});

test('does not overwrite an existing owner in a database with no matching pending setup', async t => {
  const f = await fixture(t);
  f.runtime.setupStatus = async () => ({ ok: true, configured: true, branch: '01', store: 'Different shop', owner_email: 'someone@example.test', counters: 6 });
  await assert.rejects(f.run(), { code: 'existing' });
  assert.equal(await readConfig(f.configPath), null);
  assert.ok(!f.calls.includes('setup'));
});
