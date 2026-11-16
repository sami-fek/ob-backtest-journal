// relational-core.js — pure mapping between the app's two JSON documents and the
// relational tables of migrations/001_relational.sql. No I/O here: the server
// (relational-store.js) and the one-off migration (scripts/migrate-kv.mjs) both use it,
// and test/relational-core.test.js covers it.
//
//   ob-trades               [trade, …]                 ⇄ trades + trade_attachments
//   my_journal_accounts_v1  { Demo:[…], Real:[…], … }  ⇄ accounts
//
// Round trips are lossless: a value goes into its column only when it comes back
// unchanged; anything else stays as-is in `extra` (with `extra._keys` keeping the
// original key order). Secrets never reach a row (stripSecrets).

export const TRADES_KEY = 'ob-trades';
export const ACCOUNTS_KEY = 'my_journal_accounts_v1';
export const DOC_KEYS = [TRADES_KEY, ACCOUNTS_KEY];

export const ACCOUNT_TYPES = ['Demo', 'Real', 'Funded', 'Backtest']; // document keys, in order
export const BACKTEST_ACCOUNT_ID = 'backtest';
// Real 01 / Funded 01 carry exactly the app's default; such a balance may be a placeholder.
export const UNVERIFIED_DEFAULT_BALANCE = 100000;

const SHOT_REF_RE = /^\/api\/shots\/([a-f0-9]{32}\.(?:png|jpg|webp|gif))$/;
const parseExtra = e => (typeof e === 'string' ? JSON.parse(e || '{}') : (e || {}));
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** ms timestamp encoded in app ids like "tr-1794685321742" / "demo-1789645058794" (ISO, or null). */
export function idTimestamp(id) {
  const m = /-(\d{12,14})$/.exec(String(id || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]));
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2020 || d.getUTCFullYear() > 2100 ? null : d.toISOString();
}

// ── secrets ─────────────────────────────────────────────────────────────────
const SECRET_KEY_RE = /^(token|bridgeToken|tokenHash|secret|password|passwd|apiKey|api_key|accessToken|refreshToken|privateKey|credential|credentials|eaKey)$/i;
/** Deep copy without any secret-looking key (MT5 bridge token, passwords, API keys). */
export function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) if (!SECRET_KEY_RE.test(k)) out[k] = stripSecrets(v);
  return out;
}
/** Paths of the secret keys found anywhere in `value` (for the migration report). */
export function findSecrets(value, path = '') {
  if (Array.isArray(value)) return value.flatMap((v, i) => findSecrets(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => (SECRET_KEY_RE.test(k) ? [`${path}.${k}`] : []).concat(findSecrets(v, `${path}.${k}`)));
}

// ── trades ──────────────────────────────────────────────────────────────────
// field → [column, accepts]. A value is stored in its column only if `accepts`
// returns it unchanged (or it is null); otherwise it is kept as-is in `extra`.
const asStr = v => (typeof v === 'string' ? v : undefined);
const asNum = v => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const asIso = v => (typeof v === 'string' && !Number.isNaN(new Date(v).getTime()) && new Date(v).toISOString() === v ? v : undefined);
const asDate = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const asBool = v => (typeof v === 'boolean' ? v : undefined);
const TRADE_COLUMNS = {
  accountId:    ['account_id', asStr],
  mode:         ['mode', asStr],
  pair:         ['symbol', asStr],
  direction:    ['direction', asStr],
  date:         ['trade_date', asDate],
  openTime:     ['open_time', asIso],
  closeTime:    ['close_time', asIso],
  pnl:          ['pnl', asNum],
  rMultiple:    ['r_multiple', asNum],
  result:       ['result', asStr],
  strategy:     ['strategy', asStr],
  timeframe:    ['timeframe', asStr],
  regime:       ['regime', asStr],
  session:      ['session', asStr],
  source:       ['source', asStr],
  mt5Ticket:    ['mt5_ticket', asStr],
  notes:        ['notes', asStr],
  reviewStatus: ['review_status', asStr],
  postBreach:   ['post_breach', asBool],
};
export const TRADE_ROW_COLUMNS = ['user_id', 'id', 'position', 'created_at', 'extra', ...Object.values(TRADE_COLUMNS).map(c => c[0])];

/**
 * One trade → { row, attachments }. Screenshots that are file references
 * (/api/shots/<id>, already in Storage) become trade_attachments rows. Anything
 * else in the list (an embedded image the server could not move yet) stays in
 * `extra`, so nothing is lost and no base64 reaches a column of its own.
 */
export function tradeToRow(trade, userId, position) {
  const t = trade && typeof trade === 'object' ? trade : {};
  const row = { user_id: String(userId), id: String(t.id), position, created_at: idTimestamp(t.id), post_breach: false };
  for (const [col] of Object.values(TRADE_COLUMNS)) if (!(col in row)) row[col] = null;
  row.post_breach = false;
  const extra = { _keys: Object.keys(t) };
  const present = [];
  for (const [k, v] of Object.entries(t)) {
    if (k === 'id' || k === 'screenshots') continue;
    const spec = TRADE_COLUMNS[k];
    if (spec && (v === null || spec[1](v) !== undefined)) {
      row[spec[0]] = k === 'postBreach' ? v === true : v;
      present.push(k);
    } else extra[k] = v;
  }
  const attachments = [];
  if (Array.isArray(t.screenshots)) {
    const inline = [];
    t.screenshots.forEach((s, i) => {
      const m = SHOT_REF_RE.exec(typeof s === 'string' ? s : '');
      if (m) attachments.push({ user_id: String(userId), trade_id: String(t.id), position: i, shot_id: m[1], storage_path: `${userId}/${m[1]}` });
      else inline.push([i, s]);
    });
    extra._shots = { count: t.screenshots.length, inline };
  } else if ('screenshots' in t) {
    extra.screenshots = t.screenshots;
  }
  extra._present = present;
  row.extra = extra;
  return { row, attachments };
}

/** Row (+ its attachments) → the trade object the app stored. */
export function rowToTrade(row, attachments = []) {
  const extra = parseExtra(row.extra);
  const values = { id: row.id };
  for (const f of extra._present || []) {
    let v = row[TRADE_COLUMNS[f][0]];
    if (v === undefined) v = null;
    if (v !== null && (f === 'pnl' || f === 'rMultiple')) v = Number(v);   // numeric may come back as text
    if (v !== null && f === 'postBreach') v = Boolean(v);                   // SQLite stores 0/1
    if (v !== null && (f === 'openTime' || f === 'closeTime')) v = new Date(v).toISOString();
    if (v !== null && f === 'date') v = String(v).slice(0, 10);
    values[f] = v;
  }
  for (const [k, v] of Object.entries(extra)) if (!k.startsWith('_')) values[k] = v;
  // fields set by the server or the migration that were not in the original document
  if (!('accountId' in values) && row.account_id) values.accountId = row.account_id;
  if (!('postBreach' in values) && row.post_breach) values.postBreach = true;
  if (!('reviewStatus' in values) && row.review_status) values.reviewStatus = row.review_status;
  if (extra._shots) {
    const shots = new Array(extra._shots.count).fill(undefined);
    for (const a of attachments) if (a.position < shots.length) shots[a.position] = `/api/shots/${a.shot_id}`;
    for (const [i, s] of extra._shots.inline || []) shots[i] = s;
    values.screenshots = shots.filter(s => s !== undefined);
  }
  const out = {};
  for (const k of extra._keys || []) if (k in values) out[k] = values[k];
  for (const [k, v] of Object.entries(values)) if (!(k in out)) out[k] = v;
  return out;
}

/** ob-trades JSON → rows for one user (position keeps the array order). */
export function tradesDocToRows(json, userId) {
  const list = typeof json === 'string' ? JSON.parse(json || '[]') : json;
  if (!Array.isArray(list)) throw new Error('ob-trades must be a JSON array');
  const rows = [], attachments = [], seen = new Set();
  list.forEach((t, i) => {
    if (!t || typeof t !== 'object' || t.id === undefined || t.id === null) throw new Error(`trade at position ${i} has no id`);
    if (seen.has(String(t.id))) throw new Error(`duplicate trade id ${t.id}`);
    seen.add(String(t.id));
    const r = tradeToRow(t, userId, i);
    rows.push(r.row); attachments.push(...r.attachments);
  });
  return { rows, attachments };
}

/** Rows → ob-trades JSON string (same order as stored). */
export function rowsToTradesDoc(rows, attachments) {
  const byTrade = new Map();
  for (const a of attachments || []) { if (!byTrade.has(a.trade_id)) byTrade.set(a.trade_id, []); byTrade.get(a.trade_id).push(a); }
  return JSON.stringify(rows.slice().sort((a, b) => a.position - b.position).map(r => rowToTrade(r, byTrade.get(r.id) || [])));
}

// ── accounts ────────────────────────────────────────────────────────────────
/**
 * my_journal_accounts_v1 → account rows. `previous` (rows already stored) keeps the
 * server-managed fields the app does not send (preset, reset_timezone, run_number,
 * created_at). needs_verification is cleared only by an explicit
 * `needsVerification: false` (the "Confirm" action on the account card).
 */
export function accountsDocToRows(json, userId, previous = []) {
  const doc = typeof json === 'string' ? JSON.parse(json || '{}') : json;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('accounts must be an object of {Type: [accounts]}');
  const prev = new Map(previous.map(r => [r.id, r]));
  const typeOrder = Object.keys(doc);
  const rows = [], seen = new Set();
  for (const typeKey of typeOrder) {
    if (!Array.isArray(doc[typeKey])) continue;
    doc[typeKey].forEach((a0, i) => {
      if (!a0 || typeof a0 !== 'object' || a0.id === undefined || a0.id === null) return;
      if (seen.has(String(a0.id))) throw new Error(`duplicate account id ${a0.id}`);
      seen.add(String(a0.id));
      const a = stripSecrets(a0);
      const p = prev.get(String(a.id));
      const extra = { _keys: Object.keys(a), _typeKey: typeKey, _typeOrder: typeOrder };
      const take = (k, ok) => (k in a && (a[k] === null || ok(a[k]) !== undefined) ? a[k] : (k in a ? ((extra[k] = a[k]), null) : null));
      const starting = take('startingBalance', asNum);
      const balance = take('balance', asNum);
      const name = take('name', asStr);
      for (const [k, v] of Object.entries(a)) if (!['id', 'name', 'startingBalance', 'balance', 'status', 'needsVerification'].includes(k)) extra[k] = v;
      if ('status' in a) extra.status = a.status; // the app's own value, kept exactly
      if ('needsVerification' in a) extra._nv = true;
      const needs = a.needsVerification === false ? false
        : a.needsVerification === true ? true
        : p ? Boolean(p.needs_verification)
        : (starting ?? balance) === UNVERIFIED_DEFAULT_BALANCE;
      rows.push({
        user_id: String(userId), id: String(a.id), name,
        type: typeKey.toLowerCase(),
        preset: p?.preset ?? null,
        starting_balance: starting,
        current_balance: balance,
        reset_timezone: p?.reset_timezone ?? null,
        status: a.status === 'archived' ? 'archived' : (p && p.status === 'blown' ? 'blown' : 'active'),
        run_number: p?.run_number ?? 1,
        needs_verification: needs,
        mt5_login: a.mt5 && a.mt5.login ? String(a.mt5.login) : null,
        mt5_server: a.mt5 && a.mt5.server ? String(a.mt5.server) : null,
        position: i,
        created_at: p?.created_at || idTimestamp(a.id),
        extra,
      });
    });
  }
  return rows;
}

/** Account rows → my_journal_accounts_v1 JSON (same type keys and order). */
export function rowsToAccountsDoc(rows) {
  const parsed = rows.map(r => ({ r, extra: parseExtra(r.extra) }));
  const order = [];
  for (const { extra } of parsed) for (const k of extra._typeOrder || []) if (!order.includes(k)) order.push(k);
  for (const { r, extra } of parsed) { const k = extra._typeKey || cap(r.type); if (!order.includes(k)) order.push(k); }
  const doc = {};
  for (const k of order) doc[k] = [];
  for (const { r, extra } of parsed.sort((x, y) => x.r.position - y.r.position)) {
    const key = extra._typeKey || cap(r.type);
    const keys = extra._keys || ['id', 'name', 'balance', 'startingBalance'];
    const values = { id: r.id };
    if (keys.includes('name')) values.name = 'name' in extra ? extra.name : r.name;
    if (keys.includes('balance')) values.balance = 'balance' in extra ? extra.balance : (r.current_balance === null ? null : Number(r.current_balance));
    if (keys.includes('startingBalance')) values.startingBalance = 'startingBalance' in extra ? extra.startingBalance : (r.starting_balance === null ? null : Number(r.starting_balance));
    for (const [k, v] of Object.entries(extra)) if (!k.startsWith('_') && !['name', 'balance', 'startingBalance'].includes(k)) values[k] = v;
    if (r.needs_verification) values.needsVerification = true;
    else if (extra._nv) values.needsVerification = false;
    const out = {};
    for (const k of keys) if (k in values) out[k] = values[k];
    for (const [k, v] of Object.entries(values)) if (!(k in out)) out[k] = v;
    doc[key].push(out);
  }
  return JSON.stringify(doc);
}

// ── merging the three copies of the trades (migration) ───────────────────────
const richness = v => (v === null || v === undefined ? -1
  : typeof v === 'string' ? v.length
  : Array.isArray(v) ? v.length * 100000 + JSON.stringify(v).length
  : typeof v === 'object' ? Object.keys(v).length * 100000 + JSON.stringify(v).length
  : 1);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Merge copies of the same trades by id. For each field keep the richest non-null
 * value (most items / longest text). Every field where non-null copies differ is
 * reported in `conflicts` with all values, so nothing is picked silently. `presence`
 * lists trades missing from some copy. Order follows the first copy.
 */
export function mergeTradeCopies(copies) {
  const order = [], byId = new Map();
  for (const { name, trades } of copies) {
    for (const t of trades || []) {
      if (!t || t.id === undefined || t.id === null) continue;
      const id = String(t.id);
      if (!byId.has(id)) { byId.set(id, []); order.push(id); }
      byId.get(id).push({ name, t });
    }
  }
  const trades = [], conflicts = [], presence = [];
  for (const id of order) {
    const versions = byId.get(id);
    if (versions.length !== copies.length) presence.push({ id, in: versions.map(v => v.name) });
    const keys = [];
    for (const { t } of versions) for (const k of Object.keys(t)) if (!keys.includes(k)) keys.push(k);
    const merged = {};
    for (const k of keys) {
      const vals = versions.filter(v => k in v.t).map(v => ({ copy: v.name, value: v.t[k] }));
      const nonNull = vals.filter(x => x.value !== null && x.value !== undefined);
      if (!nonNull.length) { merged[k] = vals.length ? vals[0].value : null; continue; }
      let best = nonNull[0];
      for (const x of nonNull) if (richness(x.value) > richness(best.value)) best = x;
      merged[k] = best.value;
      if (nonNull.some(x => !same(x.value, best.value))) conflicts.push({ id, field: k, kept: best.copy, values: nonNull });
    }
    trades.push(merged);
  }
  return { trades, conflicts, presence };
}

// ── migration-only fixes (RECOVERY-PLAN.md facts) ────────────────────────────
/**
 * Known data fixes for the one-off migration; returns what was done.
 *  1/2. Backtest trades with accountId null or missing → the Backtest account,
 *       created with the Backtest starting capital if it does not exist.
 *  3.   A non-Backtest trade whose accountId does not exist is attached to the only
 *       account of its mode and reported. With several candidates it is left as is
 *       and reported as unresolved (never guessed).
 */
export function applyMigrationFixes(trades, accountsDoc, { backtestStartingBalance = 1000 } = {}) {
  const doc = JSON.parse(JSON.stringify(accountsDoc || {}));
  const report = { backtestAccountCreated: false, backtestTradesAttached: [], repointed: [], unresolved: [] };
  if (!Array.isArray(doc.Backtest) || !doc.Backtest.length) {
    doc.Backtest = [{ id: BACKTEST_ACCOUNT_ID, name: 'Backtest', balance: backtestStartingBalance, startingBalance: backtestStartingBalance }];
    report.backtestAccountCreated = true;
  }
  const backtestId = doc.Backtest[0].id;
  const ids = new Set(Object.values(doc).flatMap(l => (Array.isArray(l) ? l.map(a => a && a.id) : [])));
  const out = trades.map(t0 => {
    const t = { ...t0 };
    if (t.mode === 'Backtest') {
      if (!t.accountId) { report.backtestTradesAttached.push({ id: t.id, had: 'accountId' in t0 ? 'null' : 'no field' }); t.accountId = backtestId; }
      return t;
    }
    if (t.accountId && !ids.has(t.accountId)) {
      const sameMode = (doc[t.mode] || []).filter(a => a && a.id);
      if (sameMode.length === 1) {
        report.repointed.push({ id: t.id, mode: t.mode, date: t.date, pair: t.pair, from: t.accountId, to: sameMode[0].id });
        t.accountId = sameMode[0].id;
      } else report.unresolved.push({ id: t.id, mode: t.mode, accountId: t.accountId, candidates: sameMode.map(a => a.id) });
    }
    return t;
  });
  return { trades: out, accountsDoc: doc, report };
}
