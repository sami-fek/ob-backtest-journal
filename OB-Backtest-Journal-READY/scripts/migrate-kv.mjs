#!/usr/bin/env node
// scripts/migrate-kv.mjs — one-off copy of ONE user's journal from kv into the
// relational tables of migrations/001_relational.sql (Part 1).
//
// Copy, never move: kv is not changed and nothing is ever deleted. Rows are written
// with journal_save_* in 'insert_missing' mode (existing rows are left alone), so the
// script is safe to run any number of times. The user is switched to the tables last
// (journal_migrated_users), only after every row is in.
//
// Sources (read-only), merged by trade id; for each field the richest non-null value
// is kept and every disagreement is reported:
//   <backups>/kv-export-*.csv                 the whole kv table (the user's rows)
//   <backups>/browser-ob-trades.json          the browser's copy of ob-trades
//   <backups>/browser-my_journal_trades_v1.json  the browser's older second copy
//   <backups>/browser-my_journal_accounts_v1.json, browser-ob-os-settings.json
//   --target supabase also reads the user's LIVE kv rows and merges them as a fourth copy.
//
// Usage (from OB-Backtest-Journal-READY/):
//   node scripts/migrate-kv.mjs                       report only (default; writes nothing)
//   node scripts/migrate-kv.mjs --target sql          writes migrations/data/002_<user>.sql to run in the
//                                                     Supabase SQL Editor (kept out of git: it holds your data)
//   node scripts/migrate-kv.mjs --target supabase     writes directly (needs SUPABASE_URL and
//                                                     SUPABASE_SERVICE_ROLE_KEY in the environment)
//   node scripts/migrate-kv.mjs --target sqlite --db <dir>   a local SQLite database (development checks)
// Options: --backups <dir>  --user <id>  --report <file>
//
// Only the one user is touched. Orphan sessions and other users are not read beyond
// the export file and never written (Part 9).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  TRADES_KEY, ACCOUNTS_KEY, mergeTradeCopies, applyMigrationFixes, findSecrets, stripSecrets,
  tradesDocToRows, accountsDocToRows, UNVERIFIED_DEFAULT_BALANCE,
} from '../relational-core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const DEFAULT_USER = '5091dd57-4d84-40ea-ba9d-de545cdd0219';
const DEFAULT_BACKUPS = 'C:/Users/hp/Documents/Cowork/trading-app/inputs/backups';
const SETTINGS_KEY = 'ob-os-settings';

// ── CLI ─────────────────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const a = { target: 'report', backups: DEFAULT_BACKUPS, user: DEFAULT_USER, db: null, report: null, include: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--target') { a.target = v; i++; }
    else if (k === '--backups') { a.backups = v; i++; }
    else if (k === '--user') { a.user = v; i++; }
    else if (k === '--db') { a.db = v; i++; }
    else if (k === '--report') { a.report = v; i++; }
    else if (k === '--include-trade') { a.include.push(v); i++; }
    else if (k === '--help' || k === '-h') { a.help = true; }
    else throw new Error('unknown option ' + k);
  }
  if (!['report', 'sql', 'supabase', 'sqlite'].includes(a.target)) throw new Error('--target must be report, sql, supabase or sqlite');
  if (a.target === 'sqlite' && !a.db) throw new Error('--target sqlite needs --db <data dir>');
  return a;
}

// ── CSV (RFC 4180: quoted fields, "" escapes, newlines inside quotes) ─────────
export function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.length > 1 || r[0] !== '');
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

// ── load + merge ────────────────────────────────────────────────────────────
export function loadSources(backupsDir, user) {
  const csvFile = fs.readdirSync(backupsDir).filter(f => /^kv-export.*\.csv$/i.test(f)).sort().pop();
  if (!csvFile) throw new Error('no kv-export-*.csv in ' + backupsDir);
  const kvRows = parseCsv(fs.readFileSync(path.join(backupsDir, csvFile), 'utf8')).filter(r => r.session_id === user);
  const kv = Object.fromEntries(kvRows.map(r => [r.key, r.value]));
  if (!kv[TRADES_KEY]) throw new Error(`the export has no ${TRADES_KEY} row for user ${user}`);
  return {
    csvFile,
    kv,
    browserTrades: readJson(path.join(backupsDir, 'browser-ob-trades.json'), null),
    browserTradesV1: readJson(path.join(backupsDir, 'browser-my_journal_trades_v1.json'), null),
    browserAccounts: readJson(path.join(backupsDir, 'browser-my_journal_accounts_v1.json'), null),
    browserSettings: readJson(path.join(backupsDir, 'browser-ob-os-settings.json'), null),
  };
}

/** Everything the migration will write, plus the report. Pure (no writes). */
export function plan(src, { liveKv = null, include = [] } = {}) {
  const copies = [{ name: 'kv', trades: JSON.parse(src.kv[TRADES_KEY]) }];
  if (liveKv && liveKv[TRADES_KEY] && md5(liveKv[TRADES_KEY]) !== md5(src.kv[TRADES_KEY])) copies.unshift({ name: 'kv (live)', trades: JSON.parse(liveKv[TRADES_KEY]) });
  if (src.browserTrades) copies.push({ name: 'browser ob-trades', trades: src.browserTrades });
  if (src.browserTradesV1) copies.push({ name: 'browser my_journal_trades_v1', trades: src.browserTradesV1 });
  const merged0 = mergeTradeCopies(copies);
  // The trade LIST follows the server copy (kv): a trade found only in another copy may
  // have been deleted, so it is reported and left out unless --include-trade <id> asks for it.
  const serverIds = new Set(copies[0].trades.map(t => String(t.id)));
  const leftOut = merged0.presence.filter(x => !serverIds.has(x.id) && !include.includes(x.id))
    .map(x => ({ ...x, trade: merged0.trades.find(t => String(t.id) === x.id) }));
  const merged = { ...merged0, trades: merged0.trades.filter(t => serverIds.has(String(t.id)) || include.includes(String(t.id))) };

  // accounts: kv is the server's copy; report any difference with the browser's
  const kvAccounts = JSON.parse((liveKv && liveKv[ACCOUNTS_KEY]) || src.kv[ACCOUNTS_KEY] || '{}');
  const accountsDiffer = src.browserAccounts && JSON.stringify(src.browserAccounts) !== JSON.stringify(kvAccounts);
  const settings = JSON.parse((liveKv && liveKv[SETTINGS_KEY]) || src.kv[SETTINGS_KEY] || 'null') || src.browserSettings || {};
  const backtestStartingBalance = Number(settings.initialCapital) > 0 ? Number(settings.initialCapital) : 1000;

  const secretPaths = findSecrets(kvAccounts).concat(findSecrets(merged.trades).map(p => 'trades' + p));
  const fixed = applyMigrationFixes(merged.trades, stripSecrets(kvAccounts), { backtestStartingBalance });

  const embedded = [];
  fixed.trades.forEach(t => (Array.isArray(t.screenshots) ? t.screenshots : []).forEach((s, i) => {
    if (typeof s === 'string' && s.startsWith('data:image')) embedded.push({ tradeId: t.id, index: i, bytes: Buffer.from(s.slice(s.indexOf(',') + 1), 'base64').length });
  }));
  const refs = fixed.trades.reduce((n, t) => n + (Array.isArray(t.screenshots) ? t.screenshots.filter(s => typeof s === 'string' && s.startsWith('/api/shots/')).length : 0), 0);

  return {
    trades: fixed.trades,
    accountsDoc: fixed.accountsDoc,
    report: {
      copies: copies.map(c => ({ name: c.name, trades: c.trades.length })),
      conflicts: merged.conflicts,
      presence: merged.presence,
      leftOut,
      included: include,
      accountsDiffer,
      fixes: fixed.report,
      secretPaths,
      embedded,
      storageRefs: refs,
      backtestStartingBalance,
      needsVerification: Object.entries(fixed.accountsDoc).flatMap(([type, list]) => (list || [])
        .filter(a => Number(a.startingBalance ?? a.balance) === UNVERIFIED_DEFAULT_BALANCE).map(a => ({ type, id: a.id, name: a.name, startingBalance: a.startingBalance }))),
      kvMd5: { [TRADES_KEY]: md5(src.kv[TRADES_KEY]), [ACCOUNTS_KEY]: src.kv[ACCOUNTS_KEY] ? md5(src.kv[ACCOUNTS_KEY]) : null },
    },
  };
}

// ── outputs ─────────────────────────────────────────────────────────────────
const short = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > 80 ? s.slice(0, 77) + '…' : s; };
export function reportText(user, p, result) {
  const r = p.report, L = [];
  L.push(`# Migration report: user ${user}`, '');
  L.push(`Sources: ${r.copies.map(c => `${c.name} (${c.trades} trades)`).join(', ')}.`);
  L.push(`Trades after merging by id: ${p.trades.length}. Accounts: ${Object.values(p.accountsDoc).reduce((n, l) => n + (l || []).length, 0)}.`, '');
  L.push('## Disagreements between the copies', r.conflicts.length ? `${r.conflicts.length} field(s) differ; the richest value was kept:` : 'None: every copy holds the same value for every field.');
  for (const c of r.conflicts) L.push(`- ${c.id} · ${c.field}: kept ${c.kept}; ${c.values.map(v => `${v.copy} = ${short(v.value)}`).join(' | ')}`);
  if (r.presence.length) { L.push('', 'Trades not present in every copy:'); for (const x of r.presence) L.push(`- ${x.id}: only in ${x.in.join(', ')}`); }
  for (const x of r.leftOut) L.push(`- NOT MIGRATED, please check: ${x.id} (${x.trade.mode}, ${x.trade.date}, ${x.trade.pair} ${x.trade.direction}, ${x.trade.result} ${x.trade.rMultiple}R) is only in ${x.in.join(', ')}, not in kv, so it may have been deleted. It stays in the backups; run again with --include-trade ${x.id} to add it.`);
  for (const id of r.included) L.push(`- Included on request: ${id}.`);
  if (r.accountsDiffer) L.push('', 'NOTE: the browser copy of the accounts differs from kv; kv was used.');
  L.push('', '## Fixes applied');
  L.push(`- Backtest account: ${r.fixes.backtestAccountCreated ? `created "Backtest" (type backtest, starting balance ${r.backtestStartingBalance})` : 'already existed'}.`);
  const nul = r.fixes.backtestTradesAttached.filter(x => x.had === 'null').length, missing = r.fixes.backtestTradesAttached.filter(x => x.had !== 'null').length;
  L.push(`- Backtest trades attached to it: ${r.fixes.backtestTradesAttached.length} (${nul} with accountId null, ${missing} with no accountId field).`);
  for (const x of r.fixes.repointed) L.push(`- REPOINTED ORPHAN, please verify: trade ${x.id} (${x.mode}, ${x.date}, ${x.pair}) pointed at ${x.from}, which does not exist; attached to ${x.to}, the only ${x.mode} account.`);
  for (const x of r.fixes.unresolved) L.push(`- UNRESOLVED: trade ${x.id} (${x.mode}) points at ${x.accountId}; candidates ${x.candidates.join(', ') || 'none'}. Left as is.`);
  L.push(`- Secrets stripped: ${r.secretPaths.length ? r.secretPaths.join(', ') : 'none found in this user\'s accounts or trades'}. MT5 login and server are kept.`);
  L.push('', '## Accounts flagged needs_verification (starting balance equals the 100,000 default)');
  for (const a of r.needsVerification) L.push(`- ${a.name} (${a.type}, ${a.id}): starting balance ${a.startingBalance}`);
  if (!r.needsVerification.length) L.push('- none');
  L.push('', '## Screenshots');
  L.push(`- Embedded images moved to Storage: ${result?.moved ?? (r.embedded.length ? `${r.embedded.length} to move` : 0)} (${(r.embedded.reduce((n, e) => n + e.bytes, 0) / 1024).toFixed(1)} KB).`);
  L.push(`- Already stored as files (only their paths are copied): ${r.storageRefs}.`);
  if (result) {
    L.push('', '## Written');
    L.push(result.sqlFile
      ? `- Target: ${result.target}. Rows in the file: ${result.tradesAfter} trades, ${result.accountsAfter} accounts, ${result.attachmentsAfter} attachment rows. Nothing has been sent to Supabase.`
      : `- Target: ${result.target}. Trades in the tables: ${result.tradesAfter}. Accounts: ${result.accountsAfter}. Attachment rows: ${result.attachmentsAfter}.`);
    L.push(`- User switched to the tables: ${result.switched ? 'yes' : 'no'}. kv was not changed.`);
  }
  return L.join('\n');
}

/** SQL for the Supabase SQL Editor: refuses to run if kv changed since the export. */
export function sqlScript(user, p) {
  const { rows, attachments } = tradesDocToRows(JSON.stringify(p.trades), user);
  const accRows = accountsDocToRows(JSON.stringify(p.accountsDoc), user);
  let tag = 'mj';
  const body = JSON.stringify([rows, attachments, accRows]);
  while (body.includes(`$${tag}$`)) tag += 'x';
  const q = v => `$${tag}$${v}$${tag}$`;
  const lit = s => `'${String(s).replace(/'/g, "''")}'`;
  const m = p.report.kvMd5;
  return [
    `-- 002: copy user ${user} from kv into the relational tables (generated by scripts/migrate-kv.mjs).`,
    `-- Copy only: kv is not changed; existing rows are left alone; safe to run again.`,
    `-- It stops if this user's kv data changed after the export it was built from.`,
    `-- Contains your journal data: do not commit or share this file.`,
    `begin;`,
    `do $$ begin`,
    `  if to_regclass('public.schema_migrations') is null then raise exception 'run migrations/001_relational.sql first'; end if;`,
    `  if not exists (select 1 from public.schema_migrations where version = '001_relational') then raise exception 'run migrations/001_relational.sql first'; end if;`,
    `  if (select md5(value) from public.kv where session_id = ${lit(user)} and key = 'ob-trades') is distinct from ${lit(m[TRADES_KEY])} then`,
    `    raise exception 'ob-trades in kv changed since the export: export again (or use --target supabase) and regenerate this file'; end if;`,
    m[ACCOUNTS_KEY] ? `  if (select md5(value) from public.kv where session_id = ${lit(user)} and key = 'my_journal_accounts_v1') is distinct from ${lit(m[ACCOUNTS_KEY])} then\n    raise exception 'my_journal_accounts_v1 in kv changed since the export: export again and regenerate this file'; end if;` : '',
    `end $$;`,
    `select public.journal_save_accounts(${lit(user)}, ${q(JSON.stringify(accRows))}::json, 'insert_missing');`,
    `select public.journal_save_trades(${lit(user)}, ${q(JSON.stringify(rows))}::json, ${q(JSON.stringify(attachments))}::json, 'insert_missing');`,
    `select public.journal_mark_migrated(${lit(user)}, 'migrate-kv');`,
    `select (select count(*) from public.trades where user_id = ${lit(user)}) as trades,`,
    `       (select count(*) from public.trade_attachments where user_id = ${lit(user)}) as attachments,`,
    `       (select count(*) from public.accounts where user_id = ${lit(user)}) as accounts;`,
    `commit;`, '',
  ].filter(Boolean).join('\n');
}

// ── writers ─────────────────────────────────────────────────────────────────
async function supabaseRequestFactory() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('--target supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment');
  return async (pathname, options = {}) => {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${pathname}`, { ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const text = await r.text();
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
}

/** Upload embedded images (if any) and replace them with file references. */
async function moveEmbedded(trades, user, shots) {
  let moved = 0, bytes = 0;
  for (const t of trades) {
    if (!Array.isArray(t.screenshots)) continue;
    for (let i = 0; i < t.screenshots.length; i++) {
      const s = t.screenshots[i];
      const m = typeof s === 'string' && /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/s.exec(s);
      if (!m) continue;
      const buf = Buffer.from(m[2], 'base64');
      const id = await shots.save(user, buf, m[1]);
      t.screenshots[i] = `/api/shots/${id}`;
      moved++; bytes += buf.length;
    }
  }
  return { moved, bytes };
}

async function write(args, p) {
  const user = args.user;
  if (args.target === 'sql') {
    if (p.report.embedded.length) throw new Error(`${p.report.embedded.length} embedded image(s) must be uploaded first: use --target supabase`);
    const dir = path.join(APP, 'migrations', 'data');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `002_${user}.sql`);
    fs.writeFileSync(file, sqlScript(user, p));
    const rows = tradesDocToRows(JSON.stringify(p.trades), user);
    return { target: `sql file ${path.relative(APP, file)} (run it in the Supabase SQL Editor)`, moved: 0, sqlFile: file,
      tradesAfter: rows.rows.length, attachmentsAfter: rows.attachments.length, accountsAfter: accountsDocToRows(JSON.stringify(p.accountsDoc), user).length };
  }
  const { sqliteRelational, supabaseRelational } = await import('../relational-store.js');
  const { localStore, supabaseStore } = await import('../shots-store.js');
  let store, shots, close = () => {};
  if (args.target === 'supabase') {
    store = supabaseRelational(await supabaseRequestFactory());
    shots = supabaseStore({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, bucket: process.env.SUPABASE_SCREENSHOTS_BUCKET || 'trade-screenshots' });
    if (!(await store.probe())) throw new Error('run migrations/001_relational.sql first');
  } else {
    const { default: Database } = await import('better-sqlite3');
    fs.mkdirSync(args.db, { recursive: true });
    const db = new Database(path.join(args.db, 'journal.db'));
    store = sqliteRelational(db); close = () => db.close();
    shots = localStore(path.join(args.db, 'shots'));
  }
  try {
    const trades = JSON.parse(JSON.stringify(p.trades));
    const mv = await moveEmbedded(trades, user, shots);
    await store.saveDoc(user, ACCOUNTS_KEY, JSON.stringify(p.accountsDoc), 'insert_missing');
    await store.saveDoc(user, TRADES_KEY, JSON.stringify(trades), 'insert_missing');
    const after = JSON.parse(await store.loadDoc(user, TRADES_KEY));
    const accAfter = JSON.parse(await store.loadDoc(user, ACCOUNTS_KEY) || '{}');
    const missing = trades.filter(t => !after.some(a => String(a.id) === String(t.id)));
    if (missing.length) throw new Error(`${missing.length} trade(s) are not in the tables after the copy: ${missing.map(t => t.id).join(', ')}. The user was NOT switched.`);
    await store.markMigrated(user, 'migrate-kv');
    return {
      target: args.target === 'supabase' ? 'Supabase' : `SQLite ${args.db}`,
      moved: mv.moved, movedBytes: mv.bytes, switched: true,
      tradesAfter: after.length,
      accountsAfter: Object.values(accAfter).reduce((n, l) => n + (l || []).length, 0),
      attachmentsAfter: after.reduce((n, t) => n + (Array.isArray(t.screenshots) ? t.screenshots.length : 0), 0),
    };
  } finally { close(); }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).join('\n')); return; }
  if (args.user !== DEFAULT_USER) console.warn(`[migrate] user ${args.user} is not the planned user; continuing because it was asked for explicitly.`);
  const src = loadSources(args.backups, args.user);
  let liveKv = null;
  if (args.target === 'supabase') {
    const request = await supabaseRequestFactory();
    const rows = await request(`kv?select=key,value&session_id=eq.${encodeURIComponent(args.user)}`);
    liveKv = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
  }
  const p = plan(src, { liveKv, include: args.include });
  const result = args.target === 'report' ? null : await write(args, p);
  const text = reportText(args.user, p, result);
  console.log(text);
  if (args.report) fs.writeFileSync(args.report, text + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('[migrate] FAILED:', err.message); process.exit(1); });
}
