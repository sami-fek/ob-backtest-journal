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
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');
  text = text.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, '');
  text = text.replace(/^\s*#{1,6}\s*/gm, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '• ');
  text = text.replace(/\*+/g, '');
  text = text.replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, '');
  text = text.replace(/^\s*\|\s*(.*?)\s*\|\s*$/gm, (_, row) => `• ${row.replace(/\s*\|\s*/g, ' — ')}`);
  text = text.replace(/[ \t]+$/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

const AI_FORMAT_INSTRUCTION = `FINAL ANSWER FORMAT: Return only the useful final answer. Do not reveal reasoning or thinking. Use plain text, not Markdown. Never use asterisk characters. Never use Markdown tables or code blocks. Use short plain-text headings only when useful, followed by short paragraphs or bullets using the bullet character •. Be concise and practical. For most questions stay under 350 words. Structure the answer like a direct trading-coach response: strongest finding first, evidence next, clear conclusion, then one practical next test when useful. For an overall journal review, prefer exactly this structure when the evidence supports it: Main finding; What matters; Losses / problems; Conclusion; Next step. Do not turn the response into a formal report.`;

function compactJournalText(text) {
  let out = String(text ?? '');

  // Notes are useful for psychology/execution analysis, but the full 1400-character
  // note on every trade can push an overall review over Groq's free input-token limit.
  // Keep enough of every note to detect recurring patterns while protecting the request.
  out = out.replace(/Note:\s*([\s\S]*?)(?=\nScreenshots:)/g, (_, note) => {
    const n = note.trim();
    if (!n || n === '(no note)') return 'Note: (no note)\nScreenshots:';
    return `Note: ${n.slice(0, 500)}${n.length > 500 ? '…' : ''}\nScreenshots:`;
  });

  // Old chat turns are not needed for an overall journal review. Keep the current
  // journal context and current question intact; only shrink unusually large messages.
  return out;
}

function estimateInputTokens(messages) {
  // Conservative estimate for mixed natural language + journal text.
  return Math.ceil(JSON.stringify(messages).length / 3.2);
}

function compactGroqMessages(messages) {
  const cloned = messages.map(m => ({ ...m }));
  for (const m of cloned) {
    if (typeof m.content === 'string') m.content = compactJournalText(m.content);
    else if (Array.isArray(m.content)) {
      m.content = m.content.map(part => part?.type === 'text' ? { ...part, text: compactJournalText(part.text) } : part);
    }
  }

  // Groq's free on-demand tier currently allows about 7000 input tokens/minute.
  // Target well below that so an overall review remains reliable instead of failing
  // with HTTP 413. This is a request-size guard, not a journal-data deletion rule.
  const targetTokens = 5800;
  if (estimateInputTokens(cloned) <= targetTokens) return cloned;

  // Remove older conversational turns first. The current journal payload and question
  // remain the highest-priority context.
  const system = cloned.filter(m => m.role === 'system');
  const nonSystem = cloned.filter(m => m.role !== 'system');
  const current = nonSystem[nonSystem.length - 1];
  const older = nonSystem.slice(0, -1);
  let kept = [...system, current];

  // Keep a small amount of the latest prior exchange for continuity, if it fits.
  for (let i = older.length - 1; i >= 0; i--) {
    const candidate = [older[i], ...kept];
    if (estimateInputTokens(candidate) <= targetTokens) kept = candidate;
    else break;
  }

  if (estimateInputTokens(kept) <= targetTokens) return kept;

  // If the journal itself is still large, compact the current text without dropping
  // the beginning stats or the final user question.
  if (typeof current.content === 'string') {
    let s = current.content;
    const maxChars = 16500;
    if (s.length > maxChars) {
      const questionMarker = '\n\nUSER QUESTION:';
      const qi = s.lastIndexOf(questionMarker);
      const question = qi >= 0 ? s.slice(qi) : '';
      const body = qi >= 0 ? s.slice(0, qi) : s;
      const head = body.slice(0, 5000);
      const tail = body.slice(-10500);
      current.content = `${head}\n\n[Middle journal text compacted to stay within Groq input limits.]\n\n${tail}${question}`;
    }
  } else if (Array.isArray(current.content)) {
    current.content = current.content.map(part => {
      if (part?.type !== 'text') return part;
      let s = String(part.text || '');
      const maxChars = 14500;
      if (s.length <= maxChars) return part;
      const qi = s.lastIndexOf('\n\nUSER QUESTION:');
      const question = qi >= 0 ? s.slice(qi) : '';
      const body = qi >= 0 ? s.slice(0, qi) : s;
      return { ...part, text: `${body.slice(0, 4500)}\n\n[Middle journal text compacted to stay within Groq input limits.]\n\n${body.slice(-9000)}${question}` };
    });
  }

  return kept;
}

app.post('/api/ai', async (req, res) => {
  const { provider = 'groq', model, messages, max_completion_tokens = 800, temperature = 0.4 } = req.body || {};
  const cfg = providerConfig(provider);
  const key = envKey(provider);
  if (!cfg || !key) return res.status(503).json({ error: `Server AI provider "${provider}" is not configured. Add its API key to Render environment variables.` });
  if (!model || !Array.isArray(messages)) return res.status(400).json({ error: 'model and messages are required' });

  try {
    const safeMaxTokens = Math.min(Math.max(Number(max_completion_tokens) || 800, 100), 800);

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

    const finalMessages = provider === 'groq' ? compactGroqMessages(safeMessages) : safeMessages;
    const payload = { model, messages: finalMessages, max_completion_tokens: safeMaxTokens, temperature };

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
