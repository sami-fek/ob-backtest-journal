// Server "today" for the daily limit follows the saved timezone (BUILD-PLAN-2 Part 4 Step 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteAvailable, startLocalServer } from './local-server.js';
import '../public/time-prefs.js';

const skip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';

test('daily-count and POST /api/trades use today in the saved timezone', { skip }, async () => {
  const srv = await startLocalServer();
  try {
    const c = srv.client();
    await c.call('POST', '/api/auth/register', { email: 'tz@test.local', password: 'password123' });
    // No timezone saved → UTC (unchanged behaviour)
    let r = await c.call('GET', '/api/trades/daily-count?mode=Real');
    assert.equal(r.body.date, new Date().toISOString().slice(0, 10));
    // UTC+14 and UTC-11 are on different calendar days at almost every moment
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      await c.call('PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ maxDailyTrades: 1, timezone: tz }) });
      r = await c.call('GET', '/api/trades/daily-count?mode=Real');
      assert.equal(r.body.date, globalThis.obTimeCore.todayIso(tz), tz);
    }
    // A trade without a date is counted on the saved timezone's day: the limit (1) applies to it
    r = await c.call('POST', '/api/trades', { trade: { id: 'a', mode: 'Real' }, mode: 'Real' });
    assert.ok([200, 201].includes(r.status), r.text);
    await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([{ id: 'a', mode: 'Real', date: globalThis.obTimeCore.todayIso('Pacific/Pago_Pago') }]) });
    r = await c.call('POST', '/api/trades', { trade: { id: 'b', mode: 'Real' }, mode: 'Real' });
    assert.equal(r.status, 429, 'second trade today is blocked');
    assert.equal(r.body.date, globalThis.obTimeCore.todayIso('Pacific/Pago_Pago'));
  } finally { await srv.stop(); }
});
