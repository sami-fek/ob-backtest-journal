// Screenshot file storage (BUILD-PLAN-2 Part 4 Step 1): upload, migration, deletion.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { sqliteAvailable, startLocalServer, openTestDb } from './local-server.js';
import { supabaseStore, extractEmbedded, refsIn, collectGarbage, localStore, parseDataUrl } from '../shots-store.js';

const skip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const bytesOf = d => Buffer.from(d.split(',')[1], 'base64');
async function raw(srv, cookie, url) {
  const r = await fetch(srv.base + url, { headers: cookie ? { cookie } : {} });
  return { status: r.status, type: r.headers.get('content-type'), cache: r.headers.get('cache-control'), body: Buffer.from(await r.arrayBuffer()) };
}
const trade = (id, screenshots) => ({ id, mode: 'Real', date: '2026-11-13', pair: 'XAUUSD', result: 'Win', rMultiple: 1, notes: '<p>n</p>', checklist: ['pass'], screenshots });

test('upload: stored once, served only to the owner', { skip }, async () => {
  const srv = await startLocalServer();
  try {
    const a = srv.client(); await a.call('POST', '/api/auth/register', { email: 'a@shots.local', password: 'password123' });
    const b = srv.client(); await b.call('POST', '/api/auth/register', { email: 'b@shots.local', password: 'password123' });

    let r = await srv.client().call('POST', '/api/shots', { dataUrl: PNG });
    assert.equal(r.status, 401);
    r = await a.call('POST', '/api/shots', { dataUrl: 'data:text/plain;base64,aGVsbG8=' });
    assert.equal(r.status, 400);
    r = await a.call('POST', '/api/shots', { dataUrl: PNG });
    assert.equal(r.status, 201, r.text);
    assert.match(r.body.ref, /^\/api\/shots\/[a-f0-9]{32}\.png$/);
    const ref = r.body.ref;
    const again = await a.call('POST', '/api/shots', { dataUrl: PNG });
    assert.equal(again.body.ref, ref, 'same image → same id');

    const got = await raw(srv, a.cookie, ref);
    assert.equal(got.status, 200);
    assert.equal(got.type, 'image/png');
    assert.match(got.cache, /private/);
    assert.ok(got.body.equals(bytesOf(PNG)), 'bytes unchanged');
    assert.equal((await raw(srv, b.cookie, ref)).status, 404, 'other users cannot read it');
    assert.equal((await raw(srv, '', ref)).status, 401);
    assert.equal((await raw(srv, a.cookie, '/api/shots/..%2F..%2Fjournal.db')).status, 404);
  } finally { await srv.stop(); }
});

test('migration: embedded screenshots move to files on read and on write, without loss', { skip }, async () => {
  const srv = await startLocalServer();
  try {
    const a = srv.client();
    const reg = await a.call('POST', '/api/auth/register', { email: 'm@shots.local', password: 'password123' });
    const uid = reg.body.user.id;
    // An old record with embedded data URLs (written straight into the database)
    const old = JSON.stringify([trade('t1', [PNG, GIF]), trade('t2', []), trade('t3', ['data:image/png;base64,'])]);
    const db = openTestDb(srv.dataDir);
    db.prepare('INSERT INTO kv(session_id,key,value) VALUES(?,?,?)').run(uid, 'ob-trades', old);
    db.close();

    let r = await a.call('GET', '/api/storage/ob-trades');
    assert.equal(r.status, 200);
    const list = JSON.parse(r.body.value);
    assert.match(list[0].screenshots[0], /^\/api\/shots\/[a-f0-9]{32}\.png$/);
    assert.match(list[0].screenshots[1], /^\/api\/shots\/[a-f0-9]{32}\.gif$/);
    assert.equal(list[2].screenshots[0], 'data:image/png;base64,', 'an empty/invalid image is left as it was');
    assert.ok((await raw(srv, a.cookie, list[0].screenshots[0])).body.equals(bytesOf(PNG)));
    assert.ok((await raw(srv, a.cookie, list[0].screenshots[1])).body.equals(bytesOf(GIF)));
    // the slim record was written back
    const db2 = openTestDb(srv.dataDir);
    const stored = db2.prepare('SELECT value FROM kv WHERE session_id=? AND key=?').get(uid, 'ob-trades').value;
    db2.close();
    assert.ok(!stored.includes('base64,iVBOR'), 'no embedded image left in the database');
    assert.equal(stored.length < old.length, true);

    // write path: an imported backup with embedded images is slimmed too
    r = await a.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([...list, trade('t4', [GIF])]) });
    assert.equal(r.status, 200);
    const after = JSON.parse((await a.call('GET', '/api/storage/ob-trades')).body.value);
    assert.equal(after[3].screenshots[0], list[0].screenshots[1], 'same GIF → same file');
    // the save rule still sees one screenshot per trade
    assert.equal(after[0].screenshots.length, 2);
  } finally { await srv.stop(); }
});

test('deletion: removed screenshots, deleted trades, cleared storage and deleted accounts remove files', { skip }, async () => {
  const srv = await startLocalServer();
  try {
    const a = srv.client();
    const reg = await a.call('POST', '/api/auth/register', { email: 'd@shots.local', password: 'password123' });
    const uid = reg.body.user.id;
    const p = (await a.call('POST', '/api/shots', { dataUrl: PNG })).body.ref;
    const g = (await a.call('POST', '/api/shots', { dataUrl: GIF })).body.ref;
    const dir = path.join(srv.dataDir, 'shots', uid);
    await a.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([trade('t1', [p]), trade('t2', [g])]) });
    assert.equal(fs.readdirSync(dir).length, 2);

    // remove the screenshot from t1 → its file goes
    await a.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([trade('t1', []), trade('t2', [g])]) });
    assert.equal((await raw(srv, a.cookie, p)).status, 404);
    assert.equal((await raw(srv, a.cookie, g)).status, 200);

    // an upload from a trade that was never saved stays for 24 h (grace period)
    const orphan = (await a.call('POST', '/api/shots', { dataUrl: PNG })).body.ref;
    await a.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([trade('t2', [g])]) });
    assert.equal((await raw(srv, a.cookie, orphan)).status, 200);

    // Clear all trades (DELETE of the record) → remaining referenced files go
    await a.call('DELETE', '/api/storage/ob-trades');
    assert.equal((await raw(srv, a.cookie, g)).status, 404);

    // deleting the account removes the whole folder
    await a.call('POST', '/api/shots', { dataUrl: GIF });
    r: {
      const del = await a.call('DELETE', '/api/auth/account', { password: 'password123', confirm: 'DELETE' });
      assert.ok([200, 204].includes(del.status), del.text);
    }
    assert.equal(fs.existsSync(dir), false);
  } finally { await srv.stop(); }
});

test('garbage collection keeps referenced files and honours the grace period', async () => {
  const dir = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'shots-gc-'));
  try {
    const store = localStore(dir);
    const one = await store.save('u1', bytesOf(PNG), 'image/png');
    const two = await store.save('u1', bytesOf(GIF), 'image/gif');
    const before = JSON.stringify([{ screenshots: ['/api/shots/' + one] }]);
    const after = JSON.stringify([{ screenshots: [] }]);
    let removed = await collectGarbage(store, 'u1', before, after);
    assert.deepEqual([...removed], [one], 'only the dropped reference; the fresh orphan stays');
    removed = await collectGarbage(store, 'u1', after, after, { now: Date.now() + 25 * 3600 * 1000 });
    assert.deepEqual([...removed], [two], 'orphans older than 24 h are removed');
    assert.equal(refsIn('not json').size, 0);
    assert.equal(parseDataUrl('data:image/svg+xml;base64,PHN2Zz4='), null, 'SVG is not accepted');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Supabase Storage backend: creates the bucket on first use, uploads, reads, lists, deletes', async () => {
  const objects = new Map(); let bucket = false; const calls = [];
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    calls.push(`${req.method} ${req.url}`);
    assert.equal(req.headers.authorization, 'Bearer service-key');
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.method === 'POST' && req.url === '/storage/v1/bucket') { bucket = true; return send(200, { name: 'shots' }); }
    if (req.method === 'POST' && req.url.startsWith('/storage/v1/object/list/shots')) {
      const { prefix } = JSON.parse(body);
      return send(200, [...objects.keys()].filter(k => k.startsWith(prefix)).map(k => ({ name: k.slice(prefix.length), created_at: new Date().toISOString() })));
    }
    const m = req.url.match(/^\/storage\/v1\/object\/shots\/(.+)$/);
    if (m && req.method === 'POST') { if (!bucket) return send(400, { error: 'Bucket not found' }); objects.set(m[1], body); return send(200, { Key: m[1] }); }
    if (m && req.method === 'GET') { const o = objects.get(m[1]); if (!o) return send(404, {}); res.writeHead(200); return res.end(o); }
    if (req.method === 'DELETE' && req.url === '/storage/v1/object/shots') { for (const p of JSON.parse(body).prefixes) objects.delete(p); return send(200, []); }
    send(404, {});
  });
  await new Promise(r => server.listen(0, r));
  try {
    const store = supabaseStore({ url: `http://127.0.0.1:${server.address().port}`, key: 'service-key', bucket: 'shots' });
    const id = await store.save('user-1', bytesOf(PNG), 'image/png');
    assert.ok(bucket, 'bucket created after the first upload failed');
    assert.equal(objects.size, 1);
    const file = await store.read('user-1', id);
    assert.ok(file.buffer.equals(bytesOf(PNG)));
    assert.equal(file.mime, 'image/png');
    assert.equal(await store.read('user-2', id), null, 'other users path is separate');
    assert.deepEqual((await store.list('user-1')).map(x => x.id), [id]);
    // migration helper against this backend
    const out = await extractEmbedded(store, 'user-1', JSON.stringify([{ screenshots: [GIF] }]));
    assert.equal(out.moved, 1);
    assert.equal(objects.size, 2);
    await store.removeAll('user-1');
    assert.equal(objects.size, 0);
    assert.ok(calls.some(c => c.startsWith('DELETE')));
  } finally { server.close(); }
});
