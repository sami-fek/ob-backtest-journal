import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { registerMt5Routes } from './mt5-backend.js';
import { rawSessionCookie, verifySession } from './session-cookie.js';

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
// ob_session holds a signed session set by server.js at sign-in (session-cookie.js).
// The MT5 routes get it back only when the signature is valid; it is then passed on as
// the cookie of their storage calls to server.js. Without a valid one the caller is
// unauthenticated and the MT5 route rejects them.
function getSessionId(req, res) {
  const raw = rawSessionCookie(req);
  return raw && verifySession(raw) ? raw : '';
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

// The EA key for MYJournalLogger is made by server.js (only its hash is stored there).
async function serverPost(sid, pathname, body) {
  if (!sid) throw new Error('No authenticated session');
  const response = await fetch(internalBase + pathname, {
    method: 'POST', headers: { cookie: storageCookie(sid), 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

const storage = {
  getStoredValue:    (sid, key)        => storageRequest(sid, 'GET', key),
  setStoredValue:    async (sid, key, value) => { await storageRequest(sid, 'PUT', key, value); },
  deleteStoredValue: async (sid, key)  => { await storageRequest(sid, 'DELETE', key); },
  issueEaKey:        (sid, body)       => serverPost(sid, '/api/mt5/ea-key', body),
  revokeEaKey:       (sid, accountId)  => serverPost(sid, '/api/mt5/ea-key/revoke', { accountId })
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
      // Look for the actual tag: auth.html's script contains the text
      // meta[name="google-client-id"], which used to block injection there.
      if (googleClientId && !/<meta\s+name="google-client-id"/i.test(html)) {
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

app.listen(port, () => console.log('MY Journal MT5 gateway running on port ' + port));
