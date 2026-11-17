// The signed sign-in cookie (session-cookie.js). A bare user id, an old unsigned cookie, a
// tampered signature or one made with another secret is not a session, and registering while
// holding someone else's id copies nothing of theirs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startLocalServer, sqliteAvailable } from './local-server.js';

const skip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';

test('sign and verify: only a cookie signed with this secret names a user', async () => {
  process.env.SESSION_SECRET = 'a-test-secret-that-is-at-least-32-characters-long';
  const { signSession, verifySession } = await import('../session-cookie.js');
  const id = '5091dd57-0000-4000-8000-000000000000';
  const v = signSession(id);
  assert.match(v, /^5091dd57-0000-4000-8000-000000000000\.[A-Za-z0-9_-]{43}$/);
  assert.equal(verifySession(v), id);
  assert.equal(verifySession(id), null, 'a bare user id (the old cookie) is refused');
  assert.equal(verifySession(`${id}.`), null);
  assert.equal(verifySession(v.slice(0, -1) + (v.endsWith('A') ? 'B' : 'A')), null, 'a tampered signature is refused');
  assert.equal(verifySession(`11111111-1111-4111-8111-111111111111${v.slice(v.indexOf('.'))}`), null, 'another user\'s signature does not fit');
  assert.equal(verifySession(''), null);
});

test('the server: a forged or old cookie is signed out; the real one works', { skip }, async () => {
  const srv = await startLocalServer();
  try {
    const a = srv.client();
    const reg = await a.call('POST', '/api/auth/register', { email: 'victim@test.local', password: 'password123' });
    const id = reg.body.user.id;
    assert.match(a.cookie, new RegExp(`^ob_session=${id}\\.`), 'the cookie set at sign-in is signed');
    await a.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([{ id: 'tr-1', mode: 'Real', date: '2026-11-17', rMultiple: 1, notes: 'private' }]) });
    assert.equal((await a.call('GET', '/api/auth/me')).status, 200);

    // the bare user id (the old cookie format, or someone who learned the id)
    const bare = srv.client();
    bare.cookie = `ob_session=${id}`;
    assert.equal((await bare.call('GET', '/api/auth/me')).status, 401);
    assert.equal((await bare.call('GET', '/api/storage/ob-trades')).status, 401);
    // a signature made with another secret
    const other = await startLocalServer();
    const foreign = srv.client();
    foreign.cookie = other.cookieFor(id);
    await other.stop();
    assert.equal((await foreign.call('GET', '/api/auth/me')).status, 401);

    // registering while holding the victim's bare id copies nothing of theirs
    const thief = srv.client();
    thief.cookie = `ob_session=${id}`;
    assert.equal((await thief.call('POST', '/api/auth/register', { email: 'thief@test.local', password: 'password123' })).status, 201);
    const got = await thief.call('GET', '/api/storage/ob-trades');
    assert.ok(got.status === 404 || !String(got.body && got.body.value).includes('private'), 'the victim\'s trades were not copied');

    // signing out clears it; the victim's real cookie still works until then
    assert.equal((await a.call('GET', '/api/storage/ob-trades')).status, 200);
  } finally { await srv.stop(); }
});
