// Part 8: live equity in the limit cards (Dashboard, Trading), the stale path, and the broker
// offset next to the reset zone. /api/mt5/live is answered with fixed data.
import { launch, wait, api, BASE } from './h2.mjs';
import { newUser } from './seed.mjs';
// the fake /api/mt5/live is built from the same contract the real endpoint is tested against
import { liveAnswer, liveAccount } from '../OB-Backtest-Journal-READY/test/fixtures/mt5-live-contract.js';
const staleOf = at => !at || Date.now() - Date.parse(at) > 300_000; // as the server sets it
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
  await p.evaluateOnNewDocument((t, tab) => { try { localStorage.setItem('my-journal-theme', t); localStorage.setItem('ob_ui_state_v1', JSON.stringify({ tab, mode: 'Funded' })); } catch (_) {} }, theme, tab);
  await p.goto(BASE + '/#' + tab, { waitUntil: 'networkidle0' });
  await wait(2200);
  return p;
}
const daily = p => p.evaluate(() => {
  const card = [...document.querySelectorAll('#dbTargets .ds-card')].find(c => /Daily loss/.test(c.textContent));
  return card ? { text: card.textContent.replace(/\s+/g, ' '), green: !!card.querySelector('.ds-meter i.pos') } : null;
});

for (const [theme, width] of [['light', 1440], ['dark', 390]]) {
  console.log(`\n## ${theme} ${width}px`);
  const c = await newUser({ trades: [], accounts: { Funded: [{ id: 'funded-1', name: 'FTMO 10k', balance: 10000, startingBalance: 10000, preset: 'ftmo', resetTimezone: 'Europe/Prague', mt5: { linked: true, login: '5550001', server: 'FTMO-Server' } }] } });
  await api(c, 'PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ timezone: 'Africa/Addis_Ababa', dateFormat: 'DD/MM/YYYY', currencySymbol: '€', maxDailyTrades: 10, hardStopLosses: 5 }) });
  const praguOffset = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague', timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(x => x.type === 'timeZoneName').value === 'GMT+2' ? 120 : 60;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date());
  let L = {};
  const live = () => liveAnswer({ 'funded-1': liveAccount({ balance: 10000, linked: true, positions: [], day: today, dayStartEquity: 10000, serverOffsetMinutes: praguOffset, ...L, stale: staleOf(L.takenAt) }) });

  // live equity, 400 of floating loss: measured on equity, no "equity unavailable"
  L = { equity: 9600, dayMinEquity: 9600, takenAt: iso(Date.now() - 20_000) };
  let p = await openPage(c, { width, theme, live });
  let d = await daily(p);
  ok(d && /€400\.00 of €500\.00 used/.test(d.text), 'daily loss on live equity: €400 of €500 used: ' + (d && d.text.slice(0, 90)));
  ok(d && /Measured on live equity \(floating P\/L included\)/.test(d.text) && !/equity unavailable/i.test(d.text), 'it says live equity, and the "equity unavailable" notice is gone');
  ok(d && /matches the reset zone Europe\/Prague/.test(d.text), 'the MT5 server offset is shown next to the reset zone (they agree)');
  await p.close();

  // stale: the old number is not used
  L = { equity: 9000, dayMinEquity: 9000, takenAt: iso(Date.now() - 8 * 60_000) };
  p = await openPage(c, { width, theme, live });
  d = await daily(p);
  ok(d && /Equity stale: the last MT5 report was at/.test(d.text) && /€0\.00 of €500\.00 used/.test(d.text), 'stale equity: says so, uses closed balance only (€0 used), not the old 9,000');
  ok(d && !d.green, 'never green while stale');
  const blownStale = await p.evaluate(() => document.getElementById('dbEquity')?.classList.contains('db2-blown-card'));
  ok(!blownStale, 'not BLOWN from a stale number');
  await p.close();

  // a floating loss under the floor: BLOWN on equity
  L = { equity: 9450, dayMinEquity: 9450, takenAt: iso(Date.now() - 20_000) };
  p = await openPage(c, { width, theme, live });
  const card = await p.evaluate(() => { const e = document.getElementById('dbEquity'); return { red: e.classList.contains('db2-blown-card'), text: e.textContent.replace(/\s+/g, ' ') }; });
  ok(card.red && /on equity \(floating P\/L included\)/.test(card.text), 'floating loss under the floor: BLOWN, on equity');
  await p.close();

  // the server offset disagrees with the reset zone
  L = { equity: 9900, dayMinEquity: 9900, takenAt: iso(Date.now() - 20_000), serverOffsetMinutes: praguOffset + 60 };
  p = await openPage(c, { width, theme, live });
  d = await daily(p);
  ok(d && /but the reset zone Europe\/Prague is UTC\+\d now\. FTMO resets at 00:00 server time/.test(d.text) && !d.green, 'offset mismatch: warning on the daily loss card, no green');
  await p.close();
  p = await openPage(c, { width, theme, tab: 'trading', live });
  const tp = await p.evaluate(() => document.getElementById('pageTrading')?.textContent.replace(/\s+/g, ' ') || '');
  ok(/Measured on live equity/.test(tp) && !/closed balance only/.test(tp), 'Trading page: daily loss room on live equity');
  await p.evaluate(() => window.openAccountCenter && window.openAccountCenter('accounts')); await wait(800);
  const ac = await p.evaluate(() => document.querySelector('.ac-acc[data-id="funded-1"]')?.textContent.replace(/\s+/g, ' ') || '');
  ok(/MT5 server time is UTC\+\d, but the reset zone Europe\/Prague/.test(ac), 'Account center card: the offset warning');
  await p.evaluate(() => window.obEditAccount && window.obEditAccount('funded-1')); await wait(600);
  const tzText = await p.evaluate(() => document.getElementById('aeTzText')?.textContent || '');
  ok(/Rule days run from 00:00 to 00:00 in Europe\/Prague/.test(tzText) && /MT5 server time is UTC\+\d/.test(tzText), 'editor: the server offset next to the reset zone: ' + tzText.slice(0, 120));
  await p.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`, errors.length ? errors : '');
process.exit(fail || errors.length ? 1 : 0);
