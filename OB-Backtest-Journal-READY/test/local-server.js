// Test helper: starts server.js against a throwaway SQLite folder.
// Supabase variables are forced empty so tests can never touch live data.
// If better-sqlite3 cannot load (e.g. wrong Node version), sqliteAvailable()
// returns false and the calling tests skip themselves.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

export function sqliteAvailable() {
  try { require('better-sqlite3')(':memory:').close(); return true; } catch { return false; }
}

export async function startLocalServer(extraEnv = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myjournal-test-'));
  const port = 39000 + Math.floor(Math.random() * 900);
  const env = {
    ...process.env,
    SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '',
    GROQ_API_KEY: '', GEMINI_API_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '',
    GOOGLE_CLIENT_ID: '',
    ...extraEnv,
    DATA_DIR: dataDir, PORT: String(port), NODE_ENV: 'test'
  };
  const child = spawn(process.execPath, [path.join(APP_DIR, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch {}
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

  async function stop() {
    child.kill();
    await new Promise(r => { if (child.exitCode !== null) r(); else child.on('exit', r); });
    await new Promise(r => setTimeout(r, 200));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  return { base, dataDir, client, stop, output: () => output, health };
}

export function openTestDb(dataDir) {
  const Database = require('better-sqlite3');
  return new Database(path.join(dataDir, 'journal.db'));
}
