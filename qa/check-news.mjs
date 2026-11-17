// Part 5: the high-impact news panel and the no-trade warning on the trade form.
// The first case uses the real server (nothing fetched yet = stale); the others answer
// /api/news with fixed data so every state can be seen: empty feed, inside a window, stale.
// That data is built with test/fixtures/news-contract.js, which test/news-contract.test.js
// holds to the real endpoint's fields.
import { launch, wait, api, BASE, audit } from './h2.mjs';
import { newUser } from './seed.mjs';
// the fake /api/news is built from the same contract the real endpoint is tested against
import { newsAnswer, newsEvent, newsUnavailable } from '../OB-Backtest-Journal-READY/test/fixtures/news-contract.js';
let pass = 0, fail = 0; const errors = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const b = await launch();
const H = 3_600_000, MIN = 60_000;
const iso = ms => new Date(ms).toISOString();

async function openPage(cookie, { width, theme, mode = 'Real', tab = 'dashboard', mock }) {
  const p = await b.newPage();
  const requests = [];
  p.on('pageerror', e => errors.push(`${tab}/${width}: ${e.message}`));
  p.on('dialog', d => d.accept());
  const touch = width < 1024;
  await p.setViewport({ width, height: touch ? 844 : 900, isMobile: touch, hasTouch: touch });
  await p.setRequestInterception(true);
  p.on('request', req => {
    requests.push(req.url());
    if (mock && req.url().includes('/api/news')) return req.respond({ status: mock.status || 200, contentType: 'application/json', body: JSON.stringify(mock.body) });
    req.continue();
  });
  await p.setCookie({ name: 'ob_session', value: decodeURIComponent(cookie.split('=')[1]), url: BASE });
  await p.evaluateOnNewDocument((t, m, tab) => { try { localStorage.setItem('my-journal-theme', t); localStorage.setItem('ob_ui_state_v1', JSON.stringify({ tab, mode: m })); } catch (_) {} }, theme, mode, tab);
  await p.goto(BASE + '/#' + tab, { waitUntil: 'networkidle0' });
  await wait(1800);
  return { p, requests };
}
const news = p => p.evaluate(() => {
  const s = document.getElementById('dbNews');
  const banner = s && s.querySelector('.ob-news-banner');
  return { text: s ? s.textContent.replace(/\s+/g, ' ') : '', level: banner ? banner.className.replace('ob-news-banner', '').trim() : '', days: [...(s ? s.querySelectorAll('.ob-news-day.danger') : [])].length };
});
const openNewTrade = p => p.evaluate(() => window.handleTradeSubmit({ preventDefault() {}, obCalendarDate: window.obTime.today() }));
const formWarn = p => p.evaluate(() => { const w = document.getElementById('obNewsFormWarn'); return w ? { cls: w.className, text: w.textContent.replace(/\s+/g, ' ') } : null; });

for (const [theme, width] of [['light', 1440], ['dark', 390]]) {
  console.log(`\n## ${theme} ${width}px`);
  const c = await newUser({ trades: [] });
  await api(c, 'PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ timezone: 'Africa/Addis_Ababa', dateFormat: 'DD/MM/YYYY', currencySymbol: '€', maxDailyTrades: 10, hardStopLosses: 5 }) });

  // 1. real server, nothing fetched yet: stale, never "no news"
  let { p, requests } = await openPage(c, { width, theme });
  let n = await news(p);
  ok(n.level === 'stale' && /news data stale - do not trade/.test(n.text), 'nothing fetched yet: red "news data stale - do not trade"');
  ok(!/No high-impact USD, GBP or EUR news today/.test(n.text), 'and not "no news"');
  ok(!requests.some(u => /faireconomy|forexfactory/i.test(u)), 'the page never calls the news source');
  await openNewTrade(p); await wait(500);
  let w = await formWarn(p);
  ok(w && /stale/.test(w.cls) && /news data stale - do not trade/.test(w.text), 'new-trade form: stale warning');
  ok(await p.evaluate(() => !!document.querySelector('#tradeDrawer:not(.hidden)')), 'the form still opens (warn only)');
  await p.close();

  // 2. fresh feed, nothing today
  const now = Date.now();
  ({ p } = await openPage(c, { width, theme, mock: { body: newsAnswer({ lastSuccessAt: iso(now - 2 * H) }) } }));
  n = await news(p);
  ok(n.level === 'clear' && /No high-impact USD, GBP or EUR news today/.test(n.text) && !/stale/.test(n.text), 'empty feed: "No high-impact … news today", not stale');
  await openNewTrade(p); await wait(500);
  ok(!(await formWarn(p)), 'no form warning outside a window');
  await p.close();

  // 3. inside a window: an event 5 minutes from now (+ one later in the week)
  const ev = newsEvent({ title: 'CPI m/m', currency: 'USD', impact: 'High', time: iso(now + 5 * MIN) });
  const later = newsEvent({ title: 'GDP m/m', currency: 'GBP', impact: 'High', time: iso(now + 26 * H) });
  ({ p } = await openPage(c, { width, theme, mock: { body: newsAnswer({ events: [ev, later], lastSuccessAt: iso(now - H) }) } }));
  n = await news(p);
  const addis = new Date(now + 5 * MIN).toLocaleTimeString('en-GB', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit' });
  ok(n.level === 'window' && /No-trade window now/.test(n.text) && n.text.includes('CPI m/m (USD)'), 'inside a window: "No-trade window now" with the event and currency');
  ok(n.text.includes(addis), `times in Africa/Addis_Ababa (${addis})`);
  ok(n.days >= 1, `the week view marks ${n.days} dangerous day(s)`);
  ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(n.text), 'dates in the saved format (no ISO dates)');
  await openNewTrade(p); await wait(500);
  w = await formWarn(p);
  ok(w && /window/.test(w.cls) && /No-trade window now/.test(w.text) && /saving is still allowed/i.test(w.text), 'new-trade form: window warning, warn only');
  if (width < 1024) {
    await p.evaluate(() => window.closeDrawer && window.closeDrawer()); await wait(300);
    await p.evaluate(() => document.getElementById('dbNews').scrollIntoView());
    const issues = (await audit(p, { touch: true })).filter(x => /dbNews|ob-news/.test(x) || /sideways/.test(x));
    ok(!issues.length, 'news panel on the phone: ' + (issues.slice(0, 3).join(' | ') || 'clean'));
  }
  await p.screenshot({ path: `out/news-${theme}-${width}.png`, fullPage: false });
  await p.close();

  // 4. Backtest: no form warning (a backtest trade is not placed now)
  ({ p } = await openPage(c, { width, theme, mode: 'Backtest', mock: { body: newsAnswer({ events: [ev], lastSuccessAt: iso(now - H) }) } }));
  await openNewTrade(p); await wait(500);
  ok(!(await formWarn(p)), 'Backtest: no news warning on the form');
  await p.close();

  // 5. the server cannot read the news tables (503): stale, with the reason
  ({ p } = await openPage(c, { width, theme, mock: { status: 503, body: newsUnavailable() } }));
  n = await news(p);
  ok(n.level === 'stale' && /could not be read/.test(n.text), 'unreadable news tables: stale with the reason');
  await p.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`, errors.length ? errors : '');
process.exit(fail || errors.length ? 1 : 0);
