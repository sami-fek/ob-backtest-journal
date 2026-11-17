// Part 5: GET /api/news reads news_events and the fetch log from the database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startLocalServer, sqliteAvailable, openTestDb } from './local-server.js';

const skip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';

test('GET /api/news: events in range, last successful fetch, sign-in required, range checked', { skip }, async () => {
  const srv = await startLocalServer({ DATA_RECHECK_MS: '0' });
  try {
    const c = srv.client();
    assert.equal((await srv.client().call('GET', '/api/news')).status, 401);
    assert.equal((await c.call('POST', '/api/auth/register', { email: 'news@test.local', password: 'password123' })).status, 201);

    // nothing fetched yet: no events and no lastSuccessAt (the app shows that as stale)
    let r = await c.call('GET', '/api/news');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.events, []);
    assert.equal(r.body.lastSuccessAt, null);

    const db = openTestDb(srv.dataDir);
    const now = Date.now();
    const iso = ms => new Date(ms).toISOString();
    const ins = db.prepare('INSERT INTO news_events (title, currency, event_time_utc, impact, event_key, source) VALUES (?,?,?,?,?,?)');
    ins.run('CPI m/m', 'USD', iso(now + 3_600_000), 'High', 'CPI m/m|USD|x', 'forexfactory');
    ins.run('Old GDP', 'GBP', iso(now - 30 * 86_400_000), 'High', 'Old GDP|GBP|x', 'forexfactory');
    db.prepare(`INSERT INTO news_fetches (source, started_at, finished_at, status, events_kept) VALUES ('ff', ?, ?, 'ok', 2)`).run(iso(now - 3_600_000), iso(now - 3_600_000));
    db.prepare(`INSERT INTO news_fetches (source, started_at, finished_at, status, error) VALUES ('ff', ?, ?, 'failed', 'HTTP 503')`).run(iso(now - 60_000), iso(now - 60_000));
    db.close();

    r = await c.call('GET', '/api/news');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.events.map(e => [e.title, e.currency]), [['CPI m/m', 'USD']], 'only the requested range');
    assert.equal(r.body.lastSuccessAt, iso(now - 3_600_000), 'the last good fetch, not the failed one after it');
    assert.equal(r.body.lastStatus, 'failed');
    assert.equal(r.body.lastError, 'HTTP 503');
    r = await c.call('GET', `/api/news?from=${iso(now - 31 * 86_400_000)}&to=${iso(now - 29 * 86_400_000)}`);
    assert.deepEqual(r.body.events.map(e => e.title), ['Old GDP'], 'past weeks are kept');
    assert.equal((await c.call('GET', `/api/news?from=${iso(now)}&to=${iso(now + 30 * 86_400_000)}`)).status, 400);
  } finally { await srv.stop(); }
});
