import express from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
app.use(express.json({ limit: '12mb' }));

// ─── Cookie helpers ────────────────────────────────────────────────────────────

const COOKIE_NAME = 'ob_session';
const COOKIE_OPTS = `; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}; Max-Age=31536000`;

function setSessionCookie(res, userId) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(userId)}${COOKIE_OPTS}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
function readCookieUserId(req) {
  const match = req.headers.cookie?.match(/(?:^|;\s*)ob_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

// Kept for compatibility: MT5 gateway (app-entry.js) and other callers
// still expect getSessionId(req, res). After auth it returns the user UUID.
function getSessionId(req, res) {
  return readCookieUserId(req) ?? '';
}

// ─── Database initialisation ──────────────────────────────────────────────────

const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
let db = null;

if (!useSupabase) {
  const dataDir = path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(path.join(dataDir, 'journal.db'));
  db.pragma('journal_mode = WAL');

  // KV store (unchanged schema)
  db.exec(`CREATE TABLE IF NOT EXISTS kv (
    session_id  TEXT NOT NULL,
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, key)
  )`);

  // Users table — supports password auth and Google Sign-In
  // google_sub stores the stable Google account identifier (never changes)
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    google_sub    TEXT UNIQUE,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  // Add google_sub column to existing DBs that predate this migration
  try { db.exec(`ALTER TABLE users ADD COLUMN google_sub TEXT UNIQUE`); } catch (_) {}
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

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

// ─── KV helpers ───────────────────────────────────────────────────────────────

async function getStoredValue(sid, key) {
  if (!sid) return null;
  if (!useSupabase) {
    return db.prepare('SELECT value FROM kv WHERE session_id = ? AND key = ?').get(sid, key)?.value ?? null;
  }
  const q = new URLSearchParams({ select: 'value', session_id: `eq.${sid}`, key: `eq.${key}`, limit: '1' });
  const rows = await supabaseRequest(`kv?${q.toString()}`);
  return rows?.[0]?.value ?? null;
}

async function setStoredValue(sid, key, value) {
  if (!sid) return;
  if (!useSupabase) {
    db.prepare(`INSERT INTO kv(session_id,key,value,updated_at)
      VALUES(?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(session_id,key)
      DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`
    ).run(sid, key, value);
    return;
  }
  await supabaseRequest('kv', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ session_id: sid, key, value })
  });
}

async function deleteStoredValue(sid, key) {
  if (!sid) return;
  if (!useSupabase) {
    db.prepare('DELETE FROM kv WHERE session_id = ? AND key = ?').run(sid, key);
    return;
  }
  const q = new URLSearchParams({ session_id: `eq.${sid}`, key: `eq.${key}` });
  await supabaseRequest(`kv?${q.toString()}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

// ─── User helpers ──────────────────────────────────────────────────────────────

async function getUserById(id) {
  if (!id) return null;
  if (!useSupabase) {
    return db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(id) ?? null;
  }
  const q = new URLSearchParams({ select: 'id,email,created_at', id: `eq.${id}`, limit: '1' });
  const rows = await supabaseRequest(`users?${q.toString()}`);
  return rows?.[0] ?? null;
}

async function getUserByEmail(email) {
  if (!useSupabase) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) ?? null;
  }
  const q = new URLSearchParams({ select: '*', email: `eq.${email.toLowerCase().trim()}`, limit: '1' });
  const rows = await supabaseRequest(`users?${q.toString()}`);
  return rows?.[0] ?? null;
}

async function createUser(email, passwordHash = null, googleSub = null) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const normalEmail = email.toLowerCase().trim();
  if (!useSupabase) {
    db.prepare('INSERT INTO users (id, email, password_hash, google_sub, created_at) VALUES (?,?,?,?,?)')
      .run(id, normalEmail, passwordHash, googleSub, now);
    return { id, email: normalEmail, google_sub: googleSub, created_at: now };
  }
  await supabaseRequest('users', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ id, email: normalEmail, password_hash: passwordHash, google_sub: googleSub, created_at: now })
  });
  return { id, email: normalEmail, google_sub: googleSub, created_at: now };
}

// Look up user by Google sub (stable identifier — never changes even if email changes)
async function getUserByGoogleSub(sub) {
  if (!sub) return null;
  if (!useSupabase) {
    return db.prepare('SELECT id, email, google_sub, created_at FROM users WHERE google_sub = ?').get(sub) ?? null;
  }
  const q = new URLSearchParams({ select: 'id,email,google_sub,created_at', google_sub: `eq.${sub}`, limit: '1' });
  const rows = await supabaseRequest(`users?${q.toString()}`);
  return rows?.[0] ?? null;
}

// Find or create a user from a verified Google token payload.
// Priority: (1) match by google_sub, (2) match by email and attach sub,
// (3) create new user.  The same Google account always resolves to the same
// application user — no duplicates.
async function findOrCreateUserByGoogle(sub, email) {
  // 1. Exact match by stable Google sub
  let user = await getUserByGoogleSub(sub);
  if (user) return user;

  // 2. Existing user with same email (e.g. registered with password first)
  //    Attach the google_sub so future logins go through path 1
  user = await getUserByEmail(email);
  if (user) {
    if (!useSupabase) {
      db.prepare('UPDATE users SET google_sub = ? WHERE id = ? AND google_sub IS NULL').run(sub, user.id);
    } else {
      await supabaseRequest(`users?id=eq.${user.id}&google_sub=is.null`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ google_sub: sub })
      });
    }
    return { ...user, google_sub: sub };
  }

  // 3. New user — create with google_sub attached
  return createUser(email, null, sub);
}

// Find or create a user by email — kept for password register flow
async function findOrCreateUser(email) {
  const existing = await getUserByEmail(email);
  if (existing) return existing;
  return createUser(email, null, null);
}

// ─── Auth middleware ───────────────────────────────────────────────────────────

async function requireAuth(req, res) {
  const userId = readCookieUserId(req);
  if (!userId) return null;
  const user = await getUserById(userId);
  return user || null;
}

function unauthorized(res, message = 'Authentication required') {
  return res.status(401).json({ error: message, code: 'UNAUTHORIZED' });
}

// ─── Auth routes (public — no auth required) ─────────────────────────────────

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.', code: 'EMAIL_INVALID' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.', code: 'PASSWORD_TOO_SHORT' });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.', code: 'EMAIL_TAKEN' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser(email, passwordHash);

    // Migration: if the browser had an existing anonymous session cookie, migrate
    // its KV data to the new user's ID so existing trades/settings are preserved.
    const oldSessionId = readCookieUserId(req);
    if (oldSessionId && oldSessionId !== user.id) {
      await migrateSessionData(oldSessionId, user.id);
    }

    setSessionCookie(res, user.id);
    return res.status(201).json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('Register failed:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.', code: 'REGISTER_FAILED' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.', code: 'MISSING_CREDENTIALS' });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      // Use constant-time comparison to prevent timing attacks
      await bcrypt.compare(password, '$2a$12$invalidhashtopreventtimingattack');
      return res.status(401).json({ error: 'Incorrect email or password.', code: 'INVALID_CREDENTIALS' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect email or password.', code: 'INVALID_CREDENTIALS' });
    }

    setSessionCookie(res, user.id);
    return res.json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('Login failed:', err);
    return res.status(500).json({ error: 'Login failed. Please try again.', code: 'LOGIN_FAILED' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  return res.json({ ok: true });
});

// GET /api/auth/me
app.get('/api/auth/me', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return unauthorized(res);
  return res.json({ ok: true, user: { id: user.id, email: user.email } });
});

// ─── Google Sign-In ───────────────────────────────────────────────────────────
// Full server-side verification of the Google ID token (credential) returned
// by Google Identity Services.  Steps per Google's spec:
//   1. Fetch Google's public tokeninfo endpoint to decode + verify the JWT
//   2. Verify iss (issuer) is accounts.google.com or https://accounts.google.com
//   3. Verify aud (audience) matches our GOOGLE_CLIENT_ID
//   4. Verify exp (expiry) — token must not be expired
//   5. Verify email_verified is true
//   6. Use sub (stable Google account ID) as the primary identity key
// We never trust email/sub values sent directly from the frontend.

// POST /api/auth/google  { credential }
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ error: 'Google credential is required.', code: 'MISSING_CREDENTIAL' });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({
        error: 'Google Sign-In is not configured on this server. Set the GOOGLE_CLIENT_ID environment variable.',
        code: 'GOOGLE_NOT_CONFIGURED'
      });
    }

    // ── Step 1: Verify the ID token with Google's tokeninfo endpoint ──────────
    // This endpoint decodes the JWT, checks its signature against Google's
    // public keys, and returns the claims if valid.
    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!verifyRes.ok) {
      console.warn('[Auth] Google tokeninfo rejected:', verifyRes.status);
      return res.status(401).json({
        error: 'Google credential verification failed. Please try signing in again.',
        code: 'GOOGLE_INVALID'
      });
    }

    const payload = await verifyRes.json();

    // ── Step 2: Verify issuer ─────────────────────────────────────────────────
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!validIssuers.includes(payload.iss)) {
      console.warn('[Auth] Google token invalid issuer:', payload.iss);
      return res.status(401).json({ error: 'Invalid token issuer.', code: 'GOOGLE_INVALID_ISSUER' });
    }

    // ── Step 3: Verify audience matches our client ID ─────────────────────────
    // aud can be a string or array
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(clientId)) {
      console.warn('[Auth] Google token wrong audience:', payload.aud);
      return res.status(401).json({
        error: 'Google credential is not valid for this application.',
        code: 'GOOGLE_WRONG_AUD'
      });
    }

    // ── Step 4: Verify token expiry ───────────────────────────────────────────
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && Number(payload.exp) < nowSec) {
      return res.status(401).json({
        error: 'Google credential has expired. Please sign in again.',
        code: 'GOOGLE_EXPIRED'
      });
    }

    // ── Step 5: Require verified email ────────────────────────────────────────
    if (payload.email_verified !== 'true' && payload.email_verified !== true) {
      return res.status(401).json({
        error: 'Your Google account email address is not verified.',
        code: 'GOOGLE_EMAIL_UNVERIFIED'
      });
    }

    // ── Step 6: Extract sub (stable identity) and email ───────────────────────
    // sub is Google's permanent, stable identifier for this account.
    // It never changes even if the user changes their email address.
    const sub   = String(payload.sub || '').trim();
    const email = String(payload.email || '').toLowerCase().trim();

    if (!sub) {
      return res.status(401).json({ error: 'Could not retrieve identity from Google token.', code: 'GOOGLE_NO_SUB' });
    }
    if (!email) {
      return res.status(401).json({ error: 'Could not retrieve email from Google account.', code: 'GOOGLE_NO_EMAIL' });
    }

    // ── Find or create application user ───────────────────────────────────────
    // Uses sub as primary key — same Google account always → same app user.
    const oldSessionId = readCookieUserId(req);
    const user = await findOrCreateUserByGoogle(sub, email);

    // Migrate any anonymous session data to this user (first-time sign-in)
    if (oldSessionId && oldSessionId !== user.id) {
      await migrateSessionData(oldSessionId, user.id);
    }

    // ── Create application session ────────────────────────────────────────────
    setSessionCookie(res, user.id);
    console.log(`[Auth] Google sign-in: user ${user.id.slice(0,8)}… (${user.email})`);
    return res.json({ ok: true, user: { id: user.id, email: user.email } });

  } catch (err) {
    console.error('Google sign-in failed:', err);
    return res.status(500).json({
      error: 'Google Sign-In failed. Please try again.',
      code: 'GOOGLE_FAILED'
    });
  }
});

// ─── KV storage routes (protected) ────────────────────────────────────────────

app.get('/api/storage/:key', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return unauthorized(res);
    const value = await getStoredValue(user.id, req.params.key);
    if (value == null) return res.status(404).json({ value: null });
    res.json({ value });
  } catch (err) { console.error('Storage GET failed:', err); res.status(500).json({ error: 'Storage read failed' }); }
});

app.put('/api/storage/:key', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return unauthorized(res);
    if (typeof req.body?.value !== 'string') return res.status(400).json({ error: 'value must be a string' });
    await setStoredValue(user.id, req.params.key, req.body.value);
    res.json({ ok: true });
  } catch (err) { console.error('Storage PUT failed:', err); res.status(500).json({ error: 'Storage write failed' }); }
});

app.delete('/api/storage/:key', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return unauthorized(res);
    await deleteStoredValue(user.id, req.params.key);
    res.json({ ok: true });
  } catch (err) { console.error('Storage DELETE failed:', err); res.status(500).json({ error: 'Storage delete failed' }); }
});

// ─── AI proxy (protected) ────────────────────────────────────────────────────

const PROVIDER_CONFIG = {
  groq:     { url: 'https://api.groq.com/openai/v1/chat/completions',                         env: 'GROQ_API_KEY',     headers: {} },
  gemini:   { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', env: 'GEMINI_API_KEY',   headers: {} },
  openai:   { url: 'https://api.openai.com/v1/chat/completions',                               env: 'OPENAI_API_KEY',   headers: {} },
  anthropic:{ url: 'https://api.anthropic.com/v1/chat/completions',                            env: 'ANTHROPIC_API_KEY', headers: { 'anthropic-dangerous-direct-browser-access': 'true' } }
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
  out = out.replace(/Note:\s*([\s\S]*?)(?=\nScreenshots:)/g, (_, note) => {
    const n = note.trim();
    if (!n || n === '(no note)') return 'Note: (no note)\nScreenshots:';
    return `Note: ${n.slice(0, 500)}${n.length > 500 ? '…' : ''}\nScreenshots:`;
  });
  return out;
}

function estimateInputTokens(messages) {
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
  const targetTokens = 5800;
  if (estimateInputTokens(cloned) <= targetTokens) return cloned;
  const system = cloned.filter(m => m.role === 'system');
  const nonSystem = cloned.filter(m => m.role !== 'system');
  const current = nonSystem[nonSystem.length - 1];
  const older = nonSystem.slice(0, -1);
  let kept = [...system, current];
  for (let i = older.length - 1; i >= 0; i--) {
    const candidate = [older[i], ...kept];
    if (estimateInputTokens(candidate) <= targetTokens) kept = candidate;
    else break;
  }
  if (estimateInputTokens(kept) <= targetTokens) return kept;
  if (typeof current.content === 'string') {
    let s = current.content;
    if (s.length > 16500) {
      const qi = s.lastIndexOf('\n\nUSER QUESTION:');
      const question = qi >= 0 ? s.slice(qi) : '';
      const body = qi >= 0 ? s.slice(0, qi) : s;
      current.content = `${body.slice(0, 5000)}\n\n[Journal text compacted.]\n\n${body.slice(-10500)}${question}`;
    }
  } else if (Array.isArray(current.content)) {
    current.content = current.content.map(part => {
      if (part?.type !== 'text') return part;
      let s = String(part.text || '');
      if (s.length <= 14500) return part;
      const qi = s.lastIndexOf('\n\nUSER QUESTION:');
      const question = qi >= 0 ? s.slice(qi) : '';
      const body = qi >= 0 ? s.slice(0, qi) : s;
      return { ...part, text: `${body.slice(0, 4500)}\n\n[Journal text compacted.]\n\n${body.slice(-9000)}${question}` };
    });
  }
  return kept;
}

app.post('/api/ai', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return unauthorized(res);

  const { provider = 'groq', model, messages, max_completion_tokens = 800, temperature = 0.4 } = req.body || {};
  const cfg = providerConfig(provider);
  const key = envKey(provider);
  if (!cfg || !key) return res.status(503).json({ error: `Server AI provider "${provider}" is not configured.` });
  if (!model || !Array.isArray(messages)) return res.status(400).json({ error: 'model and messages are required' });

  try {
    const safeMaxTokens = Math.min(Math.max(Number(max_completion_tokens) || 800, 100), 800);
    const safeMessages = messages.map(m => ({ ...m }));
    const systemIndex = safeMessages.findIndex(m => m.role === 'system');
    if (systemIndex >= 0) {
      safeMessages[systemIndex] = { ...safeMessages[systemIndex], content: `${safeMessages[systemIndex].content || ''}\n\n${AI_FORMAT_INSTRUCTION}` };
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

// ─── Health (public) ──────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    storage: useSupabase ? 'supabase' : 'sqlite',
    auth: 'enabled',
    ai: {
      groq:     Boolean(process.env.GROQ_API_KEY),
      gemini:   Boolean(process.env.GEMINI_API_KEY),
      openai:   Boolean(process.env.OPENAI_API_KEY),
      anthropic:Boolean(process.env.ANTHROPIC_API_KEY)
    }
  });
});

// ─── Trade enforcement API (protected) ────────────────────────────────────────

const TRADES_KEY        = 'ob-trades';
const SETTINGS_KEY      = 'ob-os-settings';
const DAILY_TRADE_LIMIT = 3;

function todayUTC() { return new Date().toISOString().slice(0, 10); }

function parseJsonSafe(value) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

async function getTradeList(uid) {
  const raw = await getStoredValue(uid, TRADES_KEY);
  const list = parseJsonSafe(raw);
  return Array.isArray(list) ? list : [];
}

async function getDailyLimit(uid) {
  const raw = await getStoredValue(uid, SETTINGS_KEY);
  const s = parseJsonSafe(raw);
  const n = parseInt(s?.maxDailyTrades, 10);
  return Number.isFinite(n) && n > 0 ? n : DAILY_TRADE_LIMIT;
}

// GET /api/trades/daily-count?mode=Real&date=YYYY-MM-DD
app.get('/api/trades/daily-count', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return unauthorized(res);

    const mode  = String(req.query.mode || 'Real');
    const date  = String(req.query.date || todayUTC());
    const limit = await getDailyLimit(user.id);

    if (mode === 'Backtest') {
      return res.json({ ok: true, count: 0, limit, date, mode, limitReached: false });
    }

    const trades  = await getTradeList(user.id);
    const count   = trades.filter(t =>
      String(t.mode || '') === mode &&
      String(t.date || '').slice(0, 10) === date.slice(0, 10) &&
      !t._deleted
    ).length;

    return res.json({ ok: true, count, limit, date, mode, limitReached: count >= limit });
  } catch (err) {
    console.error('daily-count failed:', err);
    return res.status(500).json({ error: 'daily-count failed' });
  }
});

// POST /api/trades
app.post('/api/trades', async (req, res) => {
  try {
    const user  = await requireAuth(req, res);
    if (!user) return unauthorized(res);

    const trade = req.body?.trade;
    const mode  = String(req.body?.mode || trade?.mode || 'Real');

    if (!trade || typeof trade !== 'object' || !trade.id) {
      return res.status(400).json({ error: 'trade object with id is required', code: 'TRADE_INVALID' });
    }

    if (mode !== 'Backtest') {
      const limit      = await getDailyLimit(user.id);
      const date       = String(trade.date || todayUTC()).slice(0, 10);
      const tradeList  = await getTradeList(user.id);
      const todayCount = tradeList.filter(t =>
        String(t.mode || '') === mode &&
        String(t.date || '').slice(0, 10) === date &&
        !t._deleted
      ).length;

      if (todayCount >= limit) {
        return res.status(429).json({
          error: `Daily trade limit reached. You have already logged ${todayCount} trade${todayCount === 1 ? '' : 's'} today (limit: ${limit}). No more trades can be logged for this day.`,
          code: 'DAILY_LIMIT_REACHED',
          count: todayCount,
          limit,
          date,
          mode
        });
      }
    }

    const tradeList = await getTradeList(user.id);
    const existing  = tradeList.findIndex(t => String(t.id) === String(trade.id));
    let updated;
    if (existing >= 0) {
      updated = [...tradeList];
      updated[existing] = { ...tradeList[existing], ...trade };
    } else {
      updated = [trade, ...tradeList];
    }

    await setStoredValue(user.id, TRADES_KEY, JSON.stringify(updated));
    return res.status(201).json({ ok: true, id: trade.id, total: updated.length });
  } catch (err) {
    console.error('POST /api/trades failed:', err);
    return res.status(500).json({ error: 'Trade save failed' });
  }
});

// ─── Data migration helper ────────────────────────────────────────────────────
// Moves all KV rows from an old anonymous session to a newly created user.
// Called once during registration if the browser had existing session data.
// Skips keys that the new user already has (prevents overwrite of fresh account).

async function migrateSessionData(oldSessionId, newUserId) {
  if (!oldSessionId || !newUserId || oldSessionId === newUserId) return;
  // Validate oldSessionId looks like a UUID (not a user ID or garbage)
  if (!/^[0-9a-f-]{36}$/i.test(oldSessionId)) return;

  try {
    if (!useSupabase) {
      const rows = db.prepare('SELECT key, value FROM kv WHERE session_id = ?').all(oldSessionId);
      if (!rows.length) return;
      const insertStmt = db.prepare(`
        INSERT INTO kv(session_id, key, value, updated_at)
        VALUES(?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(session_id, key) DO NOTHING
      `);
      const migrate = db.transaction(() => {
        for (const row of rows) {
          insertStmt.run(newUserId, row.key, row.value);
        }
      });
      migrate();
      console.log(`[Auth] Migrated ${rows.length} KV rows from session ${oldSessionId.slice(0,8)}… to user ${newUserId.slice(0,8)}…`);
    } else {
      const q = new URLSearchParams({ select: 'key,value', session_id: `eq.${oldSessionId}` });
      const rows = await supabaseRequest(`kv?${q.toString()}`);
      if (!rows?.length) return;
      const payload = rows.map(r => ({ session_id: newUserId, key: r.key, value: r.value }));
      await supabaseRequest('kv', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(payload)
      });
      console.log(`[Auth] Migrated ${rows.length} KV rows (Supabase) to user ${newUserId.slice(0,8)}…`);
    }
  } catch (err) {
    // Non-fatal — log and continue; user just starts fresh
    console.warn('[Auth] Data migration warning:', err.message);
  }
}

// ─── Static files + catch-all (public) ────────────────────────────────────────

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.type('html').send(fs.readFileSync(indexPath, 'utf8'));
});
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`OB Journal running on http://localhost:${PORT}`));

// Export for app-entry.js compatibility (getSessionId is used by MT5 routes)
export { getSessionId, getStoredValue, setStoredValue, deleteStoredValue };
