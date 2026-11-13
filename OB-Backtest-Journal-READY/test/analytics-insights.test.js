import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'analytics-insights.js'), 'utf8'), sandbox);
const A = sandbox.window.obAnalyticsInsights;

const T = (id, date, result, r, checklist) => ({ id, date, result, rMultiple: r, checklist });

test('rulesSplit: checklist >= 50% counts as followed, < 50% as broken, no checklist left out', () => {
  const list = [
    T('a', '2026-11-01', 'Win', 2, ['pass', 'pass', 'fail', 'notset']),   // 50% → followed
    T('b', '2026-11-02', 'Loss', -1, ['pass', 'fail', 'fail', 'notset']), // 25% → broken
    T('c', '2026-11-03', 'Win', 1, ['pass', 'pass']),                      // 100% → followed
    T('d', '2026-11-04', 'Loss', -1, []),                                  // no checklist
    T('e', '2026-11-05', 'Loss', -1, ['fail'])                             // 0% → broken
  ];
  const s = A.rulesSplit(list);
  assert.equal(s.followed.trades, 2);
  assert.equal(s.followed.winRate, 100);
  assert.equal(s.followed.avgR, 1.5);
  assert.equal(s.broken.trades, 2);
  assert.equal(s.broken.winRate, 0);
  assert.equal(s.broken.avgR, -1);
  assert.equal(s.unknown, 1);
  // totalFor: the strategy has 6 items but only 2 statuses were stored → 2/6 < 50%
  const s2 = A.rulesSplit([T('x', '2026-11-01', 'Win', 1, ['pass', 'pass'])], () => 6);
  assert.equal(s2.broken.trades, 1);
  assert.equal(s2.followed.trades, 0);
  assert.equal(s2.followed.winRate, null);
});

test('afterLosses: next trade after 1, 2, 3 losses in a row (time order, not list order)', () => {
  // stored newest first, like the app
  const list = [
    T('8', '2026-11-08', 'Win', 2),
    T('7', '2026-11-07', 'Loss', -1),
    T('6', '2026-11-06', 'Loss', -1),
    T('5', '2026-11-05', 'Loss', -1),
    T('4', '2026-11-04', 'Win', 1),
    T('3', '2026-11-03', 'Loss', -1),
    T('2', '2026-11-02', 'Loss', -1),
    T('1', '2026-11-01', 'Win', 3)
  ];
  const [k1, k2, k3] = A.afterLosses(list);
  // after ≥1 loss: trades 3 (after 2), 4 (after 3), 6, 7, 8
  assert.equal(k1.trades, 5);
  assert.equal(k1.wins, 2);
  // after ≥2 losses: 4 (after 2,3), 7 (after 5,6), 8 (after 5,6,7)
  assert.equal(k2.trades, 3);
  assert.equal(k2.wins, 2);
  assert.ok(Math.abs(k2.avgR - (1 - 1 + 2) / 3) < 1e-9);
  // after ≥3 losses: only 8
  assert.equal(k3.trades, 1);
  assert.equal(k3.winRate, 100);
  assert.equal(A.afterLosses([])[0].trades, 0);
});

test('rHistogram: 0.5R bins, end bins collect the tails', () => {
  const bins = A.rHistogram([{ rMultiple: -1 }, { rMultiple: -1 }, { rMultiple: 0 }, { rMultiple: 2.4 }, { rMultiple: -9 }, { rMultiple: 12 }, { rMultiple: 5 }]);
  assert.equal(bins.length, 16);
  const at = r => bins.find(b => r >= b.from && r < b.to);
  assert.equal(at(-1).count, 2);
  assert.equal(at(0).count, 1);
  assert.equal(at(2.4).count, 1);
  assert.equal(bins[0].count, 1);                 // -9 → first bin
  assert.equal(bins[bins.length - 1].count, 2);   // 12 and 5 → last bin
  assert.equal(bins.reduce((s, b) => s + b.count, 0), 7);
  assert.equal(bins[0].label, '≤ -2.5R');
  assert.equal(bins[bins.length - 1].label, '≥ +4.5R');
});

test('drawdown: depth and duration from the running peak', () => {
  const list = [
    T('1', '2026-11-01', 'Win', 2),   // cum 2 (peak)
    T('2', '2026-11-02', 'Loss', -1), // 1  dd -1
    T('3', '2026-11-05', 'Loss', -1), // 0  dd -2
    T('4', '2026-11-06', 'Win', 3),   // 3  new peak
    T('5', '2026-11-07', 'Loss', -1)  // 2  dd -1
  ];
  const d = A.drawdown(list);
  assert.equal(d.maxDepth, -2);
  assert.equal(d.maxDurationTrades, 2);
  assert.equal(d.maxDurationDays, 4); // Nov 1 → Nov 5
  assert.equal(d.points.length, 5);
  assert.equal(JSON.stringify(d.points.map(p => p.dd)), JSON.stringify([0, -1, -2, 0, -1]));
  assert.equal(d.current.depth, -1);
  assert.equal(d.current.trades, 1);
  assert.equal(d.current.recovered, false);
  // starts with a loss: the peak is the 0 start
  const d2 = A.drawdown([T('a', '2026-11-01', 'Loss', -1), T('b', '2026-11-02', 'Win', 2)]);
  assert.equal(d2.maxDepth, -1);
  assert.equal(d2.current.recovered, true);
  assert.equal(A.drawdown([]).maxDepth, 0);
});

test('reliability: under 30 trades is not yet reliable', () => {
  assert.equal(A.reliability(12).reliable, false);
  assert.equal(A.reliability(12).need, 18);
  assert.equal(A.reliability(30).reliable, true);
  assert.equal(A.reliability(undefined).n, 0);
});
