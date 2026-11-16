// Part 1: the server on the relational tables (SQLite), and scripts/migrate-kv.mjs end to end.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startLocalServer, sqliteAvailable, openTestDb } from './local-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '..', 'scripts', 'migrate-kv.mjs');
const skip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const valueOf = r => (r.status === 200 ? JSON.parse(r.body.value) : null);
const shot = n => `/api/shots/${String(n).repeat(32).slice(0, 32)}.png`;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

async function register(srv, email) {
  const c = srv.client();
  const r = await c.call('POST', '/api/auth/register', { email, password: 'password123' });
  assert.equal(r.status, 201, r.text);
  return { c, id: r.body.user.id };
}

test('a new user starts on the tables; documents round-trip; kv keeps a copy; flags; account deletion', { skip }, async () => {
  const srv = await startLocalServer({ DATA_RECHECK_MS: '0' });
  try {
    const { c, id } = await register(srv, 'new@test.local');
    assert.equal((await c.call('GET', '/api/storage/ob-trades')).status, 404, 'never saved → 404, as before');
    const trades = [{ id: 'tr-1', mode: 'Real', accountId: 'real-1', date: '2026-11-13', rMultiple: 2, screenshots: [shot(1)], notes: 'x' },
      { id: 'tr-2', mode: 'Backtest', accountId: null, date: '2026-11-12', rMultiple: -1 }];
    await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify(trades) });
    assert.deepEqual(valueOf(await c.call('GET', '/api/storage/ob-trades')), trades);
    let db = openTestDb(srv.dataDir);
    assert.equal(db.prepare('SELECT source FROM journal_migrated_users WHERE user_id = ?').get(id).source, 'new-user');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM trades WHERE user_id = ?').get(id).n, 2);
    assert.equal(db.prepare('SELECT storage_path FROM trade_attachments WHERE user_id = ?').get(id).storage_path, `${id}/${shot(1).slice(11)}`);
    assert.equal(db.prepare("SELECT value FROM kv WHERE session_id = ? AND key = 'ob-trades'").get(id).value, JSON.stringify(trades), 'kv copy written');
    db.close();
    // deleting all trades: [] (not 404, so a browser never re-imports an old local copy)
    await c.call('PUT', '/api/storage/ob-trades', { value: '[]' });
    assert.deepEqual(valueOf(await c.call('GET', '/api/storage/ob-trades')), []);
    // the daily-limit endpoint reads through the tables too
    await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify(trades) });
    const today = new Date().toISOString().slice(0, 10);
    const r = await c.call('POST', '/api/trades', { trade: { id: 'tr-3', mode: 'Real', date: today }, mode: 'Real' });
    assert.equal(r.status, 201, r.text);
    assert.equal(valueOf(await c.call('GET', '/api/storage/ob-trades')).length, 3);

    // accounts: 100,000 flagged; kept when omitted; cleared only by an explicit false
    const acc = { Real: [{ id: 'real-1', name: 'Real 01', balance: 100000, startingBalance: 100000 }], Demo: [{ id: 'demo-1', name: 'Demo', balance: 5000, startingBalance: 5000 }] };
    await c.call('PUT', '/api/storage/my_journal_accounts_v1', { value: JSON.stringify(acc) });
    let got = valueOf(await c.call('GET', '/api/storage/my_journal_accounts_v1'));
    assert.equal(got.Real[0].needsVerification, true); assert.equal(got.Demo[0].needsVerification, undefined);
    await c.call('PUT', '/api/storage/my_journal_accounts_v1', { value: JSON.stringify({ ...acc, Real: [{ ...acc.Real[0], name: 'Renamed' }] }) });
    got = valueOf(await c.call('GET', '/api/storage/my_journal_accounts_v1'));
    assert.equal(got.Real[0].needsVerification, true, 'an app save without the field keeps the flag');
    await c.call('PUT', '/api/storage/my_journal_accounts_v1', { value: JSON.stringify({ ...acc, Real: [{ ...got.Real[0], needsVerification: false }] }) });
    assert.equal(valueOf(await c.call('GET', '/api/storage/my_journal_accounts_v1')).Real[0].needsVerification, false, 'confirmed');
    assert.equal((await (await fetch(srv.base + '/api/health')).json()).dataStore, 'relational');

    // account deletion removes the rows too
    assert.equal((await c.call('DELETE', '/api/auth/account', { confirm: 'DELETE', password: 'password123' })).status, 200);
    db = openTestDb(srv.dataDir);
    for (const t of ['trades', 'trade_attachments', 'accounts', 'journal_migrated_users']) assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE user_id = ?`).get(id).n, 0, t);
    db.close();
  } finally { await srv.stop(); }
});

function writeBackups(dir, uid) {
  fs.mkdirSync(dir, { recursive: true });
  const kvTrades = [
    { id: 'tr-1794685321742', mode: 'Backtest', accountId: null, date: '2025-11-12', pair: 'XAUUSD', rMultiple: 7, notes: 'short', screenshots: [shot(1)] },
    { id: 'tr-1789629548555', mode: 'Demo', accountId: 'demo-missing', date: '2026-09-01', pair: 'BTCUSD', rMultiple: -1, screenshots: [PNG] },
    { id: 'tr-real', mode: 'Real', accountId: 'real-1', date: '2026-11-13', rMultiple: 2 }];
  const browser = [{ id: 'tr-only-browser', mode: 'Backtest', date: '2026-11-14', pair: 'XAUUSD', rMultiple: 2 },
    { ...kvTrades[1] }, { ...kvTrades[2] }];
  const browserV1 = [{ ...kvTrades[0], notes: 'a longer note from the browser' }, kvTrades[1], kvTrades[2]];
  const accounts = { Demo: [{ id: 'demo-1', name: 'Demo 1', balance: 5000, startingBalance: 5000, mt5: { linked: true, login: '1', server: 'S', token: 'obmt5_SECRET' } }],
    Real: [{ id: 'real-1', name: 'Real 01', balance: 100000, startingBalance: 100000 }] };
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['session_id', 'key', 'value', 'updated_at'],
    [uid, 'ob-trades', JSON.stringify(kvTrades), '2026-11-12'], [uid, 'my_journal_accounts_v1', JSON.stringify(accounts), '2026-11-12'],
    [uid, 'ob-os-settings', JSON.stringify({ initialCapital: 1000 }), '2026-11-12'],
    ['orphan-session', 'ob-trades', JSON.stringify([{ id: 'tr-orphan', mode: 'Real' }]), '2026-09-17']];
  fs.writeFileSync(path.join(dir, 'kv-export-2026-11-16.csv'), rows.map(r => r.map(esc).join(',')).join('\r\n') + '\r\n');
  fs.writeFileSync(path.join(dir, 'browser-ob-trades.json'), JSON.stringify(browser));
  fs.writeFileSync(path.join(dir, 'browser-my_journal_trades_v1.json'), JSON.stringify(browserV1));
  fs.writeFileSync(path.join(dir, 'browser-my_journal_accounts_v1.json'), JSON.stringify(accounts));
  return { kvTrades, accounts };
}
const runScript = (args, opts = {}) => execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', ...opts });

test('an existing kv user stays on kv until migrate-kv has copied them; then the tables (with the Backtest account); kv unchanged; DATA_STORE=kv falls back', { skip }, async () => {
  let srv = await startLocalServer({ DATA_RECHECK_MS: '0' });
  const backups = fs.mkdtempSync(path.join(os.tmpdir(), 'myjournal-backups-'));
  try {
    const { c, id } = await register(srv, 'old@test.local');
    const { kvTrades, accounts } = writeBackups(backups, id);
    const db = openTestDb(srv.dataDir);
    db.prepare('INSERT INTO kv (session_id, key, value) VALUES (?,?,?)').run(id, 'ob-trades', JSON.stringify(kvTrades));
    db.prepare('INSERT INTO kv (session_id, key, value) VALUES (?,?,?)').run(id, 'my_journal_accounts_v1', JSON.stringify(accounts));
    db.close();
    // not migrated: served from kv (and, as since Part 4, an embedded image is moved to a file on that read)
    const fromKv = valueOf(await c.call('GET', '/api/storage/ob-trades'));
    assert.deepEqual(fromKv.map(t => t.id), kvTrades.map(t => t.id), 'not migrated: served from kv');
    assert.match(fromKv[1].screenshots[0], /^\/api\/shots\//);
    const kvBefore = (() => { const d = openTestDb(srv.dataDir); const v = d.prepare("SELECT value FROM kv WHERE session_id = ? AND key = 'ob-trades'").get(id).value; d.close(); return v; })();

    const out = runScript(['--target', 'sqlite', '--db', srv.dataDir, '--backups', backups, '--user', id]);
    assert.match(out, /tr-1794685321742 · notes: kept browser my_journal_trades_v1/, 'the disagreement is reported');
    assert.match(out, /NOT MIGRATED, please check: tr-only-browser/, 'a trade only in the browser copy is left out and reported');
    assert.match(out, /created "Backtest" \(type backtest, starting balance 1000\)/);
    assert.match(out, /REPOINTED ORPHAN, please verify: trade tr-1789629548555 .* pointed at demo-missing, .* attached to demo-1/);
    assert.match(out, /Secrets stripped: \.Demo\[0\]\.mt5\.token/);
    assert.match(out, /- Real 01 \(Real, real-1\): starting balance 100000/);
    assert.match(out, /Embedded images moved to Storage: 1 \(/);
    assert.match(out, /Trades in the tables: 3\. Accounts: 3\./);

    const trades = valueOf(await c.call('GET', '/api/storage/ob-trades'));
    assert.deepEqual(trades.map(t => [t.id, t.accountId]), [['tr-1794685321742', 'backtest'], ['tr-1789629548555', 'demo-1'], ['tr-real', 'real-1']]);
    assert.equal(trades[0].notes, 'a longer note from the browser', 'richest value kept');
    assert.match(trades[1].screenshots[0], /^\/api\/shots\/[a-f0-9]{32}\.png$/, 'embedded image moved to storage');
    const accs = valueOf(await c.call('GET', '/api/storage/my_journal_accounts_v1'));
    assert.deepEqual(Object.keys(accs), ['Demo', 'Real', 'Backtest']);
    assert.equal(accs.Real[0].needsVerification, true);
    assert.ok(!JSON.stringify(accs).includes('SECRET'), 'token gone');
    assert.equal(accs.Demo[0].mt5.login, '1');
    // kv untouched by the migration; nothing of the orphan session copied
    const db2 = openTestDb(srv.dataDir);
    assert.equal(md5(db2.prepare("SELECT value FROM kv WHERE session_id = ? AND key = 'ob-trades'").get(id).value), md5(kvBefore), 'the migration did not touch kv');
    assert.equal(db2.prepare("SELECT COUNT(*) n FROM trades WHERE id = 'tr-orphan'").get().n, 0);
    db2.close();

    // running it again changes nothing
    runScript(['--target', 'sqlite', '--db', srv.dataDir, '--backups', backups, '--user', id]);
    assert.deepEqual(valueOf(await c.call('GET', '/api/storage/ob-trades')), trades);

    // fallback switch: DATA_STORE=kv serves kv again (same data folder)
    await srv.stop({ keepData: true });
    srv = await startLocalServer({ DATA_STORE: 'kv' }, { dataDir: srv.dataDir });
    const again = srv.client(); again.cookie = c.cookie;
    assert.equal((await (await fetch(srv.base + '/api/health')).json()).dataStore, 'kv (DATA_STORE=kv)');
    assert.deepEqual(valueOf(await again.call('GET', '/api/storage/ob-trades')).map(t => t.id), kvTrades.map(t => t.id), 'DATA_STORE=kv reads kv');
    assert.equal(valueOf(await again.call('GET', '/api/storage/ob-trades'))[1].accountId, 'demo-missing', 'kv still holds the unfixed copy: proof it is kv, not the tables');
  } finally { await srv.stop(); }
});

test('a migrated user is never served the kv copy, even when it is stale or the tables are empty', { skip }, async () => {
  const srv = await startLocalServer({ DATA_RECHECK_MS: '0' });
  const backups = fs.mkdtempSync(path.join(os.tmpdir(), 'myjournal-backups-'));
  try {
    const { c, id } = await register(srv, 'stale@test.local');
    const { kvTrades, accounts } = writeBackups(backups, id);
    let db = openTestDb(srv.dataDir);
    db.prepare('INSERT INTO kv (session_id, key, value) VALUES (?,?,?)').run(id, 'ob-trades', JSON.stringify(kvTrades));
    db.prepare('INSERT INTO kv (session_id, key, value) VALUES (?,?,?)').run(id, 'my_journal_accounts_v1', JSON.stringify(accounts));
    db.close();
    runScript(['--target', 'sqlite', '--db', srv.dataDir, '--backups', backups, '--user', id]);
    const tables = valueOf(await c.call('GET', '/api/storage/ob-trades'));
    assert.deepEqual(tables.map(t => t.accountId), ['backtest', 'demo-1', 'real-1']);

    // kv holds an older copy (accountId null / a missing account): the tables answer
    const stale = JSON.stringify([{ id: 'tr-stale-1', mode: 'Backtest', accountId: null }, { id: 'tr-stale-2', mode: 'Demo', accountId: 'demo-missing' }]);
    const staleAccounts = JSON.stringify({ Demo: [{ id: 'demo-stale', name: 'Stale', balance: 1, startingBalance: 1 }] });
    db = openTestDb(srv.dataDir);
    db.prepare("UPDATE kv SET value = ? WHERE session_id = ? AND key = 'ob-trades'").run(stale, id);
    db.prepare("UPDATE kv SET value = ? WHERE session_id = ? AND key = 'my_journal_accounts_v1'").run(staleAccounts, id);
    db.close();
    assert.deepEqual(valueOf(await c.call('GET', '/api/storage/ob-trades')), tables, 'tables, not the stale kv copy');
    assert.deepEqual(Object.keys(valueOf(await c.call('GET', '/api/storage/my_journal_accounts_v1'))), ['Demo', 'Real', 'Backtest']);

    // the tables are empty but the stale copy is still in kv: [] or 404, never the stale trades
    db = openTestDb(srv.dataDir);
    db.prepare('DELETE FROM trade_attachments WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM trades WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM accounts WHERE user_id = ?').run(id);
    db.close();
    assert.deepEqual(valueOf(await c.call('GET', '/api/storage/ob-trades')), [], 'saved empty: [] (kv only says a document exists)');
    assert.equal((await c.call('GET', '/api/storage/my_journal_accounts_v1')).status, 404, 'no account rows: 404, not the stale kv accounts');
    db = openTestDb(srv.dataDir);
    assert.equal(db.prepare("SELECT value FROM kv WHERE session_id = ? AND key = 'ob-trades'").get(id).value, stale, 'the kv row is kept, not deleted');
    db.close();
  } finally { await srv.stop(); }
});

test('migrate-kv --target sql: guarded by the kv fingerprint, insert_missing only, refuses embedded images', { skip }, () => {
  const backups = fs.mkdtempSync(path.join(os.tmpdir(), 'myjournal-backups-'));
  const uid = 'u-sql-test';
  const { kvTrades } = writeBackups(backups, uid);
  assert.throws(() => runScript(['--target', 'sql', '--backups', backups, '--user', uid], { stdio: 'pipe' }), /embedded image\(s\) must be uploaded first/);
  // without the embedded image the SQL file is written
  const clean = kvTrades.map(t => ({ ...t, screenshots: (t.screenshots || []).filter(s => !s.startsWith('data:')) }));
  const csv = fs.readFileSync(path.join(backups, 'kv-export-2026-11-16.csv'), 'utf8').replace(JSON.stringify(kvTrades).replace(/"/g, '""'), JSON.stringify(clean).replace(/"/g, '""'));
  fs.writeFileSync(path.join(backups, 'kv-export-2026-11-16.csv'), csv);
  for (const f of ['browser-ob-trades.json', 'browser-my_journal_trades_v1.json']) fs.writeFileSync(path.join(backups, f), JSON.stringify(clean));
  const out = runScript(['--target', 'sql', '--backups', backups, '--user', uid]);
  const file = path.join(__dirname, '..', 'migrations', 'data', `002_${uid}.sql`);
  try {
    assert.match(out, /sql file migrations[\\/]data[\\/]002_u-sql-test\.sql/);
    const sql = fs.readFileSync(file, 'utf8');
    assert.match(sql, new RegExp(`md5\\(value\\) from public\\.kv where session_id = 'u-sql-test' and key = 'ob-trades'\\) is distinct from '${md5(JSON.stringify(clean))}'`));
    assert.equal((sql.match(/'insert_missing'/g) || []).length, 2);
    assert.match(sql, /journal_mark_migrated\('u-sql-test', 'migrate-kv'\)/);
    assert.ok(!/delete|update |drop /i.test(sql.replace(/--.*$/gm, '')), 'no delete, update or drop');
  } finally { fs.rmSync(file, { force: true }); }
});
