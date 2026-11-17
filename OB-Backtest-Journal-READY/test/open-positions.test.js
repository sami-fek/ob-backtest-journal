// Part 7: open MT5 positions. They live in mt5_positions, never in trades: an open position
// appears, does not touch the journal (so no statistic sees it), and when it closes it
// becomes exactly one trade row and leaves the list.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleIngest } from '../supabase/functions/_shared/handlers.js';
import { sha256Hex } from '../supabase/functions/_shared/ingest.js';
import { loadJournal } from '../supabase/functions/_shared/journal-db.js';
import { accountsDocToRows } from '../relational-core.js';
import { startLocalServer, sqliteAvailable, openTestDb } from './local-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = f => fs.readFileSync(path.join(__dirname, '..', 'migrations', f), 'utf8');
const EA = fs.readFileSync(path.join(__dirname, '..', 'mt5', 'MYJournalLogger.mq5'), 'utf8');
let PGlite = null;
try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* skipped below */ }
const skip = PGlite ? false : '@electric-sql/pglite is not installed (npm install)';
const sqliteSkip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';

async function fresh(migrations = ['001_relational.sql', '003_rule_overrides.sql', '004_edge_functions.sql', '005_open_positions.sql']) {
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role;
    create table public.users (id text primary key, email text not null unique, password_hash text, google_sub text unique, created_at timestamptz not null default now());
    create table public.kv (session_id text not null, key text not null, value text not null, updated_at timestamptz not null default now(), primary key (session_id, key));
    insert into public.users (id, email) values ('u1', 'a@test.local');`);
  for (const f of migrations) await pg.exec(sql(f));
  await pg.query('select public.journal_save_accounts($1, $2, $3)', ['u1', JSON.stringify(accountsDocToRows({ Real: [{ id: 'real-1', name: 'Real', balance: 10000, startingBalance: 10000 }] }, 'u1')), 'replace']);
  await pg.query(`insert into ea_keys (key_hash, user_id, account_id) values ($1, 'u1', 'real-1')`, [await sha256Hex('myj_key')]);
  const db = { query: async (t, p = []) => (await pg.query(t, p)).rows, tx: fn => pg.transaction(tx => { const i = { query: async (t, p = []) => (await tx.query(t, p)).rows, tx: f => f(i) }; return fn(i); }) };
  return { pg, db };
}
const T = Date.parse('2026-11-16T09:00:00Z') / 1000;
const pos = (ticket, profit = -12.5) => ({ ticket, symbol: 'EURUSD', direction: 'sell', volume: 0.5, openTime: T, openPrice: 1.0850, currentPrice: 1.0875, sl: 1.0900, tp: 1.0750, profit, swap: -0.4 });
const closed = (ticket, profit = 50) => ({ ticket, symbol: 'EURUSD', direction: 'sell', volume: 0.5, openTime: T, closeTime: T + 1800, openPrice: 1.0850, closePrice: 1.0840, sl: 1.0900, tp: 1.0750, profit, commission: -3, swap: 0 });
const send = (db, body) => handleIngest(new Request('http://x', { method: 'POST', headers: { 'x-ea-key': 'myj_key', 'content-type': 'application/json' }, body: JSON.stringify({ equity: 9987.1, balance: 10000, ...body }) }), { db, env: () => undefined, now: () => new Date('2026-11-16T09:10:00Z') });
const count = async (pg, t) => Number((await pg.query(`select count(*) n from ${t}`)).rows[0].n);

test('an open position appears, stays out of the journal, and becomes one trade row when it closes', { skip }, async () => {
  const { pg, db } = await fresh();
  let out = await (await send(db, { positions: [pos('5001'), pos('5002', 30)] })).json();
  assert.equal(out.positionsSaved, 2);
  assert.equal(await count(pg, 'mt5_positions'), 2);
  assert.equal(await count(pg, 'trades'), 0, 'open positions are not trades');
  assert.deepEqual((await loadJournal(db, 'u1')).trades, [], 'the journal (and every statistic built on it) does not see them');
  const row = (await pg.query(`select symbol, direction, volume, profit, open_time from mt5_positions where ticket = '5001'`)).rows[0];
  assert.deepEqual([row.symbol, row.direction, Number(row.volume), Number(row.profit), row.open_time.toISOString()], ['EURUSD', 'Sell', 0.5, -12.5, '2026-11-16T09:00:00.000Z']);

  // 5001 closes: the closed trade arrives and the position set no longer has it
  out = await (await send(db, { deals: [closed('5001')], positions: [pos('5002', 31)] })).json();
  assert.equal(out.accepted, 1);
  assert.deepEqual((await pg.query(`select ticket from mt5_positions`)).rows.map(r => r.ticket), ['5002']);
  const trades = (await loadJournal(db, 'u1')).trades;
  assert.deepEqual(trades.map(t => t.mt5Ticket), ['5001'], 'one trade row, with the position ticket');
  // the EA retries the same request: still one row
  out = await (await send(db, { deals: [closed('5001')], positions: [pos('5002', 31)] })).json();
  assert.deepEqual([out.accepted, out.duplicates], [0, 1]);
  assert.equal(await count(pg, 'trades'), 1);
  // a closed trade sent without a position report (an old EA) still leaves the list
  await send(db, { deals: [closed('5002')] });
  assert.equal(await count(pg, 'mt5_positions'), 0);
  assert.equal(await count(pg, 'trades'), 2);
});

test('the reported set replaces the stored one; nonsense rows are skipped', { skip }, async () => {
  const { pg, db } = await fresh();
  await send(db, { positions: [pos('7001'), pos('7002')] });
  const out = await (await send(db, { positions: [pos('7002'), { ticket: 'abc' }, { symbol: 'X' }] })).json();
  assert.equal(out.positionsSaved, 1);
  assert.deepEqual((await pg.query(`select ticket from mt5_positions`)).rows.map(r => r.ticket), ['7002']);
  await send(db, { positions: [] });
  assert.equal(await count(pg, 'mt5_positions'), 0, 'an empty report clears the list');
});

test('without migration 005, closed trades are still accepted (positions are never worth a lost trade)', { skip }, async () => {
  const { pg, db } = await fresh(['001_relational.sql', '003_rule_overrides.sql', '004_edge_functions.sql']);
  const r = await send(db, { deals: [closed('9001')], positions: [pos('9002')] });
  const out = await r.json();
  assert.equal(r.status, 200, JSON.stringify(out));
  assert.equal(out.accepted, 1); assert.equal(out.positionsSaved, false); assert.equal(out.equitySaved, true);
  assert.equal(await count(pg, 'trades'), 1);
  assert.match((await pg.query(`select detail::text d from function_errors`)).rows[0].d, /positions/);
});

test('005 runs twice, needs 004, row level security on', { skip }, async () => {
  const { pg } = await fresh();
  await pg.exec(sql('005_open_positions.sql'));
  assert.equal((await pg.query(`select relrowsecurity from pg_class where relname = 'mt5_positions'`)).rows[0].relrowsecurity, true);
  const bare = new PGlite();
  await bare.exec(`create role anon; create role authenticated; create role service_role;
    create table public.users (id text primary key, email text not null unique, password_hash text, google_sub text unique, created_at timestamptz not null default now());`);
  await bare.exec(sql('001_relational.sql'));
  await assert.rejects(bare.exec(sql('005_open_positions.sql')), /Run migrations\/004_edge_functions.sql first/);
});

test('the EA reports its open positions with the position identifier', () => {
  assert.match(EA, /\\"positions\\":" \+ OpenPositionsJson\(\)/);
  assert.match(EA, /POSITION_IDENTIFIER/, 'the same id the closed trade will carry');
  assert.ok(!/PositionClose|OrderSend/.test(EA.replace(/\/\/.*$/gm, '')));
});

test('GET /api/mt5/live: equity, staleness and open positions per account; the trade list is untouched', { skip: sqliteSkip }, async () => {
  const srv = await startLocalServer({ DATA_RECHECK_MS: '0' });
  try {
    const c = srv.client();
    const uid = (await c.call('POST', '/api/auth/register', { email: 'live@test.local', password: 'password123' })).body.user.id;
    await c.call('PUT', '/api/storage/my_journal_accounts_v1', { value: JSON.stringify({
      Real: [{ id: 'real-1', name: 'Real', balance: 10000, startingBalance: 10000 }, { id: 'real-2', name: 'Quiet', balance: 5000, startingBalance: 5000 }],
      Funded: [{ id: 'funded-1', name: 'Old EA', balance: 10000, startingBalance: 10000 }],
      Backtest: [{ id: 'backtest', name: 'Backtest', balance: 1000, startingBalance: 1000 }] }) });
    await c.call('PUT', '/api/storage/ob-trades', { value: '[]' });
    const now = Date.now(), iso = ms => new Date(ms).toISOString();
    const db = openTestDb(srv.dataDir);
    db.prepare('INSERT INTO equity_snapshots (user_id, account_id, equity, balance, server_offset_minutes, taken_at) VALUES (?,?,?,?,?,?)').run(uid, 'real-1', 9987.1, 10000, 120, iso(now - 60_000));
    db.prepare('INSERT INTO equity_snapshots (user_id, account_id, equity, balance, server_offset_minutes, taken_at) VALUES (?,?,?,?,?,?)').run(uid, 'funded-1', 9900, 10000, 120, iso(now - 20 * 60_000));
    db.prepare(`INSERT INTO mt5_positions (user_id, account_id, ticket, symbol, direction, volume, open_time, open_price, current_price, sl, tp, profit, swap, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(uid, 'real-1', '5001', 'EURUSD', 'Sell', 0.5, iso(now - 3_600_000), 1.085, 1.0875, 1.09, 1.075, -12.5, -0.4, iso(now - 60_000));
    db.close();
    const r = await c.call('GET', '/api/mt5/live');
    assert.equal(r.status, 200); assert.equal(r.body.available, true);
    const a = r.body.accounts;
    assert.deepEqual(Object.keys(a).sort(), ['funded-1', 'real-1'], 'only accounts an EA reported for; never Backtest');
    assert.equal(a['real-1'].equity, 9987.1); assert.equal(a['real-1'].stale, false); assert.equal(a['real-1'].serverOffsetMinutes, 120);
    assert.deepEqual(a['real-1'].positions.map(p => [p.ticket, p.symbol, p.direction, p.profit]), [['5001', 'EURUSD', 'Sell', -12.5]]);
    assert.equal(a['funded-1'].stale, true, 'a report older than 5 minutes is stale');
    assert.equal(JSON.parse((await c.call('GET', '/api/storage/ob-trades')).body.value).length, 0, 'the journal has no entry for the open position');
    assert.equal((await srv.client().call('GET', '/api/mt5/live')).status, 401);
  } finally { await srv.stop(); }
});
