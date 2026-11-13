import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'account-balance.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(code, sandbox);
const B = sandbox.window.obBalance;
const plain = v => JSON.parse(JSON.stringify(v));

const acc = { id: 'real-1', name: 'Real 01', startingBalance: 100000, balance: 100000 };
const trades = [
  { id: 'a', date: '2026-01-05', rMultiple: 2 },
  { id: 'b', date: '2026-01-06', rMultiple: -1 }
];

test('balance: same R × starting balance × risk % calculation as before when there is no cash', () => {
  const r = B.balance(acc, trades, 1);
  assert.equal(r.balance, 101000); // +1R × $1,000
  assert.equal(r.tradePnl, 1000);
  assert.equal(r.cash, 0);
  assert.equal(r.pct, 1);
  // Old accounts without startingBalance use balance
  assert.equal(B.balance({ id: 'x', balance: 50000 }, [{ rMultiple: 1 }], 2).balance, 51000);
});

test('balance: deposits add and withdrawals subtract from their date on', () => {
  const a = { ...acc, cashMovements: [
    { id: 'd1', type: 'deposit', date: '2026-01-10', amount: 5000, note: 'top up' },
    { id: 'w1', type: 'withdraw', date: '2026-02-01', amount: 2000 },
    { id: 'f1', type: 'deposit', date: '2999-01-01', amount: 9999 } // future: not yet
  ] };
  assert.equal(B.balance(a, trades, 1).balance, 101000 + 5000 - 2000);
  assert.equal(B.balance(a, trades, 1, '2026-01-09').balance, 101000);
  assert.equal(B.balance(a, trades, 1, '2026-01-10').balance, 106000);
  assert.equal(B.balance(a, trades, 1, '2026-01-31').balance, 106000);
  // Return % ignores cash (cash is not trading performance)
  assert.equal(B.balance(a, trades, 1).pct, 1);
  // as-of also limits trades
  assert.equal(B.balance(a, trades, 1, '2026-01-05').balance, 102000);
});

test('equitySeries: dollars, date order, cash on its own date, future cash excluded', () => {
  const a = { ...acc, cashMovements: [
    { type: 'deposit', date: '2026-01-06', amount: 500 },
    { type: 'withdraw', date: '2026-01-01', amount: 100 },
    { type: 'deposit', date: '2999-01-01', amount: 1 }
  ] };
  const s = plain(B.equitySeries(a, [trades[1], trades[0]], 1));
  assert.deepEqual(s.map(p => [p.label, p.equity, p.kind]), [
    ['Start', 100000, 'start'],
    ['2026-01-01', 99900, 'withdraw'],
    ['2026-01-05', 101900, 'trade'],
    ['2026-01-06', 102400, 'deposit'],
    ['2026-01-06', 101400, 'trade']
  ]);
  assert.equal(s[s.length - 1].equity, B.balance(a, trades, 1).balance);
});

test('normalizeMovement rejects bad input; withdraw stored as positive amount', () => {
  assert.equal(B.normalizeMovement({ type: 'deposit', date: 'bad', amount: 5 }), null);
  assert.equal(B.normalizeMovement({ type: 'deposit', date: '2026-01-01', amount: 0 }), null);
  assert.equal(B.normalizeMovement({ type: 'deposit', date: '2026-01-01', amount: 'abc' }), null);
  const m = B.normalizeMovement({ type: 'withdraw', date: '2026-01-01', amount: -250.456, note: 'x' });
  assert.equal(m.amount, 250.46);
  assert.equal(m.type, 'withdraw');
});

test('startingFromCurrent: S + R·S·risk + cash = current', () => {
  const a = { ...acc, cashMovements: [{ type: 'deposit', date: '2026-01-01', amount: 1000 }] };
  const s = B.startingFromCurrent(103000, a, trades, 1); // totalR = 1
  assert.equal(s, 100990.1);
  const check = B.balance({ ...a, startingBalance: s }, trades, 1).balance;
  assert.ok(Math.abs(check - 103000) < 0.02, String(check));
  assert.equal(B.startingFromCurrent(0, a, trades, 1), null);
});

test('normalizeAccount keeps old fields (MT5 etc.) and adds defaults', () => {
  const old = { id: 'demo-1', name: 'Demo 01', balance: 100000, startingBalance: 100000, mt5State: { balance: 5 } };
  const n = plain(B.normalizeAccount(old, 'Demo'));
  assert.equal(n.id, 'demo-1');
  assert.equal(n.type, 'Demo');
  assert.equal(n.status, 'active');
  assert.equal(n.currency, 'USD');
  assert.deepEqual(n.mt5State, { balance: 5 });
  assert.deepEqual(n.cashMovements, []);
  assert.equal(n.profitTarget, null);
});

test('planImport: counts new, duplicate (existing and within file) and invalid; changes nothing', () => {
  const existing = [{ id: 'a' }];
  const file = [{ id: 'a', date: '2026-01-01' }, { id: 'n1', date: '2026-01-02' }, { id: 'n1', date: '2026-01-02' }, { foo: 1 }, null, { id: 'n2', pair: 'EURUSD' }];
  const p = B.planImport(file, existing, t => ({ ...t, id: String(t.id) }));
  assert.equal(p.ok, true);
  assert.equal(p.total, 6);
  assert.equal(p.add, 2);
  assert.equal(p.duplicates, 2);
  assert.equal(p.invalid, 2);
  assert.deepEqual(plain(p.toAdd.map(t => t.id)), ['n1', 'n2']);
  assert.equal(existing.length, 1);
  assert.equal(B.planImport({ nope: 1 }, existing).ok, false);
  assert.equal(B.planImport({ trades: [{ id: 'z', date: '2026-01-01' }] }, existing).add, 1);
});

test('tradesToCSV escapes quotes/commas/newlines and neutralises formulas', () => {
  const csv = B.tradesToCSV([{ id: 't1', mode: 'Real', date: '2026-01-01', pair: 'EURUSD', rMultiple: -1, strategy: 'A, "B"', tags: ['FOMO', 'Scalp'], notes: '<p>line1</p><p>=HYPERLINK("x")</p>', checklist: ['pass', 'fail'] }]);
  const [head, row] = csv.split('\r\n');
  assert.match(head, /^id,mode,accountId,date/);
  assert.match(row, /"A, ""B"""/);
  assert.match(row, /FOMO; Scalp/);
  assert.match(row, /,-1,/);
  assert.match(row, /,1,2,0,/); // 1 of 2 checklist, 0 screenshots
  assert.match(row, /"line1\n=HYPERLINK\(""x""\)"$/);
  const f = B.tradesToCSV([{ id: 't2', pair: '=cmd|calc', rMultiple: 0 }]).split('\r\n')[1];
  assert.match(f, /,'=cmd\|calc,/);
});
