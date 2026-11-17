// Part 4: the Cloudflare Pages build (scripts/build-static.mjs) and the /api proxy
// (functions/api/[[path]].js). No secret may reach a file served to the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, injectHtml, findSecrets } from '../scripts/build-static.mjs';
import { onRequest } from '../functions/api/[[path]].js';

test('static build: every page gets backend-sync.js and the Google client id; only /api/* runs the function', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'obstatic-')), 'dist');
  build(out, { GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com' });
  const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const auth = fs.readFileSync(path.join(out, 'auth.html'), 'utf8');
  assert.equal(index.split('src="/backend-sync.js"').length - 1, 1, 'index.html: exactly one backend-sync.js tag');
  assert.equal(auth.split('src="/backend-sync.js"').length - 1, 1, 'auth.html gets it, as the gateway does');
  assert.match(auth, /<meta name="google-client-id" content="123-abc\.apps\.googleusercontent\.com">/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, '_routes.json'), 'utf8')), { version: 1, include: ['/api/*'], exclude: [] });
  assert.ok(fs.existsSync(path.join(out, 'rule-presets.js')) && fs.existsSync(path.join(out, 'home')));
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
});

test('static build: refuses to publish anything that looks like a secret', () => {
  assert.deepEqual(findSecrets('const x = 1;', {}), []);
  assert.ok(findSecrets('k="eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop"', {}).length);
  assert.ok(findSecrets('postgresql://postgres:hunter22@db.example.co:5432/postgres', {}).length);
  assert.deepEqual(findSecrets('my value is topsecretvalue1', { CRON_SECRET: 'topsecretvalue1' }), ['the value of CRON_SECRET']);
  // public/ itself is clean today
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'obstatic-')), 'dist');
  assert.doesNotThrow(() => build(tmp, { ...process.env }));
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  assert.equal(injectHtml('<html><body></body></html>', '').match(/backend-sync/g).length, 1);
});

test('Pages proxy: /api/* goes to API_ORIGIN with the cookie, answers come back with Set-Cookie', async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen.push({ url, init }); return new Response('{"ok":true}', { status: 201, headers: { 'set-cookie': 'ob_session=u; Path=/; HttpOnly', 'content-type': 'application/json' } }); };
  try {
    const req = new Request('https://journal.pages.dev/api/storage/ob-trades?x=1', { method: 'PUT', headers: { cookie: 'ob_session=u', 'content-type': 'application/json' }, body: '{"value":"[]"}' });
    const res = await onRequest({ request: req, env: { API_ORIGIN: 'https://ob-backtest-journal.onrender.com/' } });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('set-cookie'), 'ob_session=u; Path=/; HttpOnly');
    assert.equal(seen[0].url, 'https://ob-backtest-journal.onrender.com/api/storage/ob-trades?x=1');
    assert.equal(seen[0].init.headers.get('cookie'), 'ob_session=u');
    assert.equal(seen[0].init.headers.get('x-forwarded-host'), 'journal.pages.dev');
    assert.equal(seen[0].init.method, 'PUT');
    const missing = await onRequest({ request: new Request('https://journal.pages.dev/api/health'), env: {} });
    assert.equal(missing.status, 503, 'no API_ORIGIN: a clear error, not a silent failure');
  } finally { globalThis.fetch = realFetch; }
});
