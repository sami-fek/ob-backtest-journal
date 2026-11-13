// shots-store.js — trade screenshots as files (BUILD-PLAN-2 Part 4 Step 1).
//
// Screenshots used to live inside the single "ob-trades" record as data URLs,
// which hits the 12 MB request limit after a handful of trades with photos.
// Now each image is stored once as a file and trades keep only a reference:
//     /api/shots/<32 hex>.<ext>        (id = first 32 hex of the image's SHA-256)
// The id is derived from the bytes, so the same image uploaded twice is one file
// (uploads and migrations are idempotent).
//
// Backends:
//   - local folder:     <dataDir>/shots/<userId>/<id>          (SQLite fallback)
//   - Supabase Storage: bucket SUPABASE_SCREENSHOTS_BUCKET (default "trade-screenshots"),
//                       private, object path <userId>/<id>; created on first use.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const REF_PREFIX = '/api/shots/';
export const MAX_SHOT_BYTES = 8 * 1024 * 1024;
const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const EXT_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const ID_RE = /^[a-f0-9]{32}\.(png|jpg|webp|gif)$/;
const USER_RE = /^[A-Za-z0-9_-]{1,80}$/;

export const isShotId = id => typeof id === 'string' && ID_RE.test(id);
export const refFor = id => REF_PREFIX + id;
export function idFromRef(ref) {
  if (typeof ref !== 'string' || !ref.startsWith(REF_PREFIX)) return null;
  const id = ref.slice(REF_PREFIX.length);
  return isShotId(id) ? id : null;
}

/** 'data:image/png;base64,...' → { mime, buffer } or null */
export function parseDataUrl(s) {
  if (typeof s !== 'string') return null;
  const m = /^data:(image\/[a-z+.-]+);base64,/i.exec(s);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!MIME_EXT[mime]) return null;
  const buffer = Buffer.from(s.slice(m[0].length), 'base64');
  if (!buffer.length) return null;
  return { mime: mime === 'image/jpg' ? 'image/jpeg' : mime, buffer };
}

export function idFor(buffer, mime) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32) + '.' + MIME_EXT[mime];
}

/** Every screenshot id referenced by a trades JSON string (or array). */
export function refsIn(tradesJson) {
  const out = new Set();
  let list = tradesJson;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { return out; } }
  if (!Array.isArray(list)) return out;
  for (const t of list) for (const s of (t && Array.isArray(t.screenshots) ? t.screenshots : [])) { const id = idFromRef(s); if (id) out.add(id); }
  return out;
}

export function hasEmbedded(tradesJson) {
  return typeof tradesJson === 'string' && tradesJson.includes('data:image/');
}

/**
 * Moves embedded data-URL screenshots out of a trades JSON string into the store.
 * A data URL is replaced only after its file is stored; anything that fails stays
 * embedded (never lost). Returns { json, changed, moved, failed }.
 */
export async function extractEmbedded(store, userId, tradesJson) {
  let list;
  try { list = JSON.parse(tradesJson); } catch { return { json: tradesJson, changed: false, moved: 0, failed: 0 }; }
  if (!Array.isArray(list)) return { json: tradesJson, changed: false, moved: 0, failed: 0 };
  let moved = 0, failed = 0;
  for (const t of list) {
    if (!t || !Array.isArray(t.screenshots)) continue;
    for (let i = 0; i < t.screenshots.length; i++) {
      const parsed = parseDataUrl(t.screenshots[i]);
      if (!parsed) continue;
      try {
        if (parsed.buffer.length > MAX_SHOT_BYTES) throw new Error('too large');
        const id = await store.save(userId, parsed.buffer, parsed.mime);
        t.screenshots[i] = refFor(id);
        moved++;
      } catch (err) {
        failed++;
        console.warn('[shots] could not move an embedded screenshot:', err.message);
      }
    }
  }
  return moved ? { json: JSON.stringify(list), changed: true, moved, failed } : { json: tradesJson, changed: false, moved, failed };
}

// ── Local folder backend ─────────────────────────────────────────────────────
export function localStore(rootDir) {
  const dirFor = userId => { if (!USER_RE.test(userId)) throw new Error('bad user id'); return path.join(rootDir, userId); };
  return {
    kind: 'local',
    async save(userId, buffer, mime) {
      const id = idFor(buffer, mime);
      const dir = dirFor(userId);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, id);
      if (!fs.existsSync(file)) {
        const tmp = file + '.' + process.pid + '.tmp';
        fs.writeFileSync(tmp, buffer);
        fs.renameSync(tmp, file);
      }
      return id;
    },
    async read(userId, id) {
      if (!isShotId(id)) return null;
      try { return { buffer: fs.readFileSync(path.join(dirFor(userId), id)), mime: EXT_MIME[id.split('.').pop()] }; } catch { return null; }
    },
    async remove(userId, ids) {
      for (const id of ids) if (isShotId(id)) { try { fs.unlinkSync(path.join(dirFor(userId), id)); } catch {} }
    },
    async list(userId) {
      let names = [];
      try { names = fs.readdirSync(dirFor(userId)); } catch { return []; }
      return names.filter(isShotId).map(id => { let at = 0; try { at = fs.statSync(path.join(dirFor(userId), id)).mtimeMs; } catch {} return { id, createdAt: at }; });
    },
    async removeAll(userId) { try { fs.rmSync(dirFor(userId), { recursive: true, force: true }); } catch {} }
  };
}

// ── Supabase Storage backend ─────────────────────────────────────────────────
export function supabaseStore({ url, key, bucket = 'trade-screenshots', fetchImpl = fetch }) {
  const base = String(url).replace(/\/$/, '') + '/storage/v1';
  const auth = { apikey: key, Authorization: `Bearer ${key}` };
  const objPath = (userId, id) => { if (!USER_RE.test(userId) || !isShotId(id)) throw new Error('bad path'); return `${userId}/${id}`; };
  let bucketReady = false;
  async function ensureBucket() {
    if (bucketReady) return;
    const r = await fetchImpl(`${base}/bucket`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: bucket, name: bucket, public: false }) });
    // 200 = created; 400/409 = already exists
    if (!r.ok && r.status !== 400 && r.status !== 409) throw new Error(`Supabase Storage bucket ${r.status}: ${await r.text().catch(() => '')}`);
    bucketReady = true;
  }
  async function upload(p, buffer, mime) {
    return fetchImpl(`${base}/object/${bucket}/${p}`, { method: 'POST', headers: { ...auth, 'Content-Type': mime, 'x-upsert': 'true', 'cache-control': '31536000' }, body: buffer });
  }
  return {
    kind: 'supabase',
    async save(userId, buffer, mime) {
      const id = idFor(buffer, mime);
      const p = objPath(userId, id);
      let r = await upload(p, buffer, mime);
      if (!r.ok) {
        // first use: the bucket may not exist yet
        await ensureBucket();
        r = await upload(p, buffer, mime);
      }
      if (!r.ok) throw new Error(`Supabase Storage upload ${r.status}: ${await r.text().catch(() => '')}`);
      return id;
    },
    async read(userId, id) {
      if (!isShotId(id)) return null;
      const r = await fetchImpl(`${base}/object/${bucket}/${objPath(userId, id)}`, { headers: auth });
      if (!r.ok) return null;
      return { buffer: Buffer.from(await r.arrayBuffer()), mime: EXT_MIME[id.split('.').pop()] };
    },
    async remove(userId, ids) {
      const prefixes = [...ids].filter(isShotId).map(id => objPath(userId, id));
      if (!prefixes.length) return;
      const r = await fetchImpl(`${base}/object/${bucket}`, { method: 'DELETE', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes }) });
      if (!r.ok && r.status !== 404) throw new Error(`Supabase Storage delete ${r.status}`);
    },
    async list(userId) {
      if (!USER_RE.test(userId)) return [];
      const out = [];
      for (let offset = 0; offset < 100000; offset += 1000) {
        const r = await fetchImpl(`${base}/object/list/${bucket}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: userId + '/', limit: 1000, offset }) });
        if (!r.ok) break;
        const rows = await r.json().catch(() => []);
        for (const row of rows || []) if (isShotId(row.name)) out.push({ id: row.name, createdAt: Date.parse(row.created_at || '') || 0 });
        if (!rows || rows.length < 1000) break;
      }
      return out;
    },
    async removeAll(userId) { const all = await this.list(userId); await this.remove(userId, all.map(x => x.id)); }
  };
}

/**
 * After the trades record changed: delete files no longer referenced.
 *  - ids referenced before and not after (screenshot removed, trade deleted, Clear all)
 *  - unreferenced files older than graceMs (uploads from trades that were never saved)
 */
export async function collectGarbage(store, userId, beforeJson, afterJson, { graceMs = 24 * 3600 * 1000, now = Date.now() } = {}) {
  const after = refsIn(afterJson);
  const gone = [...refsIn(beforeJson)].filter(id => !after.has(id));
  let stale = [];
  try { stale = (await store.list(userId)).filter(f => !after.has(f.id) && f.createdAt && now - f.createdAt > graceMs).map(f => f.id); } catch {}
  const ids = [...new Set([...gone, ...stale])];
  if (ids.length) await store.remove(userId, ids);
  return ids;
}
