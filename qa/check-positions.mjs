// Part 7: open MT5 positions on the Dashboard (and the Trading page panel), apart from closed
// trades. /api/mt5/live is answered with fixed data; the closing step also writes the closed
// trade through the real server, as mt5-ingest would.
import { launch, wait, api, BASE, audit } from './h2.mjs';
import { newUser, makeTrades } from './seed.mjs';
let pass = 0, fail = 0; const errors = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const b = await launch();
const iso = ms => new Date(ms).toISOString();

async function openPage(cookie, { width, theme, tab = 'dashboard', live }) {
  const p = await b.newPage();
  p.on('pageerror', e => errors.push(`${tab}/${width}: ${e.message}`));
  p.on('dialog', d => d.accept());
  const touch = width < 1024;
  await p.setViewport({ width, height: touch ? 844 : 900, isMobile: touch, hasTouch: touch });
  await p.setRequestInterception(true);
  p.on('request', req => (req.url().includes('/api/mt5/live') ? req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(live()) }) : req.continue()));
  await p.setCookie({ name: 'ob_session', value: decodeURIComponent(cookie.split('=')[1]), url: BASE });
  await p.evaluateOnNewDocument((t, tab) => { try { localStorage.setItem('my-journal-theme', t); localStorage.setItem('ob_ui_state_v1', JSON.stringify({ tab, mode: 'Real' })); } catch (_) {} }, theme, tab);
  await p.goto(BASE + '/#' + tab, { waitUntil: 'networkidle0' });
  await wait(1800);
  return p;
}
const kpis = p => p.evaluate(() => ['analyticsExpectancy', 'analyticsProfitFactor', 'analyticsWinLossRatio', 'analyticsMaxDD', 'analyticsMonthNet'].map(id => document.getElementById(id)?.textContent.trim()).join(' | ') + ` | trades ${window.trades.length}`);

for (const [theme, width] of [['light', 1440], ['dark', 390]]) {
  console.log(`\n## ${theme} ${width}px`);
  const accounts = { Real: [{ id: 'real-1', name: 'Real 01', balance: 10000, startingBalance: 10000, mt5: { linked: true, login: '5550001', server: 'Broker-Live' } }] };
  const c = await newUser({ trades: makeTrades(30), accounts });
  await api(c, 'PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ timezone: 'Africa/Addis_Ababa', dateFormat: 'DD/MM/YYYY', currencySymbol: '€', maxDailyTrades: 10, hardStopLosses: 5 }) });
  const now = Date.now();
  const position = { ticket: '5001', symbol: 'EURUSD', direction: 'Sell', volume: 0.5, openTime: iso(now - 3_600_000), openPrice: 1.085, currentPrice: 1.0875, sl: 1.09, tp: 1.075, profit: -12.5, swap: -0.4, updatedAt: iso(now - 20_000) };
  let state = { positions: [position], takenAt: iso(now - 20_000) };
  const live = () => ({ ok: true, available: true, staleAfterSeconds: 300, accounts: { 'real-1': { equity: 9987.1, balance: 10000, takenAt: state.takenAt, stale: false, serverOffsetMinutes: 120, linked: true, positions: state.positions } } });

  // Analytics without open positions first
  state = { positions: [], takenAt: iso(now - 20_000) };
  let p = await openPage(c, { width, theme, tab: 'analytics', live });
  const without = await kpis(p); await p.close();
  state = { positions: [position], takenAt: iso(now - 20_000) };
  p = await openPage(c, { width, theme, tab: 'analytics', live });
  const withPos = await kpis(p); await p.close();
  ok(without === withPos, `Analytics is the same with an open position: ${withPos}`);

  p = await openPage(c, { width, theme, live });
  let sec = await p.evaluate(() => document.getElementById('dbPositions')?.textContent.replace(/\s+/g, ' ') || '');
  ok(/Open positions/.test(sec) && /EURUSD/.test(sec) && /Sell/.test(sec), 'Dashboard: the open position is shown');
  ok(/-€12\.90/.test(sec), 'floating P/L with swap, in the saved currency: ' + (sec.match(/Floating P\/L [^ ]+/) || [''])[0]);
  ok(/not journal entries/.test(sec), 'it says open positions are not journal entries');
  ok(!(await p.evaluate(() => window.trades.some(t => String(t.mt5Ticket) === '5001'))), 'the open position is not in the trade list');
  const acc = await p.evaluate(() => localStorage.getItem('my_journal_accounts_v1'));
  ok(!/mt5State|9987/.test(acc), 'live numbers are not written into the account');
  if (width < 1024) {
    await p.evaluate(() => document.getElementById('dbPositions').scrollIntoView());
    const issues = (await audit(p, { touch: true })).filter(x => /dbPositions|ob-pos|sideways/.test(x));
    ok(!issues.length, 'open positions on the phone: ' + (issues.slice(0, 3).join(' | ') || 'clean'));
  }
  await p.screenshot({ path: `out/positions-${theme}-${width}.png` });

  // it closes: the EA sends the closed trade (written as mt5-ingest would) and the list is empty
  const list = JSON.parse((await api(c, 'GET', '/api/storage/ob-trades')).body.value);
  const closedTrade = { id: 'mt5-real-1-5001', mt5Ticket: '5001', source: 'mt5', mode: 'Real', accountId: 'real-1', date: '2026-11-17', pair: 'EURUSD', direction: 'SHORT', result: 'Win', rMultiple: 0.2, pnl: 47, reviewStatus: 'Not reviewed', strategy: 'Model OB', notes: '', checklist: [], screenshots: [] };
  await api(c, 'PUT', '/api/storage/ob-trades', { value: JSON.stringify([closedTrade, ...list]) });
  state = { positions: [], takenAt: iso(Date.now()) };
  await p.evaluate(() => window.obMt5Live.load(true)); await wait(2500);
  sec = await p.evaluate(() => document.getElementById('dbPositions')?.textContent.replace(/\s+/g, ' ') || '');
  ok(/No open positions/.test(sec), 'after it closes: no open positions');
  ok(await p.evaluate(() => window.trades.filter(t => String(t.mt5Ticket) === '5001').length === 1), 'and the closed trade is in the journal once (the page reloaded its trades)');
  await p.close();

  // stale report
  state = { positions: [position], takenAt: iso(Date.now() - 12 * 60_000) };
  p = await openPage(c, { width, theme, live });
  sec = await p.evaluate(() => document.getElementById('dbPositions')?.textContent.replace(/\s+/g, ' ') || '');
  ok(/Not live/.test(sec) && /more than 5 minutes ago/.test(sec), 'a report older than 5 minutes says "Not live"');
  await p.close();

  // Trading page panel uses the same data
  state = { positions: [position], takenAt: iso(Date.now() - 20_000) };
  p = await openPage(c, { width, theme, tab: 'trading', live });
  await wait(4500);
  const panel = await p.evaluate(() => document.getElementById('mt5OpenPositions')?.textContent.replace(/\s+/g, ' ') || '');
  ok(/EURUSD/.test(panel) && /1 open/.test(panel), 'Trading page: the positions panel shows the live position');
  await p.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`, errors.length ? errors : '');
process.exit(fail || errors.length ? 1 : 0);
