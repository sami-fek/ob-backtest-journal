// session-cookie.js — the signed sign-in cookie, shared by server.js and the MT5 gateway
// (app-entry.js).
//
// The cookie used to hold the bare user id, so anyone who learned a user id could sign in as
// that user (and, by registering with it, get a copy of that user's stored data). It now holds
//   <user id>.<HMAC-SHA256 of "v1:<user id>" with a server-only secret, base64url>
// and only a cookie the server signed is accepted. Older cookies are refused: everyone signs
// in once more.
//
// The secret, in order:
//   SESSION_SECRET                 when set (32+ characters); changing it signs everyone out
//   SUPABASE_SERVICE_ROLE_KEY      otherwise a secret derived from it (already on Render, never
//                                  sent anywhere); rotating that key signs everyone out
//   <DATA_DIR>/session-secret      local development: random, made once, kept in the data folder
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COOKIE_NAME = 'ob_session';
const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
let cached = null;

export function sessionSecret() {
  if (cached) return cached;
  const own = process.env.SESSION_SECRET;
  if (own && own.length >= 32) return (cached = own);
  if (own) console.warn('[session] SESSION_SECRET is shorter than 32 characters and is not used.');
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (service) return (cached = crypto.createHmac('sha256', service).update('my-journal session cookie v1').digest('base64url'));
  const dir = process.env.DATA_DIR || path.join(APP_DIR, 'data');
  const file = path.join(dir, 'session-secret');
  try { cached = fs.readFileSync(file, 'utf8').trim(); } catch { cached = ''; }
  if (cached.length >= 32) return cached;
  fs.mkdirSync(dir, { recursive: true });
  const fresh = crypto.randomBytes(32).toString('base64url');
  try { fs.writeFileSync(file, fresh, { flag: 'wx', mode: 0o600 }); cached = fresh; } // the other process may have made it first
  catch { cached = fs.readFileSync(file, 'utf8').trim(); }
  return cached;
}

const mac = id => crypto.createHmac('sha256', sessionSecret()).update(`v1:${id}`).digest('base64url');

/** The cookie value for a user id. */
export function signSession(userId) {
  const id = String(userId);
  return `${id}.${mac(id)}`;
}

/** The user id in a signed cookie value, or null (unsigned, tampered, or signed with another secret). */
export function verifySession(value) {
  const v = String(value || '');
  const dot = v.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = v.slice(0, dot);
  const given = Buffer.from(v.slice(dot + 1));
  const want = Buffer.from(mac(id));
  return given.length === want.length && crypto.timingSafeEqual(given, want) ? id : null;
}

/** The raw ob_session cookie value of a request (not checked). */
export function rawSessionCookie(req) {
  const match = req.headers.cookie?.match(/(?:^|;\s*)ob_session=([^;]+)/);
  if (!match?.[1]) return '';
  try { return decodeURIComponent(match[1]); } catch { return ''; }
}

/** The signed-in user id of a request, or null. */
export function sessionUserId(req) {
  return verifySession(rawSessionCookie(req));
}
