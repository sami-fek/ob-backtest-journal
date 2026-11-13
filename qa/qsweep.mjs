// Fix-round sweep: every page and overlay; layout audit + text check + colour check.
// node qsweep.mjs <name> [widths] [themes] [--layout] [--hover] [--shots]
import { open, launch, mk, OUTDIR, audit, wait, BASE, api, makeTrades } from './h2.mjs';
import { newUser } from './seed.mjs';
import { qcheck, TEXT_ALLOWED, COLOUR_ALLOWED } from './qcheck.mjs';
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const [name = 'qsweep', widthsArg = '1440,390', themesArg = 'light,dark'] = args.filter(a => !a.startsWith('--'));
const dir = mk(OUTDIR + name + '/');
const LAYOUT = flags.has('--layout'), HOVER = flags.has('--hover'), SHOTS = flags.has('--shots');
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = iso(new Date());
const PREFS = { currencySymbol: '€', dateFormat: 'DD/MM/YYYY', maxDailyTrades: 3, hardStopLosses: 2 };
const t = (o) => ({ mode: 'Real', accountId: 'real-1', pair: 'EURUSD', timeframe: '15M', regime: 'Trending', session: 'London', direction: 'LONG', strategy: 'Model A', notes: '<p>n</p>', checklist: ['pass'], screenshots: [], tags: [], feeling: 'neutral', ...o });
const ACCOUNTS = {
  Demo: [{ id: 'demo-1', name: 'Demo 01', balance: 100000, startingBalance: 100000 }],
  Real: [{ id: 'real-1', name: 'Real 01', balance: 100000, startingBalance: 100000, weeklyTarget: 3000, monthlyTarget: 10000, cashMovements: [{ id: 'c1', type: 'deposit', date: '2026-10-20', amount: 2000 }] }],
  Funded: [{ id: 'funded-1', name: 'Funded 100k', balance: 100000, startingBalance: 100000, profitTarget: 10000, maxDrawdown: 10000, dailyLossLimit: 5000, weeklyTarget: 2500 }]
};
async function user(trades) { const c = await newUser({ trades, accounts: ACCOUNTS }); await api(c, 'PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ ...PREFS, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) }); return c; }

// main user: 40 trades, funded trades, one MT5 trade (R-assign panel), one older hard-stop day
const main = makeTrades(40);
for (let i = 0; i < 8; i++) { const d = new Date(); d.setDate(d.getDate() - i * 2 - 1); main.push(t({ id: 'f-' + i, mode: 'Funded', accountId: 'funded-1', date: iso(d), pair: 'NAS100', result: i % 3 === 1 ? 'Win' : 'Loss', rMultiple: i % 3 === 1 ? 2 : -1 })); }
main.push(t({ id: 'mt5-1', source: 'mt5', date: iso(new Date(Date.now() - 3 * 864e5)), pair: 'XAUUSD', result: 'Win', pnl: 412.5, rMultiple: null, ticket: 99123, volume: 0.5 }));
const cMain = await user(main);
const cLimit = await user([...makeTrades(10), t({ id: 'l1', date: today, result: 'Win', rMultiple: 1 }), t({ id: 'l2', date: today, result: 'Win', rMultiple: 1 }), t({ id: 'l3', date: today, result: 'Win', rMultiple: 1 })]);
const cStop = await user([...makeTrades(10), t({ id: 's1', date: today, result: 'Loss', rMultiple: -1 }), t({ id: 's2', date: today, result: 'Loss', rMultiple: -1 })]);

const b = await launch(); const errors = [];
const results = []; // { screen, layout:[], text:[], colour:[] }
async function check(p, screen, width, { scope = null, layout = true } = {}) {
  process.stderr.write('· ' + screen + String.fromCharCode(10));
  const r = await race(qcheck(p, { scope, hover: HOVER && width >= 1024 }), 240000, 'qcheck ' + screen).catch(e => ({ text: [], colour: ['CHECK FAILED: ' + e.message] }));
  const lay = LAYOUT && layout ? await race(audit(p, { touch: width < 1024 }), 60000, 'audit').catch(e => ['AUDIT FAILED: ' + e.message]) : [];
  results.push({ screen, layout: lay, text: r.text, colour: r.colour });
  if (SHOTS) await p.screenshot({ path: `${dir}${screen.replace(/[^\w.-]+/g, '_')}.png` });
}
const race = (pr, ms, label) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + label)), ms))]);
const step = async (p, fn, ms = 600) => { await race(p.evaluate(fn), 8000, 'step').catch(e => errors.push('step: ' + e.message)); await wait(ms); };

for (const theme of themesArg.split(',')) for (const width of widthsArg.split(',').map(Number)) {
  const tag = `${theme} ${width}`; let p;
  // ── pages
  for (const [tab, mode] of [['dashboard', 'Real'], ['dashboard', 'Funded'], ['dashboard', 'Backtest'], ['trading', 'Real'], ['trading', 'Funded'], ['journal', 'Real'], ['analytics', 'Real'], ['settings', 'Real']]) {
    p = await open(b, cMain, { theme, width, tab, mode, errors });
    await check(p, `${tab}/${mode} ${tag}`, width);
    if (tab === 'analytics') { await step(p, () => [...document.querySelectorAll('#pageAnalytics button')].find(x => /behavior/i.test(x.textContent))?.click(), 900); await check(p, `analytics/Behavior ${tag}`, width); }
    if (tab === 'dashboard' && mode === 'Real') { await step(p, () => document.getElementById('dbFilterBtn')?.click(), 400); await check(p, `dashboard filter popover ${tag}`, width, { layout: false }); }
    await p.close();
  }
  for (const sec of ['profile', 'accounts', 'settings', 'security', 'data', 'danger']) {
    p = await open(b, cMain, { theme, width, tab: 'accounts', errors });
    await step(p, s => window.openAccountCenter(s), 900);
    await check(p, `account center/${sec} ${tag}`, width);
    await p.close();
  }
  // ── overlays (Trading page underneath)
  p = await open(b, cMain, { theme, width, tab: 'trading', errors });
  await step(p, () => document.getElementById('tpAddTrade')?.click(), 800); await check(p, `new trade sheet ${tag}`, width, { layout: false });
  await step(p, () => window.closeDrawer && window.closeDrawer(), 300);
  await step(p, () => { const x = document.querySelector('.ob-dd-btn'); x && x.scrollIntoView({ block: 'center' }); x && x.click(); }, 500); await check(p, `dropdown ${tag}`, width, { layout: false });
  await p.keyboard.press('Escape'); await wait(200);
  await step(p, () => window.openDrawer(window.trades.find(x => x.mode === 'Real' && x.source !== 'mt5').id), 800); await check(p, `trade drawer ${tag}`, width, { layout: false });
  await step(p, () => window.closeDrawer(), 300);
  await step(p, () => window.openDrawer('mt5-1'), 900); await check(p, `trade drawer MT5 (R-assign) ${tag}`, width, { layout: false });
  await step(p, () => window.closeDrawer(), 300);
  await step(p, () => window.obAddTradeOnDate(new Date().toISOString().slice(0, 8) + '01'), 800); await check(p, `calendar day panel ${tag}`, width, { layout: false });
  await step(p, () => window.closeDrawer(), 300);
  await step(p, () => { window.scrollTo(0, 0); document.getElementById('ob-account-btn')?.click(); }, 500); await check(p, `account menu ${tag}`, width, { layout: false });
  await p.keyboard.press('Escape'); await step(p, () => document.body.click(), 200);
  await step(p, () => document.getElementById('ob-ai-fab')?.click(), 700); await check(p, `AI Coach ${tag}`, width, { layout: false });
  await p.keyboard.press('Escape'); await wait(300);
  await p.close();
  p = await open(b, cMain, { theme, width, tab: 'trading', errors });
  await step(p, () => { const btn = [...document.querySelectorAll('button')].find(x => /edit checklist|\+ add strategy/i.test(x.textContent)); btn && btn.click(); }, 600); await check(p, `strategy dialog ${tag}`, width, { layout: false });
  await p.close();
  p = await open(b, cMain, { theme, width, tab: 'trading', errors });
  await step(p, () => document.querySelector('#tpStrip [data-mt5="link"]')?.click(), 800); await check(p, `MT5 link dialog ${tag}`, width, { layout: false });
  await p.close();
  p = await open(b, cMain, { theme, width, tab: 'trading', errors });
  await step(p, () => window.openAddAccountModal(), 700); await check(p, `add account dialog ${tag}`, width, { layout: false });
  await p.close();
  p = await open(b, cMain, { theme, width, tab: 'trading', errors });
  await step(p, () => window.openEditAccountModal('real-1'), 700); await check(p, `edit account dialog ${tag}`, width, { layout: false });
  await p.close();
  p = await open(b, cLimit, { theme, width, tab: 'trading', errors });
  await check(p, `trading at daily limit ${tag}`, width);
  await step(p, () => document.getElementById('tpAddTrade')?.click(), 900); await check(p, `daily-limit modal ${tag}`, width, { layout: false });
  await p.close();
  p = await open(b, cStop, { theme, width, tab: 'trading', errors });
  await check(p, `trading at hard stop ${tag}`, width);
  await step(p, () => document.getElementById('tpAddTrade')?.click(), 900); await check(p, `hard-stop modal ${tag}`, width, { layout: false });
  await p.close();
  p = await open(b, cStop, { theme, width, tab: 'journal', errors });
  await check(p, `journal at hard stop ${tag}`, width);
  await p.close();
  // ── signed out
  const ctx = await b.createBrowserContext(); const q = await ctx.newPage(); q.on('pageerror', e => errors.push('signed out: ' + e.message));
  const touch = width < 1024;
  await q.setViewport({ width, height: touch ? 844 : 900, isMobile: touch, hasTouch: touch });
  if (touch) { const cdp = await q.createCDPSession(); await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'any-hover', value: 'none' }, { name: 'pointer', value: 'coarse' }, { name: 'any-pointer', value: 'coarse' }] }); }
  await q.evaluateOnNewDocument(th => localStorage.setItem('my-journal-theme', th), theme);
  await q.goto(BASE + '/', { waitUntil: 'networkidle0' }); await wait(1500);
  await check(q, `homepage (signed out) ${tag}`, width);
  await step(q, () => document.getElementById('obSignInBtn')?.click(), 500); await check(q, `sign-in modal ${tag}`, width, { layout: false });
  await q.goto(BASE + '/auth.html', { waitUntil: 'networkidle0' }); await wait(900);
  await check(q, `auth.html ${tag}`, width, { layout: false });
  await ctx.close();
  console.error(`done ${tag}`);
}
await b.close();

// ── report
const screens = results.length;
const agg = kind => { const m = new Map(); for (const r of results) for (const i of r[kind]) { if (!m.has(i)) m.set(i, []); m.get(i).push(r.screen); } return m; };
for (const kind of ['text', 'colour', 'layout']) {
  const m = agg(kind);
  console.log(`\n=== ${kind.toUpperCase()}: ${m.size ? m.size + ' distinct issue(s)' : 'clean'} ===`);
  for (const [i, s] of m) console.log(` - ${i}\n     on ${s.length} screen(s): ${s.slice(0, 4).join(' | ')}${s.length > 4 ? ' …' : ''}`);
}
const perPage = new Map();
for (const r of results) { const k = r.screen.replace(/ (light|dark) \d+$/, ''); const v = perPage.get(k) || { n: 0, bad: 0 }; v.n++; if (r.layout.length + r.text.length + r.colour.length) v.bad++; perPage.set(k, v); }
console.log(`\n=== PER PAGE (${screens} screens) ===`);
for (const [k, v] of perPage) console.log(`${v.bad ? 'ISSUES' : 'clean '}  ${k}: ${v.n - v.bad}/${v.n} clean`);
console.log('\nallowed text:', TEXT_ALLOWED.map(a => a.why).join('; '));
console.log('allowed blue:', COLOUR_ALLOWED.map(a => a.why).join('; '));
console.log('errors', errors);
