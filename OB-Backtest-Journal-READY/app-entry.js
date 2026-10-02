import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { registerMt5Routes } from './mt5-backend.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env file if present (local dev) ─────────────────────────────────────
// In production (Render) env vars are injected directly — .env is not needed.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
  console.log('[Env] Loaded .env file');
}

const app = express();
const port = Number(process.env.PORT || 3000);
const internalPort = port + 1;
const internalBase = 'http://127.0.0.1:' + internalPort;
app.use(express.json({ limit: '12mb' }));

// ── Auth-aware session ID ──────────────────────────────────────────────────────
// After the multi-user auth system was added, ob_session now holds a real user
// UUID set by /api/auth/login or /api/auth/register (in server.js).
// We NO LONGER mint anonymous UUIDs here — if there is no valid session cookie
// the caller is unauthenticated and the MT5 route will correctly reject them.
function getSessionId(req, res) {
  const match = req.headers.cookie?.match(/(?:^|;\s*)ob_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

// ── Internal storage proxy ─────────────────────────────────────────────────────
// MT5 routes in this process proxy storage calls to the inner server.js process
// so they share the same persistence layer.
function storageCookie(sid) {
  return sid ? 'ob_session=' + encodeURIComponent(sid) : '';
}

async function storageRequest(sid, method, key, value) {
  if (!sid) throw new Error('No authenticated session');
  const options = { method, headers: { cookie: storageCookie(sid) } };
  if (value !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify({ value });
  }
  const response = await fetch(internalBase + '/api/storage/' + encodeURIComponent(key), options);
  if (response.status === 404 && method === 'GET') return null;
  if (response.status === 401) throw new Error('Unauthenticated storage request');
  if (!response.ok) throw new Error('storage ' + method + ' failed with HTTP ' + response.status);
  const body = await response.json().catch(() => ({}));
  return body.value ?? null;
}

const storage = {
  getStoredValue:    (sid, key)        => storageRequest(sid, 'GET', key),
  setStoredValue:    async (sid, key, value) => { await storageRequest(sid, 'PUT', key, value); },
  deleteStoredValue: async (sid, key)  => { await storageRequest(sid, 'DELETE', key); }
};

registerMt5Routes(app, { getSessionId, ...storage });

// ── Inner server process ────────────────────────────────────────────────────────
const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: { ...process.env, PORT: String(internalPort) },
  stdio: 'inherit'
});
child.on('exit', code => { if (code !== 0) process.exit(code || 1); });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { child.kill(signal); process.exit(0); });

// ── Proxy all other requests to inner server ───────────────────────────────────
app.use(async (req, res) => {
  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers['content-length'];

    const hasBody = !['GET', 'HEAD'].includes(req.method) && req.body !== undefined;
    const upstream = await fetch(internalBase + req.originalUrl, {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body) : undefined
    });

    res.status(upstream.status);

    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);

    // Forward Set-Cookie headers (auth cookies from login/register/logout)
    const cookies = upstream.headers.getSetCookie?.() ||
      (upstream.headers.get('set-cookie') ? [upstream.headers.get('set-cookie')] : []);
    if (cookies.length) res.setHeader('set-cookie', cookies);

    const bytes = Buffer.from(await upstream.arrayBuffer());

    if (contentType?.toLowerCase().includes('text/html')) {
      let html = bytes.toString('utf8');

      // Inject backend-sync.js into every HTML page
      if (!html.includes('src="/backend-sync.js"')) {
        html = html.replace(
          /<\/body>\s*<\/html>\s*$/i,
          '  <script src="/backend-sync.js"></script>\n</body>\n</html>'
        );
      }

      // Inject Google Client ID meta tag when configured
      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      if (googleClientId && !html.includes('name="google-client-id"')) {
        html = html.replace(
          '<meta charset="UTF-8"',
          `<meta name="google-client-id" content="${googleClientId.replace(/"/g, '')}">\n  <meta charset="UTF-8"`
        );
      }

      res.send(html);
    } else {
      res.send(bytes);
    }
  } catch (error) {
    console.error('[Gateway] upstream request failed:', error);
    res.status(502).json({ error: 'Application upstream unavailable', details: error.message });
  }
});

app.listen(port, () => console.log('OB Journal MT5 gateway running on port ' + port));
