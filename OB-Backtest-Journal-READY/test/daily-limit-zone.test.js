// The daily trade limit's "today" is the account's rule day: its reset zone when it has a rule
// preset (the zone of its daily-loss floor), else the display zone. Both rules put each trade
// on the same day, so an account agrees with itself about when today ends.
//
// The display zone (UTC-12) and the account's reset zone (UTC+14) are 26 hours apart, so their
// dates differ at every moment of the day: whenever this test runs, it can only pass if the
// account's zone is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/time-prefs.js';
import '../public/rule-presets.js';
import { startLocalServer, sqliteAvailable } from './local-server.js';

const R = globalThis.obRules;
const core = globalThis.obTimeCore;
const DISPLAY = 'Etc/GMT+12';   // UTC-12
const ACCOUNT_TZ = 'Etc/GMT-14'; // UTC+14
const skip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

test('tradeDay: a manual trade logged on its own date counts on the rule day of the moment it was logged', () => {
  const at = Date.parse('2026-11-17T22:30:00Z'); // 01:30 on 18 Nov in Addis Ababa, still 17 Nov in UTC
  const logged = { id: `tr-${at}`, date: '2026-11-18' };
  assert.equal(R.tradeDay(logged, 'UTC', 'Africa/Addis_Ababa'), '2026-11-17', 'a UTC account: still 17 Nov');
  assert.equal(R.tradeDay(logged, 'Africa/Addis_Ababa', 'Africa/Addis_Ababa'), '2026-11-18');
  assert.equal(R.tradeDay({ id: `tr-${at}`, date: '2026-11-10' }, 'UTC', 'Africa/Addis_Ababa'), '2026-11-10', 'logged for another date: keeps it');
  assert.equal(R.tradeDay(logged, 'UTC'), '2026-11-18', 'without the display zone: the date, as before');
  assert.equal(R.tradeDay({ id: 'mt5-x-1', closeTime: '2026-11-17T22:30:00.000Z', date: '2026-11-18' }, 'UTC', 'Africa/Addis_Ababa'), '2026-11-17', 'MT5: its close time');
});

test('accountDayZone: the reset zone with a preset, else the display zone', () => {
  assert.equal(R.accountDayZone({ preset: 'ftmo' }, 'Africa/Addis_Ababa'), 'Europe/Prague');
  assert.equal(R.accountDayZone({ preset: 'my-rules', resetTimezone: 'Asia/Dubai' }, 'Africa/Addis_Ababa'), 'Asia/Dubai');
  assert.equal(R.accountDayZone({ id: 'real-1' }, 'Africa/Addis_Ababa'), 'Africa/Addis_Ababa', 'no preset: the display zone, as before');
  assert.equal(R.accountDayZone(null, 'not/a-zone'), 'UTC');
});

test('the server counts the daily limit on the account\'s rule day, the same day as its daily-loss floor', { skip }, async () => {
  const srv = await startLocalServer({ DATA_RECHECK_MS: '0' });
  try {
    const c = srv.client();
    assert.equal((await c.call('POST', '/api/auth/register', { email: 'zone@test.local', password: 'password123' })).status, 201);
    await c.call('PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ timezone: DISPLAY, maxDailyTrades: 2, riskPercent: 1 }) });
    const accounts = {
      Funded: [{ id: 'funded-1', name: 'FTMO', balance: 10000, startingBalance: 10000, preset: 'ftmo', resetTimezone: ACCOUNT_TZ }],
      Real: [{ id: 'real-1', name: 'Real 01', balance: 10000, startingBalance: 10000 }],
    };
    await c.call('PUT', '/api/storage/my_journal_accounts_v1', { value: JSON.stringify(accounts) });
    const now = Date.now();
    const accToday = R.dayOf(now, ACCOUNT_TZ);
    const dispToday = core.todayIso(DISPLAY);
    assert.notEqual(accToday, dispToday, 'the two zones are always on different dates');
    const trades = [
      { id: 'mt5-funded-1-1', source: 'mt5', mt5Ticket: '1', mode: 'Funded', accountId: 'funded-1', closeTime: new Date(now - 60_000).toISOString(), date: dispToday, rMultiple: 1 },
      { id: `tr-${now - 120_000}`, mode: 'Funded', accountId: 'funded-1', date: dispToday, rMultiple: -1 },                 // logged now, for today
      { id: `tr-${now - 180_000}`, mode: 'Funded', accountId: 'funded-1', date: addDays(dispToday, -3), rMultiple: 1 },      // logged now, for an old date
      { id: `tr-${now - 240_000}`, mode: 'Real', accountId: 'real-1', date: dispToday, rMultiple: 1 },                       // another mode
    ];
    await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify(trades) });

    let r = await c.call('GET', '/api/trades/daily-count?mode=Funded&accountId=funded-1');
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.count, r.body.date, r.body.timezone, r.body.limitReached], [2, accToday, ACCOUNT_TZ, true]);
    // the app asks with the display zone's today: it means the account's today
    r = await c.call('GET', `/api/trades/daily-count?mode=Funded&accountId=funded-1&date=${dispToday}`);
    assert.deepEqual([r.body.count, r.body.date], [2, accToday]);
    // the mode's only open account is found without an id
    assert.equal((await c.call('GET', '/api/trades/daily-count?mode=Funded')).body.timezone, ACCOUNT_TZ);
    // a past date asked for explicitly is that date
    r = await c.call('GET', `/api/trades/daily-count?mode=Funded&accountId=funded-1&date=${addDays(dispToday, -3)}`);
    assert.deepEqual([r.body.count, r.body.date], [1, addDays(dispToday, -3)]);

    // saving a third trade today is refused, and the answer names the zone
    r = await c.call('POST', '/api/trades', { trade: { id: `tr-${Date.now()}`, mode: 'Funded', accountId: 'funded-1', date: dispToday, rMultiple: 1 }, mode: 'Funded' });
    assert.equal(r.status, 429); assert.equal(r.body.timezone, ACCOUNT_TZ); assert.equal(r.body.date, accToday);
    assert.match(r.body.error, /the day runs 00:00 to 00:00 Etc\/GMT-14/);
    // a trade logged for an old date is counted on that date (1 there): allowed
    r = await c.call('POST', '/api/trades', { trade: { id: `tr-${Date.now() + 1}`, mode: 'Funded', accountId: 'funded-1', date: addDays(dispToday, -3), rMultiple: 1 }, mode: 'Funded' });
    assert.equal(r.status, 201);

    // an account without a preset keeps the display zone
    r = await c.call('GET', '/api/trades/daily-count?mode=Real&accountId=real-1');
    assert.deepEqual([r.body.count, r.body.date, r.body.timezone], [1, dispToday, DISPLAY]);

    // the daily-loss floor puts the same trades on the same day
    const saved = JSON.parse((await c.call('GET', '/api/storage/ob-trades')).body.value);
    const fundedTrades = R.accountTrades('Funded', accounts.Funded[0], saved);
    const s = R.accountState(accounts.Funded[0], fundedTrades, { pnlFor: t => R.pnlOf(t, accounts.Funded[0], { riskPct: 1 }), displayTz: DISPLAY });
    assert.equal(s.daily.today, accToday);
    assert.equal(s.daily.todayCount, 2, 'the floor counts the same 2 trades today');
  } finally { await srv.stop(); }
});
