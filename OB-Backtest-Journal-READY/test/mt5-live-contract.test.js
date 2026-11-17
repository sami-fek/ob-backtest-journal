// GET /api/mt5/live must return exactly the fields in test/fixtures/mt5-live-contract.js, the
// same contract the browser checks build their fake answers from (qa/check-positions.mjs,
// qa/check-equity.mjs). And the browser code must not read a field that is not in it.
// So a fake can never show the page something the real endpoint does not send.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalServer, sqliteAvailable, openTestDb } from './local-server.js';
import { LIVE_ANSWER_FIELDS, LIVE_ACCOUNT_FIELDS, LIVE_POSITION_FIELDS, contractProblems, liveAccount, liveAnswer, livePosition } from './fixtures/mt5-live-contract.js';
import '../public/time-prefs.js';
import '../public/rule-presets.js';

const skip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iso = ms => new Date(ms).toISOString();

test('the real /api/mt5/live answers with exactly the contract fields and types', { skip }, async () => {
  const srv = await startLocalServer({ DATA_RECHECK_MS: '0' });
  try {
    const c = srv.client();
    const uid = (await c.call('POST', '/api/auth/register', { email: 'contract@test.local', password: 'password123' })).body.user.id;
    await c.call('PUT', '/api/storage/my_journal_accounts_v1', { value: JSON.stringify({ Funded: [
      { id: 'funded-1', name: 'FTMO', balance: 10000, startingBalance: 10000, preset: 'ftmo', resetTimezone: 'UTC' },
      { id: 'funded-2', name: 'Key only', balance: 5000, startingBalance: 5000 },
    ] }) });
    const now = Date.now();
    const dayStart = globalThis.obRules.dayStartUtc(globalThis.obRules.dayOf(now, 'UTC'), 'UTC');
    const db = openTestDb(srv.dataDir);
    const snap = db.prepare('INSERT INTO equity_snapshots (user_id, account_id, equity, balance, server_offset_minutes, taken_at) VALUES (?,?,?,?,?,?)');
    snap.run(uid, 'funded-1', 10000, 10000, 0, iso(dayStart + 20_000));
    snap.run(uid, 'funded-1', 9900, 10000, 0, iso(now - 15_000));
    const key = db.prepare('INSERT INTO ea_keys (key_hash, user_id, account_id, key_hint, created_at, last_used_at, last_server_offset_minutes) VALUES (?,?,?,?,?,?,?)');
    key.run('a'.repeat(64), uid, 'funded-1', 'abcd', iso(now - 86_400_000), iso(now - 15_000), 0);
    key.run('b'.repeat(64), uid, 'funded-2', 'efgh', iso(now - 86_400_000), null, null);
    db.prepare(`INSERT INTO mt5_positions (user_id, account_id, ticket, symbol, direction, volume, open_time, open_price, current_price, sl, tp, profit, swap, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(uid, 'funded-1', '5001', 'EURUSD', 'Sell', 0.5, iso(now - 3_600_000), 1.085, 1.0875, 1.09, 1.075, -12.5, -0.4, iso(now - 15_000));
    db.close();

    const r = await c.call('GET', '/api/mt5/live');
    assert.equal(r.status, 200);
    const problems = contractProblems(r.body, LIVE_ANSWER_FIELDS, 'answer');
    for (const [id, a] of Object.entries(r.body.accounts)) {
      problems.push(...contractProblems(a, LIVE_ACCOUNT_FIELDS, `accounts.${id}`));
      for (const [i, p] of (a.positions || []).entries()) problems.push(...contractProblems(p, LIVE_POSITION_FIELDS, `accounts.${id}.positions[${i}]`));
    }
    assert.deepEqual(problems, [], 'the real answer and the contract differ');
    // every contract field was really exercised with a value, not only null
    const full = r.body.accounts['funded-1'];
    for (const k of Object.keys(LIVE_ACCOUNT_FIELDS)) assert.notEqual(full[k], null, `funded-1.${k} should have a value in this test`);
    for (const k of Object.keys(LIVE_POSITION_FIELDS)) assert.notEqual(full.positions[0][k], null, `position.${k} should have a value in this test`);
    assert.equal(full.dayStartEquity, 10000); assert.equal(full.dayMinEquity, 9900); assert.equal(full.stale, false);
    // an account with a key but no report yet: the same fields, mostly null
    assert.deepEqual(contractProblems(r.body.accounts['funded-2'], LIVE_ACCOUNT_FIELDS, 'funded-2'), []);
    assert.equal(r.body.accounts['funded-2'].takenAt, null);
  } finally { await srv.stop(); }
});

test('the fake builders refuse anything the real endpoint does not send', () => {
  assert.throws(() => liveAccount({ equtiy: 9000 }), /account\.equtiy is not in the contract/);
  assert.throws(() => liveAccount({ takenAt: 'yesterday' }), /account\.takenAt = "yesterday" is not iso\|null/);
  assert.throws(() => livePosition({ pnl: 5 }), /position\.pnl is not in the contract/);
  assert.throws(() => liveAccount({ positions: [{ ticket: 5001 }] }), /position\.ticket = 5001 is not string/);
  const a = liveAccount({ equity: 9900, takenAt: new Date().toISOString(), stale: false, positions: [{}] });
  assert.equal(liveAnswer({ x: a }).accounts.x.positions[0].ticket, '5001');
});

test('the browser code reads no /api/mt5/live field outside the contract', () => {
  const read = (file, re) => [...fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8').matchAll(re)].map(m => m[1]);
  const notFields = new Set(['length', 'some', 'js']); // `live` is also a list of accounts in some files
  const accountReads = ['mt5-live.js', 'mt5-integration-ui.js', 'dashboard.js', 'account-center.js', 'rule-status.js']
    .flatMap(f => read(f, /\blive\.([a-zA-Z]+)/g).filter(k => !notFields.has(k)).map(k => [f, k]));
  const unknown = accountReads.filter(([, k]) => !(k in LIVE_ACCOUNT_FIELDS));
  assert.deepEqual(unknown, [], 'the page reads an account field the server does not send');
  // rule-presets.js liveEquity(eq) reads the equity fields
  const liveEquity = fs.readFileSync(path.join(__dirname, '..', 'public', 'rule-presets.js'), 'utf8').match(/function liveEquity[\s\S]*?\n {2}}/)[0];
  const eqReads = [...liveEquity.matchAll(/\beq\.([a-zA-Z]+)/g)].map(m => m[1]);
  assert.ok(eqReads.length >= 5);
  assert.deepEqual(eqReads.filter(k => !(k in LIVE_ACCOUNT_FIELDS)), []);
  // the positions table in mt5-live.js
  const posReads = read('mt5-live.js', /\bp\.([a-zA-Z]+)/g);
  assert.ok(posReads.length >= 8);
  assert.deepEqual(posReads.filter(k => !(k in LIVE_POSITION_FIELDS)), [], 'the positions table reads a field the server does not send');
});
