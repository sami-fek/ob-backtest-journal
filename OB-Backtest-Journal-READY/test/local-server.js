// Test helper: starts server.js against a throwaway SQLite folder.
// Supabase variables are forced empty so tests can never touch live data.
// If better-sqlite3 cannot load (e.g. wrong Node version), sqliteAvailable()
// returns false and the calling tests skip themselves.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

export function sqliteAvailable() {
  try { require('better-sqlite3')(':memory:').close(); return true; } catch { return false; }
}

// A port the OS says is free. (A random port from a fixed range collided when several
// test files started servers in parallel: the second server could not bind, and its tests
// then talked to the other file's server.)
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

export async function startLocalServer(extraEnv = {}, { dataDir: reuseDir } = {}) {
  const dataDir = reuseDir || fs.mkdtempSync(path.join(os.tmpdir(), 'myjournal-test-'));
  const port = await freePort();
  // each data folder has its own session secret (session-cookie.js); a restart on the same
  // folder keeps it, as production keeps its secret, so sessions survive the restart
  const secretFile = path.join(dataDir, '.test-session-secret');
  let sessionSecret = extraEnv.SESSION_SECRET || (fs.existsSync(secretFile) ? fs.readFileSync(secretFile, 'utf8') : '');
  if (!sessionSecret) { sessionSecret = crypto.randomBytes(32).toString('base64url'); fs.writeFileSync(secretFile, sessionSecret); }
  const env = {
    ...process.env,
    SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '',
    GROQ_API_KEY: '', GEMINI_API_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '',
    GOOGLE_CLIENT_ID: '',
    SESSION_SECRET: sessionSecret,
    ...extraEnv,
    DATA_DIR: dataDir, PORT: String(port), NODE_ENV: 'test'
  };
  const child = spawn(process.execPath, [path.join(APP_DIR, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('server exited before it was ready:\n' + output);
    // ready = our own process says it is listening (not another server on the same port)
    try { const r = await fetch(base + '/api/health'); if (r.ok && child.exitCode === null && /running on/.test(output)) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
    if (i === 99) { child.kill(); throw new Error('server did not start:\n' + output); }
  }
  const health = await (await fetch(base + '/api/health')).json();
  if (health.storage !== 'sqlite') { child.kill(); throw new Error('refusing to test: storage is not sqlite'); }

  // Minimal cookie-aware client
  function client() {
    let cookie = '';
    async function call(method, url, body) {
      const headers = {};
      if (cookie) headers.cookie = cookie;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const r = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const set = r.headers.get('set-cookie');
      if (set) {
        const m = set.match(/ob_session=([^;]*)/);
        cookie = m && m[1] ? `ob_session=${m[1]}` : '';
      }
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, body: json, text };
    }
    return { call, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
  }

  async function stop({ keepData = false } = {}) {
    child.kill();
    await new Promise(r => { if (child.exitCode !== null) r(); else child.on('exit', r); });
    await new Promise(r => setTimeout(r, 200));
    if (!keepData) fs.rmSync(dataDir, { recursive: true, force: true });
  }

  /** A valid signed session cookie for a user id (for users written straight into the database). */
  const cookieFor = userId => `ob_session=${encodeURIComponent(`${userId}.${crypto.createHmac('sha256', sessionSecret).update(`v1:${userId}`).digest('base64url')}`)}`;

  return { base, dataDir, client, stop, output: () => output, health, cookieFor };
}

export function openTestDb(dataDir) {
  const Database = require('better-sqlite3');
  return new Database(path.join(dataDir, 'journal.db'));
}
