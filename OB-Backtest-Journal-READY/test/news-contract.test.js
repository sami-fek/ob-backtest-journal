// GET /api/news must return exactly the fields in test/fixtures/news-contract.js, the same
// contract qa/check-news.mjs builds its fake answers from. And the browser code must not read
// a field that is not in it. So a fake can never show the page something the real endpoint
// does not send.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalServer, sqliteAvailable, openTestDb } from './local-server.js';
import { NEWS_ANSWER_FIELDS, NEWS_EVENT_FIELDS, NEWS_UNAVAILABLE_FIELDS, contractProblems, newsAnswer, newsEvent, newsUnavailable } from './fixtures/news-contract.js';

const skip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iso = ms => new Date(ms).toISOString();

test('the real /api/news answers with exactly the contract fields and types; so does its 503', { skip }, async () => {
  const srv = await startLocalServer({ DATA_RECHECK_MS: '0' });
  try {
    const c = srv.client();
    await c.call('POST', '/api/auth/register', { email: 'newscontract@test.local', password: 'password123' });
    const now = Date.now();
    let db = openTestDb(srv.dataDir);
    db.prepare('INSERT INTO news_events (title, currency, event_time_utc, impact, event_key, source) VALUES (?,?,?,?,?,?)')
      .run('CPI m/m', 'USD', iso(now + 3_600_000), 'High', 'CPI m/m|USD|x', 'forexfactory');
    db.prepare(`INSERT INTO news_fetches (source, started_at, finished_at, status, events_kept) VALUES ('ff', ?, ?, 'ok', 1)`).run(iso(now - 3_600_000), iso(now - 3_600_000));
    db.prepare(`INSERT INTO news_fetches (source, started_at, finished_at, status, error) VALUES ('ff', ?, ?, 'failed', 'HTTP 503')`).run(iso(now - 60_000), iso(now - 60_000));
    db.close();

    let r = await c.call('GET', '/api/news');
    assert.equal(r.status, 200);
    const problems = contractProblems(r.body, NEWS_ANSWER_FIELDS, 'answer');
    r.body.events.forEach((e, i) => problems.push(...contractProblems(e, NEWS_EVENT_FIELDS, `events[${i}]`)));
    assert.deepEqual(problems, [], 'the real answer and the contract differ');
    for (const k of Object.keys(NEWS_ANSWER_FIELDS)) assert.notEqual(r.body[k], null, `${k} should have a value in this test`);
    assert.equal(r.body.events.length, 1);

    // nothing fetched yet / nothing in range: the same fields, with nulls
    r = await c.call('GET', `/api/news?from=${iso(now - 40 * 86_400_000)}&to=${iso(now - 30 * 86_400_000)}`);
    assert.deepEqual(contractProblems(r.body, NEWS_ANSWER_FIELDS, 'answer'), []);

    // the news tables cannot be read (here: the fetch log is gone): 503, the "unavailable" shape
    db = openTestDb(srv.dataDir);
    db.exec('DROP TABLE news_fetches');
    db.close();
    r = await c.call('GET', '/api/news');
    assert.equal(r.status, 503);
    assert.deepEqual(contractProblems(r.body, NEWS_UNAVAILABLE_FIELDS, 'unavailable'), []);
    assert.equal(r.body.ok, false);
  } finally { await srv.stop(); }
});

test('the fake builders refuse anything the real endpoint does not send', () => {
  assert.throws(() => newsAnswer({ lastSucess: null }), /answer\.lastSucess is not in the contract/);
  assert.throws(() => newsAnswer({ lastSuccessAt: 'two hours ago' }), /answer\.lastSuccessAt = "two hours ago" is not iso\|null/);
  assert.throws(() => newsEvent({ date: '2026-11-10T08:30:00-05:00' }), /event\.date is not in the contract/);
  assert.throws(() => newsAnswer({ events: [{ time: '2026-11-10T08:30:00-05:00' }] }), /event\.time = .* is not iso/, 'the server sends UTC, not the feed\'s offset');
  const a = newsAnswer({ lastSuccessAt: new Date().toISOString(), events: [{ currency: 'GBP' }] });
  assert.equal(a.events[0].currency, 'GBP'); assert.equal(a.lastStatus, 'ok');
  assert.equal(newsUnavailable().ok, false);
});

test('the browser code reads no /api/news field outside the contract', () => {
  const src = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
  const files = ['news-core.js', 'news-panel.js'];
  const answerReads = files.flatMap(f => [...src(f).matchAll(/\bdata\.([a-zA-Z]+)/g)].map(m => [f, m[1]]));
  assert.ok(answerReads.length >= 5);
  const answerFields = { ...NEWS_ANSWER_FIELDS, ...NEWS_UNAVAILABLE_FIELDS };
  assert.deepEqual(answerReads.filter(([, k]) => !(k in answerFields)), [], 'the page reads an answer field the server does not send');
  // events are read as e.x (and next.x for the next event)
  const eventReads = files.flatMap(f => [...src(f).matchAll(/\b(?:e|next)\.([a-zA-Z]+)/g)].map(m => [f, m[1]]));
  assert.ok(eventReads.length >= 8);
  assert.deepEqual(eventReads.filter(([, k]) => !(k in NEWS_EVENT_FIELDS)), [], 'the page reads an event field the server does not send');
});
