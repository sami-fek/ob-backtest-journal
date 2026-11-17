// Part 8: live equity for the firm presets, the stale-equity path, and the broker offset check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../public/time-prefs.js';
import '../public/rule-presets.js';
import { handleIngest, handleRiskCheck } from '../supabase/functions/_shared/handlers.js';
import { sha256Hex } from '../supabase/functions/_shared/ingest.js';
import { loadJournal } from '../supabase/functions/_shared/journal-db.js';
import { accountsDocToRows } from '../relational-core.js';
import { startLocalServer, sqliteAvailable, openTestDb } from './local-server.js';

const R = globalThis.obRules;
const MIN = 60_000;
const NOW = Date.parse('2026-11-17T10:00:00Z');          // 11:00 in Prague (UTC+1 in November)
const PRAGUE_MIDNIGHT = Date.parse('2026-11-16T23:00:00Z');
const iso = ms => new Date(ms).toISOString();
const ftmo = { id: 'funded-1', name: 'FTMO 10k', startingBalance: 10000, preset: 'ftmo' };  // daily: 5% of 10,000 = 500 below the day-start balance
const state = (acc, trades, equity) => R.accountState(acc, trades, { pnlFor: t => R.pnlOf(t, acc, { riskPct: 1 }), equity, now: NOW });

test('a floating loss breaches the daily floor while closed balance alone would not', () => {
  // no trade closed today: closed balance is 10,000, so closed balance alone sees no loss at all
  const closedOnly = state(ftmo, [], undefined);
  assert.equal(closedOnly.state, 'ok');
  assert.equal(closedOnly.understated, true, 'without equity: understated, never a plain pass');
  assert.equal(closedOnly.daily.used, 0);

  // live equity 9,450: 550 of floating loss, under the FTMO floor of 9,500
  const live = { equity: 9450, balance: 10000, takenAt: iso(NOW - 30_000), day: '2026-11-17', dayStartEquity: 10000, dayMinEquity: 9450 };
  const s = state(ftmo, [], live);
  assert.equal(s.state, 'blown');
  assert.deepEqual([s.breach.kind, s.breach.basis, s.breach.loss, s.breach.limit, s.breach.day], ['daily_loss', 'equity', 550, 500, '2026-11-17']);
  assert.equal(s.daily.basis, 'equity'); assert.equal(s.daily.used, 550); assert.equal(s.understated, false);
  assert.match(R.blownReason(s.blown, v => String(v)), /Daily loss limit breached on equity \(floating P\/L included\): lost 550/);
});

test('a dip that recovered still counts: the day\'s lowest equity is checked (standard formula, equity anchor)', () => {
  const the5ers = { id: 't5', startingBalance: 10000, preset: 'the5ers' };
  // day started with 200 of floating profit: anchor = max(10,000, 10,200) = 10,200; 5% = 510; floor 9,690
  const base = { balance: 10000, takenAt: iso(NOW - 20_000), day: '2026-11-17', dayStartEquity: 10200 };
  assert.equal(state(the5ers, [], { ...base, equity: 9700, dayMinEquity: 9700 }).state, 'ok', 'not breached: 9,700 is above the floor of 9,690 (and 3% down is under the 8% warning)');
  const s = state(the5ers, [], { ...base, equity: 9700, dayMinEquity: 9680 });
  assert.equal(s.state, 'blown'); assert.equal(s.breach.kind, 'daily_loss'); assert.equal(s.breach.loss, 520); assert.equal(s.breach.equity, 9680);
  assert.equal(s.daily.floor, 9690); assert.equal(s.daily.worst, 520);
});

test('stale equity (older than 5 minutes) is not used: closed balance only, understated, said so', () => {
  const stale = { equity: 9000, balance: 10000, takenAt: iso(NOW - 6 * MIN), day: '2026-11-17', dayStartEquity: 10000, dayMinEquity: 9000 };
  const s = state(ftmo, [], stale);
  assert.equal(s.state, 'ok', 'the old 9,000 is not used');
  assert.equal(s.equityState, 'stale'); assert.equal(s.understated, true);
  assert.equal(s.daily.basis, 'closed balance'); assert.equal(s.daily.equityState, 'stale');
  const text = R.equityText(s.daily, v => v);
  assert.equal(text.live, false); assert.match(text.long, /^Equity stale: the last MT5 report was at .*more than 5 minutes ago/);
  // no report at all
  assert.match(R.equityText(state(ftmo, [], undefined).daily).long, /Equity unavailable - closed balance only, understated/);
  // live: the notice is gone
  const live = state(ftmo, [], { ...stale, takenAt: iso(NOW - MIN), equity: 9900, dayMinEquity: 9900 });
  assert.equal(live.understated, false); assert.match(R.equityText(live.daily, v => v).long, /^Measured on live equity/);
});

test('max drawdown on equity; balance-based presets (My Rules) ignore equity', () => {
  const s = state(ftmo, [], { equity: 8990, balance: 10000, takenAt: iso(NOW - MIN), day: '2026-11-17', dayStartEquity: 8995, dayMinEquity: 8990 });
  assert.equal(s.breach.kind, 'max_drawdown'); assert.equal(s.breach.basis, 'equity'); assert.equal(s.breach.loss, 1010);
  const mine = { id: 'm', startingBalance: 10000, preset: 'my-rules' };
  const m = state(mine, [], { equity: 8000, balance: 10000, takenAt: iso(NOW - MIN) });
  assert.equal(m.state, 'ok'); assert.equal(m.equityState, 'n/a'); assert.equal(m.understated, false);
});

test('day-start equity: the snapshot nearest to 00:00 in the reset zone, within 10 minutes; else unknown and understated', () => {
  assert.equal(R.dayStartUtc('2026-11-17', 'Europe/Prague'), PRAGUE_MIDNIGHT);
  assert.equal(iso(R.dayStartUtc('2026-07-17', 'Europe/Prague')), '2026-07-16T22:00:00.000Z', 'summer time');
  assert.equal(iso(R.dayStartUtc('2026-11-17', 'Etc/GMT-3')), '2026-11-16T21:00:00.000Z');
  const rows = [{ equity: 10100, taken_at: iso(PRAGUE_MIDNIGHT - 9 * MIN) }, { equity: 10050, taken_at: iso(PRAGUE_MIDNIGHT + 30_000) }, { equity: 9000, taken_at: iso(PRAGUE_MIDNIGHT + 30 * MIN) }];
  assert.equal(R.pickDayStartEquity(rows, PRAGUE_MIDNIGHT), 10050);
  assert.equal(R.pickDayStartEquity([{ equity: 9000, taken_at: iso(PRAGUE_MIDNIGHT + 30 * MIN) }], PRAGUE_MIDNIGHT), null);
  const t5 = { id: 't5', startingBalance: 10000, preset: 'the5ers' };
  const s = state(t5, [], { equity: 9900, balance: 10000, takenAt: iso(NOW - MIN), day: '2026-11-17', dayStartEquity: null, dayMinEquity: 9900 });
  assert.equal(s.daily.basis, 'equity'); assert.equal(s.daily.understated, true, 'standard formula without day-start equity');
  assert.match(R.equityText(s.daily, v => v).long, /Equity at the start of the day is unknown/);
});

test('the EA-reported server offset next to the reset zone: a warning when a server-midnight firm disagrees', () => {
  const winter = Date.parse('2026-11-17T10:00:00Z');
  let c = R.offsetCheck({ preset: 'ftmo' }, 60, winter);
  assert.equal(c.agree, true); assert.equal(c.warn, false); assert.match(c.message, /matches the reset zone Europe\/Prague \(UTC\+1\)/);
  c = R.offsetCheck({ preset: 'ftmo' }, 120, winter);
  assert.equal(c.warn, true); assert.match(c.message, /MT5 server time is UTC\+2, but the reset zone Europe\/Prague is UTC\+1 now\. FTMO resets at 00:00 server time/);
  assert.equal(R.offsetCheck({ preset: 'ftmo' }, 120, Date.parse('2026-07-17T10:00:00Z')).warn, false, 'summer: Prague is UTC+2');
  assert.equal(R.offsetCheck({ preset: 'fundingpips' }, 180, winter).warn, false);
  c = R.offsetCheck({ preset: 'maven' }, 120, winter);
  assert.equal(c.warn, false, 'Maven resets at 00:00 UTC whatever the server says'); assert.match(c.message, /not at server midnight/);
  assert.equal(R.offsetCheck({ preset: 'custom', resetTimezone: 'UTC', customRules: { maxDrawdownPct: 10, warnPct: 8, dailyLossPct: 5, dailyLossBase: 'equity', dailyLossFormula: 'standard' } }, 120, winter).warn, true);
  assert.equal(R.offsetCheck({ preset: 'ftmo' }, null, winter), null);
  assert.equal(R.zoneOffsetMinutes('America/New_York', winter), -300);
});

// ── the Edge Functions: a snapshot with a floating loss blows the account, a stale one does not ──
let PGlite = null;
try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* skipped below */ }
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = f => fs.readFileSync(path.join(__dirname, '..', 'migrations', f), 'utf8');
async function edgeDb() {
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role;
    create table public.users (id text primary key, email text not null unique, password_hash text, google_sub text unique, created_at timestamptz not null default now());
    create table public.kv (session_id text not null, key text not null, value text not null, updated_at timestamptz not null default now(), primary key (session_id, key));
    insert into public.users (id, email) values ('u1', 'a@test.local');`);
  for (const f of ['001_relational.sql', '003_rule_overrides.sql', '004_edge_functions.sql', '005_open_positions.sql']) await pg.exec(sql(f));
  await pg.query('select public.journal_save_accounts($1, $2, $3)', ['u1', JSON.stringify(accountsDocToRows({ Funded: [{ ...ftmo, balance: 10000 }] }, 'u1')), 'replace']);
  await pg.query(`select public.journal_mark_migrated('u1', 'test')`);
  await pg.query(`insert into ea_keys (key_hash, user_id, account_id) values ($1, 'u1', 'funded-1')`, [await sha256Hex('myj_key')]);
  const db = { query: async (t, p = []) => (await pg.query(t, p)).rows, tx: fn => pg.transaction(tx => { const i = { query: async (t, p = []) => (await tx.query(t, p)).rows, tx: f => f(i) }; return fn(i); }) };
  return { pg, db };
}
const report = (db, at, equity) => handleIngest(new Request('http://x', { method: 'POST', headers: { 'x-ea-key': 'myj_key' }, body: JSON.stringify({ equity, balance: 10000, serverOffsetMinutes: 60, positions: [] }) }), { db, env: () => undefined, now: () => new Date(at) });

test('mt5-ingest: an equity report with a floating loss under the floor records BLOWN, before any trade closes', { skip: PGlite ? false : 'pglite missing' }, async () => {
  const { pg, db } = await edgeDb();
  // midnight snapshot (day-start equity), then equity drifts down
  assert.equal((await (await report(db, PRAGUE_MIDNIGHT + 20_000, 10000)).json()).blown, false);
  assert.equal((await (await report(db, NOW - 60_000, 9600)).json()).blown, false, '9,600 > floor 9,500');
  const out = await (await report(db, NOW, 9480)).json();
  assert.equal(out.blown, true);
  const acc = (await pg.query(`select status, extra::text as extra from accounts where id = 'funded-1'`)).rows[0];
  const blown = JSON.parse(acc.extra).blown;
  assert.equal(acc.status, 'blown');
  assert.deepEqual([blown.kind, blown.basis, blown.loss, blown.equity], ['daily_loss', 'equity', 520, 9480]);
  assert.equal(Number((await pg.query('select count(*) n from trades')).rows[0].n), 0, 'no trade closed: the floating loss alone did it');
  assert.equal((await loadJournal(db, 'u1')).accountsDoc.Funded[0].blown.basis, 'equity', 'the app sees the same record');
});

test('risk-check: a stale snapshot (older than 5 minutes) is not used to blow an account', { skip: PGlite ? false : 'pglite missing' }, async () => {
  const { pg, db } = await edgeDb();
  await pg.query(`insert into equity_snapshots (user_id, account_id, equity, balance, taken_at) values ('u1', 'funded-1', 9000, 10000, $1::timestamptz)`, [iso(NOW - 6 * MIN)]);
  const deps = { db, env: name => ({ CRON_SECRET: 's' })[name], now: () => new Date(NOW) };
  let out = await (await handleRiskCheck(new Request('http://x', { method: 'POST', headers: { 'x-cron-secret': 's' }, body: '{}' }), deps)).json();
  assert.deepEqual(out.newlyBlown, [], 'a 6-minute-old 9,000 is not used');
  // the same number, fresh: blown
  await pg.query(`insert into equity_snapshots (user_id, account_id, equity, balance, taken_at) values ('u1', 'funded-1', 9000, 10000, $1::timestamptz)`, [iso(NOW - MIN)]);
  out = await (await handleRiskCheck(new Request('http://x', { method: 'POST', headers: { 'x-cron-secret': 's' }, body: '{}' }), deps)).json();
  assert.equal(out.newlyBlown[0].accountId, 'funded-1');
});

test('server: /api/mt5/live gives the day numbers, and an app save is checked on live equity too', { skip: sqliteAvailable() ? false : 'better-sqlite3 not loadable (use Node 20)' }, async () => {
  const srv = await startLocalServer({ DATA_RECHECK_MS: '0' });
  try {
    const c = srv.client();
    const uid = (await c.call('POST', '/api/auth/register', { email: 'eq@test.local', password: 'password123' })).body.user.id;
    await c.call('PUT', '/api/storage/my_journal_accounts_v1', { value: JSON.stringify({ Funded: [{ ...ftmo, balance: 10000, resetTimezone: 'UTC' }] }) });
    const now = Date.now();
    const dayStart = R.dayStartUtc(R.dayOf(now, 'UTC'), 'UTC');
    const db = openTestDb(srv.dataDir);
    const ins = db.prepare('INSERT INTO equity_snapshots (user_id, account_id, equity, balance, server_offset_minutes, taken_at) VALUES (?,?,?,?,?,?)');
    ins.run(uid, 'funded-1', 10000, 10000, 0, iso(Math.max(dayStart + 30_000, now - 4 * MIN)));
    ins.run(uid, 'funded-1', 9480, 10000, 0, iso(now - 20_000));
    db.close();
    const live = (await c.call('GET', '/api/mt5/live')).body.accounts['funded-1'];
    assert.equal(live.equity, 9480); assert.equal(live.stale, false); assert.equal(live.dayMinEquity, 9480);
    assert.equal(live.day, R.dayOf(now, 'UTC'));
    // any trade save runs the server's rule check, which now sees the live equity
    await c.call('PUT', '/api/storage/ob-trades', { value: '[]' });
    const acc = JSON.parse((await c.call('GET', '/api/storage/my_journal_accounts_v1')).body.value).Funded[0];
    assert.equal(acc.blown && acc.blown.basis, 'equity');
    assert.equal(acc.blown.kind, 'daily_loss');
  } finally { await srv.stop(); }
});
