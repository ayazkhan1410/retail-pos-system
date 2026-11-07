const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

class SetupError extends Error {
  constructor(code, detail = '') {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

async function readRecord(filename) {
  try {
    return JSON.parse(await fs.readFile(filename, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readConfig(configPath) {
  const record = await readRecord(configPath);
  if (record !== null && (record.version !== 1 || !record.storeName || !record.branchName)) {
    throw new Error('Invalid Tijori configuration file.');
  }
  return record;
}

async function writeRecord(filename, record) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temp = filename + '.' + crypto.randomUUID() + '.tmp';
  try {
    const file = await fs.open(temp, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(record, null, 2) + '\n', 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.rename(temp, filename);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

function validateSubmission(data) {
  if (!data || data.confirmMigration !== true) throw new SetupError('consent');
  const fields = {};
  const limits = { storeName: 255, branchName: 255, phone: 30, address: 2000, ntn: 30, receiptFooter: 300, ownerName: 150, ownerEmail: 254 };
  for (const [name, max] of Object.entries(limits)) {
    if (typeof data[name] !== 'string') throw new SetupError('fields');
    fields[name] = data[name].trim();
    if (fields[name].length > max || fields[name].includes('\0')) throw new SetupError('fields');
  }
  if (!fields.storeName || !fields.branchName || !fields.ownerName ||
      !/^[^\s@]+@[^\s@]+$/.test(fields.ownerEmail)) throw new SetupError('fields');
  if (!Number.isInteger(data.counters) || data.counters < 1 || data.counters > 20) throw new SetupError('counters');
  fields.counters = data.counters;
  if (typeof data.password !== 'string' || !data.password || data.password !== data.confirmPassword ||
      /[\r\n\0]/.test(data.password)) throw new SetupError('password');
  if (!['en', 'ur'].includes(data.language)) throw new SetupError('fields');
  return { fields, password: data.password, language: data.language };
}

function matchesIntent(status, intent) {
  return !!intent && status.branch === '01' && status.store === intent.storeName &&
    typeof status.owner_email === 'string' && status.owner_email.toLowerCase() === intent.ownerEmail.toLowerCase() &&
    status.counters === intent.counters;
}

async function runSetup({ configPath, runtime, submission, onProgress }) {
  const { fields, password, language } = validateSubmission(submission);
  const intentPath = path.join(path.dirname(configPath), 'setup-pending.json');
  let phase = 'storage';
  const progress = (stage, percent) => {
    phase = stage;
    onProgress({ stage, percent });
  };
  try {
    const existing = await readConfig(configPath);
    if (existing) return existing;
    let intent = await readRecord(intentPath);
    progress('database', 10);
    await runtime.initializePostgres();
    if (!intent) {
      progress('migration', 30);
      await runtime.migrate();
    }
    progress('shop', 65);
    const status = await runtime.setupStatus();
    if (!status || status.ok !== true || typeof status.configured !== 'boolean') throw new SetupError('shop');
    if (status.configured) {
      if (!matchesIntent(status, intent)) throw new SetupError('existing');
      // The previous attempt committed and stopped before settings reached disk.
    } else {
      intent = { storeName: fields.storeName, branchName: fields.branchName, ownerEmail: fields.ownerEmail, counters: fields.counters, language };
      await writeRecord(intentPath, intent);
      const result = await runtime.setupShop(fields, password);
      if (!result || result.ok !== true) throw new SetupError('shop');
    }
    progress('storage', 90);
    const { port, dataDir, appVersion } = await runtime.getConfig();
    const config = { version: 1, language: intent.language, storeName: intent.storeName, branchName: intent.branchName, port, dataDir, appVersion };
    await writeRecord(configPath, config);
    await fs.rm(intentPath, { force: true }).catch(() => {});
    progress('ready', 100);
    return config;
  } catch (error) {
    if (error instanceof SetupError) throw error;
    throw new SetupError(phase, phase === 'shop' && typeof error.userMessage === 'string' ? error.userMessage : '');
  }
}

module.exports = { SetupError, readConfig, runSetup, writeRecord };
