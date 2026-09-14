import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { registerMt5Routes } from './mt5-backend.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const internalPort = port + 1;
const internalBase = 'http://127.0.0.1:' + internalPort;
app.use(express.json({ limit: '12mb' }));

function setSessionCookie(res, sid) {
  res.setHeader('Set-Cookie', 'ob_session=' + encodeURIComponent(sid) + '; Path=/; HttpOnly; SameSite=Lax' + (process.env.NODE_ENV === 'production' ? '; Secure' : '') + '; Max-Age=31536000');
}
function getSessionId(req, res) {
  const match = req.headers.cookie?.match(/(?:^|;\s*)ob_session=([^;]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  const sid = crypto.randomUUID(); setSessionCookie(res, sid); return sid;
}
function storageCookie(sid) { return 'ob_session=' + encodeURIComponent(sid); }
async function storageRequest(sid, method, key, value) {
  const options = { method, headers: { cookie: storageCookie(sid) } };
  if (value !== undefined) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify({ value }); }
  const response = await fetch(internalBase + '/api/storage/' + encodeURIComponent(key), options);
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok) throw new Error('storage ' + method + ' failed with HTTP ' + response.status);
  const body = await response.json().catch(() => ({}));
  return body.value ?? null;
}
const storage = {
  getStoredValue: (sid, key) => storageRequest(sid, 'GET', key),
  setStoredValue: async (sid, key, value) => { await storageRequest(sid, 'PUT', key, value); },
  deleteStoredValue: async (sid, key) => { await storageRequest(sid, 'DELETE', key); }
};
registerMt5Routes(app, { getSessionId, ...storage });

const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(internalPort) }, stdio: 'inherit' });
child.on('exit', code => { if (code !== 0) process.exit(code || 1); });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { child.kill(signal); process.exit(0); });

app.use(async (req, res) => {
  try {
    const headers = { ...req.headers }; delete headers.host; delete headers.connection; delete headers['content-length'];
    const hasBody = !['GET', 'HEAD'].includes(req.method) && req.body !== undefined;
    const upstream = await fetch(internalBase + req.originalUrl, { method: req.method, headers, body: hasBody ? JSON.stringify(req.body) : undefined });
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type'); if (contentType) res.setHeader('content-type', contentType);
    const cookies = upstream.headers.getSetCookie?.() || (upstream.headers.get('set-cookie') ? [upstream.headers.get('set-cookie')] : []);
    if (cookies.length) res.setHeader('set-cookie', cookies);

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (contentType?.toLowerCase().includes('text/html')) {
      let html = bytes.toString('utf8');
      // The Next-Gen index is intentionally kept as the UI source of truth.
      // Load the previously built feature layer after the page so it can wire
      // accounts, heatmap, discipline, MT5 UI, and navigation without replacing
      // or reconstructing the existing HTML.
      if (!html.includes('src="/backend-sync.js"')) {
        html = html.replace(/<\/body>\s*<\/html>\s*$/i, '  <script src="/backend-sync.js"></script>\n</body>\n</html>');
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
