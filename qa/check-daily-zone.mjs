// The daily trade limit on the account's rule day (its reset zone), in the page: the discipline
// engine asks the server for the active account's count, and offline it counts the same way.
// The display zone (UTC-12) and the account zone (UTC+14) are always on different dates.
import { launch, wait, api, open } from './h2.mjs';
import { newUser } from './seed.mjs';
let pass = 0, fail = 0; const errors = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const b = await launch();
const day = (ms, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
const now = Date.now();
const accToday = day(now, 'Etc/GMT-14'), dispToday = day(now, 'Etc/GMT+12');
const c = await newUser({
  trades: [
    { id: 'mt5-funded-1-1', source: 'mt5', mt5Ticket: '1', mode: 'Funded', accountId: 'funded-1', closeTime: new Date(now - 60_000).toISOString(), date: dispToday, pair: 'EURUSD', result: 'Win', rMultiple: 1, checklist: [], screenshots: [] },
    { id: `tr-${now - 120_000}`, mode: 'Funded', accountId: 'funded-1', date: dispToday, pair: 'EURUSD', result: 'Loss', rMultiple: -1, checklist: [], screenshots: [] },
  ],
  accounts: { Funded: [{ id: 'funded-1', name: 'FTMO', balance: 10000, startingBalance: 10000, preset: 'ftmo', resetTimezone: 'Etc/GMT-14' }] },
});
await api(c, 'PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ timezone: 'Etc/GMT+12', maxDailyTrades: 2, hardStopLosses: 5, dateFormat: 'DD/MM/YYYY' }) });
let p = await open(b, c, { tab: 'trading', mode: 'Funded', errors });
await p.evaluate(() => window.obDisciplineRefresh()); await wait(1500);
let s = await p.evaluate(() => window.getDisciplineState && window.getDisciplineState());
ok(s && s.todayCount === 2 && s.dailyLimitReached === true, `the account's day: 2 of 2 trades (${s && s.todayCount}/${s && s.dailyMax})`);
ok(s && s.todayDate === accToday && s.todayTimezone === 'Etc/GMT-14', `"today" is ${s && s.todayDate} in ${s && s.todayTimezone} (the display zone says ${dispToday})`);
await p.close();

// offline: the daily-count request fails, so the page counts itself; the state it then
// broadcasts (ob-discipline-state) must give the same answer
p = await open(b, c, { tab: 'trading', mode: 'Funded', errors });
const offline = await p.evaluate(async () => {
  const real = window.fetch;
  let failed = 0, seen = null;
  const on = e => { seen = e.detail; };
  window.addEventListener('ob-discipline-state', on);
  window.fetch = (u, o) => (String(u).includes('/api/trades/daily-count') ? (failed++, Promise.reject(new Error('offline'))) : real(u, o));
  try { await window.obDisciplineRefresh(); } finally { window.fetch = real; window.removeEventListener('ob-discipline-state', on); }
  return seen && { ...seen, failed };
});
ok(offline && offline.failed >= 1, 'the server count really failed (the offline path ran)');
ok(offline && offline.todayCount === 2 && offline.todayDate === accToday, `offline: the same 2 trades on ${offline && offline.todayDate}`);
await p.close();
await b.close();
console.log(`\n${pass} passed, ${fail} failed`, errors.length ? errors : '');
process.exit(fail || errors.length ? 1 : 0);
