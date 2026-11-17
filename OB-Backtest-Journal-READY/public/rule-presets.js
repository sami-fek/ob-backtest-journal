/**
 * rule-presets.js — risk rule presets per account and the daily floor formulas.
 *
 * Numbers come from research/prop-firms.xlsx, "preset values" tab (checked 14 Nov 2026),
 * and DECISIONS.md. Warn % is the app's own level: no firm publishes one, so it is 80% of
 * each firm's max drawdown, the same ratio as My Rules (8 / 10).
 *
 * Two daily floor formulas (they cannot share one "daily loss %" field):
 *   standard: floor = anchor − daily% × anchor, anchor = max(day-start balance, day-start equity)
 *             (balance-based presets use the day-start balance: equity is not their base)
 *   ftmo:     floor = day-start balance − daily% × INITIAL capital (a fixed dollar amount)
 *
 * The daily reset is an IANA zone name per account (never a UTC offset: an offset is an hour
 * wrong for half the year). Rule days run from 00:00 to 00:00 in that zone.
 *
 * Anything that cannot be computed is reported as incomplete or understated, never as a pass.
 *
 * Part 3, accountState(): ok / warn / blown for the account's current run (static drawdown
 * from the run's starting balance; a day blows when its net closed loss reaches the day's
 * allowance). The server records BLOWN (account.blown); the app shows it and blocks manual
 * entry on Real, Demo and Funded, never on Backtest (blocksManualEntry, rule-status.js);
 * "Start new run" begins a new run (runNumber, runStartedAt).
 *
 * Browser: window.obRules. Node: globalThis.obRules (server.js, mt5-backend.js,
 * relational-core.js import this file). Needs time-prefs.js (obTimeCore) for day keys.
 * Tests: test/rule-presets.test.js.
 */
(function (root) {
  'use strict';

  // id → rules. dailyLossBase: what the floor is measured against ('balance' = closed balance,
  // 'equity' = balance + floating P/L).
  const PRESETS = [
    { id: 'my-rules', label: 'My Rules', maxDrawdownPct: 10, warnPct: 8, dailyLossPct: 3, dailyLossBase: 'balance', dailyLossFormula: 'standard',
      resetTimezone: 'UTC', ea: 'n/a', note: '' },
    { id: 'fundingpips', label: 'FundingPips', maxDrawdownPct: 10, warnPct: 8, dailyLossPct: 5, dailyLossBase: 'equity', dailyLossFormula: 'standard',
      resetTimezone: 'Etc/GMT-3', ea: 'ask',
      note: 'FundingPips reports its reset as UTC+3. Confirm it on your account: if it moves with summer time, use Europe/Athens.' },
    { id: 'ftmo', label: 'FTMO', maxDrawdownPct: 10, warnPct: 8, dailyLossPct: 5, dailyLossBase: 'equity', dailyLossFormula: 'ftmo',
      resetTimezone: 'Europe/Prague', ea: 'yes', note: '' },
    { id: 'the5ers', label: 'The5ers', maxDrawdownPct: 10, warnPct: 8, dailyLossPct: 5, dailyLossBase: 'equity', dailyLossFormula: 'standard',
      resetTimezone: 'Europe/Athens', ea: 'yes', note: '' },
    { id: 'maven', label: 'Maven', maxDrawdownPct: 8, warnPct: 6.4, dailyLossPct: 4, dailyLossBase: 'equity', dailyLossFormula: 'standard',
      resetTimezone: 'UTC', ea: 'no', note: 'Maven resets at 00:00 UTC.' },
    { id: 'custom', label: 'Custom', maxDrawdownPct: null, warnPct: null, dailyLossPct: null, dailyLossBase: 'balance', dailyLossFormula: 'standard',
      resetTimezone: 'UTC', ea: 'n/a', note: '' },
  ];
  const PRESET_IDS = PRESETS.map(p => p.id);
  const BASES = ['balance', 'equity'];
  const FORMULAS = ['standard', 'ftmo'];
  const EA_BLOCKED_MSG = 'EAs not permitted by this firm';
  const EQUITY_MSG = 'equity unavailable - closed balance only, understated';

  const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const fin = v => Number.isFinite(v);
  const round2 = n => Math.round(n * 100) / 100;
  const core = () => root.obTimeCore || null;

  function presetById(id) { return PRESETS.find(p => p.id === id) || null; }

  /** True for an IANA zone name the runtime knows; offsets ("UTC+2", "+03:00", "3") are refused. */
  function validResetTz(tz) {
    if (typeof tz !== 'string' || !tz.trim()) return false;
    const s = tz.trim();
    if (/^[+\-−]?\d/.test(s) || /^(utc|gmt)\s*[+\-−]/i.test(s)) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: s }); return true; } catch (_) { return false; }
  }

  /** Custom rules typed by the user: every problem is listed (an empty list means usable). */
  function checkCustom(r) {
    const x = r || {};
    const problems = [];
    const dd = num(x.maxDrawdownPct), warn = num(x.warnPct), daily = num(x.dailyLossPct);
    if (!(dd > 0 && dd < 100)) problems.push('Max drawdown % must be between 0 and 100.');
    if (!(warn > 0 && warn < 100)) problems.push('Warn % must be between 0 and 100.');
    else if (dd > 0 && warn > dd) problems.push('Warn % cannot be above max drawdown %.');
    if (!(daily > 0 && daily < 100)) problems.push('Daily loss % must be between 0 and 100.');
    if (!BASES.includes(x.dailyLossBase)) problems.push('Choose a daily loss base (balance or equity).');
    if (!FORMULAS.includes(x.dailyLossFormula)) problems.push('Choose a daily floor formula.');
    return problems;
  }

  /**
   * The rules an account runs under, or null when it has no preset (the older dollar
   * limits then apply as before). `complete: false` means a number is missing: never a pass.
   */
  function rulesFor(account) {
    const id = account && account.preset;
    const p = presetById(id);
    if (!p) return null;
    const own = id === 'custom' ? (account.customRules || {}) : p;
    const tz = validResetTz(account.resetTimezone) ? account.resetTimezone.trim() : p.resetTimezone;
    const out = {
      preset: p.id, label: p.label,
      maxDrawdownPct: fin(num(own.maxDrawdownPct)) ? num(own.maxDrawdownPct) : null,
      warnPct: fin(num(own.warnPct)) ? num(own.warnPct) : null,
      dailyLossPct: fin(num(own.dailyLossPct)) ? num(own.dailyLossPct) : null,
      dailyLossBase: BASES.includes(own.dailyLossBase) ? own.dailyLossBase : null,
      dailyLossFormula: FORMULAS.includes(own.dailyLossFormula) ? own.dailyLossFormula : null,
      resetTimezone: tz,
      resetTimezoneIsDefault: !validResetTz(account.resetTimezone),
      ea: p.ea, note: p.note,
    };
    out.problems = id === 'custom' ? checkCustom(own) : [];
    out.complete = out.problems.length === 0;
    return out;
  }

  /**
   * Daily floor for one rule day. inputs: dayStartBalance, dayStartEquity (optional),
   * initialCapital (the run's starting balance; used by the ftmo formula).
   * Returns { formula, anchor, amount, floor, complete, understated, missing[] }.
   *  - amount: the loss allowed today in money (anchor − floor)
   *  - understated: the base is equity but only closed balance is known, so the real loss can
   *    be larger than shown (never treat as a pass)
   */
  function dailyFloor(rules, inputs) {
    const i = inputs || {};
    const missing = [];
    if (!rules || !rules.complete || !fin(rules.dailyLossPct)) return { formula: rules && rules.dailyLossFormula, complete: false, understated: false, missing: ['rules'] };
    const pct = rules.dailyLossPct / 100;
    const dsb = num(i.dayStartBalance), dse = num(i.dayStartEquity), initial = num(i.initialCapital);
    if (!fin(dsb)) missing.push('day-start balance');
    const equityBase = rules.dailyLossBase === 'equity';
    const equityKnown = fin(dse);
    if (rules.dailyLossFormula === 'ftmo') {
      if (!(initial > 0)) missing.push('initial capital');
      if (missing.length) return { formula: 'ftmo', complete: false, understated: false, missing };
      const amount = round2(pct * initial);
      return { formula: 'ftmo', anchor: dsb, amount, floor: round2(dsb - amount), complete: true, understated: equityBase && !equityKnown, missing };
    }
    if (missing.length) return { formula: 'standard', complete: false, understated: false, missing };
    const anchor = equityBase && equityKnown ? Math.max(dsb, dse) : dsb;
    const amount = round2(pct * anchor);
    // With an equity base and no day-start equity the anchor can only be too low, so the floor
    // shown is too low as well: understated.
    return { formula: 'standard', anchor, amount, floor: round2(anchor - amount), complete: true, understated: equityBase && !equityKnown, missing };
  }

  /** Static drawdown from the starting balance: warn and blown levels in money. */
  function drawdownLevels(rules, startingBalance) {
    const s = num(startingBalance);
    if (!rules || !rules.complete || !(s > 0)) return null;
    return {
      maxLoss: round2(s * rules.maxDrawdownPct / 100), floor: round2(s - s * rules.maxDrawdownPct / 100),
      warnLoss: round2(s * rules.warnPct / 100), warnLevel: round2(s - s * rules.warnPct / 100),
    };
  }

  // ── rule days in the account's reset timezone ──────────────────────────────
  const ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
  /** Calendar day 'YYYY-MM-DD' of an instant in `tz`. */
  function dayOf(instant, tz) {
    const c = core();
    if (!c) throw new Error('time-prefs.js (obTimeCore) must load before rule-presets.js');
    return c.isoInTz(instant, tz);
  }
  /**
   * Rule day of a trade: its close (or open) time in the reset zone when that time carries a
   * zone; otherwise the trade's own date (a manual trade has a date and no time).
   */
  function tradeDay(t, tz) {
    for (const k of ['closeTime', 'openTime']) {
      const v = t && t[k];
      if (typeof v === 'string' && ZONED.test(v)) { const d = dayOf(v, tz); if (d) return d; }
    }
    return String((t && t.date) || '').slice(0, 10);
  }

  /**
   * Today's daily-loss position for an account with a preset (null without one).
   * opts: { pnlFor(trade) → money, now (Date|ms), dayStartEquity (when an equity feed exists) }.
   * trades: this account's trades. Cash movements count toward the balance, never as a loss.
   */
  function dailyStatus(account, trades, opts) {
    const rules = rulesFor(account);
    if (!rules) return null;
    const o = opts || {};
    const pnlFor = typeof o.pnlFor === 'function' ? o.pnlFor : (t => Number(t.pnl) || 0);
    const tz = rules.resetTimezone;
    const today = dayOf(o.now == null ? new Date() : o.now, tz);
    const start = num(account.startingBalance);
    const list = Array.isArray(trades) ? trades : [];
    let before = 0, todayPnl = 0, todayCount = 0;
    for (const t of list) {
      const d = tradeDay(t, tz);
      if (!d) continue;
      if (d < today) before += pnlFor(t);
      else if (d === today) { todayPnl += pnlFor(t); todayCount++; }
    }
    const cash = (Array.isArray(account.cashMovements) ? account.cashMovements : [])
      .filter(m => m && /^\d{4}-\d{2}-\d{2}$/.test(String(m.date)) && m.date < today && fin(num(m.amount)))
      .reduce((s, m) => s + (m.type === 'withdraw' ? -1 : 1) * Math.abs(num(m.amount)), 0);
    const dayStartBalance = fin(start) ? round2(start + before + cash) : NaN;
    const f = dailyFloor(rules, { dayStartBalance, dayStartEquity: o.dayStartEquity, initialCapital: start });
    const used = round2(Math.max(0, -todayPnl));
    const out = { rules, tz, today, dayStartBalance, todayPnl: round2(todayPnl), todayCount, used, ...f };
    if (f.complete) { out.allowed = f.amount; out.left = round2(f.amount - used); }
    return out;
  }

  // ── Part 3: account state for the current run ──────────────────────────────
  /**
   * The broker's own P/L of an MT5 trade (profit + swap + commission, in account money), or
   * null. The rules use it instead of R: an MT5 trade without a stop loss has R = 0, and
   * counting a real loss as nothing would be a false "safe".
   */
  function brokerPnl(t) {
    return t && t.source === 'mt5' && typeof t.pnl === 'number' && Number.isFinite(t.pnl) ? t.pnl : null;
  }

  /**
   * Money of a trade for the rules: the broker's P/L for MT5 trades (brokerPnl), otherwise as
   * the app computes it everywhere (calendar, dashboard): R × base × risk %, base = the
   * account's starting balance (Backtest: initial capital).
   */
  function pnlOf(t, account, opts) {
    const broker = brokerPnl(t);
    if (broker !== null) return broker;
    const o = opts || {};
    const base = t && t.mode === 'Backtest' ? (num(o.initialCapital) || 100000)
      : (num(account && (account.startingBalance ?? account.balance)) || 100000);
    return (Number(t && t.rMultiple) || 0) * base * ((num(o.riskPct) || 1) / 100);
  }

  const idTs = id => { const m = /-(\d{12,14})$/.exec(String(id || '')); return m ? Number(m[1]) : null; };
  /** Instant of a trade in ms when it has a zoned time, else null. */
  function tradeInstant(t) {
    for (const k of ['closeTime', 'openTime']) { const v = t && t[k]; if (typeof v === 'string' && ZONED.test(v)) return Date.parse(v); }
    return null;
  }
  /**
   * Does the trade belong to the account's current run? A run starts at runStartedAt
   * ("Start new run"); without it every trade counts. A trade with only a date that falls on
   * the start day is placed by its id's creation time (manual ids are 'tr-<ms>').
   */
  function inRun(t, account, tz) {
    const start = Date.parse(account && account.runStartedAt);
    if (!fin(start)) return true;
    const at = tradeInstant(t);
    if (at != null) return at >= start;
    const d = tradeDay(t, tz), startDay = dayOf(start, tz);
    if (!d || d > startDay) return true;
    if (d < startDay) return false;
    const ts = idTs(t && t.id);
    return ts == null ? true : ts >= start;
  }
  function runTrades(account, trades, tz) {
    const sortKey = t => { const at = tradeInstant(t); return at != null ? at : (idTs(t.id) ?? 0); };
    return (Array.isArray(trades) ? trades : [])
      .filter(t => t && inRun(t, account, tz))
      .map(t => ({ t, day: tradeDay(t, tz), k: sortKey(t) }))
      .filter(x => x.day)
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.k - b.k));
  }

  /**
   * State of an account for its current run:
   *   'none'    no rule preset (the older dollar limits apply)
   *   'unknown' rules incomplete or no starting balance: never a pass
   *   'ok'      below the warn level
   *   'warn'    drawdown from the starting balance reached warn %
   *   'blown'   drawdown reached max drawdown %, or a day lost its whole daily allowance,
   *             or the server already recorded the account as blown (account.blown stays
   *             until "Start new run", even if the trades are edited later)
   * understated: the preset measures equity but only closed balance is known; an 'ok' is then
   * shown as understated, never as a green pass. opts: { pnlFor(trade), now }.
   */
  function accountState(account, trades, opts) {
    const o = opts || {};
    const pnlFor = typeof o.pnlFor === 'function' ? o.pnlFor : (t => pnlOf(t, account, o));
    const runNumber = Number.isInteger(account && account.runNumber) && account.runNumber >= 1 ? account.runNumber : 1;
    const saved = account && account.blown && typeof account.blown === 'object' ? account.blown : null;
    const base = { runNumber, runStartedAt: (account && account.runStartedAt) || null, saved };
    const rules = rulesFor(account);
    if (!rules) return { ...base, state: saved ? 'blown' : 'none', blown: saved };
    if (!rules.complete) return { ...base, rules, state: saved ? 'blown' : 'unknown', blown: saved, problems: rules.problems };
    const start = num(account.startingBalance);
    if (!(start > 0)) return { ...base, rules, state: saved ? 'blown' : 'unknown', blown: saved, problems: ['No starting balance.'] };
    const tz = rules.resetTimezone;
    const lv = drawdownLevels(rules, start);
    const list = runTrades(account, trades, tz);
    let bal = start, peak = start, breach = null, day = null, dayStart = start, dayPnl = 0, allowance = 0;
    for (const { t, day: d } of list) {
      if (d !== day) {
        day = d; dayStart = bal; dayPnl = 0;
        allowance = dailyFloor(rules, { dayStartBalance: dayStart, initialCapital: start }).amount;
      }
      const p = pnlFor(t);
      dayPnl += p; bal += p; peak = Math.max(peak, bal);
      if (breach) continue;
      const dd = start - bal;
      if (dd >= lv.maxLoss - 1e-9) {
        breach = { kind: 'max_drawdown', day: d, tradeId: t.id, loss: round2(dd), limit: lv.maxLoss, pct: rules.maxDrawdownPct };
      } else if (-dayPnl >= allowance - 1e-9) {
        breach = { kind: 'daily_loss', day: d, tradeId: t.id, loss: round2(-dayPnl), limit: allowance, pct: rules.dailyLossPct, formula: rules.dailyLossFormula };
      }
    }
    const drawdown = round2(Math.max(0, start - bal));
    const computed = breach ? 'blown' : drawdown >= lv.warnLoss - 1e-9 ? 'warn' : 'ok';
    return {
      ...base, rules, tz,
      state: saved ? 'blown' : computed,
      blown: saved || (breach ? { ...breach, runNumber } : null),
      breach, drawdown, drawdownPct: round2(drawdown / start * 100), warnLoss: lv.warnLoss, maxLoss: lv.maxLoss,
      balance: round2(bal), peak: round2(peak), tradeCount: list.length,
      understated: rules.dailyLossBase === 'equity',
      daily: dailyStatus(account, list.map(x => x.t), { pnlFor, now: o.now }),
    };
  }

  /** Trades of an account as the app scopes them: every Backtest trade belongs to the Backtest account. */
  function accountTrades(type, account, trades) {
    return (Array.isArray(trades) ? trades : []).filter(t => t && t.mode === type
      && (type === 'Backtest' || (account && String(t.accountId) === String(account.id))));
  }

  /**
   * Accounts whose current run is breached but not yet recorded as BLOWN.
   * accountsDoc: { Real: [...], Funded: [...], ... }; ctx: { riskPct, initialCapital }.
   * Returns [{ type, id, blown }], blown being the record to store on the account.
   * The server (server.js checkRules) and the risk-check Edge Function both use this.
   */
  function newBreaches(accountsDoc, trades, ctx, atIso) {
    const out = [];
    const c = ctx || {};
    for (const [type, list] of Object.entries(accountsDoc || {})) {
      if (!Array.isArray(list)) continue;
      for (const acc of list) {
        if (!acc || typeof acc !== 'object' || acc.blown || !rulesFor(acc)) continue;
        const s = accountState(acc, accountTrades(type, acc, trades), { pnlFor: t => pnlOf(t, acc, c) });
        if (s.state === 'blown' && s.breach) out.push({ type, id: String(acc.id), blown: { ...s.breach, runNumber: s.runNumber, at: atIso || new Date().toISOString() } });
      }
    }
    return out;
  }

  /** "Max drawdown reached: down $1,000 … (10%), on 2026-11-16". money(v) / date(iso) format. */
  function blownReason(blown, money, date) {
    if (!blown) return '';
    const m = typeof money === 'function' ? money : (v => String(v));
    const fd = typeof date === 'function' ? date : (v => v);
    const what = blown.kind === 'daily_loss'
      ? `Daily loss limit breached: lost ${m(blown.loss)} in one day, allowed ${m(blown.limit)} (${blown.pct}%${blown.formula === 'ftmo' ? ' of initial capital' : ''})`
      : `Max drawdown reached: down ${m(blown.loss)} from the starting balance, limit ${m(blown.limit)} (${blown.pct}%)`;
    return blown.day ? `${what}, on ${fd(blown.day)}` : what;
  }

  /** Plain-language formula for the editor and the cards. money(v) formats an amount. */
  function formulaText(rules, initialCapital, money) {
    const m = typeof money === 'function' ? money : (v => String(v));
    if (!rules || !rules.complete) return 'Daily floor: incomplete rules.';
    const pct = `${rules.dailyLossPct}%`;
    if (rules.dailyLossFormula === 'ftmo') {
      const amt = num(initialCapital) > 0 ? ` (${m(round2(num(initialCapital) * rules.dailyLossPct / 100))})` : '';
      return `Daily floor = day-start balance − ${pct} of initial capital${amt}, a fixed amount.`;
    }
    return rules.dailyLossBase === 'equity'
      ? `Daily floor = higher of day-start balance and day-start equity, minus ${pct} of it.`
      : `Daily floor = day-start balance minus ${pct} of it.`;
  }

  /** False when the account's firm bans EAs (Maven): no MT5 EA linking is offered. */
  function eaAllowed(account) { return !(account && account.preset === 'maven'); }

  /**
   * True when BLOWN locks manual entry for this account type (Real, Demo, Funded).
   * A Backtest runs to the end: BLOWN is recorded and shown, the form never locks and no
   * override is needed; trades after the breach are still marked postBreach.
   */
  const HARD_BLOCK_TYPES = ['Real', 'Demo', 'Funded'];
  function blocksManualEntry(type) { return HARD_BLOCK_TYPES.includes(type); }

  // ── timezone choices for the dropdown ───────────────────────────────────────
  const COMMON_TZ = ['UTC', 'Etc/GMT-2', 'Etc/GMT-3', 'Europe/London', 'Europe/Prague', 'Europe/Berlin', 'Europe/Athens', 'Europe/Helsinki',
    'Europe/Istanbul', 'Europe/Moscow', 'Africa/Addis_Ababa', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
    'America/New_York', 'America/Chicago'];
  function tzOffsetLabel(tz, now) {
    try {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now == null ? new Date() : now);
      const v = (p.find(x => x.type === 'timeZoneName') || {}).value || '';
      return v.replace(/^GMT$/, 'UTC').replace(/^GMT/, 'UTC');
    } catch (_) { return ''; }
  }
  /** { common: [...], all: [...] } of IANA names (all: every zone the runtime lists). */
  function timezoneChoices() {
    let all = [];
    try { all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []; } catch (_) { all = []; }
    const common = COMMON_TZ.filter(validResetTz);
    return { common, all: all.filter(z => !common.includes(z) && validResetTz(z)) };
  }
  function tzLabel(tz, now) {
    const off = tzOffsetLabel(tz, now);
    const fixed = /^Etc\/GMT[+-]\d+$/.test(tz) ? ' · fixed, no summer time' : '';
    return `${tz}${off ? ` (${off} now${fixed})` : fixed}`;
  }

  root.obRules = {
    PRESETS, PRESET_IDS, BASES, FORMULAS, EA_BLOCKED_MSG, EQUITY_MSG,
    presetById, validResetTz, checkCustom, rulesFor, dailyFloor, drawdownLevels,
    dayOf, tradeDay, dailyStatus, formulaText, eaAllowed, timezoneChoices, tzLabel,
    pnlOf, brokerPnl, inRun, accountState, blownReason, blocksManualEntry, accountTrades, newBreaches,
    BLOWN_WORD: 'BLOWN',
  };
})(typeof window !== 'undefined' ? window : globalThis);
