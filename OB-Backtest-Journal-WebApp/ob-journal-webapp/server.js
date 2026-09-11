import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const db = new Database(path.join(__dirname, 'data', 'journal.db'));

db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    session_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, key)
  )
`);

app.use(express.json({ limit: '25mb' }));

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const match = raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function sessionId(req, res) {
  let id = getCookie(req, 'ob_session');
  if (!id || !/^[a-f0-9-]{20,80}$/i.test(id)) {
    id = crypto.randomUUID();
    res.setHeader('Set-Cookie', `ob_session=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  }
  return id;
}

function envKey(provider) {
  return ({
    groq: process.env.GROQ_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY
  })[provider];
}

function providerConfig(provider) {
  return ({
    groq: {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: {}
    },
    gemini: {
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      headers: {}
    },
    openai: {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {}
    },
    anthropic: {
      url: 'https://api.anthropic.com/v1/chat/completions',
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' }
    }
  })[provider];
}

app.get('/api/storage/:key', (req, res) => {
  const sid = sessionId(req, res);
  const row = db.prepare('SELECT value FROM kv WHERE session_id = ? AND key = ?').get(sid, req.params.key);
  if (!row) return res.status(404).json({ value: null });
  res.json({ value: row.value });
});

app.put('/api/storage/:key', (req, res) => {
  const sid = sessionId(req, res);
  if (typeof req.body?.value !== 'string') return res.status(400).json({ error: 'value must be a string' });
  db.prepare(`INSERT INTO kv(session_id,key,value,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(session_id,key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`)
    .run(sid, req.params.key, req.body.value);
  res.json({ ok: true });
});

app.delete('/api/storage/:key', (req, res) => {
  const sid = sessionId(req, res);
  db.prepare('DELETE FROM kv WHERE session_id = ? AND key = ?').run(sid, req.params.key);
  res.json({ ok: true });
});

app.post('/api/ai', async (req, res) => {
  const { provider = 'groq', model, messages, max_completion_tokens = 1400, temperature = 0.4 } = req.body || {};
  const cfg = providerConfig(provider);
  const key = envKey(provider);
  if (!cfg || !key) return res.status(503).json({ error: `Server AI provider "${provider}" is not configured. Add its API key to the server .env file.` });
  if (!model || !Array.isArray(messages)) return res.status(400).json({ error: 'model and messages are required' });

  try {
    const upstream = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        ...cfg.headers
      },
      body: JSON.stringify({ model, messages, max_completion_tokens, temperature })
    });
    const text = await upstream.text();
    res.status(upstream.status).type('application/json').send(text);
  } catch (err) {
    res.status(502).json({ error: `AI upstream request failed: ${err.message}` });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, storage: 'sqlite', ai: { groq: Boolean(process.env.GROQ_API_KEY), gemini: Boolean(process.env.GEMINI_API_KEY), openai: Boolean(process.env.OPENAI_API_KEY), anthropic: Boolean(process.env.ANTHROPIC_API_KEY) } });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`OB Journal running on http://localhost:${PORT}`));
