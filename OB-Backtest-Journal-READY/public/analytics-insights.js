/**
 * analytics-insights.js — extra Analytics numbers (pure functions, no DOM).
 * BUILD-PLAN-2 Part 2 Step 1: rules followed vs broken, performance after
 * losses, R-multiple distribution, drawdown (depth + duration), sample size.
 *
 * All values are in R so they work for every mode (Backtest has no $).
 * Loaded as window.obAnalyticsInsights; tests: test/analytics-insights.test.js.
 */
(function (root) {
  'use strict';
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const RELIABLE_N = 30;

  /** Trades in time order (date, then time if stored, then original order). */
  function chrono(list) {
    return (Array.isArray(list) ? list : [])
      .map((t, i) => ({ t, i }))
      .sort((a, b) => {
        const da = String(a.t.date || ''), db = String(b.t.date || '');
        if (da !== db) return da < db ? -1 : 1;
        const ta = String(a.t.time || a.t.openTime || ''), tb = String(b.t.time || b.t.openTime || '');
        if (ta !== tb) return ta < tb ? -1 : 1;
        return a.i - b.i;
      })
      .map(x => x.t);
  }
  const isWin = t => t.result === 'Win';
  const isLoss = t => t.result === 'Loss';

  /** { trades, wins, winRate (0–100 | null), avgR (null when empty), netR } */
  function group(list) {
    const n = list.length;
    const wins = list.filter(isWin).length;
    const net = list.reduce((s, t) => s + num(t.rMultiple), 0);
    return { trades: n, wins, winRate: n ? (wins / n) * 100 : null, avgR: n ? net / n : null, netR: net };
  }

  /**
   * Checklist score of a trade: ticked ('pass') items / total items.
   * totalFor(t) gives the number of checklist items (defaults to the stored list length).
   * Returns null when the trade has no checklist items.
   */
  function checklistRatio(t, totalFor) {
    const list = Array.isArray(t && t.checklist) ? t.checklist : [];
    const total = Math.max(0, num(totalFor ? totalFor(t) : list.length));
    if (!total) return null;
    return list.filter(s => s === 'pass').length / total;
  }

  /** Rules followed (checklist ≥ 50 %) vs broken (< 50 %). Trades without a checklist are left out. */
  function rulesSplit(list, totalFor) {
    const followed = [], broken = [];
    let unknown = 0;
    for (const t of Array.isArray(list) ? list : []) {
      const r = checklistRatio(t, totalFor);
      if (r == null) unknown++;
      else (r >= 0.5 ? followed : broken).push(t);
    }
    return { followed: group(followed), broken: group(broken), unknown };
  }

  /**
   * Results of the NEXT trade after k consecutive losses (k = 1, 2, 3).
   * A trade counts for k when at least the k trades right before it were all losses.
   */
  function afterLosses(list, maxK = 3) {
    const seq = chrono(list);
    const out = [];
    for (let k = 1; k <= maxK; k++) {
      const next = [];
      let run = 0;
      for (const t of seq) {
        if (run >= k) next.push(t);
        run = isLoss(t) ? run + 1 : 0;
      }
      out.push({ k, ...group(next) });
    }
    return out;
  }

  /** R-multiple histogram: 0.5R bins from -3R to +5R; the end bins collect everything beyond. */
  function rHistogram(list, { min = -3, max = 5, step = 0.5 } = {}) {
    const bins = [];
    for (let from = min; from < max - 1e-9; from += step) bins.push({ from, to: from + step, count: 0 });
    const label = b => {
      const f = v => `${v > 0 ? '+' : ''}${Number.isInteger(v) ? v : v.toFixed(1)}`;
      return `${f(b.from)}…${f(b.to)}R`;
    };
    for (const t of Array.isArray(list) ? list : []) {
      const r = num(t.rMultiple);
      let i = Math.floor((r - min) / step + 1e-9);
      i = Math.max(0, Math.min(bins.length - 1, i));
      bins[i].count++;
    }
    bins.forEach((b, i) => {
      b.label = i === 0 ? `≤ ${b.to}R` : i === bins.length - 1 ? `≥ +${b.from}R` : label(b);
      b.sign = b.to <= 0 ? -1 : b.from >= 0 ? 1 : 0;
    });
    return bins;
  }

  /**
   * Drawdown in R from the running peak of cumulative R (the peak starts at 0).
   * points: one per trade { date, cum, dd (≤ 0) }.
   * maxDepth (≤ 0), maxDurationTrades (trades spent below a peak, longest),
   * maxDurationDays (calendar days from the peak's date to recovery or the last trade),
   * current: { depth, trades, recovered }.
   */
  function drawdown(list) {
    const seq = chrono(list);
    const points = [];
    let cum = 0, peak = 0, peakDate = null;
    let maxDepth = 0, maxDurationTrades = 0, maxDurationDays = 0, run = 0;
    const days = (a, b) => {
      if (!a || !b) return 0;
      const pa = Date.parse(a + 'T00:00:00Z'), pb = Date.parse(b + 'T00:00:00Z');
      return Number.isFinite(pa) && Number.isFinite(pb) ? Math.round((pb - pa) / 86400000) : 0;
    };
    for (const t of seq) {
      cum += num(t.rMultiple);
      if (peakDate == null) peakDate = t.date || null;
      if (cum >= peak - 1e-9) { peak = Math.max(peak, cum); peakDate = t.date || peakDate; run = 0; }
      else {
        run++;
        maxDurationTrades = Math.max(maxDurationTrades, run);
        maxDurationDays = Math.max(maxDurationDays, days(peakDate, t.date));
      }
      const dd = Math.min(0, cum - peak);
      maxDepth = Math.min(maxDepth, dd);
      points.push({ date: t.date || '', cum, dd });
    }
    const last = points[points.length - 1];
    return {
      points,
      maxDepth,
      maxDurationTrades,
      maxDurationDays,
      current: { depth: last ? last.dd : 0, trades: run, recovered: !last || last.dd >= -1e-9 }
    };
  }

  /** Sample-size label: results under ~30 trades are not yet reliable. */
  function reliability(n) {
    const c = Math.max(0, Math.floor(num(n)));
    return { n: c, reliable: c >= RELIABLE_N, need: Math.max(0, RELIABLE_N - c), threshold: RELIABLE_N };
  }

  root.obAnalyticsInsights = { RELIABLE_N, chrono, group, checklistRatio, rulesSplit, afterLosses, rHistogram, drawdown, reliability };
})(typeof window !== 'undefined' ? window : globalThis);
