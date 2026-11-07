import { chromium } from 'playwright-core';
// End-to-end checks for the redesigned pages, against a running app with demo data.
//   BASE=http://localhost:3000 PASSWORD=<seed_demo password> node design.mjs
// Optional: CHROME_PATH=/path/to/chromium (else the installed Chrome channel is used).
const B = process.env.BASE || 'http://localhost:3000';
const PW = process.env.PASSWORD;
if (!PW) throw new Error('Set PASSWORD to the seed_demo password.');

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? `  -> ${extra}` : ''}`);
};

async function session(email, password = PW) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Karachi' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The notification stream answers 503 on purpose when a worker already holds its stream cap; the client retries.
  // Product search answers 503 when Elasticsearch is down; the pages fall back to the local catalogue (checked below).
  const expected503 = (url) => url.includes('/notifications/stream') || url.includes('/inventory/products/search');
  page.on('response', (r) => { if (r.status() >= 500 && !(r.status() === 503 && expected503(r.url()))) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(B);
  await page.waitForSelector('#email');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForTimeout(1200);
  const api = async (method, path, data) => {
    const csrf = (await ctx.cookies()).find((c) => c.name === 'csrftoken')?.value ?? '';
    const res = await page.request.fetch(`${B}/api${path}`, { method, data, headers: { 'X-CSRFToken': csrf, Referer: B } });
    return { status: res.status(), body: res.status() === 204 ? null : await res.json().catch(() => null) };
  };
  return { ctx, page, errors, api };
}

// ---------------------------------------------------------------- Owner: every page renders
const owner = await session('owner@smartshop.local');
const pages = [
  ['/dashboard', 'Gross sales'], ['/sales', 'Avg bill'], ['/customers', 'Returning rate'], ['/inventory', 'On hand'],
  ['/purchases', 'Recent deliveries'], ['/suppliers', 'Balance owed'], ['/expenses', 'Where the money went'],
  ['/reports', 'Net profit'], ['/insights', 'Customer segments'], ['/settings', 'Store details'],
];
for (const [path, text] of pages) {
  await owner.page.goto(B + path);
  const found = await owner.page.waitForFunction((needle) => document.body.innerText.includes(needle), text, { timeout: 8000 }).then(() => true).catch(() => false);
  ok(`owner ${path} shows "${text}"`, found);
}
for (const tab of ['Sales', 'Stock valuation', 'Tax', 'Cashier performance', 'Khata ageing']) {
  await owner.page.goto(`${B}/reports`);
  await owner.page.getByRole('tab', { name: tab }).click();
  const loaded = await owner.page.waitForFunction(() => !document.querySelector('.skeleton'), null, { timeout: 8000 }).then(() => true).catch(() => false);
  ok(`reports tab ${tab} loads`, loaded);
}
ok('owner pages had no errors', owner.errors.length === 0, owner.errors.slice(0, 3).join(' | '));

// Drawer expense through the UI lowers the open shift's expected cash.
const shifts = (await owner.api('GET', '/sales/terminals/1/shift/')).body.shift;
const before = shifts ? (await owner.api('GET', `/sales/shifts/${shifts.id}/z-report/`)).body : null;
await owner.page.goto(`${B}/expenses`);
await owner.page.getByRole('button', { name: 'Add expense' }).click();
await owner.page.fill('#expense-amount', '75');
await owner.page.fill('#expense-note', 'E2E rickshaw');
await owner.page.selectOption('#expense-category', 'transport');
await owner.page.selectOption('#expense-from', 'drawer:1');
await owner.page.locator('#expense-form').evaluate((f) => f.requestSubmit());
await owner.page.waitForFunction(() => document.body.innerText.includes('E2E rickshaw'), null, { timeout: 8000 }).catch(() => undefined);
ok('drawer expense row shows its register', (await owner.page.innerText('main')).includes('Cash · Counter 1'));
if (before) {
  const after = (await owner.api('GET', `/sales/shifts/${shifts.id}/z-report/`)).body;
  ok('drawer expense lowers expected cash by 75', Math.abs(Number(before.expected_cash) - Number(after.expected_cash) - 75) < 0.01, `${before.expected_cash} -> ${after.expected_cash}`);
}

// Give the cashier a PIN for the PIN sign-in check below.
const users = (await owner.api('GET', '/auth/users/')).body;
const cashierUser = users.find((u) => u.email === 'cashier@smartshop.local');
ok('owner sets cashier PIN', (await owner.api('PATCH', `/auth/users/${cashierUser.id}/`, { pin: '4826' })).status === 200);

// A customer with room on khata for the credit sale.
const khataCustomer = (await owner.api('POST', '/customers/', { name: 'E2E Khata Customer', phone: `0300${Date.now() % 10_000_000}`, credit_limit: '50000', area: 'Gulberg III' })).body;
ok('customer with area created', khataCustomer?.area === 'Gulberg III');

// ---------------------------------------------------------------- Cashier at the till
const cashier = await session('cashier@smartshop.local');
ok('cashier lands on the till', cashier.page.url().endsWith('/pos'), cashier.page.url());
const products = (await cashier.api('GET', '/inventory/products/')).body;
const item = products.find((p) => p.active && Number(p.stock) > 5 && !p.track_expiry);
const scanner = cashier.page.getByRole('textbox', { name: 'Scan a barcode or search products' });

// Name search: this sandbox has no Elasticsearch, so this exercises the local fallback.
await scanner.fill(item.name.slice(0, 5));
await cashier.page.waitForTimeout(700);
ok('name search finds products without the search service', (await cashier.page.locator('section[aria-label] button.relative', { hasText: item.name }).count()) > 0);
await scanner.fill('');

// Cash sale by barcode.
const salesBefore = (await owner.api('GET', '/sales/?page_size=1')).body.count;
await scanner.fill(item.barcode);
await scanner.press('Enter');
await cashier.page.waitForTimeout(300);
await cashier.page.keyboard.press('F1');
await cashier.page.waitForSelector('#cash-tendered');
await cashier.page.getByRole('button', { name: /Exact/ }).click();
await cashier.page.locator('#cash-quick-form').evaluate((f) => f.requestSubmit());
const flash = await cashier.page.waitForSelector('[data-testid=change-flash]', { timeout: 8000 }).then(() => true).catch(() => false);
ok('cash sale completes with change screen', flash);
await cashier.page.locator('[role=dialog]:has([data-testid=change-flash])').getByRole('button').first().click();
await cashier.page.waitForSelector('[data-testid=change-flash]', { state: 'detached' });
ok('sale recorded on the server', (await owner.api('GET', '/sales/?page_size=1')).body.count === salesBefore + 1);
const after = (await cashier.api('GET', `/inventory/products/${item.id}/`)).body;
ok('stock went down by one', Number(after.stock) === Number(item.stock) - 1, `${item.stock} -> ${after.stock}`);

// Khata sale: F6 picks the customer, the payment form takes it on credit.
await scanner.fill(item.barcode);
await scanner.press('Enter');
await cashier.page.waitForTimeout(300);
await cashier.page.keyboard.press('F6');
await cashier.page.getByPlaceholder('Search name or phone').fill(khataCustomer.phone);
await cashier.page.waitForTimeout(700);
await cashier.page.getByRole('option', { name: new RegExp(khataCustomer.phone) }).click();
ok('customer chip on the bill', (await cashier.page.innerText('body')).includes('E2E Khata Customer'));
await cashier.page.getByRole('button', { name: 'Split', exact: true }).click();
await cashier.page.waitForSelector('#payment-form');
const due = (await cashier.page.innerText('[data-testid=amount-due]')).replace(/[^\d.]/g, '');
await cashier.page.fill('#pay-credit', due);
await cashier.page.locator('#payment-form').evaluate((f) => f.requestSubmit());
await cashier.page.waitForTimeout(1200);
const customerAfter = (await owner.api('GET', `/customers/${khataCustomer.id}/`)).body;
ok('khata sale charged the customer', Number(customerAfter.balance) === Number(due), `${customerAfter.balance} vs ${due}`);
ok('till had no errors', cashier.errors.length === 0, cashier.errors.slice(0, 3).join(' | '));

// Cashier must not see owner pages.
await cashier.page.goto(`${B}/reports`);
await cashier.page.waitForTimeout(600);
ok('cashier is kept out of Reports', !cashier.page.url().endsWith('/reports'), cashier.page.url());

// PIN sign-in on this till (it has the till cookie from the email sign-in above).
await cashier.page.goto(`${B}/pos`);
await cashier.page.getByRole('button', { name: 'More till options' }).click();
await cashier.page.getByRole('menuitem', { name: /Log out|Logout|Sign out/i }).click();
await cashier.page.waitForSelector('#email');
await cashier.page.getByRole('button', { name: 'Cashier quick sign-in with PIN' }).click();
await cashier.page.fill('#pin', '4826');
await cashier.page.click('button[type=submit]');
await cashier.page.waitForTimeout(1200);
ok('PIN sign-in works on a till', cashier.page.url().endsWith('/pos'), cashier.page.url());

// A fresh browser is not a till, so PIN sign-in is refused there.
const stranger = await browser.newContext();
const strangerPage = await stranger.newPage();
await strangerPage.goto(B);
await strangerPage.waitForSelector('#email');
const csrf = (await stranger.cookies()).find((c) => c.name === 'csrftoken')?.value ?? '';
const refused = await strangerPage.request.post(`${B}/api/auth/pin-login/`, { data: { pin: '4826' }, headers: { 'X-CSRFToken': csrf, Referer: B } });
ok('PIN sign-in refused on a non-till browser', refused.status() === 403, String(refused.status()));

// ---------------------------------------------------------------- Orders: find the sale and return it
const latest = (await owner.api('GET', '/sales/?page_size=1')).body.results[0];
await owner.page.goto(`${B}/sales?search=${encodeURIComponent(latest.invoice_no)}`);
const shown = await owner.page.waitForFunction((inv) => document.body.innerText.includes(inv), latest.invoice_no, { timeout: 8000 }).then(() => true).catch(() => false);
ok('order found by invoice search', shown);
ok('khata order shows On khata', (await owner.page.innerText('main')).includes('On khata'));
await owner.page.getByRole('button', { name: 'Return items' }).click();
ok('return dialog opens', await owner.page.locator('[role=dialog]').isVisible());

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
