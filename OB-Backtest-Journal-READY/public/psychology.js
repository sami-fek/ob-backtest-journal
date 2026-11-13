/**
 * psychology.js — Psychology Status numbers (pure functions, no DOM).
 * Uses ONLY data already on trades: tags, feeling, checklist, result, rMultiple, date.
 *
 *   Followed   = % of trades with no Negative tag
 *   Deviated   = % of trades with at least one Negative tag
 *   Discipline = average checklist completion % (✓ items / items) over trades that have a checklist
 *   FOMO       = % of trades tagged FOMO (case-insensitive)
 * Tables: per tag and per feeling (trades, win rate, avg R, total R);
 * Mistake leaderboard: Negative tags ranked by R lost (sum of the negative R of trades with that tag);
 * Trend: Followed % per week (weeks start on Monday).
 *
 * Loaded as window.obPsych; tests evaluate this file in a sandbox (test/psychology.test.js).
 */
(function (root) {
  'use strict';
  const DEFAULT_SENTIMENT = { fomo: 'negative', revenge: 'negative', overtrade: 'negative', patient: 'positive', 'followed plan': 'positive' };

  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const round = (n, d = 2) => { const f = Math.pow(10, d); return Math.round(n * f) / f; };
  const tagsOf = t => (Array.isArray(t && t.tags) ? t.tags.map(x => String(x).trim()).filter(Boolean) : []);

  /** library: [{ name, sentiment }]; unknown tags are neutral (defaults for the built-in ones). */
  function sentimentLookup(library) {
    const map = Object.assign({}, DEFAULT_SENTIMENT);
    (Array.isArray(library) ? library : []).forEach(t => {
      if (t && t.name) map[String(t.name).trim().toLowerCase()] = ['positive', 'negative', 'neutral'].includes(t.sentiment) ? t.sentiment : 'neutral';
    });
    return name => map[String(name).trim().toLowerCase()] || 'neutral';
  }

  function stats(list) {
    const n = list.length;
    const wins = list.filter(t => t.result === 'Win').length;
    const total = list.reduce((s, t) => s + num(t.rMultiple), 0);
    return { trades: n, wins, winRate: n ? round((wins / n) * 100, 1) : 0, avgR: n ? round(total / n) : 0, totalR: round(total) };
  }

  function checklistPct(t) {
    const c = Array.isArray(t && t.checklist) ? t.checklist : [];
    if (!c.length) return null;
    return (c.filter(s => s === 'pass').length / c.length) * 100;
  }

  function weekStart(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  }

  /** Keep trades whose date is within the last `days` days of `todayIso` (inclusive). days = 0/null → all. */
  function inRange(trades, days, todayIso) {
    if (!days) return trades.slice();
    const t = new Date((todayIso || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() - (days - 1));
    const from = t.toISOString().slice(0, 10);
    return trades.filter(x => String(x.date || '').slice(0, 10) >= from && String(x.date || '').slice(0, 10) <= (todayIso || '9999'));
  }

  function compute(trades, opts = {}) {
    const list = (Array.isArray(trades) ? trades : []).filter(t => t && typeof t === 'object');
    const sentiment = sentimentLookup(opts.tagLibrary);
    const feelings = Array.isArray(opts.feelings) ? opts.feelings : [];
    const n = list.length;
    const isNeg = t => tagsOf(t).some(g => sentiment(g) === 'negative');
    const deviatedN = list.filter(isNeg).length;
    const fomoN = list.filter(t => tagsOf(t).some(g => g.toLowerCase() === 'fomo')).length;
    const chk = list.map(checklistPct).filter(v => v != null);
    const tagged = list.filter(t => tagsOf(t).length).length;

    // per tag
    const byTag = new Map();
    list.forEach(t => {
      const seen = new Set();
      tagsOf(t).forEach(g => {
        const key = g.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        if (!byTag.has(key)) byTag.set(key, { tag: g, list: [] });
        byTag.get(key).list.push(t);
      });
    });
    const tags = [...byTag.values()].map(x => Object.assign({ tag: x.tag, sentiment: sentiment(x.tag) }, stats(x.list),
      { rLost: round(x.list.reduce((s, t) => s + Math.min(0, num(t.rMultiple)), 0)) }))
      .sort((a, b) => b.trades - a.trades || a.tag.localeCompare(b.tag));

    // per feeling
    const byFeel = new Map();
    list.forEach(t => {
      const f = typeof t.feeling === 'string' && t.feeling ? t.feeling : null;
      if (!f) return;
      if (!byFeel.has(f)) byFeel.set(f, []);
      byFeel.get(f).push(t);
    });
    const feelingRows = [...byFeel.entries()].map(([id, l]) => {
      const meta = feelings.find(x => x.id === id) || {};
      return Object.assign({ id, label: meta.label || id, emoji: meta.emoji || '' }, stats(l));
    }).sort((a, b) => b.trades - a.trades || a.label.localeCompare(b.label));

    const mistakes = tags.filter(r => r.sentiment === 'negative')
      .sort((a, b) => a.rLost - b.rLost || a.totalR - b.totalR || b.trades - a.trades);

    // weekly trend
    const weeks = new Map();
    list.forEach(t => {
      const w = weekStart(t.date);
      if (!w) return;
      if (!weeks.has(w)) weeks.set(w, { week: w, trades: 0, followed: 0 });
      const x = weeks.get(w);
      x.trades++;
      if (!isNeg(t)) x.followed++;
    });
    const trend = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week))
      .map(x => ({ week: x.week, trades: x.trades, followedPct: round((x.followed / x.trades) * 100, 1) }));

    return {
      trades: n,
      taggedTrades: tagged,
      followedPct: n ? round(((n - deviatedN) / n) * 100, 1) : 0,
      deviatedPct: n ? round((deviatedN / n) * 100, 1) : 0,
      disciplinePct: chk.length ? round(chk.reduce((s, v) => s + v, 0) / chk.length, 1) : null,
      fomoPct: n ? round((fomoN / n) * 100, 1) : 0,
      counts: { followed: n - deviatedN, deviated: deviatedN, fomo: fomoN, withChecklist: chk.length },
      tags, feelings: feelingRows, mistakes, trend
    };
  }

  root.obPsych = { compute, inRange, weekStart, sentimentLookup };
})(typeof window !== 'undefined' ? window : globalThis);
