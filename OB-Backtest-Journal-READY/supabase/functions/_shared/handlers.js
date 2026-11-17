// handlers.js — the three Edge Functions as Request → Response handlers (Part 4).
// index.ts in each function folder only wires these to Deno.serve and the database, so
// the Node tests run the same code against PGlite.
//
// deps: { db, env(name) → string|undefined, fetchImpl, now() → Date }
//
//   fetch-news   POST or GET, header x-cron-secret: CRON_SECRET    (external HTTP cron)
//   mt5-ingest   POST,        header x-ea-key: <the account's EA key>  (MYJournalLogger)
//   risk-check   POST,        header x-cron-secret: CRON_SECRET, body { userId? }
//
// No secret value is ever sent back, and errors are written to function_errors.
import { runFetchNews } from './news.js';
import { runIngest, IngestError } from './ingest.js';
import { checkUserRules, logError } from './journal-db.js';

const MAX_BODY_BYTES = 1_000_000;

export function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

/** Constant-time comparison of a presented secret with the configured one (via SHA-256). */
export async function secretMatches(presented, expected) {
  if (typeof presented !== 'string' || typeof expected !== 'string' || !expected) return false;
  const enc = s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [a, b] = await Promise.all([enc(presented), enc(expected)]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function cronAuth(req, env) {
  const expected = env('CRON_SECRET');
  if (!expected) return json(500, { ok: false, code: 'CRON_SECRET_MISSING', error: 'CRON_SECRET is not set for this function.' });
  if (!(await secretMatches(req.headers.get('x-cron-secret') || '', expected))) return json(401, { ok: false, code: 'UNAUTHORIZED', error: 'Missing or wrong x-cron-secret header.' });
  return null;
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new IngestError(413, 'BODY_TOO_LARGE', 'Request body is too large.');
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new IngestError(400, 'BAD_JSON', 'Request body is not valid JSON.'); }
}

export async function handleFetchNews(req, deps) {
  if (req.method !== 'POST' && req.method !== 'GET') return json(405, { ok: false, error: 'Use POST or GET.' });
  const denied = await cronAuth(req, deps.env);
  if (denied) return denied;
  try {
    const result = await runFetchNews({ db: deps.db, fetchImpl: deps.fetchImpl, now: deps.now ? deps.now() : new Date() });
    if (!result.ok) await logError(deps.db, 'fetch-news', new Error(result.error), { lastSuccessAt: result.lastSuccessAt });
    // A failed fetch answers 502 so the cron service shows it; the stored events are kept.
    return json(result.ok ? 200 : 502, result);
  } catch (err) {
    await logError(deps.db, 'fetch-news', err);
    return json(500, { ok: false, error: 'fetch-news failed' });
  }
}

export async function handleIngest(req, deps) {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Use POST.' });
  try {
    const body = await readJson(req);
    const result = await runIngest({ db: deps.db, key: req.headers.get('x-ea-key'), body, now: deps.now ? deps.now() : new Date() });
    return json(200, result);
  } catch (err) {
    if (err instanceof IngestError) return json(err.status, { ok: false, code: err.code, error: err.message });
    await logError(deps.db, 'mt5-ingest', err);
    return json(500, { ok: false, code: 'INGEST_FAILED', error: 'mt5-ingest failed; the EA keeps the deals and retries.' });
  }
}

export async function handleRiskCheck(req, deps) {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Use POST.' });
  const denied = await cronAuth(req, deps.env);
  if (denied) return denied;
  try {
    const body = await readJson(req);
    const atIso = (deps.now ? deps.now() : new Date()).toISOString();
    const users = body.userId
      ? [String(body.userId)]
      : (await deps.db.query(`select user_id from public.journal_migrated_users order by user_id`)).map(r => r.user_id);
    const newlyBlown = [];
    for (const uid of users) for (const b of await checkUserRules(deps.db, uid, atIso)) newlyBlown.push({ accountId: b.id, type: b.type, kind: b.blown.kind, day: b.blown.day });
    return json(200, { ok: true, usersChecked: users.length, newlyBlown });
  } catch (err) {
    if (err instanceof IngestError) return json(err.status, { ok: false, code: err.code, error: err.message });
    await logError(deps.db, 'risk-check', err);
    return json(500, { ok: false, error: 'risk-check failed' });
  }
}
