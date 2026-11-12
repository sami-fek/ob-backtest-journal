import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteAvailable, startLocalServer, openTestDb } from './local-server.js';

const skip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';

test('auth: register, logout, login, wrong password, duplicate, Google-only account', { skip }, async () => {
  const srv = await startLocalServer();
  try {
    const c = srv.client();

    // Register
    let r = await c.call('POST', '/api/auth/register', { email: 'User1@Test.local', password: 'password123' });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.body.user.email, 'user1@test.local');
    assert.ok(c.cookie, 'register sets session cookie');

    r = await c.call('GET', '/api/auth/me');
    assert.equal(r.status, 200);
    assert.equal(r.body.user.email, 'user1@test.local');

    // Short password / invalid email
    r = await srv.client().call('POST', '/api/auth/register', { email: 'x@test.local', password: 'short' });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'PASSWORD_TOO_SHORT');
    r = await srv.client().call('POST', '/api/auth/register', { email: 'not-an-email', password: 'password123' });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'EMAIL_INVALID');

    // Duplicate email (case-insensitive)
    r = await srv.client().call('POST', '/api/auth/register', { email: 'user1@test.local', password: 'password456' });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'EMAIL_TAKEN');

    // Logout clears session
    r = await c.call('POST', '/api/auth/logout');
    assert.equal(r.status, 200);
    r = await c.call('GET', '/api/auth/me');
    assert.equal(r.status, 401);

    // Login
    r = await c.call('POST', '/api/auth/login', { email: 'user1@test.local', password: 'password123' });
    assert.equal(r.status, 200, r.text);
    r = await c.call('GET', '/api/auth/me');
    assert.equal(r.status, 200);

    // Wrong password / unknown user
    r = await srv.client().call('POST', '/api/auth/login', { email: 'user1@test.local', password: 'wrongpass1' });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'INVALID_CREDENTIALS');
    r = await srv.client().call('POST', '/api/auth/login', { email: 'nobody@test.local', password: 'password123' });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'INVALID_CREDENTIALS');

    // Malformed body must not 500
    r = await srv.client().call('POST', '/api/auth/login', { email: ['a'], password: 123 });
    assert.equal(r.status, 400);

    // Account created through Google (no password hash) → clear 401, never 500
    const db = openTestDb(srv.dataDir);
    db.prepare('INSERT INTO users (id, email, password_hash, google_sub, created_at) VALUES (?,?,?,?,?)')
      .run('google-user-1', 'guser@test.local', null, 'sub-123', new Date().toISOString());
    db.close();
    r = await srv.client().call('POST', '/api/auth/login', { email: 'guser@test.local', password: 'anything123' });
    assert.equal(r.status, 401, r.text);
    assert.equal(r.body.code, 'PASSWORD_NOT_SET');
    assert.match(r.body.error, /Google/);

    // Google sign-in without GOOGLE_CLIENT_ID → clear 503
    r = await srv.client().call('POST', '/api/auth/google', { credential: 'x' });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'GOOGLE_NOT_CONFIGURED');
  } finally {
    await srv.stop();
  }
});
