/**
 * account-balance.js — account maths shared by the balance card, the equity
 * chart and the Account center (pure functions, no DOM).
 *
 * Dollar value of a trade (unchanged from before, the one calculation the app
 * uses everywhere): R-multiple × the account's starting balance × risk % / 100.
 *
 * Balance = starting balance + Σ trade dollars + Σ cash movements dated on or
 * before "as of" (today by default). Deposits add, withdrawals subtract, so a
 * movement only shows up in the balance from its own date onward.
 *
 * Also: account normalisation (new optional fields with safe defaults), the
 * "balance type = Current" conversion, the JSON import plan and CSV export.
 *
 * Loaded by index.html as window.obBalance; tests evaluate this file in a
 * sandbox (see test/account-balance.test.js).
 */
(function (root) {
  'use strict';

  const TYPES = ['Real', 'Demo', 'Funded', 'Backtest'];
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const round2 = n => Math.round(n * 100) / 100;
  const isIso = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  function todayIso() {
    if (typeof window !== 'undefined' && window.obTime) return window.obTime.today();
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function baseOf(account, fallback) {
    const b = num(account && (account.startingBalance ?? account.balance), NaN);
    return Number.isFinite(b) && b > 0 ? b : (fallback || 100000);
  }

  function tradeDollars(trade, account, riskPct, fallbackBase) {
    return num(trade && trade.rMultiple) * baseOf(account, fallbackBase) * (num(riskPct, 1) / 100);
  }

  function normalizeMovement(m) {
    if (!m || typeof m !== 'object') return null;
    const amount = Math.abs(num(m.amount, NaN));
    if (!Number.isFinite(amount) || amount <= 0 || !isIso(m.date)) return null;
    return {
      id: String(m.id || ('cm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7))),
      type: m.type === 'withdraw' ? 'withdraw' : 'deposit',
      date: String(m.date),
      amount: round2(amount),
      note: String(m.note || '').slice(0, 200)
    };
  }

  function signedMovement(m) { return m.type === 'withdraw' ? -m.amount : m.amount; }

  function cashTotal(account, asOfIso) {
    const asOf = asOfIso || todayIso();
    const list = Array.isArray(account && account.cashMovements) ? account.cashMovements : [];
    return list.map(normalizeMovement).filter(Boolean)
      .filter(m => m.date <= asOf)
      .reduce((s, m) => s + signedMovement(m), 0);
  }

  /** trades: the account's trades (already filtered). */
  function balance(account, trades, riskPct, asOfIso, fallbackBase) {
    const base = baseOf(account, fallbackBase);
    const list = Array.isArray(trades) ? trades : [];
    const tradeSum = list
      .filter(t => !asOfIso || !t.date || String(t.date).slice(0, 10) <= asOfIso)
      .reduce((s, t) => s + tradeDollars(t, account, riskPct, fallbackBase), 0);
    const cash = cashTotal(account, asOfIso);
    const value = base + tradeSum + cash;
    // Return % is trading performance only (cash movements are not a return).
    return { balance: value, base, tradePnl: tradeSum, cash, pct: base ? (tradeSum / base) * 100 : 0 };
  }

  /**
   * Equity curve in dollars: one point per trade and per cash movement, in date
   * order (cash first on the same day). Starts with a "Start" point.
   */
  function equitySeries(account, trades, riskPct, fallbackBase) {
    const base = baseOf(account, fallbackBase);
    const today = todayIso();
    const events = [];
    (Array.isArray(trades) ? trades : []).forEach((t, i) => events.push({
      kind: 'trade', date: String(t.date || '').slice(0, 10), order: 1, i,
      delta: tradeDollars(t, account, riskPct, fallbackBase), r: num(t.rMultiple)
    }));
    (Array.isArray(account && account.cashMovements) ? account.cashMovements : [])
      .map(normalizeMovement).filter(Boolean).filter(m => m.date <= today)
      .forEach((m, i) => events.push({ kind: m.type, date: m.date, order: 0, i, delta: signedMovement(m), note: m.note }));
    events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.i - b.i);
    let eq = base;
    const points = [{ label: 'Start', date: '', equity: base, kind: 'start', delta: 0 }];
    events.forEach(e => { eq += e.delta; points.push({ label: e.date, date: e.date, equity: round2(eq), kind: e.kind, delta: round2(e.delta), r: e.r, note: e.note }); });
    return points;
  }

  /**
   * "Balance type: Current": the user types today's balance; derive the
   * starting balance S so that S + R·S·risk + cash = current.
   */
  function startingFromCurrent(current, account, trades, riskPct) {
    const cur = num(current, NaN);
    if (!Number.isFinite(cur) || cur <= 0) return null;
    const totalR = (Array.isArray(trades) ? trades : []).reduce((s, t) => s + num(t.rMultiple), 0);
    const factor = 1 + totalR * (num(riskPct, 1) / 100);
    if (factor <= 0) return null;
    const s = (cur - cashTotal(account)) / factor;
    return s > 0 ? round2(s) : null;
  }

  /** Adds the optional Account-center fields with safe defaults; keeps everything else (MT5 data etc.). */
  function normalizeAccount(a, mode) {
    const type = TYPES.includes(mode) ? mode : (TYPES.includes(a && a.type) ? a.type : 'Demo');
    const start = baseOf(a, 100000);
    const out = Object.assign({}, a, {
      id: String((a && a.id) || `${type.toLowerCase()}-${Date.now()}`),
      name: String((a && a.name) || `${type} account`).slice(0, 60),
      type,
      startingBalance: start,
      balance: num(a && a.balance, start) || start,
      broker: String((a && a.broker) || '').slice(0, 80),
      currency: String((a && a.currency) || 'USD').toUpperCase().slice(0, 3) || 'USD',
      profitTarget: a && a.profitTarget != null && a.profitTarget !== '' ? num(a.profitTarget, null) : null,
      maxDrawdown: a && a.maxDrawdown != null && a.maxDrawdown !== '' ? num(a.maxDrawdown, null) : null,
      dailyLossLimit: a && a.dailyLossLimit != null && a.dailyLossLimit !== '' ? num(a.dailyLossLimit, null) : null,
      weeklyTarget: a && a.weeklyTarget != null && a.weeklyTarget !== '' ? num(a.weeklyTarget, null) : null,
      monthlyTarget: a && a.monthlyTarget != null && a.monthlyTarget !== '' ? num(a.monthlyTarget, null) : null,
      balanceType: a && a.balanceType === 'current' ? 'current' : 'starting',
      status: a && a.status === 'archived' ? 'archived' : 'active',
      cashMovements: (Array.isArray(a && a.cashMovements) ? a.cashMovements : []).map(normalizeMovement).filter(Boolean)
    });
    return out;
  }

  /** P&L of trades in [fromIso, toIso] (inclusive) for target progress. */
  function periodPnl(account, trades, riskPct, fromIso, toIso) {
    return (Array.isArray(trades) ? trades : [])
      .filter(t => { const d = String(t.date || '').slice(0, 10); return d >= fromIso && d <= toIso; })
      .reduce((s, t) => s + tradeDollars(t, account, riskPct), 0);
  }

  /**
   * Plan a JSON import without changing anything: which trades would be added,
   * which are duplicates (same id as an existing trade or earlier in the file),
   * and which are invalid. normalize: the app's normalizeTrade.
   */
  function planImport(parsed, existing, normalize) {
    const incoming = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.trades) ? parsed.trades : null);
    if (!incoming) return { ok: false, error: 'Unrecognised file. Expected a JSON array of trades (or an object with a "trades" array).' };
    const ids = new Set((Array.isArray(existing) ? existing : []).map(t => String(t.id)));
    const toAdd = [];
    let duplicates = 0, invalid = 0;
    incoming.forEach(raw => {
      const looks = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.id != null && (raw.date || raw.pair || raw.result);
      if (!looks) { invalid++; return; }
      const t = typeof normalize === 'function' ? normalize(raw) : raw;
      if (!t) { invalid++; return; }
      const id = String(t.id);
      if (ids.has(id)) { duplicates++; return; }
      ids.add(id);
      toAdd.push(t);
    });
    return { ok: true, total: incoming.length, toAdd, add: toAdd.length, duplicates, invalid };
  }

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s; // no spreadsheet formulas
    return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  }
  function htmlToText(html) {
    return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\n{2,}/g, '\n').trim();
  }
  const CSV_COLUMNS = ['id', 'mode', 'accountId', 'date', 'pair', 'timeframe', 'regime', 'session', 'direction', 'result', 'rMultiple', 'strategy', 'tags', 'feeling', 'checklistDone', 'checklistTotal', 'screenshots', 'notes'];
  function tradesToCSV(trades) {
    const rows = (Array.isArray(trades) ? trades : []).map(t => {
      const chk = Array.isArray(t.checklist) ? t.checklist : [];
      return [t.id, t.mode, t.accountId || '', t.date, t.pair, t.timeframe, t.regime, t.session || '', t.direction, t.result, t.rMultiple,
        t.strategy, (t.tags || []).join('; '), t.feeling || '', chk.filter(s => s === 'pass').length, chk.length,
        (t.screenshots || []).length, htmlToText(t.notes)].map(csvCell).join(',');
    });
    return [CSV_COLUMNS.join(','), ...rows].join('\r\n');
  }

  root.obBalance = {
    TYPES, todayIso, baseOf, tradeDollars, normalizeMovement, cashTotal, balance, equitySeries,
    startingFromCurrent, normalizeAccount, periodPnl, planImport, tradesToCSV, htmlToText
  };
})(typeof window !== 'undefined' ? window : globalThis);
