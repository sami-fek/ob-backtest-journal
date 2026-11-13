/**
 * dashboard-stats.js — numbers for the Dashboard (pure functions, no DOM).
 * Dollar values always come from the pnlFor(trade) passed in, which is the
 * app's one R → $ calculation (R × account starting balance × risk %), so the
 * Dashboard agrees with the calendar and the balance card.
 *
 * Loaded as window.obDashStats; tests: test/dashboard-stats.test.js.
 */
(function (root) {
  'use strict';
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const RANGES = [
    { id: '7d', label: 'Last 7 days' }, { id: '30d', label: 'Last 30 days' }, { id: '90d', label: 'Last 90 days' },
    { id: 'month', label: 'This month' }, { id: 'ytd', label: 'Year to date' }, { id: 'all', label: 'All time' }
  ];
  /** [fromIso, toIso] for a range id relative to todayIso ('' = open). */
  function rangeBounds(id, todayIso) {
    const [y, m, d] = String(todayIso).split('-').map(Number);
    const today = new Date(y, m - 1, d);
    const back = n => { const x = new Date(today); x.setDate(x.getDate() - (n - 1)); return iso(x); };
    switch (id) {
      case '7d': return [back(7), todayIso];
      case '30d': return [back(30), todayIso];
      case '90d': return [back(90), todayIso];
      case 'month': return [todayIso.slice(0, 8) + '01', todayIso];
      case 'ytd': return [todayIso.slice(0, 5) + '01-01', todayIso];
      default: return ['', ''];
    }
  }
  function inBounds(t, [from, to]) {
    const dt = String(t.date || '').slice(0, 10);
    return (!from || dt >= from) && (!to || dt <= to);
  }
  function applyFilter(list, f) {
    f = f || {};
    return list.filter(t =>
      (!f.pair || t.pair === f.pair) && (!f.strategy || t.strategy === f.strategy) &&
      (!f.side || t.direction === f.side) && (!f.result || t.result === f.result));
  }

  /**
   * trades: already scoped (mode/account, range, filter). pnlFor: trade → $.
   */
  function summary(trades, pnlFor) {
    const list = (Array.isArray(trades) ? trades : []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const $ = t => num(pnlFor(t));
    const wins = list.filter(t => t.result === 'Win');
    const losses = list.filter(t => t.result === 'Loss');
    const bes = list.length - wins.length - losses.length;
    const winR = wins.reduce((s, t) => s + num(t.rMultiple), 0);
    const lossR = losses.reduce((s, t) => s + num(t.rMultiple), 0);
    const grossProfit = list.reduce((s, t) => s + Math.max(0, $(t)), 0);
    const grossLoss = list.reduce((s, t) => s + Math.min(0, $(t)), 0);
    const net = grossProfit + grossLoss;
    const avgWinR = wins.length ? winR / wins.length : 0;
    const avgLossR = losses.length ? lossR / losses.length : 0;
    const totalR = list.reduce((s, t) => s + num(t.rMultiple), 0);
    let best = null, worst = null;
    list.forEach(t => { const v = $(t); if (!best || v > $(best)) best = t; if (!worst || v < $(worst)) worst = t; });
    // Max drawdown of the cumulative trade P&L (peak → trough), in $.
    let eq = 0, peak = 0, maxDD = 0;
    list.forEach(t => { eq += $(t); peak = Math.max(peak, eq); maxDD = Math.min(maxDD, eq - peak); });
    const pairCount = {};
    list.forEach(t => { if (t.pair) pairCount[t.pair] = (pairCount[t.pair] || 0) + 1; });
    const mostPair = Object.entries(pairCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
    const byStrategy = {};
    list.forEach(t => {
      const k = t.strategy || '—';
      (byStrategy[k] = byStrategy[k] || { strategy: k, trades: 0, wins: 0, net: 0, r: 0 });
      byStrategy[k].trades++; byStrategy[k].net += $(t); byStrategy[k].r += num(t.rMultiple);
      if (t.result === 'Win') byStrategy[k].wins++;
    });
    const strategies = Object.values(byStrategy).sort((a, b) => b.net - a.net);
    return {
      trades: list.length, wins: wins.length, losses: losses.length, breakeven: bes,
      winRate: list.length ? (wins.length / list.length) * 100 : 0,
      net, grossProfit, grossLoss,
      profitFactor: grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : (grossProfit > 0 ? Infinity : 0),
      avgWin: wins.length ? wins.reduce((s, t) => s + $(t), 0) / wins.length : 0,
      avgLoss: losses.length ? losses.reduce((s, t) => s + $(t), 0) / losses.length : 0,
      avgWinR, avgLossR,
      riskReward: avgLossR < 0 ? avgWinR / Math.abs(avgLossR) : null,
      avgR: list.length ? totalR / list.length : 0, totalR,
      best: best ? { trade: best, pnl: $(best) } : null,
      worst: worst ? { trade: worst, pnl: $(worst) } : null,
      maxDrawdown: maxDD,
      mostTradedPair: mostPair ? { pair: mostPair[0], trades: mostPair[1] } : null,
      strategies,
      bestStrategy: strategies[0] || null,
      worstStrategy: strategies.length > 1 ? strategies[strategies.length - 1] : null
    };
  }

  /** Daily P&L map { iso: { pnl, count } } */
  function daily(trades, pnlFor) {
    const out = {};
    (trades || []).forEach(t => {
      const d = String(t.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      (out[d] = out[d] || { pnl: 0, count: 0 });
      out[d].pnl += num(pnlFor(t)); out[d].count++;
    });
    return out;
  }

  root.obDashStats = { RANGES, rangeBounds, inBounds, applyFilter, summary, daily };
})(typeof window !== 'undefined' ? window : globalThis);
