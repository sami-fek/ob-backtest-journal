// journal-db.js — the journal tables as the app sees them, for the Edge Functions.
// Rows are turned into the app's documents with relational-core.js (vendor copy), and the
// rules are the app's own (rule-presets.js), so a function never judges an account
// differently from server.js or the browser.
//
// db: { query(sql, params) → rows, tx(fn(db)) }.
import './vendor/time-prefs.js';
import './vendor/rule-presets.js';
import { rowsToAccountsDoc, rowsToTradesDoc } from './vendor/relational-core.js';

const R = () => globalThis.obRules;

const ACCOUNT_SELECT = `select id, name, type, preset, starting_balance, current_balance, reset_timezone, status, run_number,
  needs_verification, mt5_login, mt5_server, position, created_at, extra::text as extra
  from public.accounts where user_id = $1`;
const TRADE_SELECT = `select id, account_id, mode, symbol, direction, to_char(trade_date, 'YYYY-MM-DD') as trade_date, open_time, close_time,
  pnl, r_multiple, result, strategy, timeframe, regime, session, source, mt5_ticket, notes, review_status, post_breach, position,
  created_at, extra::text as extra
  from public.trades where user_id = $1`;

/** The user's saved settings (ob-os-settings stays in kv for every user). */
export async function loadSettings(db, userId) {
  const [row] = await db.query(`select value from public.kv where session_id = $1 and key = 'ob-os-settings'`, [userId]);
  try { const s = row ? JSON.parse(row.value) : {}; return s && typeof s === 'object' ? s : {}; } catch { return {}; }
}

/** { accountsDoc, trades } exactly as the app would load them. */
export async function loadJournal(db, userId) {
  const [accRows, tradeRows] = await Promise.all([db.query(ACCOUNT_SELECT, [userId]), db.query(TRADE_SELECT, [userId])]);
  return {
    accountsDoc: accRows.length ? JSON.parse(rowsToAccountsDoc(accRows)) : {},
    trades: JSON.parse(rowsToTradesDoc(tradeRows, [])), // screenshots are not needed for the rules
  };
}

/**
 * Records BLOWN (the same record server.js writes) on the account row: status 'blown'
 * (an archived account stays archived) and extra.blown. Read and written in one
 * transaction so an app save in between is not overwritten.
 */
export async function recordBlown(db, userId, accountId, blown) {
  return db.tx(async tx => {
    const [row] = await tx.query(`select extra::text as extra, status from public.accounts where user_id = $1 and id = $2 for update`, [userId, accountId]);
    if (!row) return false;
    const extra = JSON.parse(row.extra || '{}');
    if (extra.blown) return false; // already recorded (by the server or another call)
    extra.blown = blown;
    await tx.query(`update public.accounts set status = case when status = 'archived' then status else 'blown' end,
      extra = $3::json, updated_at = now() where user_id = $1 and id = $2`, [userId, accountId, JSON.stringify(extra)]);
    return true;
  });
}

/**
 * Live equity of one account for the rules (Part 8): the newest snapshot, the equity at 00:00
 * of today's rule day in the account's reset zone (within 10 minutes of it, else unknown), and
 * the day's lowest equity. undefined when the preset does not measure equity or no EA reported.
 */
export async function equityFor(db, userId, account, atMs) {
  const rules = R().rulesFor(account);
  if (!rules || rules.dailyLossBase !== 'equity') return undefined;
  const [last] = await db.query(`select equity, balance, taken_at from public.equity_snapshots where user_id = $1 and account_id = $2 order by taken_at desc limit 1`, [userId, String(account.id)]);
  if (!last) return undefined;
  const iso = v => new Date(v).toISOString();
  const day = R().dayOf(atMs, rules.resetTimezone);
  const start = R().dayStartUtc(day, rules.resetTimezone);
  const near = await db.query(`select equity, taken_at from public.equity_snapshots where user_id = $1 and account_id = $2 and taken_at between $3::timestamptz and $4::timestamptz`,
    [userId, String(account.id), iso(start - 10 * 60_000), iso(start + 10 * 60_000)]);
  const [low] = await db.query(`select min(equity) as low from public.equity_snapshots where user_id = $1 and account_id = $2 and taken_at >= $3::timestamptz and taken_at <= $4::timestamptz`,
    [userId, String(account.id), iso(start), iso(atMs)]);
  return {
    equity: Number(last.equity), balance: Number(last.balance), takenAt: iso(last.taken_at), day,
    dayStartEquity: R().pickDayStartEquity(near, start), dayMinEquity: low && low.low != null ? Number(low.low) : null,
  };
}

/** Re-checks every account of a user; records each new breach. Returns [{ type, id, blown }]. */
export async function checkUserRules(db, userId, atIso = new Date().toISOString()) {
  const [{ accountsDoc, trades }, s] = await Promise.all([loadJournal(db, userId), loadSettings(db, userId)]);
  const atMs = Date.parse(atIso);
  const equity = new Map();
  for (const [type, list] of Object.entries(accountsDoc)) {
    if (type === 'Backtest' || !Array.isArray(list)) continue;
    for (const acc of list) if (acc && !acc.blown) { const e = await equityFor(db, userId, acc, atMs); if (e) equity.set(String(acc.id), e); }
  }
  const displayTz = globalThis.obTimeCore.validTz(s.timezone) ? s.timezone : undefined; // the zone manual trade dates were picked in
  const ctx = { riskPct: Number(s.riskPercent) || 1, initialCapital: Number(s.initialCapital) || 100000, now: atMs, displayTz, equityFor: id => equity.get(id) };
  const found = R().newBreaches(accountsDoc, trades, ctx, atIso);
  const recorded = [];
  for (const b of found) if (await recordBlown(db, userId, b.id, b.blown)) recorded.push(b);
  return recorded;
}

/** Writes an error to function_errors (Supabase Free keeps logs for one day). Never throws. */
export async function logError(db, fn, err, detail) {
  try {
    await db.query(`insert into public.function_errors (fn, message, detail) values ($1, $2, $3::json)`,
      [fn, String(err && err.message || err).slice(0, 1000), JSON.stringify(detail ?? null)]);
  } catch { /* the log itself failed: nothing more to do */ }
}
