// Part 3 on the server: BLOWN recorded, manual entry blocked (MT5 trades still accepted),
// the BLOWN override (recorded, one trade, post_breach), "Start new run", and Backtest
// (BLOWN shown, never locked).
import test from 'node:test';
import assert from 'node:assert/strict';
import { startLocalServer, sqliteAvailable, openTestDb } from './local-server.js';

const skip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';
const valueOf = r => (r.status === 200 ? JSON.parse(r.body.value) : null);
const today = new Date().toISOString().slice(0, 10);

async function setup(env = {}) {
  const srv = await startLocalServer({ DATA_RECHECK_MS: '0', ...env });
  const c = srv.client();
  const reg = await c.call('POST', '/api/auth/register', { email: 'rules@test.local', password: 'password123' });
  assert.equal(reg.status, 201, reg.text);
  // 1% risk: 1R on a 10,000 account = 100
  await c.call('PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ riskPercent: 1, maxDailyTrades: 10, timezone: 'UTC' }) });
  const accounts = { Funded: [{ id: 'funded-1', name: 'Funded 01', balance: 10000, startingBalance: 10000, preset: 'my-rules' }] };
  await c.call('PUT', '/api/storage/my_journal_accounts_v1', { value: JSON.stringify(accounts) });
  return { srv, c, id: reg.body.user.id, accounts };
}
const breach = { id: 'tr-1794000000000', mode: 'Funded', accountId: 'funded-1', date: '2026-11-10', rMultiple: -3, result: 'Loss' }; // -300 = 3% in a day

async function flow({ srv, c, id, accounts }, { tables }) {
  // a 3% day: the server records BLOWN on the account
  assert.equal((await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([breach]) })).status, 200);
  let acc = valueOf(await c.call('GET', '/api/storage/my_journal_accounts_v1')).Funded[0];
  assert.equal(acc.blown.kind, 'daily_loss'); assert.equal(acc.blown.day, '2026-11-10'); assert.equal(acc.blown.loss, 300);
  if (tables) {
    const db = openTestDb(srv.dataDir);
    assert.equal(db.prepare("SELECT status FROM accounts WHERE user_id = ? AND id = 'funded-1'").get(id).status, 'blown');
    db.close();
  }

  // the app cannot clear it (an older copy without the field) nor add one to another account
  const older = { Funded: [{ ...accounts.Funded[0], name: 'Renamed' }, { id: 'funded-2', name: 'Other', balance: 5000, startingBalance: 5000, blown: { kind: 'x' } }] };
  await c.call('PUT', '/api/storage/my_journal_accounts_v1', { value: JSON.stringify(older) });
  const after = valueOf(await c.call('GET', '/api/storage/my_journal_accounts_v1')).Funded;
  assert.equal(after[0].name, 'Renamed'); assert.equal(after[0].blown.kind, 'daily_loss', 'still BLOWN after an app save');
  assert.equal(after[1].blown, undefined, 'the app cannot set BLOWN');

  // manual entry is blocked
  const manual = { id: 'tr-manual-1', mode: 'Funded', accountId: 'funded-1', date: today, rMultiple: 1, result: 'Win' };
  let r = await c.call('POST', '/api/trades', { trade: manual, mode: 'Funded' });
  assert.equal(r.status, 423); assert.equal(r.body.code, 'ACCOUNT_BLOWN'); assert.equal(r.body.blown.kind, 'daily_loss');
  // an edit of an existing trade is not a new entry
  assert.equal((await c.call('POST', '/api/trades', { trade: { ...breach, notes: 'reviewed' }, mode: 'Funded' })).status, 201);

  // MT5 trades are always accepted (the gateway writes them through the storage PUT)
  const mt5 = { id: 'mt5-555', mt5Ticket: '555', source: 'mt5', mode: 'Funded', accountId: 'funded-1', date: today, rMultiple: -1, pnl: -100, postBreach: true };
  let trades = valueOf(await c.call('GET', '/api/storage/ob-trades'));
  assert.equal((await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([mt5, ...trades]) })).status, 200);
  trades = valueOf(await c.call('GET', '/api/storage/ob-trades'));
  assert.equal(trades.find(t => t.id === 'mt5-555').postBreach, true);
  assert.equal((await c.call('POST', '/api/trades', { trade: { ...mt5, id: 'mt5-556', mt5Ticket: '556' }, mode: 'Funded' })).status, 201, 'never blocked');
  if (tables) {
    const db = openTestDb(srv.dataDir);
    assert.equal(db.prepare("SELECT post_breach FROM trades WHERE user_id = ? AND id = 'mt5-555'").get(id).post_breach, 1);
    db.close();
  }

  // the override: deliberate (typed BLOWN), recorded, one trade, saved with post_breach
  assert.equal((await c.call('POST', '/api/accounts/funded-1/override', { confirm: 'blown' })).status, 400);
  r = await c.call('POST', '/api/accounts/funded-1/override', { confirm: 'BLOWN' });
  assert.equal(r.status, 201, r.text);
  const ovr = r.body.override.id;
  r = await c.call('POST', '/api/trades', { trade: { ...manual, ruleOverride: ovr }, mode: 'Funded' });
  assert.equal(r.status, 201); assert.equal(r.body.postBreach, true);
  assert.equal(valueOf(await c.call('GET', '/api/storage/ob-trades')).find(t => t.id === 'tr-manual-1').postBreach, true);
  r = await c.call('POST', '/api/trades', { trade: { ...manual, id: 'tr-manual-2', ruleOverride: ovr }, mode: 'Funded' });
  assert.equal(r.status, 423, 'an override lets one trade through');
  let log = (await c.call('GET', '/api/rules/log')).body;
  assert.equal(log.overrides.length, 1); assert.equal(log.overrides[0].used_by_trade, 'tr-manual-1'); assert.ok(log.overrides[0].created_at);
  // the records cannot be written by the app
  assert.equal((await c.call('PUT', '/api/storage/ob-rule-overrides', { value: '[]' })).status, 403);
  assert.equal((await c.call('DELETE', '/api/storage/ob-account-runs')).status, 403);

  // Start new run: archived with its reason, BLOWN cleared, run 2 from the new balance
  assert.equal((await c.call('POST', '/api/accounts/funded-1/new-run', { startingBalance: 0 })).status, 400);
  r = await c.call('POST', '/api/accounts/funded-1/new-run', { startingBalance: 12000 });
  assert.equal(r.status, 200, r.text);
  acc = JSON.parse(r.body.accounts).Funded[0];
  assert.equal(acc.blown, undefined); assert.equal(acc.runNumber, 2); assert.equal(acc.startingBalance, 12000); assert.ok(acc.runStartedAt);
  log = (await c.call('GET', '/api/rules/log')).body;
  assert.equal(log.runs.length, 1);
  assert.deepEqual([log.runs[0].run_number, log.runs[0].end_reason, Number(log.runs[0].starting_balance)], [1, 'blown', 10000]);
  // the old run's 3% day no longer counts: manual entry works again
  assert.equal((await c.call('POST', '/api/trades', { trade: { ...manual, id: 'tr-manual-3' }, mode: 'Funded' })).status, 201);
  assert.equal(valueOf(await c.call('GET', '/api/storage/my_journal_accounts_v1')).Funded[0].blown, undefined);
}

test('relational tables: BLOWN, blocked manual entry, MT5 accepted with post_breach, override, new run', { skip }, async () => {
  const ctx = await setup();
  try { await flow(ctx, { tables: true }); } finally { await ctx.srv.stop(); }
});

// Backtest runs to the end: BLOWN is recorded and shown, but never locks entry. Real, Demo and
// Funded keep the hard block. Both accounts are blown by the same kind of day.
async function backtestFlow({ c }) {
  await c.call('PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ riskPercent: 1, maxDailyTrades: 10, timezone: 'UTC', initialCapital: 10000 }) });
  const accounts = {
    Funded: [{ id: 'funded-1', name: 'Funded 01', balance: 10000, startingBalance: 10000, preset: 'my-rules' }],
    Backtest: [{ id: 'bt-1', name: 'Backtest 01', balance: 10000, startingBalance: 10000, preset: 'my-rules' }],
  };
  await c.call('PUT', '/api/storage/my_journal_accounts_v1', { value: JSON.stringify(accounts) });
  const btBreach = { id: 'tr-1794000000001', mode: 'Backtest', date: '2026-11-10', rMultiple: -3, result: 'Loss' }; // -300 = 3% in a day
  await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([breach, btBreach]) });
  const doc = valueOf(await c.call('GET', '/api/storage/my_journal_accounts_v1'));
  assert.equal(doc.Funded[0].blown.kind, 'daily_loss');
  assert.equal(doc.Backtest[0].blown.kind, 'daily_loss', 'a Backtest account is still recorded as BLOWN');

  // Funded: hard block, as before
  const r = await c.call('POST', '/api/trades', { trade: { id: 'tr-f-1', mode: 'Funded', accountId: 'funded-1', date: today, rMultiple: 1 }, mode: 'Funded' });
  assert.equal(r.status, 423); assert.equal(r.body.code, 'ACCOUNT_BLOWN');

  // Backtest: no lock, no override, saved and marked as after the breach
  const bt = await c.call('POST', '/api/trades', { trade: { id: 'tr-bt-1', mode: 'Backtest', date: today, rMultiple: 1 }, mode: 'Backtest' });
  assert.equal(bt.status, 201, bt.text); assert.equal(bt.body.postBreach, true);
  assert.equal(valueOf(await c.call('GET', '/api/storage/ob-trades')).find(t => t.id === 'tr-bt-1').postBreach, true);
  const bt2 = await c.call('POST', '/api/trades', { trade: { id: 'tr-bt-2', mode: 'Backtest', date: today, rMultiple: -1 }, mode: 'Backtest' });
  assert.equal(bt2.status, 201, 'every later Backtest trade goes through too');
  assert.equal((await c.call('POST', '/api/accounts/bt-1/override', { confirm: 'BLOWN' })).status, 409, 'no override for a Backtest');
  assert.equal((await c.call('GET', '/api/rules/log')).body.overrides.length, 0, 'nothing is counted as an override');
  assert.ok(valueOf(await c.call('GET', '/api/storage/my_journal_accounts_v1')).Backtest[0].blown, 'still shown as BLOWN');
}

test('Backtest: BLOWN is recorded but never blocks a manual trade; Funded still does', { skip }, async () => {
  const ctx = await setup();
  try { await backtestFlow(ctx); } finally { await ctx.srv.stop(); }
});

test('DATA_STORE=kv: the same rules, runs and overrides kept in kv', { skip }, async () => {
  const ctx = await setup({ DATA_STORE: 'kv' });
  try {
    await flow(ctx, { tables: false });
    const db = openTestDb(ctx.srv.dataDir);
    assert.equal(JSON.parse(db.prepare("SELECT value FROM kv WHERE session_id = ? AND key = 'ob-account-runs'").get(ctx.id).value).length, 1);
    db.close();
  } finally { await ctx.srv.stop(); }
});
