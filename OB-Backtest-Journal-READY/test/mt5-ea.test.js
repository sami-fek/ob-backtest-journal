// Part 6: MYJournalLogger (the EA), the EA key, and MT5 trades in the rules.
//  - the EA source never trades and never holds a key
//  - a request shaped exactly like the EA's is accepted by mt5-ingest; a retry is deduplicated
//  - the server issues EA keys (hash only, one active key per account, Maven/Backtest refused)
//  - Link MT5 uses that key as its token; Unlink revokes it
//  - no secret is ever saved with an account
//  - the rules count an MT5 trade with the broker's P/L, not R
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startLocalServer, sqliteAvailable, openTestDb } from './local-server.js';
import { registerMt5Routes } from '../mt5-backend.js';
import { handleIngest } from '../supabase/functions/_shared/handlers.js';
import { sha256Hex } from '../supabase/functions/_shared/ingest.js';
import { loadJournal } from '../supabase/functions/_shared/journal-db.js';
import { accountsDocToRows } from '../relational-core.js';
import '../public/time-prefs.js';
import '../public/rule-presets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EA = fs.readFileSync(path.join(__dirname, '..', 'mt5', 'MYJournalLogger.mq5'), 'utf8');
const code = EA.replace(/\/\/.*$/gm, '').replace(/"(?:[^"\\]|\\.)*"/g, '""'); // without comments and strings
const sqliteSkip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';
let PGlite = null;
try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* skipped below */ }

test('the EA never places, changes or closes a trade', () => {
  for (const call of ['OrderSend', 'OrderSendAsync', 'OrderCheck', 'CTrade', 'PositionClose', 'PositionModify', 'OrderModify', 'OrderDelete', 'PositionOpen', 'Buy(', 'Sell(']) {
    assert.ok(!code.includes(call), `MYJournalLogger.mq5 must not use ${call}`);
  }
  assert.ok(!/#include/.test(EA), 'no includes (in particular no Trade\\Trade.mqh)');
});

test('the EA key is an input, never written in the file; the EA sends what mt5-ingest expects', () => {
  assert.match(EA, /input string InpEaKey\s*=\s*"";/);
  assert.ok(!/myj_[A-Za-z0-9_-]{20,}|obmt5_[A-Za-z0-9_-]{20,}/.test(EA), 'no key in the source');
  assert.match(EA, /x-ea-key: " \+ g_key/);
  assert.match(EA, /\\"serverOffsetMinutes\\":/);
  assert.match(EA, /TimeTradeServer\(\)/);
  assert.match(EA, /DEAL_POSITION_ID/, 'the position ticket is the dedup key');
  assert.match(EA, /\\"ticket\\":\\"" \+ IntegerToString\(\(long\)positionId\)/);
  assert.match(EA, /queue_" \+ IntegerToString\(AccountInfoInteger\(ACCOUNT_LOGIN\)\)/, 'failed sends are queued in a file');
  assert.match(EA, /Print\("MYJournalLogger: send failed/);
  assert.match(EA, /Print\("MYJournalLogger: connected/);
  assert.match(EA, /PositionSelectByTicket\(positionId\)/, 'a partly closed position waits until it is fully closed');
});

// The body the EA builds in Send(), with the deal JSON of ClosedPositionJson().
function eaBody({ deals, equity = '10050.00', balance = '10020.00' }) {
  const deal = d => `{"ticket":"${d.ticket}","symbol":"XAUUSD","direction":"${d.dir}","volume":0.10,"openTime":${d.open},"closeTime":${d.close},"openPrice":2000.00,"closePrice":${d.exit},"sl":1990.00,"tp":2030.00,"profit":${d.profit},"commission":-0.70,"swap":0.00,"magic":"0","comment":"tp \\"hit\\""}`;
  return `{"login":"5550001","server":"Broker-Live","serverOffsetMinutes":120,"serverTime":"2026.11.16 11:00:00","equity":${equity},"balance":${balance},"deals":[${deals.map(deal).join(',')}]}`;
}

test('a request exactly like the EA sends is stored once; a retry is a duplicate', { skip: PGlite ? false : 'pglite missing' }, async () => {
  const pg = new PGlite();
  const sql = f => fs.readFileSync(path.join(__dirname, '..', 'migrations', f), 'utf8');
  await pg.exec(`create role anon; create role authenticated; create role service_role;
    create table public.users (id text primary key, email text not null unique, password_hash text, google_sub text unique, created_at timestamptz not null default now());
    create table public.kv (session_id text not null, key text not null, value text not null, updated_at timestamptz not null default now(), primary key (session_id, key));
    insert into public.users (id, email) values ('u1', 'a@test.local');`);
  for (const f of ['001_relational.sql', '003_rule_overrides.sql', '004_edge_functions.sql']) await pg.exec(sql(f));
  await pg.query('select public.journal_save_accounts($1, $2, $3)', ['u1', JSON.stringify(accountsDocToRows({ Funded: [{ id: 'funded-1', name: 'F', balance: 10000, startingBalance: 10000, preset: 'my-rules' }] }, 'u1')), 'replace']);
  await pg.query(`insert into ea_keys (key_hash, user_id, account_id, mt5_login) values ($1, 'u1', 'funded-1', '5550001')`, [await sha256Hex('myj_test_key')]);
  const db = { query: async (t, p = []) => (await pg.query(t, p)).rows, tx: fn => pg.transaction(tx => { const i = { query: async (t, p = []) => (await tx.query(t, p)).rows, tx: f => f(i) }; return fn(i); }) };
  const T = Date.parse('2026-11-16T09:00:00Z') / 1000;
  const body = eaBody({ deals: [{ ticket: '987654321', dir: 'buy', open: T - 600, close: T, exit: '2010.00', profit: '100.00' }] });
  const send = () => handleIngest(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ea-key': 'myj_test_key' }, body }), { db, env: () => undefined });
  let r = await send();
  let out = await r.json();
  assert.equal(r.status, 200, JSON.stringify(out));
  assert.deepEqual([out.ok, out.accepted, out.duplicates, out.equitySaved], [true, 1, 0, true]);
  assert.match(JSON.stringify(out), /"ok":true/, 'the EA checks for "ok":true');
  out = await (await send()).json();
  assert.deepEqual([out.accepted, out.duplicates], [0, 1], 'the EA re-sent the same position: no second row');
  const t = (await loadJournal(db, 'u1')).trades[0];
  assert.equal(t.mt5Ticket, '987654321'); assert.equal(t.openTime, '2026-11-16T08:50:00.000Z'); assert.equal(t.closeTime, '2026-11-16T09:00:00.000Z');
  assert.equal(t.pnl, 99.3); assert.equal(t.rMultiple, 1); assert.equal(t.reviewStatus, 'Not reviewed'); assert.equal(t.direction, 'LONG');
});

test('EA keys: issued once, stored as a hash, one active key per account; Maven and Backtest refused', { skip: sqliteSkip }, async () => {
  const srv = await startLocalServer({ DATA_RECHECK_MS: '0', SUPABASE_URL: '', MT5_INGEST_URL: 'https://ynloihdiiahlegpkzhae.supabase.co/functions/v1/mt5-ingest' });
  try {
    const c = srv.client();
    const reg = await c.call('POST', '/api/auth/register', { email: 'ea@test.local', password: 'password123' });
    const uid = reg.body.user.id;
    const accounts = {
      Funded: [{ id: 'funded-1', name: 'FTMO', balance: 10000, startingBalance: 10000, preset: 'ftmo', mt5: { linked: true, login: '5550001', token: 'obmt5_old_secret_value' } }],
      Demo: [{ id: 'maven-1', name: 'Maven', balance: 10000, startingBalance: 10000, preset: 'maven' }],
      Backtest: [{ id: 'backtest', name: 'Backtest', balance: 1000, startingBalance: 1000 }],
    };
    await c.call('PUT', '/api/storage/my_journal_accounts_v1', { value: JSON.stringify(accounts) });
    // the old page's MT5 token is not kept anywhere
    const saved = (await c.call('GET', '/api/storage/my_journal_accounts_v1')).body.value;
    assert.ok(!saved.includes('obmt5_old_secret_value'));
    let db = openTestDb(srv.dataDir);
    const kvCopy = db.prepare(`SELECT value FROM kv WHERE session_id = ? AND key = 'my_journal_accounts_v1'`).get(uid).value;
    db.close();
    assert.ok(!kvCopy.includes('obmt5_old_secret_value'), 'not in the kv copy either');

    let r = await c.call('POST', '/api/mt5/ea-key', { accountId: 'funded-1', login: '5550001', server: 'Broker-Live' });
    assert.equal(r.status, 201, r.text);
    const first = r.body.key;
    assert.match(first, /^myj_[A-Za-z0-9_-]{40,}$/);
    assert.equal(r.body.allowUrl, 'https://ynloihdiiahlegpkzhae.supabase.co');
    assert.equal(r.body.ingestUrl, 'https://ynloihdiiahlegpkzhae.supabase.co/functions/v1/mt5-ingest');
    r = await c.call('POST', '/api/mt5/ea-key', { accountId: 'funded-1', login: '5550001' });
    const second = r.body.key;
    assert.notEqual(first, second);

    db = openTestDb(srv.dataDir);
    const rows = db.prepare('SELECT key_hash, key_hint, revoked_at, mt5_login FROM ea_keys WHERE user_id = ? ORDER BY created_at').all(uid);
    const dump = JSON.stringify(db.prepare('SELECT * FROM ea_keys').all());
    db.close();
    const hash = k => crypto.createHash('sha256').update(k).digest('hex');
    assert.deepEqual(rows.map(x => x.key_hash), [hash(first), hash(second)]);
    assert.ok(rows[0].revoked_at && !rows[1].revoked_at, 'a new key revokes the old one');
    assert.ok(!dump.includes(first) && !dump.includes(second), 'only hashes are stored');
    assert.equal(rows[1].mt5_login, '5550001');

    r = await c.call('GET', '/api/mt5/ea-keys');
    assert.deepEqual(r.body.keys.map(k => [k.accountId, k.keyHint]), [['funded-1', second.slice(-4)]]);
    assert.ok(!JSON.stringify(r.body).includes(second), 'the list never shows a key');

    assert.equal((await c.call('POST', '/api/mt5/ea-key', { accountId: 'maven-1' })).status, 403);
    assert.equal((await c.call('POST', '/api/mt5/ea-key', { accountId: 'backtest' })).status, 409);
    assert.equal((await c.call('POST', '/api/mt5/ea-key', { accountId: 'nope' })).status, 404);
    assert.equal((await c.call('POST', '/api/mt5/ea-key', { accountId: 'funded-1', login: 'abc' })).status, 400);
    assert.equal((await srv.client().call('POST', '/api/mt5/ea-key', { accountId: 'funded-1' })).status, 401);

    r = await c.call('POST', '/api/mt5/ea-key/revoke', { accountId: 'funded-1' });
    assert.equal(r.body.revoked, 1);
    assert.deepEqual((await c.call('GET', '/api/mt5/ea-keys')).body.keys, []);
  } finally { await srv.stop(); }
});

test('EA keys need the journal on the tables (DATA_STORE=kv: refused with the reason)', { skip: sqliteSkip }, async () => {
  const srv = await startLocalServer({ DATA_STORE: 'kv' });
  try {
    const c = srv.client();
    await c.call('POST', '/api/auth/register', { email: 'eakv@test.local', password: 'password123' });
    await c.call('PUT', '/api/storage/my_journal_accounts_v1', { value: JSON.stringify({ Funded: [{ id: 'funded-1', name: 'F', balance: 1, startingBalance: 1 }] }) });
    const r = await c.call('POST', '/api/mt5/ea-key', { accountId: 'funded-1' });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'EA_KEYS_UNAVAILABLE');
  } finally { await srv.stop(); }
});

// Link MT5 (Render gateway): the EA key is the token; Unlink revokes it.
function harness(issue, { realProxy = false } = {}) {
  const routes = new Map(), values = new Map(), calls = [];
  const app = { post(p, h) { routes.set('POST ' + p, h); }, get(p, h) { routes.set('GET ' + p, h); } };
  // realProxy: like app-entry.js, records of the '__mt5_bridge_tokens_v2' pseudo-user are refused
  const guard = sid => { if (realProxy && sid.startsWith('__')) throw new Error('Unauthenticated storage request'); };
  const storage = {
    getStoredValue: async (sid, k) => { guard(sid); return values.get(sid + '|' + k) ?? null; },
    setStoredValue: async (sid, k, v) => { guard(sid); values.set(sid + '|' + k, v); },
    deleteStoredValue: async (sid, k) => { guard(sid); values.delete(sid + '|' + k); },
    getSessionId: () => 's1',
    issueEaKey: async (sid, body) => { calls.push(['issue', body]); return issue(body); },
    revokeEaKey: async (sid, accountId) => { calls.push(['revoke', accountId]); return { status: 200, body: { ok: true, revoked: 1 } }; },
  };
  registerMt5Routes(app, storage);
  values.set('s1|my_journal_accounts_v1', JSON.stringify({ Funded: [{ id: 'funded-1', name: 'F', balance: 1, startingBalance: 1 }] }));
  const call = async (p, body) => {
    const res = { statusCode: 200, headers: {}, payload: null, setHeader(n, v) { this.headers[n] = v; }, status(c) { this.statusCode = c; return this; }, json(v) { this.payload = v; return this; } };
    await routes.get('POST ' + p)({ body, query: {}, headers: {} }, res);
    return res;
  };
  return { call, calls };
}

test('Link MT5 hands out the EA key as its token; Unlink revokes it', async () => {
  const h = harness(() => ({ status: 201, body: { key: 'myj_issued_key_1234', keyHint: '1234', ingestUrl: 'https://p.supabase.co/functions/v1/mt5-ingest', allowUrl: 'https://p.supabase.co' } }));
  const r = await h.call('/api/mt5/link', { accountId: 'funded-1', mode: 'Funded', login: '5550001', server: 'Broker-Live' });
  assert.equal(r.statusCode, 201);
  assert.equal(r.payload.token, 'myj_issued_key_1234');
  assert.deepEqual(r.payload.eaKey, { keyHint: '1234', ingestUrl: 'https://p.supabase.co/functions/v1/mt5-ingest', allowUrl: 'https://p.supabase.co' });
  assert.deepEqual(h.calls[0], ['issue', { accountId: 'funded-1', login: '5550001', server: 'Broker-Live' }]);
  await h.call('/api/mt5/unlink', { accountId: 'funded-1' });
  assert.deepEqual(h.calls[1], ['revoke', 'funded-1']);

  // not on the tables yet: the bridge still links, and says why direct logging is off
  const off = harness(() => ({ status: 409, body: { error: 'Direct MT5 logging needs the journal on the database tables' } }));
  const r2 = await off.call('/api/mt5/link', { accountId: 'funded-1', mode: 'Funded', login: '5550001', server: 'Broker-Live' });
  assert.equal(r2.statusCode, 201);
  assert.match(r2.payload.token, /^obmt5_/);
  assert.equal(r2.payload.eaKey, null);
  assert.match(r2.payload.eaKeyError, /database tables/);
});

test('Link MT5 through the real gateway proxy: works with an EA key, explains itself without one (was a 500)', async () => {
  const issued = () => ({ status: 201, body: { key: 'myj_issued_key_5678', keyHint: '5678', ingestUrl: 'https://p.supabase.co/functions/v1/mt5-ingest', allowUrl: 'https://p.supabase.co' } });
  const h = harness(issued, { realProxy: true });
  const r = await h.call('/api/mt5/link', { accountId: 'funded-1', mode: 'Funded', login: '5550001', server: 'Broker-Live' });
  assert.equal(r.statusCode, 201, JSON.stringify(r.payload));
  assert.equal(r.payload.token, 'myj_issued_key_5678');
  assert.equal((await h.call('/api/mt5/unlink', { accountId: 'funded-1' })).statusCode, 200);

  const off = harness(() => ({ status: 503, body: { error: 'run migrations/004_edge_functions.sql' } }), { realProxy: true });
  const r2 = await off.call('/api/mt5/link', { accountId: 'funded-1', mode: 'Funded', login: '5550001', server: 'Broker-Live' });
  assert.equal(r2.statusCode, 409);
  assert.equal(r2.payload.code, 'MT5_LINK_UNAVAILABLE');
  assert.match(r2.payload.error, /004_edge_functions/);
});

test('the rules count an MT5 trade with the broker P/L, not R (no stop loss = R 0)', () => {
  const R = globalThis.obRules;
  const acc = { id: 'funded-1', startingBalance: 10000, preset: 'my-rules' };
  const loss = { id: 'mt5-funded-1-1', source: 'mt5', mode: 'Funded', accountId: 'funded-1', date: '2026-11-16', closeTime: '2026-11-16T09:00:00.000Z', rMultiple: 0, pnl: -400 };
  assert.equal(R.pnlOf(loss, acc, { riskPct: 1 }), -400);
  assert.equal(R.pnlOf({ ...loss, source: 'manual' }, acc, { riskPct: 1 }), 0, 'a manual trade still counts in R');
  const s = R.accountState(acc, [loss], { pnlFor: t => R.pnlOf(t, acc, { riskPct: 1 }) });
  assert.equal(s.state, 'blown'); assert.equal(s.breach.kind, 'daily_loss'); assert.equal(s.breach.loss, 400);
  assert.equal(R.brokerPnl({ source: 'mt5', pnl: 'x' }), null);
});
