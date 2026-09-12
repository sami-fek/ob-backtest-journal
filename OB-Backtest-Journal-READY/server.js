import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
app.use(express.json({ limit: '12mb' }));

function setSessionCookie(res, sid) {
  res.setHeader('Set-Cookie', `ob_session=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}; Max-Age=31536000`);
}
function getSessionId(req, res) {
  const match = req.headers.cookie?.match(/(?:^|;\s*)ob_session=([^;]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  const sid = crypto.randomUUID();
  setSessionCookie(res, sid);
  return sid;
}

const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
let db = null;
if (!useSupabase) {
  const dataDir = path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(path.join(dataDir, 'journal.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS kv (session_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (session_id, key))`);
}

async function supabaseRequest(pathname, options = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  const headers = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...options.headers };
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
  if (!useSupabase) return db.prepare('SELECT value FROM kv WHERE session_id = ? AND key = ?').get(sid, key)?.value ?? null;
  const q = new URLSearchParams({ select: 'value', session_id: `eq.${sid}`, key: `eq.${key}`, limit: '1' });
  const rows = await supabaseRequest(`kv?${q.toString()}`);
  return rows?.[0]?.value ?? null;
}
async function setStoredValue(sid, key, value) {
  if (!useSupabase) {
    db.prepare(`INSERT INTO kv(session_id,key,value,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(session_id,key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`).run(sid, key, value);
    return;
  }
  await supabaseRequest('kv', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ session_id: sid, key, value }) });
}
async function deleteStoredValue(sid, key) {
  if (!useSupabase) { db.prepare('DELETE FROM kv WHERE session_id = ? AND key = ?').run(sid, key); return; }
  const q = new URLSearchParams({ session_id: `eq.${sid}`, key: `eq.${key}` });
  await supabaseRequest(`kv?${q.toString()}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

app.get('/api/storage/:key', async (req, res) => {
  try { const sid = getSessionId(req, res); const value = await getStoredValue(sid, req.params.key); if (value == null) return res.status(404).json({ value: null }); res.json({ value }); }
  catch (err) { console.error('Storage GET failed:', err); res.status(500).json({ error: 'Storage read failed' }); }
});
app.put('/api/storage/:key', async (req, res) => {
  try { const sid = getSessionId(req, res); if (typeof req.body?.value !== 'string') return res.status(400).json({ error: 'value must be a string' }); await setStoredValue(sid, req.params.key, req.body.value); res.json({ ok: true }); }
  catch (err) { console.error('Storage PUT failed:', err); res.status(500).json({ error: 'Storage write failed' }); }
});
app.delete('/api/storage/:key', async (req, res) => {
  try { const sid = getSessionId(req, res); await deleteStoredValue(sid, req.params.key); res.json({ ok: true }); }
  catch (err) { console.error('Storage DELETE failed:', err); res.status(500).json({ error: 'Storage delete failed' }); }
});

const PROVIDER_CONFIG = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', env: 'GROQ_API_KEY', headers: {} },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', env: 'GEMINI_API_KEY', headers: {} },
  openai: { url: 'https://api.openai.com/v1/chat/completions', env: 'OPENAI_API_KEY', headers: {} },
  anthropic: { url: 'https://api.anthropic.com/v1/chat/completions', env: 'ANTHROPIC_API_KEY', headers: { 'anthropic-dangerous-direct-browser-access': 'true' } }
};
function providerConfig(provider) { return PROVIDER_CONFIG[provider]; }
function envKey(provider) { const cfg = providerConfig(provider); return cfg ? process.env[cfg.env] : null; }

function cleanAiAnswer(value) {
  let text = String(value ?? '');

  // Never expose model reasoning, even if the provider puts it in the visible content.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');

  // Keep the journal UI in plain ChatGPT-style text instead of Markdown formatting.
  text = text.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, '');
  text = text.replace(/^\s*#{1,6}\s*/gm, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '• ');
  text = text.replace(/\*+/g, '');

  // Remove Markdown table separator rows and convert remaining table rows to readable lines.
  text = text.replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, '');
  text = text.replace(/^\s*\|\s*(.*?)\s*\|\s*$/gm, (_, row) => `• ${row.replace(/\s*\|\s*/g, ' — ')}`);

  text = text.replace(/[ \t]+$/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

const AI_FORMAT_INSTRUCTION = `FINAL ANSWER FORMAT: Return only the useful final answer. Do not reveal reasoning or thinking. Use plain text, not Markdown. Never use asterisk characters. Never use Markdown tables or code blocks. Use short plain-text headings only when useful, followed by short paragraphs or bullets using the bullet character •. Be concise and practical. For most questions stay under 350 words. Structure the answer like a direct trading-coach response: strongest finding first, evidence next, clear conclusion, then one practical next test when useful.`;

app.post('/api/ai', async (req, res) => {
  const { provider = 'groq', model, messages, max_completion_tokens = 800, temperature = 0.4 } = req.body || {};
  const cfg = providerConfig(provider);
  const key = envKey(provider);
  if (!cfg || !key) return res.status(503).json({ error: `Server AI provider "${provider}" is not configured. Add its API key to Render environment variables.` });
  if (!model || !Array.isArray(messages)) return res.status(400).json({ error: 'model and messages are required' });

  try {
    const safeMaxTokens = Math.min(Math.max(Number(max_completion_tokens) || 800, 100), 800);

    // Add a final formatting instruction without changing the user's journal question.
    const safeMessages = messages.map(m => ({ ...m }));
    const systemIndex = safeMessages.findIndex(m => m.role === 'system');
    if (systemIndex >= 0) {
      safeMessages[systemIndex] = {
        ...safeMessages[systemIndex],
        content: `${safeMessages[systemIndex].content || ''}\n\n${AI_FORMAT_INSTRUCTION}`
      };
    } else {
      safeMessages.unshift({ role: 'system', content: AI_FORMAT_INSTRUCTION });
    }

    const payload = { model, messages: safeMessages, max_completion_tokens: safeMaxTokens, temperature };

    if (provider === 'groq') {
      payload.include_reasoning = false;
      if (model.startsWith('qwen/')) payload.reasoning_effort = 'none';
      else if (model.startsWith('openai/gpt-oss-')) payload.reasoning_effort = 'low';
    }

    const upstream = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...cfg.headers },
      body: JSON.stringify(payload)
    });
    const text = await upstream.text();
    let body = text;
    try { body = JSON.parse(text); } catch {}

    if (upstream.ok && body?.choices?.[0]?.message?.content) {
      body.choices[0].message.content = cleanAiAnswer(body.choices[0].message.content);
    }

    return res.status(upstream.status).json(body);
  } catch (err) {
    console.error('AI upstream request failed:', err);
    return res.status(502).json({ error: `AI upstream request failed: ${err.message}` });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, storage: useSupabase ? 'supabase' : 'sqlite', ai: {
    groq: Boolean(process.env.GROQ_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY)
  }});
});

app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`OB Journal running on http://localhost:${PORT}`));
