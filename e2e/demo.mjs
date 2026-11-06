// Records the client demo video from the real app, on a database seeded with: seed_demo --history 30
//   BASE=http://localhost:3000 PASSWORD=<password> OUT=../demo-output CONTACT="0300-0000000" node demo.mjs
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BASE = process.env.BASE || 'http://localhost:3000';
const PASSWORD = process.env.PASSWORD;
const OUT = resolve(process.env.OUT || '../demo-output');
const CONTACT = process.env.CONTACT || '';
const FRAMES = join(OUT, 'frames');
const VIEW = { width: 1536, height: 864 };
const SCALE = 1.25; // Keeps the UI readable while the video stays a sharp 1920x1080.

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const overlay = () => {
  const install = () => {
    if (document.getElementById('demo-layer') || !document.body) return;
    const style = document.createElement('style');
    style.textContent = `
      #demo-layer{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:Poppins,Inter,system-ui,sans-serif;direction:ltr}
      #demo-cursor{position:absolute;left:0;top:0;width:26px;height:26px;transform:translate(760px,430px);transition:transform .7s cubic-bezier(.65,.05,.25,1);filter:drop-shadow(0 3px 5px rgba(0,0,0,.45))}
      .demo-ripple{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(16,185,129,.55);animation:demo-ripple .55s ease-out forwards}
      @keyframes demo-ripple{to{transform:scale(4.5);opacity:0}}
      #demo-badge{position:absolute;right:18px;bottom:14px;padding:4px 11px;border-radius:999px;background:rgba(15,23,42,.72);color:#fff;font-size:11px;font-weight:500;letter-spacing:.03em}
      #demo-caption{position:absolute;left:50%;bottom:34px;min-width:380px;max-width:880px;padding:15px 26px;border-radius:16px;background:rgba(1,44,20,.95);color:#fff;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.4);transform:translate(-50%,28px);opacity:0;transition:transform .45s cubic-bezier(.2,.9,.3,1),opacity .35s}
      #demo-caption.on{transform:translate(-50%,0);opacity:1}
      #demo-caption b{display:block;font-size:21px;font-weight:600;line-height:1.25}
      #demo-caption span{display:block;margin-top:3px;font-size:14px;font-family:Inter,system-ui,sans-serif;color:#bbf7d0}
      #demo-card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff;background:radial-gradient(1200px 700px at 30% 20%,#0a6a35 0%,#01411C 48%,#011f0e 100%);opacity:0;transition:opacity .55s}
      #demo-card.on{opacity:1}
      #demo-card.on ~ #demo-cursor{opacity:0}
      #demo-caption.top{bottom:auto;top:18px}
      #demo-card .k{font-size:15px;letter-spacing:.32em;text-transform:uppercase;color:#86efac;opacity:0;animation:demo-rise .7s .15s forwards}
      #demo-card h1{margin:16px 40px 0;font-size:66px;font-weight:700;line-height:1.08;letter-spacing:-.02em;opacity:0;animation:demo-rise .8s .3s forwards}
      #demo-card p{margin:20px 60px 0;max-width:900px;font:400 23px/1.45 Inter,system-ui,sans-serif;color:#d1fae5;opacity:0;animation:demo-rise .8s .55s forwards}
      #demo-card .chips{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:30px;max-width:940px}
      #demo-card .chips i{font:500 15px Inter,system-ui,sans-serif;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.12);opacity:0;animation:demo-rise .55s forwards}
      @keyframes demo-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
      #root{transition:transform .9s cubic-bezier(.65,.05,.25,1)}
    `;
    document.head.appendChild(style);
    const layer = document.createElement('div');
    layer.id = 'demo-layer';
    layer.innerHTML = `<div id="demo-badge">Demo data</div><div id="demo-caption"><b></b><span></span></div><div id="demo-card"></div>
      <svg id="demo-cursor" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.7-7.6L21 10.6z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    document.body.appendChild(layer);
  };
  window.__demo = {
    ensure: install,
    cursor(x, y) { install(); document.getElementById('demo-cursor').style.transform = `translate(${x}px,${y}px)`; },
    ripple(x, y) {
      const dot = document.createElement('div');
      dot.className = 'demo-ripple';
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      document.getElementById('demo-layer').appendChild(dot);
      setTimeout(() => dot.remove(), 600);
    },
    caption(title, sub, top) {
      install();
      const box = document.getElementById('demo-caption');
      box.classList.toggle('top', !!top);
      if (!title) { box.classList.remove('on'); return; }
      box.querySelector('b').textContent = title;
      box.querySelector('span').textContent = sub || '';
      box.querySelector('span').style.display = sub ? 'block' : 'none';
      box.classList.add('on');
    },
    card(kicker, title, text, chips) {
      install();
      const card = document.getElementById('demo-card');
      card.innerHTML = `<div class="k">${kicker}</div><h1>${title}</h1>${text ? `<p>${text}</p>` : ''}`
        + (chips ? `<div class="chips">${chips.map((c, i) => `<i style="animation-delay:${0.8 + i * 0.09}s">${c}</i>`).join('')}</div>` : '');
      card.classList.add('on');
    },
    hideCard() { document.getElementById('demo-card')?.classList.remove('on'); },
    zoom(x, y, scale) {
      const root = document.getElementById('root');
      root.style.transformOrigin = `${x}px ${y}px`;
      root.style.transform = scale === 1 ? 'none' : `scale(${scale})`;
    },
  };
  document.addEventListener('DOMContentLoaded', install);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE });
await ctx.addInitScript(overlay);
const page = await ctx.newPage();
page.on('dialog', (dialog) => dialog.accept());
page.on('pageerror', (error) => console.log('PAGE ERROR', error.message));

const cdp = await ctx.newCDPSession(page);
const frames = [];
let frameIndex = 0;
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const name = `f${String(frameIndex++).padStart(6, '0')}.jpg`;
  writeFileSync(join(FRAMES, name), Buffer.from(data, 'base64'));
  frames.push({ name, t: metadata.timestamp });
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});

const wait = (ms) => page.waitForTimeout(ms);
const say = (title, sub) => page.evaluate(([a, b]) => window.__demo.caption(a, b), [title, sub]);
const sayTop = (title, sub) => page.evaluate(([a, b]) => window.__demo.caption(a, b, true), [title, sub]);
const hush = () => page.evaluate(() => window.__demo.caption(''));
const card = async (kicker, title, text, hold = 2400, chips) => {
  await hush();
  await page.evaluate(([k, h, t, c]) => window.__demo.card(k, h, t, c), [kicker, title, text, chips]);
  await wait(hold);
};
const uncard = async () => { await page.evaluate(() => window.__demo.hideCard()); await wait(600); };
const zoom = async (locator, scale = 1.5) => {
  const box = await locator.boundingBox();
  await page.evaluate(([x, y, s]) => window.__demo.zoom(x, y, s), [box.x + box.width / 2, box.y + box.height / 2, scale]);
  await wait(1000);
};
const unzoom = async () => { await page.evaluate(() => window.__demo.zoom(0, 0, 1)); await wait(1000); };
const point = async (locator) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(([a, b]) => window.__demo.cursor(a, b), [x, y]);
  await wait(760);
  return [x, y];
};
const click = async (locator) => {
  const [x, y] = await point(locator);
  await page.evaluate(([a, b]) => window.__demo.ripple(a, b), [x, y]);
  await locator.click();
  await wait(350);
};
const typeIn = async (locator, text, delay = 55) => {
  await click(locator);
  await locator.fill('');
  await page.keyboard.type(text, { delay });
  await wait(250);
};
const scan = async (code) => {
  await page.keyboard.type(code, { delay: 12 });
  await page.keyboard.press('Enter');
  await wait(750);
};
const nav = async (name) => { await hush(); await click(page.locator('nav').getByRole('link', { name, exact: true })); await wait(900); };
const scrollMain = async (top) => {
  await page.evaluate((y) => document.querySelector('main')?.scrollTo({ top: y, behavior: 'smooth' }), top);
  await wait(1300);
};
const signIn = async (email) => {
  await typeIn(page.locator('#email'), email, 28);
  await typeIn(page.locator('#password'), PASSWORD, 18);
  await click(page.locator('button[type=submit]'));
};

await page.goto(BASE);
await page.waitForSelector('#email');
await page.evaluate(() => window.__demo.ensure());
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

// ---------- Opening
await card('SmartShop POS', 'Run your whole shop<br/>from one screen', 'Point of sale, stock, suppliers, customer khata and real profit reports. Built for Pakistani retail, in English and Urdu.', 3900);
await uncard();

// ---------- Selling
await card('01 · At the counter', 'Fast, keyboard-first billing', '', 1700);
await uncard();
await say('Every person has their own login', 'Cashiers only ever see the POS');
await signIn('cashier@smartshop.local');
await page.waitForSelector('#cash-amount');
await wait(700);
await say('Each shift starts with a cash count', 'So the drawer can be checked at the end of the day');
await typeIn(page.locator('#cash-amount'), '5000');
await click(page.getByRole('button', { name: 'Open Shift' }));
await page.waitForSelector('#cash-amount', { state: 'detached' });
await page.waitForFunction(() => document.body.innerText.includes('Sprite'));
await wait(500);
await say('Scan a barcode and it is on the bill', 'Prices come from the server, so nobody can change them at the till');
await scan('200000000011');
await scan('200000000097');
await scan('200000000097');
await scan('200000000080');
await zoom(page.locator('table').first(), 1.35);
await wait(1100);
await unzoom();
await say('Unknown or expired items are refused', 'A clear message and a warning sound, not a silent mistake');
await scan('200000000103');
await wait(1500);
await sayTop('F1 to pay. Cash, wallets, card, or a split', 'The change is worked out for you');
await page.keyboard.press('F1');
await page.waitForSelector('#pay-cash');
await wait(600);
await page.keyboard.type('3500', { delay: 90 });
await wait(1600);
await page.keyboard.press('Enter');
await page.waitForSelector('[data-testid=invoice-no]');
await say('Saved instantly, with its own invoice number', 'Stock goes down the moment the sale completes');
await zoom(page.locator('[data-testid=change-due]'), 1.45);
await wait(1300);
await unzoom();
await sayTop('Print a receipt in one click', 'Sized for 80mm receipt paper, with sales tax shown');
await click(page.getByRole('button', { name: 'Print Receipt' }));
await page.waitForSelector('iframe', { state: 'attached' });
await page.evaluate(() => {
  const frame = document.querySelector('iframe');
  frame.style.cssText = 'position:fixed;z-index:999999;top:50%;left:50%;width:360px;height:640px;margin:-320px 0 0 -180px;border:0;border-radius:12px;background:#fff;box-shadow:0 30px 90px rgba(0,0,0,.6);visibility:visible';
});
await wait(3100);
await page.evaluate(() => document.querySelector('iframe').remove());
await page.keyboard.press('Enter');
await wait(500);

// ---------- Urdu
await say('English or Urdu, for the whole app', 'Right-to-left layout, one click to switch');
await click(page.getByRole('button', { name: /اردو/ }).first());
await wait(2400);
await click(page.getByRole('button', { name: /EN/ }).first());
await wait(700);

// ---------- Offline
await card('02 · When things go wrong', 'The server drops. You keep selling.', '', 1900);
await uncard();
await say('Connection lost in the middle of a shift', 'The sale still completes, and it is kept safely on the till');
await ctx.setOffline(true);
await scan('200000000042');
await page.keyboard.press('F1');
await page.waitForSelector('#pay-cash');
await wait(600);
await page.keyboard.press('Enter');
await page.waitForSelector('[data-testid=invoice-no]');
await wait(1500);
await page.keyboard.press('Enter');
await wait(700);
await say('The till shows what is waiting', 'Nothing is lost, and the shift cannot close until it syncs');
await zoom(page.getByRole('status').first(), 1.7);
await wait(1300);
await unzoom();
await say('Connection back: it syncs by itself', 'Retries can never create a duplicate sale');
await wait(700);
await ctx.setOffline(false);
await page.waitForFunction(() => !document.body.innerText.includes('waiting to sync'), null, { timeout: 30000 });
await wait(1900);

// ---------- Khata
await sayTop('Customer credit (khata), with a limit', 'Choose the customer and put the bill on their account');
await scan('200000000066');
await page.keyboard.press('F1');
await page.waitForSelector('#sale-customer');
await wait(400);
await page.selectOption('#sale-customer', { index: 1 });
await wait(900);
await typeIn(page.locator('#pay-credit'), '290');
await wait(1200);
await page.keyboard.press('Enter');
await page.waitForSelector('[data-testid=invoice-no]');
await wait(1200);
await page.keyboard.press('Enter');
await wait(500);

// ---------- Owner
await hush();
await click(page.getByRole('button', { name: 'Log out' }).first());
await page.waitForSelector('#email');
await wait(300);
await card('03 · For the owner', 'See your business clearly', '', 1800);
await uncard();
await say('The owner signs in and sees everything');
await signIn('owner@smartshop.local');
await page.waitForFunction(() => document.body.innerText.includes("Today's Sales"));
await wait(1700);
await say('Live numbers from real sales', 'Revenue, stock alerts and which counters are open');
await wait(2000);
await scrollMain(520);
await say('Sales by counter, payment methods, busy hours', 'Every chart comes from recorded sales');
await wait(2100);
await scrollMain(1120);
await say('Cash shortages and every sensitive action are logged', 'Shift differences, discounts, cleared bills, price changes');
await wait(2300);

// ---------- Buying
await hush();
await nav('Purchases');
await say('Goods received, exactly the way distributors bill', 'Free units, discounts, freight and tax, shared across items');
await page.selectOption('#grn-supplier', { label: 'Lucky Beverages' });
await wait(700);
await typeIn(page.locator('#grn-search'), 'Sprite', 70);
await wait(500);
await page.keyboard.press('Enter');
await wait(500);
await typeIn(page.getByRole('spinbutton', { name: 'Sprite 1.5 LTR Qty' }), '48');
await typeIn(page.getByRole('spinbutton', { name: 'Sprite 1.5 LTR Free' }), '2');
await typeIn(page.getByRole('spinbutton', { name: 'Sprite 1.5 LTR Rate' }), '150');
await typeIn(page.locator('#grn-flat'), '500');
await wait(900);
await say('It warns you when a supplier raises the price', 'See the new cost and margin before you accept the bill');
await wait(2600);
await click(page.getByRole('button', { name: 'Complete Purchase' }));
await page.waitForFunction(() => document.body.innerText.includes('posted. Stock added'));
await say('One click: stock in, cost updated, supplier charged');
await wait(2500);

await nav('Suppliers');
await click(page.getByRole('button', { name: /Lucky Beverages/ }).first());
await page.waitForSelector('#ledger-amount');
await sayTop('A full ledger for every supplier', 'Every purchase and payment, always adding up');
await wait(3400);
await hush();
await page.keyboard.press('Escape');
await wait(400);

await nav('Reports');
await wait(800);
await say('Real profit, not just sales', 'Net of returns, cost of goods and expenses');
await wait(2800);
await scrollMain(460);
await say('Stock value, what you owe, what you are owed');
await wait(2500);

await nav('Insights');
await wait(800);
await say('Know what to reorder before it runs out', 'From your own sales and supplier lead times');
await wait(2800);
await scrollMain(420);
await say('Spot expiring stock, dead stock and unusual patterns', 'Cash shortages and heavy discounts are flagged for you to check');
await wait(3100);

await nav('Settings');
await page.getByText('Roles and Permissions').waitFor();
await wait(500);
await page.getByText('Roles and Permissions').evaluate((node) => node.scrollIntoView({ behavior: 'smooth', block: 'start' }));
await wait(1300);
await say('You decide who can do what', 'If a role has no permission, the button simply is not there');
await wait(3400);

// ---------- Close
await hush();
await card(
  'SmartShop POS',
  'Ready for your shop',
  CONTACT ? `Book a free demo: ${CONTACT}` : 'Ask us for a live demo with your own products.',
  5200,
  ['Fast billing', 'Barcode labels', 'Stock & expiry', 'GRN & suppliers', 'Customer khata', 'Returns', 'Profit reports', 'Reorder insights', 'Roles & permissions', 'Works when the server drops', 'English & اردو'],
);

const stoppedAt = Date.now() / 1000; // Stills send no new frames, so the last one must be told how long it stayed on screen.
await cdp.send('Page.stopScreencast');
await wait(300);
await browser.close();

// A frame shows until the next one arrives; this keeps the real timing, including long still moments.
const list = frames.map((frame, i) => {
  const next = frames[i + 1];
  return `file '${join(FRAMES, frame.name)}'\nduration ${Math.max((next ? next.t : stoppedAt) - frame.t, 0.01).toFixed(4)}`;
}).join('\n');
const listFile = join(OUT, 'frames.txt');
writeFileSync(listFile, `${list}\nfile '${join(FRAMES, frames.at(-1).name)}'\n`);
const video = join(OUT, 'SmartShop-POS-demo.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
  '-vf', 'scale=1920:1080:flags=lanczos,fps=30,fade=in:0:15,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', video]);
rmSync(FRAMES, { recursive: true, force: true });
rmSync(listFile);
console.log(`Saved ${video} from ${frames.length} frames`);
