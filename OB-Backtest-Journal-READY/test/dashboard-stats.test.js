import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard-stats.js'), 'utf8'), sandbox);
const D = sandbox.window.obDashStats;
const pnl = t => t.rMultiple * 1000; // R × $100k × 1 %

const trades = [
  { id: 'a', date: '2026-11-02', pair: 'XAUUSD', strategy: 'A', direction: 'LONG', result: 'Win', rMultiple: 2 },
  { id: 'b', date: '2026-11-03', pair: 'XAUUSD', strategy: 'A', direction: 'SHORT', result: 'Loss', rMultiple: -1 },
  { id: 'c', date: '2026-11-04', pair: 'EURUSD', strategy: 'B', direction: 'LONG', result: 'Loss', rMultiple: -1 },
  { id: 'd', date: '2026-11-05', pair: 'EURUSD', strategy: 'B', direction: 'LONG', result: 'BE', rMultiple: 0 },
  { id: 'e', date: '2026-11-06', pair: 'XAUUSD', strategy: 'B', direction: 'LONG', result: 'Win', rMultiple: 3 }
];

test('summary: P&L, win rate, profit factor, R:R, breakdown', () => {
  const s = D.summary(trades, pnl);
  assert.equal(s.trades, 5);
  assert.deepEqual([s.wins, s.losses, s.breakeven], [2, 2, 1]);
  assert.equal(s.winRate, 40);
  assert.equal(s.net, 3000);
  assert.equal(s.grossProfit, 5000);
  assert.equal(s.grossLoss, -2000);
  assert.equal(s.profitFactor, 2.5);
  assert.equal(s.avgWin, 2500);
  assert.equal(s.avgLoss, -1000);
  assert.equal(s.riskReward, 2.5);
  assert.equal(s.avgR, 0.6);
  assert.equal(s.best.trade.id, 'e');
  assert.equal(s.worst.trade.id, 'b'); // first of the equal worst trades
  assert.equal(s.maxDrawdown, -2000);  // +2000 → 0
  assert.equal(s.mostTradedPair.pair, 'XAUUSD');
  assert.equal(s.bestStrategy.strategy, 'B');
  assert.equal(s.bestStrategy.net, 2000);
  assert.equal(s.worstStrategy.strategy, 'A');
});

test('summary: empty and wins-only edge cases', () => {
  const e = D.summary([], pnl);
  assert.equal(e.trades, 0);
  assert.equal(e.net, 0);
  assert.equal(e.profitFactor, 0);
  assert.equal(e.riskReward, null);
  assert.equal(e.best, null);
  const w = D.summary([trades[0]], pnl);
  assert.equal(w.profitFactor, Infinity);
  assert.equal(w.worstStrategy, null);
});

test('ranges, filters, daily map', () => {
  assert.deepEqual([...D.rangeBounds('7d', '2026-11-13')], ['2026-11-07', '2026-11-13']);
  assert.deepEqual([...D.rangeBounds('month', '2026-11-13')], ['2026-11-01', '2026-11-13']);
  assert.deepEqual([...D.rangeBounds('ytd', '2026-11-13')], ['2026-01-01', '2026-11-13']);
  assert.deepEqual([...D.rangeBounds('30d', '2026-03-01')], ['2026-01-31', '2026-03-01']);
  assert.deepEqual([...D.rangeBounds('all', '2026-11-13')], ['', '']);
  assert.equal(trades.filter(t => D.inBounds(t, ['2026-11-03', '2026-11-04'])).length, 2);
  assert.equal(D.applyFilter(trades, { pair: 'XAUUSD', side: 'LONG' }).length, 2);
  assert.equal(D.applyFilter(trades, {}).length, 5);
  const d = D.daily(trades, pnl);
  assert.deepEqual(JSON.parse(JSON.stringify(d['2026-11-02'])), { pnl: 2000, count: 1 });
});
