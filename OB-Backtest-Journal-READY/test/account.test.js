// Account center backend: change password and delete account.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteAvailable, startLocalServer, openTestDb } from './local-server.js';

const skip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';

test('change-password: session required, current password checked, Google-only can set a first one', { skip }, async () => {
  const srv = await startLocalServer();
  try {
    // No session
    let r = await srv.client().call('POST', '/api/auth/change-password', { currentPassword: 'x', newPassword: 'newpassword1' });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'UNAUTHORIZED');

    const c = srv.client();
    r = await c.call('POST', '/api/auth/register', { email: 'pw@test.local', password: 'password123' });
    assert.equal(r.status, 201, r.text);

    r = await c.call('GET', '/api/auth/me');
    assert.equal(r.body.user.hasPassword, true);
    assert.equal(r.body.user.hasGoogle, false);

    // Missing current password
    r = await c.call('POST', '/api/auth/change-password', { newPassword: 'newpassword1' });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'CURRENT_PASSWORD_REQUIRED');

    // Wrong current password → 401 with a clear message
    r = await c.call('POST', '/api/auth/change-password', { currentPassword: 'wrongpass1', newPassword: 'newpassword1' });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'WRONG_PASSWORD');
    assert.match(r.body.error, /current password is incorrect/i);
    // A wrong current password must not end the session
    r = await c.call('GET', '/api/auth/me');
    assert.equal(r.status, 200);

    // Too short
    r = await c.call('POST', '/api/auth/change-password', { currentPassword: 'password123', newPassword: 'short' });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'PASSWORD_TOO_SHORT');

    // Success
    r = await c.call('POST', '/api/auth/change-password', { currentPassword: 'password123', newPassword: 'newpassword1' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.ok, true);

    // Old password no longer works, new one does
    r = await srv.client().call('POST', '/api/auth/login', { email: 'pw@test.local', password: 'password123' });
    assert.equal(r.status, 401);
    r = await srv.client().call('POST', '/api/auth/login', { email: 'pw@test.local', password: 'newpassword1' });
    assert.equal(r.status, 200);

    // Stored hash is bcrypt, never the plain text
    const db = openTestDb(srv.dataDir);
    const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('pw@test.local');
    assert.match(row.password_hash, /^\$2[aby]\$12\$/);
    assert.ok(!row.password_hash.includes('newpassword1'));

    // Google-only user: may set a first password without currentPassword
    db.prepare('INSERT INTO users (id, email, password_hash, google_sub, created_at) VALUES (?,?,?,?,?)')
      .run('11111111-1111-4111-8111-111111111111', 'g@test.local', null, 'sub-g', new Date().toISOString());
    db.close();
    const g = srv.client();
    g.cookie = 'ob_session=11111111-1111-4111-8111-111111111111';
    r = await g.call('GET', '/api/auth/me');
    assert.equal(r.body.user.hasPassword, false);
    assert.equal(r.body.user.hasGoogle, true);
    r = await g.call('POST', '/api/auth/change-password', { newPassword: 'firstpass1' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.passwordSet, true);
    r = await srv.client().call('POST', '/api/auth/login', { email: 'g@test.local', password: 'firstpass1' });
    assert.equal(r.status, 200);
    // From now on the current password is required for that user too
    r = await g.call('POST', '/api/auth/change-password', { newPassword: 'another12' });
    assert.equal(r.body.code, 'CURRENT_PASSWORD_REQUIRED');

    // Passwords never appear in server logs
    assert.ok(!/password123|newpassword1|firstpass1|wrongpass1/.test(srv.output()), 'no password in logs');
  } finally {
    await srv.stop();
  }
});

test('delete account: confirm + password required, deletes only that user\'s data', { skip }, async () => {
  const srv = await startLocalServer();
  try {
    let r = await srv.client().call('DELETE', '/api/auth/account', { confirm: 'DELETE' });
    assert.equal(r.status, 401);

    const a = srv.client();
    const b = srv.client();
    r = await a.call('POST', '/api/auth/register', { email: 'a@test.local', password: 'password123' });
    assert.equal(r.status, 201);
    const aId = r.body.user.id;
    r = await b.call('POST', '/api/auth/register', { email: 'b@test.local', password: 'password123' });
    assert.equal(r.status, 201);
    const bId = r.body.user.id;

    for (const c of [a, b]) {
      await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([{ id: 'tr-1', mode: 'Real' }]) });
      await c.call('PUT', '/api/storage/ob-profile', { value: JSON.stringify({ firstName: 'X' }) });
    }
    // MT5 bridge-token records for both users live under the shared token session
    const db = openTestDb(srv.dataDir);
    const ins = db.prepare('INSERT INTO kv (session_id, key, value) VALUES (?,?,?)');
    ins.run('__mt5_bridge_tokens_v2', 'mt5_token_hash:aaa', JSON.stringify({ sessionId: aId, accountId: 'real-1' }));
    ins.run('__mt5_bridge_tokens_v2', 'mt5_token_hash:bbb', JSON.stringify({ sessionId: bId, accountId: 'real-1' }));
    db.close();

    // Missing / wrong confirmation
    r = await a.call('DELETE', '/api/auth/account', { password: 'password123' });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'CONFIRM_REQUIRED');
    r = await a.call('DELETE', '/api/auth/account', { confirm: 'delete', password: 'password123' });
    assert.equal(r.status, 400);
    // Missing / wrong password
    r = await a.call('DELETE', '/api/auth/account', { confirm: 'DELETE' });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'PASSWORD_REQUIRED');
    r = await a.call('DELETE', '/api/auth/account', { confirm: 'DELETE', password: 'wrongpass1' });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'WRONG_PASSWORD');
    r = await a.call('GET', '/api/storage/ob-trades');
    assert.equal(r.status, 200, 'nothing deleted after a failed attempt');

    // Success
    r = await a.call('DELETE', '/api/auth/account', { confirm: 'DELETE', password: 'password123' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.ok, true);
    assert.equal(a.cookie, '', 'cookie cleared');

    const db2 = openTestDb(srv.dataDir);
    assert.equal(db2.prepare('SELECT COUNT(*) n FROM users WHERE id = ?').get(aId).n, 0);
    assert.equal(db2.prepare('SELECT COUNT(*) n FROM kv WHERE session_id = ?').get(aId).n, 0);
    assert.equal(db2.prepare("SELECT COUNT(*) n FROM kv WHERE key = 'mt5_token_hash:aaa'").get().n, 0);
    // Other user untouched
    assert.equal(db2.prepare('SELECT COUNT(*) n FROM users WHERE id = ?').get(bId).n, 1);
    assert.equal(db2.prepare('SELECT COUNT(*) n FROM kv WHERE session_id = ?').get(bId).n, 2);
    assert.equal(db2.prepare("SELECT COUNT(*) n FROM kv WHERE key = 'mt5_token_hash:bbb'").get().n, 1);
    db2.close();
    r = await b.call('GET', '/api/storage/ob-trades');
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(r.body.value)[0].id, 'tr-1');

    // The old cookie no longer works; the email can register again (fresh, empty)
    const stale = srv.client();
    stale.cookie = `ob_session=${aId}`;
    r = await stale.call('GET', '/api/auth/me');
    assert.equal(r.status, 401);
    r = await srv.client().call('POST', '/api/auth/login', { email: 'a@test.local', password: 'password123' });
    assert.equal(r.status, 401);
    const again = srv.client();
    r = await again.call('POST', '/api/auth/register', { email: 'a@test.local', password: 'password123' });
    assert.equal(r.status, 201);
    r = await again.call('GET', '/api/storage/ob-trades');
    assert.equal(r.status, 404);

    // Google-only user: no password needed, only the typed confirmation
    const db3 = openTestDb(srv.dataDir);
    db3.prepare('INSERT INTO users (id, email, password_hash, google_sub, created_at) VALUES (?,?,?,?,?)')
      .run('22222222-2222-4222-8222-222222222222', 'g2@test.local', null, 'sub-g2', new Date().toISOString());
    db3.close();
    const g = srv.client();
    g.cookie = 'ob_session=22222222-2222-4222-8222-222222222222';
    r = await g.call('DELETE', '/api/auth/account', { confirm: 'DELETE' });
    assert.equal(r.status, 200, r.text);
    assert.ok(!/password123|wrongpass1/.test(srv.output()), 'no password in logs');
  } finally {
    await srv.stop();
  }
});
