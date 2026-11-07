'use strict';

const copy = {
  en: {
    store: 'Store', owner: 'Owner', counters: 'Counters', storeTitle: 'Set up your store',
    storeHint: 'These details appear on receipts.', storeName: 'Store name', branchName: 'Branch name',
    phone: 'Phone', address: 'Address', ntn: 'NTN (optional)', receiptFooter: 'Receipt footer',
    ownerTitle: 'Create your owner account', ownerHint: 'You’ll use this email and password to sign in.',
    ownerName: 'Full name', ownerEmail: 'Email', password: 'Password', confirmPassword: 'Confirm password',
    counterTitle: 'Set up your counters', counterHint: 'Each till has its own counter and invoice numbers.',
    counterCount: 'Number of tills (1–20)', confirmMigration: 'I approve creating the database tables and applying migrations to this installation’s shop database.',
    back: 'Back', next: 'Continue', submit: 'Set up store', progressTitle: 'Setting up your store…',
    stages: { database: 'Starting the local database…', migration: 'Preparing database tables…', shop: 'Setting up the store, counters and owner…', storage: 'Saving settings…', ready: 'Opening the login screen…' },
    errors: { fields: 'Check the required store and owner details.', email: 'Enter a valid owner email address.', password: 'Enter the same password in both fields.', consent: 'Confirm the database setup before continuing.', counters: 'Enter a whole number from 1 to 20.', existing: 'This database already has an owner. Check that this is the intended installation.', busy: 'Setup is already running.', database: 'The local database could not start. Check the installation and try again.', migration: 'The database tables could not be prepared. Check the installation and try again.', shop: 'The store could not be set up. Review the details and try again.', storage: 'Could not save settings. Check available space and try again.', launch: 'Could not open the register. Check the installation and try again.' },
  },
  ur: {
    store: 'دکان', owner: 'مالک', counters: 'کاؤنٹر', storeTitle: 'اپنی دکان کی تفصیلات درج کریں',
    storeHint: 'یہ معلومات رسید پر نظر آئیں گی۔', storeName: 'دکان کا نام', branchName: 'برانچ کا نام',
    phone: 'فون نمبر', address: 'پتہ', ntn: 'این ٹی این (اختیاری)', receiptFooter: 'رسید کے آخر میں پیغام',
    ownerTitle: 'مالک کا اکاؤنٹ بنائیں', ownerHint: 'سائن اِن کے لیے یہی ای میل اور پاس ورڈ استعمال کریں۔',
    ownerName: 'پورا نام', ownerEmail: 'ای میل', password: 'پاس ورڈ', confirmPassword: 'پاس ورڈ دوبارہ درج کریں',
    counterTitle: 'کاؤنٹر ترتیب دیں', counterHint: 'ہر کاؤنٹر کی رسیدوں کا الگ نمبر ہوتا ہے۔',
    counterCount: 'کاؤنٹرز کی تعداد (1–20)', confirmMigration: 'میں اس تنصیب میں دکان کے ڈیٹابیس کے لیے ٹیبلز بنانے اور مائیگریشن چلانے کی اجازت دیتا ہوں۔',
    back: 'واپس', next: 'آگے بڑھیں', submit: 'دکان تیار کریں', progressTitle: 'آپ کی دکان تیار ہو رہی ہے…',
    stages: { database: 'مقامی ڈیٹابیس شروع ہو رہا ہے…', migration: 'ڈیٹابیس کی ٹیبلز تیار ہو رہی ہیں…', shop: 'دکان، کاؤنٹر اور مالک کا اکاؤنٹ بن رہے ہیں…', storage: 'ترتیبات محفوظ ہو رہی ہیں…', ready: 'سائن اِن اسکرین کھل رہی ہے…' },
    errors: { fields: 'دکان اور مالک کی لازمی معلومات مکمل کریں۔', email: 'مالک کا درست ای میل پتہ درج کریں۔', password: 'دونوں خانوں میں ایک ہی پاس ورڈ درج کریں۔', consent: 'آگے بڑھنے کے لیے ڈیٹابیس کی تیاری کی اجازت دیں۔', counters: '1 سے 20 تک کوئی صحیح عدد درج کریں۔', existing: 'اس ڈیٹابیس میں مالک پہلے سے موجود ہے۔ تصدیق کریں کہ یہی مطلوبہ تنصیب ہے۔', busy: 'سیٹ اپ پہلے ہی جاری ہے۔', database: 'مقامی ڈیٹابیس شروع نہیں ہو سکا۔ تنصیب چیک کر کے دوبارہ کوشش کریں۔', migration: 'ڈیٹابیس کی ٹیبلز تیار نہیں ہو سکیں۔ تنصیب چیک کر کے دوبارہ کوشش کریں۔', shop: 'دکان ترتیب نہیں دی جا سکی۔ معلومات چیک کر کے دوبارہ کوشش کریں۔', storage: 'ترتیبات محفوظ نہیں ہو سکیں۔ دستیاب جگہ چیک کر کے دوبارہ کوشش کریں۔', launch: 'رجسٹر نہیں کھل سکا۔ تنصیب چیک کر کے دوبارہ کوشش کریں۔' },
  },
};

const form = document.querySelector('#form');
const sections = [...document.querySelectorAll('#form section')];
const byId = id => document.getElementById(id);
let language = 'en';
let step = 0;
let working = false;
let stage = 'database';
let issue = null;

function render() {
  const t = copy[language];
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-key]').forEach(el => { el.textContent = t[el.dataset.key]; });
  for (const code of ['en', 'ur']) byId(code).setAttribute('aria-pressed', String(language === code));
  sections.forEach((section, index) => { section.hidden = index !== step; });
  [...byId('steps').children].forEach((li, index) => {
    if (index === step) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
    li.classList.toggle('complete', index < step);
  });
  form.hidden = working;
  byId('progress').hidden = !working;
  byId('back').hidden = step === 0;
  byId('next').textContent = step === sections.length - 1 ? t.submit : t.next;
  byId('status').textContent = t.stages[stage];
  byId('error').hidden = !issue;
  byId('error').textContent = issue ? [t.errors[issue.code] || t.errors.shop, issue.detail].filter(Boolean).join(' ') : '';
}

function setStep(value) {
  step = value;
  issue = null;
  render();
  sections[step].querySelector('h1').focus();
}

function validStep(index) {
  for (const field of sections[index].querySelectorAll('input, textarea')) {
    let code;
    if (!field.validity.valid || (field.required && !field.value.trim())) {
      code = { counters: 'counters', confirmMigration: 'consent', ownerEmail: 'email', password: 'password', confirmPassword: 'password' }[field.name] || 'fields';
    }
    if (field.name === 'confirmPassword' && field.value !== form.elements.password.value) code = 'password';
    if (code) {
      step = index;
      issue = { code };
      render();
      field.focus();
      return false;
    }
  }
  return true;
}

for (const code of ['en', 'ur']) byId(code).addEventListener('click', () => { language = code; render(); });
byId('back').addEventListener('click', () => setStep(step - 1));
form.addEventListener('input', () => { if (issue) { issue = null; render(); } });
window.tijoriSetup.onProgress(update => {
  stage = update.stage;
  byId('bar').value = update.percent;
  render();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (working || !validStep(step)) return;
  if (step < sections.length - 1) { setStep(step + 1); return; }
  if (!sections.every((_, index) => validStep(index))) return;
  const data = Object.fromEntries(new FormData(form));
  data.counters = Number(data.counters);
  data.confirmMigration = form.elements.confirmMigration.checked;
  data.language = language;
  issue = null;
  working = true;
  stage = 'database';
  byId('bar').value = 0;
  render();
  byId('progress').querySelector('h1').focus();
  try {
    const result = await window.tijoriSetup.submit(data);
    if (result.ok) {
      form.elements.password.value = '';
      form.elements.confirmPassword.value = '';
      return;
    }
    issue = result;
  } catch {
    issue = { code: 'launch' };
  }
  working = false;
  render();
  byId('error').setAttribute('tabindex', '-1');
  byId('error').focus();
});
render();
