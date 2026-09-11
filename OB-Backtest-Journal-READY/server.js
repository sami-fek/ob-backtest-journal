import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const db = useSupabase ? null : new Database(path.join(__dirname, 'data', 'journal.db'));

if (db) {
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
}

async function supabaseRequest(pathname, options = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...options.headers
  };
  const response = await fetch(`${base}/rest/v1/${pathname}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const msg = typeof data === 'object' && data?.message ? data.message : text || response.statusText;
    throw new Error(`Supabase ${response.status}: ${msg}`);
  }
  return data;
}

async function getStoredValue(sid, key) {
  if (!useSupabase) {
    return db.prepare('SELECT value FROM kv WHERE session_id = ? AND key = ?').get(sid, key)?.value ?? null;
  }
  const q = new URLSearchParams({ select: 'value', session_id: `eq.${sid}`, key: `eq.${key}`, limit: '1' });
  const rows = await supabaseRequest(`kv?${q.toString()}`);
  return rows?.[0]?.value ?? null;
}

async function setStoredValue(sid, key, value) {
  if (!useSupabase) {
    db.prepare(`INSERT INTO kv(session_id,key,value,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(session_id,key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`)
      .run(sid, key, value);
    return;
  }
  await supabaseRequest('kv', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ session_id: sid, key, value })
  });
}

async function deleteStoredValue(sid, key) {
  if (!useSupabase) {
    db.prepare('DELETE FROM kv WHERE session_id = ? AND key = ?').run(sid, key);
    return;
  }
  const q = new URLSearchParams({ session_id: `eq.${sid}`, key: `eq.${key}` });
  await supabaseRequest(`kv?${q.toString()}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

app.get('/api/storage/:key', async (req, res) => {
  try {
    const sid = sessionId(req, res);
    const value = await getStoredValue(sid, req.params.key);
    if (value == null) return res.status(404).json({ value: null });
    res.json({ value });
  } catch (err) {
    console.error('Storage GET failed:', err);
    res.status(500).json({ error: 'Storage read failed' });
  }
});

app.put('/api/storage/:key', async (req, res) => {
  try {
    const sid = sessionId(req, res);
    if (typeof req.body?.value !== 'string') return res.status(400).json({ error: 'value must be a string' });
    await setStoredValue(sid, req.params.key, req.body.value);
    res.json({ ok: true });
  } catch (err) {
    console.error('Storage PUT failed:', err);
    res.status(500).json({ error: 'Storage write failed' });
  }
});

app.delete('/api/storage/:key', async (req, res) => {
  try {
    const sid = sessionId(req, res);
    await deleteStoredValue(sid, req.params.key);
    res.json({ ok: true });
  } catch (err) {
    console.error('Storage DELETE failed:', err);
    res.status(500).json({ error: 'Storage delete failed' });
  }
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
  res.json({ ok: true, storage: useSupabase ? 'supabase' : 'sqlite', ai: { groq: Boolean(process.env.GROQ_API_KEY), gemini: Boolean(process.env.GEMINI_API_KEY), openai: Boolean(process.env.OPENAI_API_KEY), anthropic: Boolean(process.env.ANTHROPIC_API_KEY) } });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`OB Journal running on http://localhost:${PORT}`));
