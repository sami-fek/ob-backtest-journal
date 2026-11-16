// relational-store.js — reads and writes the app's two documents (ob-trades,
// my_journal_accounts_v1) as rows of the relational tables (migrations/001_relational.sql).
//
// Two backends with the same behaviour:
//   sqliteRelational(db)              local development and tests (tables created here)
//   supabaseRelational(request, ...)  production: PostgREST reads, journal_save_* functions
//                                     for writes (one transaction per document)
//
// A user is read from these tables only after journal_migrated_users has a row for
// them (written last by scripts/migrate-kv.mjs, or automatically for a user who has
// no kv data at all). Until then the server keeps using kv: nobody ever sees an
// empty journal because a migration has not run yet.

import { TRADES_KEY, ACCOUNTS_KEY, tradesDocToRows, rowsToTradesDoc, accountsDocToRows, rowsToAccountsDoc } from './relational-core.js';

const TRADE_FIELDS = ['id', 'account_id', 'mode', 'symbol', 'direction', 'trade_date', 'open_time', 'close_time', 'pnl', 'r_multiple', 'result',
  'strategy', 'timeframe', 'regime', 'session', 'source', 'mt5_ticket', 'notes', 'review_status', 'post_breach', 'position', 'created_at', 'extra'];
const ACCOUNT_FIELDS = ['id', 'name', 'type', 'preset', 'starting_balance', 'current_balance', 'reset_timezone', 'status', 'run_number',
  'needs_verification', 'mt5_login', 'mt5_server', 'position', 'created_at', 'extra'];
const ATTACHMENT_FIELDS = ['trade_id', 'position', 'bucket', 'shot_id', 'storage_path', 'mime', 'bytes'];
const pick = (o, fields) => Object.fromEntries(fields.map(f => [f, o[f] === undefined ? null : o[f]]));

/** Shared document logic on top of a backend's row functions. */
function documentStore(backend) {
  return {
    kind: backend.kind,
    probe: backend.probe,
    isMigrated: backend.isMigrated,
    markMigrated: backend.markMigrated,
    deleteUser: backend.deleteUser || (async () => {}),

    /** The stored document as the app expects it (string), or null when there is none. */
    async loadDoc(uid, key) {
      if (key === TRADES_KEY) {
        const [rows, atts] = await Promise.all([backend.loadTradeRows(uid), backend.loadAttachmentRows(uid)]);
        return rowsToTradesDoc(rows, atts); // '[]' when empty: never fall back to a browser's old local copy
      }
      if (key === ACCOUNTS_KEY) {
        const rows = await backend.loadAccountRows(uid);
        return rows.length ? rowsToAccountsDoc(rows) : null; // null: the app creates its default accounts
      }
      throw new Error('not a relational document: ' + key);
    },

    /** Save a whole document. mode 'replace' (the app) or 'insert_missing' (the migration). */
    async saveDoc(uid, key, json, mode = 'replace') {
      if (key === TRADES_KEY) {
        const { rows, attachments } = tradesDocToRows(json, uid);
        await backend.saveTradeRows(uid, rows.map(r => pick(r, TRADE_FIELDS)), attachments.map(a => pick(a, ATTACHMENT_FIELDS)), mode);
        return;
      }
      if (key === ACCOUNTS_KEY) {
        const previous = await backend.loadAccountRows(uid);
        const rows = accountsDocToRows(json, uid, previous);
        await backend.saveAccountRows(uid, rows.map(r => pick(r, ACCOUNT_FIELDS)), mode);
        return;
      }
      throw new Error('not a relational document: ' + key);
    },

    async deleteDoc(uid, key) {
      if (key === TRADES_KEY) return backend.saveTradeRows(uid, [], [], 'replace');
      if (key === ACCOUNTS_KEY) return backend.saveAccountRows(uid, [], 'replace');
      throw new Error('not a relational document: ' + key);
    },
  };
}

// ── SQLite (local) ───────────────────────────────────────────────────────────
export function sqliteRelational(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      user_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT, type TEXT NOT NULL, preset TEXT,
      starting_balance REAL, current_balance REAL, reset_timezone TEXT, status TEXT NOT NULL DEFAULT 'active',
      run_number INTEGER NOT NULL DEFAULT 1, needs_verification INTEGER NOT NULL DEFAULT 0,
      mt5_login TEXT, mt5_server TEXT, position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      extra TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (user_id, id));
    CREATE TABLE IF NOT EXISTS trades (
      user_id TEXT NOT NULL, id TEXT NOT NULL, account_id TEXT, mode TEXT, symbol TEXT, direction TEXT,
      trade_date TEXT, open_time TEXT, close_time TEXT, pnl REAL, r_multiple REAL, result TEXT, strategy TEXT,
      timeframe TEXT, regime TEXT, session TEXT, source TEXT, mt5_ticket TEXT, notes TEXT, review_status TEXT,
      post_breach INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      extra TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (user_id, id));
    CREATE INDEX IF NOT EXISTS trades_account_close_idx ON trades (user_id, account_id, close_time);
    CREATE INDEX IF NOT EXISTS trades_account_date_idx ON trades (user_id, account_id, trade_date);
    CREATE UNIQUE INDEX IF NOT EXISTS trades_mt5_ticket_uq ON trades (user_id, account_id, mt5_ticket) WHERE mt5_ticket IS NOT NULL;
    CREATE TABLE IF NOT EXISTS trade_attachments (
      user_id TEXT NOT NULL, trade_id TEXT NOT NULL, position INTEGER NOT NULL, bucket TEXT NOT NULL DEFAULT 'trade-screenshots',
      shot_id TEXT NOT NULL, storage_path TEXT NOT NULL, mime TEXT, bytes INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, trade_id, position));
    CREATE TABLE IF NOT EXISTS news_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, currency TEXT NOT NULL, event_time_utc TEXT NOT NULL,
      impact TEXT NOT NULL, event_key TEXT NOT NULL UNIQUE, source TEXT, fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS news_events_time_idx ON news_events (event_time_utc);
    CREATE TABLE IF NOT EXISTS equity_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, account_id TEXT NOT NULL, equity REAL NOT NULL,
      balance REAL NOT NULL, server_offset_minutes INTEGER, taken_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS equity_snapshots_account_time_idx ON equity_snapshots (user_id, account_id, taken_at);
    CREATE TABLE IF NOT EXISTS account_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, account_id TEXT NOT NULL, run_number INTEGER NOT NULL,
      starting_balance REAL NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, end_reason TEXT, peak_balance REAL,
      UNIQUE (user_id, account_id, run_number));
    CREATE TABLE IF NOT EXISTS journal_migrated_users (
      user_id TEXT PRIMARY KEY, source TEXT NOT NULL, migrated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  `);
  const json = v => (v === null || v === undefined ? null : JSON.stringify(v));
  const bool = v => (v ? 1 : 0);

  const saveTrades = db.transaction((uid, rows, atts, mode) => {
    const verb = mode === 'replace'
      ? `INSERT INTO trades (user_id,${TRADE_FIELDS.join(',')},updated_at) VALUES (@user_id,${TRADE_FIELDS.map(f => '@' + f).join(',')},CURRENT_TIMESTAMP)
         ON CONFLICT(user_id,id) DO UPDATE SET ${TRADE_FIELDS.filter(f => !['id', 'created_at'].includes(f)).map(f => f === 'post_breach' ? 'post_breach = MAX(post_breach, excluded.post_breach)' : `${f}=excluded.${f}`).join(',')}, updated_at=CURRENT_TIMESTAMP`
      : `INSERT INTO trades (user_id,${TRADE_FIELDS.join(',')}) VALUES (@user_id,${TRADE_FIELDS.map(f => '@' + f).join(',')}) ON CONFLICT(user_id,id) DO NOTHING`;
    const ins = db.prepare(verb);
    for (const r of rows) ins.run({ ...r, user_id: uid, post_breach: bool(r.post_breach), extra: json(r.extra) || '{}', created_at: r.created_at || new Date().toISOString() });
    if (mode === 'replace') {
      const keep = new Set(rows.map(r => r.id));
      for (const { id } of db.prepare('SELECT id FROM trades WHERE user_id = ?').all(uid)) if (!keep.has(id)) db.prepare('DELETE FROM trades WHERE user_id = ? AND id = ?').run(uid, id);
      db.prepare('DELETE FROM trade_attachments WHERE user_id = ?').run(uid);
    }
    const insA = db.prepare(`INSERT INTO trade_attachments (user_id,${ATTACHMENT_FIELDS.join(',')}) VALUES (@user_id,${ATTACHMENT_FIELDS.map(f => '@' + f).join(',')}) ON CONFLICT(user_id,trade_id,position) DO NOTHING`);
    const exists = db.prepare('SELECT 1 FROM trades WHERE user_id = ? AND id = ?');
    for (const a of atts) if (exists.get(uid, a.trade_id)) insA.run({ ...a, user_id: uid, bucket: a.bucket || 'trade-screenshots' });
  });
  const saveAccounts = db.transaction((uid, rows, mode) => {
    const verb = mode === 'replace'
      ? `INSERT INTO accounts (user_id,${ACCOUNT_FIELDS.join(',')},updated_at) VALUES (@user_id,${ACCOUNT_FIELDS.map(f => '@' + f).join(',')},CURRENT_TIMESTAMP)
         ON CONFLICT(user_id,id) DO UPDATE SET ${ACCOUNT_FIELDS.filter(f => !['id', 'created_at'].includes(f)).map(f => `${f}=excluded.${f}`).join(',')}, updated_at=CURRENT_TIMESTAMP`
      : `INSERT INTO accounts (user_id,${ACCOUNT_FIELDS.join(',')}) VALUES (@user_id,${ACCOUNT_FIELDS.map(f => '@' + f).join(',')}) ON CONFLICT(user_id,id) DO NOTHING`;
    const ins = db.prepare(verb);
    for (const r of rows) ins.run({ ...r, user_id: uid, needs_verification: bool(r.needs_verification), extra: json(r.extra) || '{}', created_at: r.created_at || new Date().toISOString(), status: r.status || 'active', run_number: r.run_number || 1 });
    if (mode === 'replace') {
      const keep = new Set(rows.map(r => r.id));
      for (const { id } of db.prepare('SELECT id FROM accounts WHERE user_id = ?').all(uid)) if (!keep.has(id)) db.prepare('DELETE FROM accounts WHERE user_id = ? AND id = ?').run(uid, id);
    }
  });

  return documentStore({
    kind: 'sqlite',
    probe: async () => true,
    isMigrated: async uid => Boolean(db.prepare('SELECT 1 FROM journal_migrated_users WHERE user_id = ?').get(uid)),
    markMigrated: async (uid, source) => { db.prepare('INSERT INTO journal_migrated_users (user_id, source) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING').run(uid, source); },
    loadTradeRows: async uid => db.prepare('SELECT * FROM trades WHERE user_id = ? ORDER BY position').all(uid),
    loadAttachmentRows: async uid => db.prepare('SELECT * FROM trade_attachments WHERE user_id = ?').all(uid),
    loadAccountRows: async uid => db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY position').all(uid),
    saveTradeRows: async (uid, rows, atts, mode) => saveTrades(uid, rows, atts, mode),
    saveAccountRows: async (uid, rows, mode) => saveAccounts(uid, rows, mode),
    deleteUser: async uid => db.transaction(() => {
      for (const t of ['trade_attachments', 'trades', 'equity_snapshots', 'account_runs', 'accounts', 'journal_migrated_users']) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(uid);
    })(),
  });
}

// ── Supabase (production) ────────────────────────────────────────────────────
/** request(pathname, options) is the server's PostgREST helper (service role). */
export function supabaseRelational(request) {
  const enc = encodeURIComponent;
  // PostgREST answers at most max-rows (1000 on Supabase) per request: page through.
  async function all(path) {
    const out = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await request(`${path}&limit=1000&offset=${offset}`);
      out.push(...(page || []));
      if (!page || page.length < 1000) return out;
    }
  }
  const rpc = (fn, body) => request(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) });
  return documentStore({
    kind: 'supabase',
    async probe() {
      const rows = await request('schema_migrations?select=version&version=eq.001_relational');
      return Array.isArray(rows) && rows.length === 1;
    },
    isMigrated: async uid => ((await request(`journal_migrated_users?select=user_id&user_id=eq.${enc(uid)}`)) || []).length === 1,
    markMigrated: async (uid, source) => { await rpc('journal_mark_migrated', { p_user: uid, p_source: source }); },
    loadTradeRows: uid => all(`trades?select=*&user_id=eq.${enc(uid)}&order=position.asc`),
    loadAttachmentRows: uid => all(`trade_attachments?select=*&user_id=eq.${enc(uid)}&order=trade_id.asc,position.asc`),
    loadAccountRows: uid => all(`accounts?select=*&user_id=eq.${enc(uid)}&order=position.asc`),
    saveTradeRows: (uid, rows, atts, mode) => rpc('journal_save_trades', { p_user: uid, p_rows: rows, p_attachments: atts, p_mode: mode }),
    saveAccountRows: (uid, rows, mode) => rpc('journal_save_accounts', { p_user: uid, p_rows: rows, p_mode: mode }),
    // Postgres: rows follow the users row (on delete cascade)
  });
}
