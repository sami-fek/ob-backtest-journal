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

  const byDate = list => (Array.isArray(list) ? list : []).map((t, i) => ({ t, i }))
    .sort((a, b) => String(a.t.date || '').slice(0, 10).localeCompare(String(b.t.date || '').slice(0, 10)) || a.i - b.i)
    .map(x => x.t);

  /**
   * Current win/loss streak (newest trades last by date; same-day trades keep
   * their logged order). A breakeven trade ends a streak.
   * → { kind: 'Win' | 'Loss' | null, count, recent: ['Win'|'Loss'|'BE', …] (oldest → newest, max `keep`),
   *     longestWin, longestLoss }
   */
  function streak(list, keep = 12) {
    const sorted = byDate(list);
    const res = sorted.map(t => (t.result === 'Win' || t.result === 'Loss') ? t.result : 'BE');
    let kind = null, count = 0;
    const last = res[res.length - 1];
    if (last === 'Win' || last === 'Loss') {
      kind = last;
      for (let i = res.length - 1; i >= 0 && res[i] === last; i--) count++;
    }
    let longestWin = 0, longestLoss = 0, run = 0, prev = null;
    res.forEach(r => {
      run = r === prev ? run + 1 : 1; prev = r;
      if (r === 'Win') longestWin = Math.max(longestWin, run);
      if (r === 'Loss') longestLoss = Math.max(longestLoss, run);
    });
    return { kind, count, recent: res.slice(-keep), longestWin, longestLoss };
  }

  /** Current drawdown of the cumulative trade P&L: peak (≥ 0) minus now, in $ (≥ 0). */
  function currentDrawdown(list, pnlFor) {
    let eq = 0, peak = 0;
    byDate(list).forEach(t => { eq += num(pnlFor(t)); peak = Math.max(peak, eq); });
    return Math.max(0, peak - eq);
  }

  /** Monday → Sunday of the week containing todayIso. */
  function weekBounds(todayIso) {
    const [y, m, d] = String(todayIso).split('-').map(Number);
    const t = new Date(y, m - 1, d);
    const mon = new Date(y, m - 1, d - ((t.getDay() + 6) % 7));
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    return [iso(mon), iso(sun)];
  }
  function monthBounds(todayIso) { return [todayIso.slice(0, 8) + '01', todayIso.slice(0, 8) + '31']; }

  /** Progress towards a positive target: { pct 0–100, value, target, reached } or null when no target. */
  function progress(value, target) {
    const tg = Number(target);
    if (!(tg > 0)) return null;
    const v = num(value);
    return { value: v, target: tg, pct: Math.max(0, Math.min(100, (v / tg) * 100)), reached: v >= tg };
  }

  root.obDashStats = { RANGES, rangeBounds, inBounds, applyFilter, summary, daily, streak, currentDrawdown, weekBounds, monthBounds, progress };
})(typeof window !== 'undefined' ? window : globalThis);
