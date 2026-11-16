// Part 1: the pure mapping between the app's documents and relational rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tradesDocToRows, rowsToTradesDoc, accountsDocToRows, rowsToAccountsDoc, stripSecrets, findSecrets,
  mergeTradeCopies, applyMigrationFixes, idTimestamp, BACKTEST_ACCOUNT_ID,
} from '../relational-core.js';

const shot = n => `/api/shots/${String(n).repeat(32).slice(0, 32)}.png`;
const TRADES = [
  { id: 'tr-1794685321742', mode: 'Backtest', accountId: null, date: '2025-11-12', pair: 'XAUUSD', direction: 'SHORT', result: 'Win', rMultiple: 7, strategy: 'Model OB',
    notes: '<p>note</p>', checklist: ['pass', 'fail', 'notset'], tags: ['A'], screenshots: [shot(1), shot(2)], pnl: null, openTime: null, closeTime: null, mt5Ticket: null },
  { id: 'tr-1789629548555', mode: 'Demo', accountId: 'demo-x', date: '2026-09-01', pair: 'BTCUSD', rMultiple: -1, screenshots: [] },
  { id: 'tr-3', mode: 'Real', accountId: 'real-1', date: '2026-11-13', rMultiple: '2', pnl: 412.5, // a string R stays a string
    openTime: '2026-11-13T08:00:00.000Z', closeTime: '2026-11-13 10:00', source: 'mt5', mt5Ticket: 123456, postBreach: true,
    screenshots: [shot(3), 'data:image/png;base64,iVBORw0KGgo=', shot(4)], nested: { b: 1, a: [1, { z: 2, y: 3 }] } },
  { id: 'tr-4', mode: 'Backtest' }, // no accountId field, nothing else
];

test('trades: document → rows → document is identical (values, order, odd types)', () => {
  const { rows, attachments } = tradesDocToRows(JSON.stringify(TRADES), 'u1');
  assert.equal(rows.length, 4);
  assert.equal(attachments.length, 4, 'only file references become attachment rows');
  assert.deepEqual(attachments.map(a => [a.trade_id, a.position, a.storage_path]), [
    ['tr-1794685321742', 0, `u1/${shot(1).slice(11)}`], ['tr-1794685321742', 1, `u1/${shot(2).slice(11)}`],
    ['tr-3', 0, `u1/${shot(3).slice(11)}`], ['tr-3', 2, `u1/${shot(4).slice(11)}`]]);
  const t3 = rows.find(r => r.id === 'tr-3');
  assert.equal(t3.r_multiple, null, 'a string R is not forced into the numeric column');
  assert.equal(t3.extra.rMultiple, '2');
  assert.equal(t3.close_time, null, 'a non-ISO time is kept as text in extra, not reinterpreted');
  assert.equal(t3.mt5_ticket, null); assert.equal(t3.extra.mt5Ticket, 123456);
  assert.equal(t3.post_breach, true);
  assert.equal(rowsToTradesDoc(rows, attachments), JSON.stringify(TRADES));
  // rows come back in any order (and attachments too): position restores the list order
  assert.equal(rowsToTradesDoc(rows.slice().reverse(), attachments.slice().reverse()), JSON.stringify(TRADES));
});

test('trades: values as a database returns them (numeric as text, 0/1 booleans, timestamps) still round-trip', () => {
  const { rows, attachments } = tradesDocToRows(TRADES, 'u1');
  const asDb = rows.map(r => ({ ...r, extra: JSON.stringify(r.extra), r_multiple: r.r_multiple === null ? null : String(r.r_multiple), pnl: r.pnl === null ? null : String(r.pnl),
    post_breach: r.post_breach ? 1 : 0, open_time: r.open_time && r.open_time.replace('Z', '+00:00') }));
  assert.equal(rowsToTradesDoc(asDb, attachments), JSON.stringify(TRADES));
});

test('trades: rejects documents the tables cannot hold safely', () => {
  assert.throws(() => tradesDocToRows('{"a":1}', 'u1'), /JSON array/);
  assert.throws(() => tradesDocToRows('[{"mode":"Real"}]', 'u1'), /no id/);
  assert.throws(() => tradesDocToRows('[{"id":"a"},{"id":"a"}]', 'u1'), /duplicate trade id/);
});

test('accounts: round trip, Backtest type, needs_verification only for the 100,000 default', () => {
  const doc = { Demo: [{ id: 'demo-1789645058794', name: 'Demo 1', balance: 5000.37, startingBalance: 5000 }],
    Real: [{ id: 'real-1', name: 'Real 01', balance: 100000, startingBalance: 100000, cashMovements: [{ id: 'c1', type: 'deposit', date: '2026-10-20', amount: 2000 }] }],
    Funded: [{ id: 'funded-1', name: 'Funded 01', balance: 100000, startingBalance: 100000, status: 'archived' }],
    Backtest: [{ id: 'backtest', name: 'Backtest', balance: 1000, startingBalance: 1000 }] };
  const rows = accountsDocToRows(doc, 'u1');
  assert.deepEqual(rows.map(r => [r.id, r.type, r.needs_verification, r.status]),
    [['demo-1789645058794', 'demo', false, 'active'], ['real-1', 'real', true, 'active'], ['funded-1', 'funded', true, 'archived'], ['backtest', 'backtest', false, 'active']]);
  assert.equal(rows[0].created_at, idTimestamp('demo-1789645058794'));
  const back = JSON.parse(rowsToAccountsDoc(rows));
  assert.equal(back.Real[0].needsVerification, true);
  delete back.Real[0].needsVerification; delete back.Funded[0].needsVerification;
  assert.deepEqual(back, doc);
});

test('accounts: the flag is kept when the app omits it and cleared only by an explicit false', () => {
  const doc = { Real: [{ id: 'real-1', name: 'Real 01', balance: 100000, startingBalance: 100000 }] };
  const first = accountsDocToRows(doc, 'u1');
  const edited = { Real: [{ id: 'real-1', name: 'Renamed', balance: 100000, startingBalance: 90000 }] };
  assert.equal(accountsDocToRows(edited, 'u1', first)[0].needs_verification, true, 'an edit without the field keeps the flag');
  const confirmed = { Real: [{ ...doc.Real[0], needsVerification: false }] };
  const after = accountsDocToRows(confirmed, 'u1', first);
  assert.equal(after[0].needs_verification, false);
  assert.equal(accountsDocToRows(doc, 'u1', after)[0].needs_verification, false, 'once confirmed it stays confirmed');
  assert.equal(JSON.parse(rowsToAccountsDoc(after)).Real[0].needsVerification, false);
});

test('accounts: secrets never reach a row; MT5 login and server are kept', () => {
  const doc = { Demo: [{ id: 'demo-3', name: 'Demo 3', balance: 5000, startingBalance: 100000,
    mt5: { linked: true, login: '10000001', server: 'Broker-Demo1', token: 'obmt5_SECRET', label: 'x' }, apiKey: 'k', nested: [{ password: 'p', ok: 1 }] }] };
  assert.deepEqual(findSecrets(doc), ['.Demo[0].mt5.token', '.Demo[0].apiKey', '.Demo[0].nested[0].password']);
  const [row] = accountsDocToRows(doc, 'u1');
  assert.equal(row.mt5_login, '10000001'); assert.equal(row.mt5_server, 'Broker-Demo1');
  const text = JSON.stringify(row);
  assert.ok(!/SECRET|"k"|"p"/.test(text), 'no secret value anywhere in the row: ' + text);
  assert.deepEqual(stripSecrets({ a: { token: 1, b: 2 } }), { a: { b: 2 } });
});

test('merge: richest non-null value per field; every disagreement and missing trade is reported', () => {
  const kv = [{ id: 'a', notes: 'short', tags: ['x'], pnl: null }, { id: 'b', r: 1 }];
  const b1 = [{ id: 'a', notes: 'a much longer note', tags: ['x'], pnl: 5 }, { id: 'c', r: 2 }];
  const b2 = [{ id: 'a', notes: 'short', tags: ['x', 'y'], pnl: null }, { id: 'b', r: 1 }];
  const m = mergeTradeCopies([{ name: 'kv', trades: kv }, { name: 'b1', trades: b1 }, { name: 'b2', trades: b2 }]);
  assert.deepEqual(m.trades.map(t => t.id), ['a', 'b', 'c']);
  assert.deepEqual(m.trades[0], { id: 'a', notes: 'a much longer note', tags: ['x', 'y'], pnl: 5 });
  assert.deepEqual(m.conflicts.map(c => [c.id, c.field, c.kept]), [['a', 'notes', 'b1'], ['a', 'tags', 'b2']]);
  assert.deepEqual(m.presence, [{ id: 'b', in: ['kv', 'b2'] }, { id: 'c', in: ['b1'] }]);
});

test('migration fixes: Backtest account and trades, repointed orphan, unresolved when ambiguous', () => {
  const trades = [
    { id: 't1', mode: 'Backtest', accountId: null }, { id: 't2', mode: 'Backtest' },
    { id: 't3', mode: 'Demo', accountId: 'demo-missing' }, { id: 't4', mode: 'Real', accountId: 'real-missing' },
    { id: 't5', mode: 'Real', accountId: 'real-1' }];
  const accounts = { Demo: [{ id: 'demo-1' }], Real: [{ id: 'real-1' }, { id: 'real-2' }] };
  const out = applyMigrationFixes(trades, accounts, { backtestStartingBalance: 1000 });
  assert.deepEqual(out.accountsDoc.Backtest, [{ id: BACKTEST_ACCOUNT_ID, name: 'Backtest', balance: 1000, startingBalance: 1000 }]);
  assert.deepEqual(out.trades.map(t => t.accountId), ['backtest', 'backtest', 'demo-1', 'real-missing', 'real-1']);
  assert.deepEqual(out.report.backtestTradesAttached, [{ id: 't1', had: 'null' }, { id: 't2', had: 'no field' }]);
  assert.deepEqual(out.report.repointed.map(r => [r.id, r.from, r.to]), [['t3', 'demo-missing', 'demo-1']]);
  assert.deepEqual(out.report.unresolved.map(r => r.id), ['t4'], 'two Real accounts: never guessed');
  assert.equal(accounts.Backtest, undefined, 'the input is not modified');
});
