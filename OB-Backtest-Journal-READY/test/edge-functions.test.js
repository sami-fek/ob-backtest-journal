// Part 4: the Supabase Edge Functions (supabase/functions/_shared) against a real Postgres
// (PGlite) with migrations 001, 003 and 004 applied. The handlers are the ones index.ts
// serves; only the database adapter and fetch are swapped.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOffsetDate, parseFeed, runFetchNews, NEWS_SOURCE_URL } from '../supabase/functions/_shared/news.js';
import { sha256Hex } from '../supabase/functions/_shared/ingest.js';
import { handleFetchNews, handleIngest, handleRiskCheck } from '../supabase/functions/_shared/handlers.js';
import { loadJournal } from '../supabase/functions/_shared/journal-db.js';
import { accountsDocToRows } from '../relational-core.js';
import { expectedVendor, VENDOR_DIR } from '../scripts/sync-edge-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = f => fs.readFileSync(path.join(__dirname, '..', 'migrations', f), 'utf8');
let PGlite = null;
try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* skipped below */ }
const skip = PGlite ? false : '@electric-sql/pglite is not installed (npm install)';

// Supabase already has these; PGlite needs stand-ins.
const PRELUDE = `create role anon; create role authenticated; create role service_role;
  create table public.users (id text primary key, email text not null unique, password_hash text, google_sub text unique, created_at timestamptz not null default now());
  create table public.kv (session_id text not null, key text not null, value text not null, updated_at timestamptz not null default now(), primary key (session_id, key));`;

const adapter = pg => ({
  query: async (text, params = []) => (await pg.query(text, params)).rows,
  tx: fn => pg.transaction(tx => {
    const inner = { query: async (text, params = []) => (await tx.query(text, params)).rows, tx: f => f(inner) };
    return fn(inner);
  }),
});

async function fresh() {
  const pg = new PGlite();
  await pg.exec(PRELUDE + `insert into public.users (id, email) values ('u1', 'a@test.local');`);
  await pg.exec(sql('001_relational.sql'));
  await pg.exec(sql('003_rule_overrides.sql'));
  await pg.exec(sql('004_edge_functions.sql'));
  return { pg, db: adapter(pg) };
}
const env = vars => name => vars[name];
const post = (url, headers, body) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

test('the Edge vendor copies match the app files (run node scripts/sync-edge-shared.mjs)', () => {
  for (const { file, content } of expectedVendor()) {
    const have = fs.readFileSync(path.join(VENDOR_DIR, file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(have, content, `supabase/functions/_shared/vendor/${file} is out of date`);
  }
});

// ── fetch-news ──────────────────────────────────────────────────────────────
test('news: the UTC offset is read from each date string, never assumed', () => {
  // the same 08:30 New York release in US winter (-05:00) and US summer (-04:00)
  assert.equal(parseOffsetDate('2026-11-10T08:30:00-05:00').toISOString(), '2026-11-10T13:30:00.000Z');
  assert.equal(parseOffsetDate('2026-07-10T08:30:00-04:00').toISOString(), '2026-07-10T12:30:00.000Z');
  assert.equal(parseOffsetDate('2026-11-10T08:30:00-04:00').toISOString(), '2026-11-10T12:30:00.000Z');
  assert.equal(parseOffsetDate('2026-11-10T08:30:00+0530').toISOString(), '2026-11-10T03:00:00.000Z');
  assert.equal(parseOffsetDate('2026-11-10T13:30:00Z').toISOString(), '2026-11-10T13:30:00.000Z');
  for (const bad of ['2026-11-10T08:30:00', '2026-11-10', 'Tuesday 8:30am', '', null, '2026-02-30T08:30:00-05:00']) assert.equal(parseOffsetDate(bad), null, String(bad));
});

const FEED = [
  { title: 'CPI m/m', country: 'USD', date: '2026-11-10T08:30:00-05:00', impact: 'High', forecast: '0.3%', previous: '0.2%' },
  { title: 'GDP m/m', country: 'GBP', date: '2026-11-12T02:00:00-05:00', impact: 'High' },
  { title: 'German ZEW', country: 'EUR', date: '2026-11-11T05:00:00-05:00', impact: 'Medium' },
  { title: 'RBA Rate', country: 'AUD', date: '2026-11-11T22:30:00-05:00', impact: 'High' },
  { title: 'Bank Holiday', country: 'USD', date: '2026-11-11T00:00:00-05:00', impact: 'Holiday' },
  { title: 'No offset', country: 'USD', date: '2026-11-13T08:30:00', impact: 'High' },
];

test('news: only USD/GBP/EUR high impact is kept; a non-array body is refused', () => {
  const r = parseFeed(JSON.stringify(FEED));
  assert.equal(r.ok, true);
  assert.deepEqual(r.events.map(e => [e.currency, e.title, e.event_time_utc]), [['USD', 'CPI m/m', '2026-11-10T13:30:00.000Z'], ['GBP', 'GDP m/m', '2026-11-12T07:00:00.000Z']]);
  assert.equal(r.events[0].event_key, 'CPI m/m|USD|2026-11-10T13:30:00.000Z');
  assert.equal(r.skipped, 1, 'the high-impact row without an offset is counted, not guessed');
  assert.equal(parseFeed('<html><body>Request Denied</body></html>').ok, false);
  assert.match(parseFeed('<html>Request Denied</html>').error, /HTML/);
  assert.equal(parseFeed('{"error":"x"}').ok, false);
  assert.equal(parseFeed('').ok, false);
});

test('fetch-news: stores events, skips calls inside 25 minutes, keeps the last good data on a bad body', { skip }, async () => {
  const { db, pg } = await fresh();
  let calls = 0, body = JSON.stringify(FEED);
  const fetchImpl = async () => { calls++; return new Response(body, { status: 200 }); };
  const t0 = new Date('2026-11-10T00:00:00Z');
  let r = await runFetchNews({ db, fetchImpl, now: t0 });
  assert.equal(r.ok, true); assert.equal(r.kept, 2); assert.equal(calls, 1);
  assert.equal(r.lastSuccessAt, t0.toISOString());

  // a retry 10 minutes later does not call the feed
  r = await runFetchNews({ db, fetchImpl, now: new Date(t0.getTime() + 10 * 60_000) });
  assert.equal(r.skipped, true); assert.equal(calls, 1);

  // rate limited: HTML instead of JSON → failed, events kept, last success unchanged
  body = '<!DOCTYPE html><title>Request Denied</title>';
  r = await runFetchNews({ db, fetchImpl, now: new Date(t0.getTime() + 30 * 60_000) });
  assert.equal(r.ok, false); assert.equal(calls, 2);
  assert.equal(r.lastSuccessAt, t0.toISOString());
  assert.equal(Number((await pg.query('select count(*) n from news_events')).rows[0].n), 2);

  // next week's file without last week's events: nothing is deleted, nothing doubles
  body = JSON.stringify([FEED[0], { title: 'NFP', country: 'USD', date: '2026-11-20T08:30:00-05:00', impact: 'High' }]);
  r = await runFetchNews({ db, fetchImpl, now: new Date(t0.getTime() + 60 * 60_000) });
  assert.equal(r.ok, true);
  const rows = (await pg.query('select title, event_time_utc from news_events order by event_time_utc')).rows;
  assert.deepEqual(rows.map(x => x.title), ['CPI m/m', 'GDP m/m', 'NFP']);
  assert.deepEqual((await pg.query(`select status from news_fetches order by started_at`)).rows.map(x => x.status), ['ok', 'failed', 'ok']);
});

test('fetch-news handler: x-cron-secret required, missing secret config fails closed, a failed fetch answers 502', { skip }, async () => {
  const { db } = await fresh();
  const deps = { db, env: env({ CRON_SECRET: 's3cret' }), fetchImpl: async () => new Response(JSON.stringify(FEED)), now: () => new Date('2026-11-10T00:00:00Z') };
  assert.equal((await handleFetchNews(post('http://x/fetch-news', {}), deps)).status, 401);
  assert.equal((await handleFetchNews(post('http://x/fetch-news', { 'x-cron-secret': 'wrong' }), deps)).status, 401);
  assert.equal((await handleFetchNews(post('http://x/fetch-news', { 'x-cron-secret': 's3cret' }), { ...deps, env: env({}) })).status, 500);
  const ok = await handleFetchNews(post('http://x/fetch-news', { 'x-cron-secret': 's3cret' }), deps);
  assert.equal(ok.status, 200); assert.equal((await ok.json()).kept, 2);
  const bad = await handleFetchNews(post('http://x/fetch-news', { 'x-cron-secret': 's3cret' }), { ...deps, fetchImpl: async () => new Response('<html>Denied</html>'), now: () => new Date('2026-11-10T01:00:00Z') });
  assert.equal(bad.status, 502);
  assert.equal((await db.query(`select fn from function_errors`))[0].fn, 'fetch-news', 'the failure is logged in function_errors');
});

// ── mt5-ingest ──────────────────────────────────────────────────────────────
const ACCOUNTS = {
  Funded: [{ id: 'funded-1', name: 'FTMO 10k', balance: 10000, startingBalance: 10000, preset: 'my-rules' }],
  Demo: [{ id: 'maven-1', name: 'Maven', balance: 10000, startingBalance: 10000, preset: 'maven' }],
  Backtest: [{ id: 'backtest', name: 'Backtest', balance: 1000, startingBalance: 1000 }],
};
async function withAccounts(doc = ACCOUNTS) {
  const ctx = await fresh();
  const rows = accountsDocToRows(doc, 'u1');
  await ctx.pg.query('select public.journal_save_accounts($1, $2, $3)', ['u1', JSON.stringify(rows), 'replace']);
  await ctx.pg.query(`insert into kv (session_id, key, value) values ('u1', 'ob-os-settings', $1)`, [JSON.stringify({ riskPercent: 1, timezone: 'Africa/Addis_Ababa' })]);
  for (const [key, account, login] of [['key-funded', 'funded-1', '5550001'], ['key-maven', 'maven-1', null], ['key-bt', 'backtest', null]]) {
    await ctx.pg.query(`insert into ea_keys (key_hash, user_id, account_id, key_hint, mt5_login) values ($1, 'u1', $2, $3, $4)`, [await sha256Hex(key), account, key.slice(-4), login]);
  }
  return ctx;
}
// MT5 R needs prices: entry 2000, SL 1990 (risk 10/unit); exit 1970 = -3R
const deal = (ticket, closeTime, exit = 2010) => ({ ticket, symbol: 'XAUUSD', direction: 'buy', volume: 0.1, openTime: closeTime - 3600, closeTime, openPrice: 2000, closePrice: exit, sl: 1990, tp: 2030, profit: (exit - 2000) * 10, commission: -1, swap: 0 });
const T = Date.parse('2026-11-16T09:00:00Z') / 1000; // epoch seconds, as the EA sends
const ingest = (deps, key, body) => handleIngest(post('http://x/mt5-ingest', key ? { 'x-ea-key': key } : {}, body), deps);

test('mt5-ingest: a missing, wrong or revoked EA key is refused; nothing is written', { skip }, async () => {
  const { db, pg } = await withAccounts();
  const deps = { db, env: env({}), now: () => new Date('2026-11-16T10:00:00Z') };
  let r = await ingest(deps, '', { deals: [deal('1001', T)] });
  assert.equal(r.status, 401); assert.equal((await r.json()).code, 'EA_KEY_REQUIRED');
  r = await ingest(deps, 'key-wrong', { deals: [deal('1001', T)] });
  assert.equal(r.status, 401); assert.equal((await r.json()).code, 'EA_KEY_INVALID');
  await pg.query(`update ea_keys set revoked_at = now() where account_id = 'funded-1'`);
  r = await ingest(deps, 'key-funded', { deals: [deal('1001', T)] });
  assert.equal(r.status, 401);
  assert.equal(Number((await pg.query('select count(*) n from trades')).rows[0].n), 0);
  // the hash is stored, never the key
  assert.equal(Number((await pg.query(`select count(*) n from ea_keys where key_hash like 'key-%'`)).rows[0].n), 0);
});

test('mt5-ingest: closed deals arrive Not reviewed; a repeated ticket never makes a second row', { skip }, async () => {
  const { db, pg } = await withAccounts();
  const deps = { db, env: env({}), now: () => new Date('2026-11-16T10:00:00Z') };
  let r = await ingest(deps, 'key-funded', { login: '5550001', serverOffsetMinutes: 120, deals: [deal('1001', T), deal('1002', T + 60)], equity: 10050, balance: 10020 });
  let out = await r.json();
  assert.equal(r.status, 200, JSON.stringify(out));
  assert.deepEqual([out.accepted, out.duplicates, out.equitySaved], [2, 0, true]);
  // the EA retries the same batch (lost answer) plus one new deal
  r = await ingest(deps, 'key-funded', { deals: [deal('1001', T), deal('1002', T + 60), deal('1003', T + 120)] });
  out = await r.json();
  assert.deepEqual([out.accepted, out.duplicates], [1, 2]);
  assert.equal(Number((await pg.query('select count(*) n from trades')).rows[0].n), 3);
  const { trades } = await loadJournal(db, 'u1');
  const t = trades.find(x => x.mt5Ticket === '1001');
  assert.equal(t.reviewStatus, 'Not reviewed'); assert.equal(t.source, 'mt5'); assert.equal(t.accountId, 'funded-1'); assert.equal(t.mode, 'Funded');
  assert.equal(t.rMultiple, 1); assert.equal(t.pnl, 99); assert.equal(t.closeTime, '2026-11-16T09:00:00.000Z');
  assert.equal(t.date, '2026-11-16', 'the trade day in the saved timezone');
  assert.equal(trades[0].mt5Ticket, '1003', 'newest first, as the app lists them');
  const snap = (await pg.query('select equity, balance, server_offset_minutes from equity_snapshots')).rows[0];
  assert.deepEqual([Number(snap.equity), Number(snap.balance), snap.server_offset_minutes], [10050, 10020, 120]);
  assert.equal((await pg.query(`select last_server_offset_minutes from ea_keys where account_id = 'funded-1'`)).rows[0].last_server_offset_minutes, 120);
  // invalid deals are counted, not stored
  out = await (await ingest(deps, 'key-funded', { deals: [{ ticket: '', closeTime: T }, { ticket: '1004' }, { ticket: 'abc', closeTime: T }] })).json();
  assert.deepEqual([out.accepted, out.invalid], [0, 3]);
});

test('mt5-ingest: a blown account still takes every MT5 trade, with post_breach = true', { skip }, async () => {
  const { db, pg } = await withAccounts();
  const deps = { db, env: env({}), now: () => new Date('2026-11-16T10:00:00Z') };
  // a -3R day (3% of 10,000 = 300) blows My Rules; deals after it in the same batch are post-breach
  let out = await (await ingest(deps, 'key-funded', { deals: [deal('2001', T, 1970), deal('2002', T + 600)] })).json();
  assert.equal(out.blown, true); assert.equal(out.accepted, 2); assert.equal(out.postBreach, 1);
  let acc = (await pg.query(`select status, extra::text as extra from accounts where id = 'funded-1'`)).rows[0];
  assert.equal(acc.status, 'blown');
  assert.equal(JSON.parse(acc.extra).blown.kind, 'daily_loss');
  let rows = (await pg.query(`select mt5_ticket, post_breach from trades order by mt5_ticket`)).rows;
  assert.deepEqual(rows.map(x => [x.mt5_ticket, x.post_breach]), [['2001', false], ['2002', true]]);
  // later deals on the blown account: accepted, all post-breach
  out = await (await ingest(deps, 'key-funded', { deals: [deal('2003', T + 7200)] })).json();
  assert.equal(r200(out), true); assert.equal(out.postBreach, 1);
  assert.equal((await pg.query(`select post_breach from trades where mt5_ticket = '2003'`)).rows[0].post_breach, true);
  // the app sees the account as BLOWN (the same record server.js writes)
  const { accountsDoc } = await loadJournal(db, 'u1');
  assert.equal(accountsDoc.Funded[0].blown.kind, 'daily_loss');
});
const r200 = out => out.ok === true && out.accepted === 1;

test('mt5-ingest: Maven keys, another login and Backtest are refused', { skip }, async () => {
  const { db } = await withAccounts();
  const deps = { db, env: env({}) };
  let r = await ingest(deps, 'key-maven', { deals: [deal('3001', T)] });
  assert.equal(r.status, 403); assert.equal((await r.json()).code, 'MT5_EA_NOT_PERMITTED');
  r = await ingest(deps, 'key-funded', { login: '9999999', deals: [deal('3002', T)] });
  assert.equal(r.status, 403); assert.equal((await r.json()).code, 'MT5_LOGIN_MISMATCH');
  r = await ingest(deps, 'key-bt', { deals: [deal('3003', T)] });
  assert.equal(r.status, 409);
  r = await handleIngest(new Request('http://x/mt5-ingest', { method: 'POST', headers: { 'x-ea-key': 'key-funded' }, body: '{not json' }), deps);
  assert.equal(r.status, 400);
});

// ── risk-check ──────────────────────────────────────────────────────────────
test('risk-check: recomputes every migrated user and records BLOWN server-side', { skip }, async () => {
  const { db, pg } = await withAccounts();
  await pg.query(`select public.journal_mark_migrated('u1', 'test')`);
  // a manual trade written straight to the table (no server check ran): -10R = 1,000 = 10%
  await pg.query(`insert into trades (user_id, id, account_id, mode, trade_date, r_multiple, extra)
    values ('u1', 'tr-1794000000000', 'funded-1', 'Funded', '2026-11-12', -10, '{"_keys":["id","mode","accountId","date","rMultiple"],"_present":["mode","accountId","date","rMultiple"]}')`);
  const deps = { db, env: env({ CRON_SECRET: 's3cret' }), now: () => new Date('2026-11-16T10:00:00Z') };
  assert.equal((await handleRiskCheck(post('http://x/risk-check', {}, {}), deps)).status, 401);
  let out = await (await handleRiskCheck(post('http://x/risk-check', { 'x-cron-secret': 's3cret' }, {}), deps)).json();
  assert.equal(out.usersChecked, 1);
  assert.deepEqual(out.newlyBlown, [{ accountId: 'funded-1', type: 'Funded', kind: 'max_drawdown', day: '2026-11-12' }]);
  // the second run finds it already recorded
  out = await (await handleRiskCheck(post('http://x/risk-check', { 'x-cron-secret': 's3cret' }, { userId: 'u1' }), deps)).json();
  assert.deepEqual(out.newlyBlown, []);
  assert.equal((await pg.query(`select status from accounts where id = 'funded-1'`)).rows[0].status, 'blown');
});

test('004 runs twice and refuses to run before 001', { skip }, async () => {
  const { pg } = await fresh();
  await pg.exec(sql('004_edge_functions.sql'));
  assert.equal(Number((await pg.query(`select count(*) n from schema_migrations where version = '004_edge_functions'`)).rows[0].n), 1);
  for (const t of ['ea_keys', 'news_fetches', 'function_errors']) {
    assert.equal((await pg.query(`select relrowsecurity from pg_class where relname = $1`, [t])).rows[0].relrowsecurity, true, `RLS on ${t}`);
  }
  const bare = new PGlite();
  await bare.exec(PRELUDE);
  await assert.rejects(bare.exec(sql('004_edge_functions.sql')), /Run migrations\/001_relational.sql first/);
});

test('NEWS_SOURCE_URL is the ForexFactory weekly JSON from news-sources.md', () => {
  assert.equal(NEWS_SOURCE_URL, 'https://nfs.faireconomy.media/ff_calendar_thisweek.json');
});
