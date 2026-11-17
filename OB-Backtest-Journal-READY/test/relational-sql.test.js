// Part 1: migrations/001_relational.sql in a real Postgres (PGlite, WebAssembly):
// the file runs (twice), the guard stops on a stray table, and the save functions keep
// their promises (insert_missing never updates or deletes; replace mirrors the app).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tradesDocToRows, rowsToTradesDoc, accountsDocToRows, rowsToAccountsDoc, tradeToRow } from '../relational-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_relational.sql'), 'utf8');
const SQL003 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '003_rule_overrides.sql'), 'utf8');
let PGlite = null;
try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* skipped below */ }
const skip = PGlite ? false : '@electric-sql/pglite is not installed (npm install)';

// Supabase already has these; PGlite needs stand-ins.
const PRELUDE = `create role anon; create role authenticated; create role service_role;
  create table public.users (id text primary key, email text not null unique, password_hash text, google_sub text unique, created_at timestamptz not null default now());`;

const shot = n => `/api/shots/${String(n).repeat(32).slice(0, 32)}.png`;
const TRADES = [
  { id: 'tr-1', mode: 'Backtest', accountId: 'backtest', date: '2026-11-12', pair: 'XAUUSD', rMultiple: 7, pnl: null, notes: '<p>n</p>', checklist: ['pass'], screenshots: [shot(1), shot(2)], extraField: { b: 2, a: 1 } },
  { id: 'tr-2', mode: 'Real', accountId: 'real-1', date: '2026-11-13', rMultiple: -1.5, pnl: -150.25, openTime: '2026-11-13T08:00:00.000Z', source: 'mt5', mt5Ticket: '99', screenshots: [] },
  { id: 'tr-3', mode: 'Demo', accountId: 'demo-1', date: '2026-09-01', rMultiple: 2 },
];
const ACCOUNTS = { Demo: [{ id: 'demo-1', name: 'Demo 1', balance: 5000.37, startingBalance: 5000 }],
  Real: [{ id: 'real-1', name: 'Real 01', balance: 100000, startingBalance: 100000 }],
  Backtest: [{ id: 'backtest', name: 'Backtest', balance: 1000, startingBalance: 1000 }] };

async function fresh() {
  const db = new PGlite();
  await db.exec(PRELUDE + `insert into public.users (id, email) values ('u1','a@test.local'),('u2','b@test.local');`);
  await db.exec(SQL);
  return db;
}
const call = (db, fn, args) => db.query(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args);
const n = async (db, q) => Number((await db.query(q)).rows[0].n);
async function readTrades(db, uid) {
  const rows = (await db.query(`select *, to_char(trade_date,'YYYY-MM-DD') as trade_date, extra::text as extra from trades where user_id=$1`, [uid])).rows
    .map(r => ({ ...r, open_time: r.open_time && r.open_time.toISOString(), close_time: r.close_time && r.close_time.toISOString() }));
  return rowsToTradesDoc(rows, (await db.query('select * from trade_attachments where user_id=$1', [uid])).rows);
}

test('001 runs twice; the guard stops on a pre-existing table of the same name', { skip }, async () => {
  const db = await fresh();
  await db.exec(SQL); // second run
  assert.equal(await n(db, `select count(*) n from schema_migrations where version='001_relational'`), 1);
  for (const t of ['accounts', 'trades', 'trade_attachments', 'news_events', 'equity_snapshots', 'account_runs', 'journal_migrated_users']) {
    assert.equal((await db.query(`select relrowsecurity from pg_class where relname=$1`, [t])).rows[0].relrowsecurity, true, `RLS on ${t}`);
  }
  const stray = new PGlite();
  await stray.exec(PRELUDE + 'create table public.accounts (x int);');
  await assert.rejects(stray.exec(SQL), /public\.accounts already exists but migration 001 was never recorded/);
});

test('insert_missing: copies, is idempotent, never updates or deletes', { skip }, async () => {
  const db = await fresh();
  const { rows, attachments } = tradesDocToRows(TRADES, 'u1');
  await call(db, 'journal_save_accounts', ['u1', JSON.stringify(accountsDocToRows(ACCOUNTS, 'u1')), 'insert_missing']);
  await call(db, 'journal_save_trades', ['u1', JSON.stringify(rows), JSON.stringify(attachments), 'insert_missing']);
  await call(db, 'journal_save_trades', ['u1', JSON.stringify(rows), JSON.stringify(attachments), 'insert_missing']);
  await call(db, 'journal_mark_migrated', ['u1', 'migrate-kv']);
  await call(db, 'journal_mark_migrated', ['u1', 'migrate-kv']);
  assert.equal(await n(db, `select count(*) n from trades`), 3);
  assert.equal(await n(db, `select count(*) n from trade_attachments`), 2);
  assert.equal(await n(db, `select count(*) n from journal_migrated_users`), 1);
  assert.equal(await readTrades(db, 'u1'), JSON.stringify(TRADES), 'read back = the original document');
  const accRows = (await db.query(`select *, extra::text as extra from accounts where user_id='u1'`)).rows;
  assert.equal(JSON.parse(rowsToAccountsDoc(accRows)).Real[0].needsVerification, true);
  // a second copy with changed content and fewer trades changes nothing
  const changed = tradesDocToRows([{ ...TRADES[0], notes: 'CHANGED' }], 'u1');
  await call(db, 'journal_save_trades', ['u1', JSON.stringify(changed.rows), '[]', 'insert_missing']);
  assert.equal(await readTrades(db, 'u1'), JSON.stringify(TRADES));
  // no base64 is stored anywhere
  assert.equal(await n(db, `select count(*) n from trades where extra::text like '%base64%'`), 0);
});

test('replace (the app): updates, deletes removed trades, keeps post_breach, other users untouched', { skip }, async () => {
  const db = await fresh();
  const all = tradesDocToRows(TRADES, 'u1');
  await call(db, 'journal_save_trades', ['u1', JSON.stringify(all.rows), JSON.stringify(all.attachments), 'replace']);
  await call(db, 'journal_save_trades', ['u2', JSON.stringify([tradeToRow({ id: 'tr-x', mode: 'Demo' }, 'u2', 0).row]), '[]', 'replace']);
  await db.query(`update trades set post_breach = true where user_id='u1' and id='tr-2'`);
  const next = [{ ...TRADES[1], notes: 'edited' }, TRADES[2]];
  const r = tradesDocToRows(next, 'u1');
  await call(db, 'journal_save_trades', ['u1', JSON.stringify(r.rows), JSON.stringify(r.attachments), 'replace']);
  assert.equal(await n(db, `select count(*) n from trades where user_id='u1'`), 2);
  assert.equal(await n(db, `select count(*) n from trade_attachments where user_id='u1'`), 0, "the deleted trade's attachments go with it");
  assert.equal((await db.query(`select notes, post_breach from trades where user_id='u1' and id='tr-2'`)).rows[0].notes, 'edited');
  assert.equal((await db.query(`select post_breach from trades where user_id='u1' and id='tr-2'`)).rows[0].post_breach, true, 'once post-breach, always post-breach');
  assert.equal(await n(db, `select count(*) n from trades where user_id='u2'`), 1, "u2's rows untouched");
  await db.query(`delete from users where id='u2'`);
  assert.equal(await n(db, `select count(*) n from trades where user_id='u2'`), 0, 'deleting a user deletes their rows');
});

test('one MT5 ticket per account', { skip }, async () => {
  const db = await fresh();
  await db.query(`insert into trades (user_id,id,account_id,mt5_ticket) values ('u1','m1','demo-1','123')`);
  await assert.rejects(db.query(`insert into trades (user_id,id,account_id,mt5_ticket) values ('u1','m2','demo-1','123')`), /duplicate key/);
  await db.query(`insert into trades (user_id,id,account_id,mt5_ticket) values ('u1','m3','demo-2','123')`); // another account: fine
});

test('003_rule_overrides: needs 001, runs twice, RLS on, one override per trade is enforced by the server query', { skip }, async () => {
  const bare = new PGlite();
  await bare.exec(PRELUDE);
  await bare.exec(SQL.replace(/insert into public\.schema_migrations[^;]*;/, '')); // 001 without its record
  await assert.rejects(bare.exec(SQL003), /run migrations\/001_relational\.sql first/);
  const db = await fresh();
  await db.exec(SQL003); await db.exec(SQL003);
  assert.equal(await n(db, "select count(*) n from schema_migrations where version='003_rule_overrides'"), 1);
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='rule_overrides'")).rows[0].relrowsecurity, true);
  await db.query("insert into rule_overrides (user_id, id, account_id, run_number) values ('u1','ovr-1','funded-1',1)");
  // the server's "use" is an update guarded by used_by_trade is null: a second use changes nothing
  const use = () => db.query("update rule_overrides set used_by_trade=$1, used_at=now() where user_id='u1' and id='ovr-1' and used_by_trade is null", ['tr-a']);
  assert.equal((await use()).affectedRows, 1); assert.equal((await use()).affectedRows, 0);
  // the accounts table takes the blown status and account_runs takes a run
  await call(db, 'journal_save_accounts', ['u1', JSON.stringify([{ id: 'funded-1', name: 'F', type: 'funded', status: 'blown', run_number: 2, preset: 'my-rules', reset_timezone: 'UTC', extra: {} }]), 'replace']);
  await db.query("insert into account_runs (user_id, account_id, run_number, starting_balance, started_at, ended_at, end_reason, peak_balance) values ('u1','funded-1',1,10000,now(),now(),'blown',10100)");
  assert.equal(await n(db, "select count(*) n from accounts where status='blown' and run_number=2 and preset='my-rules'"), 1);
  await assert.rejects(db.query("insert into account_runs (user_id, account_id, run_number, starting_balance, started_at, end_reason) values ('u1','funded-1',1,1,now(),'blown')"), /duplicate key/, 'one row per run');
});
