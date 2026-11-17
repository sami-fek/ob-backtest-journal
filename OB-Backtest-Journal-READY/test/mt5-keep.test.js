// Part 4: a whole-list save of ob-trades (the app, an import, a stale page) never drops an
// MT5 trade the EA added (mt5-ingest writes straight to the tables). Only a trade the app
// says it deleted (body.deleted) is removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startLocalServer, sqliteAvailable } from './local-server.js';

const skip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';
const valueOf = r => JSON.parse(r.body.value);

for (const DATA_STORE of ['relational', 'kv']) {
  test(`${DATA_STORE}: MT5 trades survive a save that leaves them out; a deleted one goes`, { skip }, async () => {
    const srv = await startLocalServer({ DATA_RECHECK_MS: '0', DATA_STORE });
    try {
      const c = srv.client();
      assert.equal((await c.call('POST', '/api/auth/register', { email: 'keep@test.local', password: 'password123' })).status, 201);
      const mt5 = { id: 'mt5-funded-1-777', source: 'mt5', mt5Ticket: '777', mode: 'Funded', accountId: 'funded-1', date: '2026-11-16', rMultiple: 1 };
      const manual = { id: 'tr-1794000000000', mode: 'Funded', accountId: 'funded-1', date: '2026-11-15', rMultiple: -1 };
      const other = { id: 'tr-1794000000001', mode: 'Funded', accountId: 'funded-1', date: '2026-11-14', rMultiple: 2 };
      await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([mt5, manual, other]) });

      // a page that loaded before the MT5 trade arrived saves its own list (and deletes `other`)
      let r = await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([manual]) });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.kept.map(t => t.id), [mt5.id], 'the answer says which MT5 trade was kept');
      let ids = valueOf(await c.call('GET', '/api/storage/ob-trades')).map(t => t.id);
      assert.deepEqual(ids, [mt5.id, manual.id], 'MT5 trade kept, the manual delete applied');

      // the app deletes the MT5 trade on purpose
      r = await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([manual]), deleted: [mt5.id] });
      assert.equal(r.body.kept, undefined);
      ids = valueOf(await c.call('GET', '/api/storage/ob-trades')).map(t => t.id);
      assert.deepEqual(ids, [manual.id]);

      // the same deal under another id (the Render gateway's mt5-<ticket>), or twice in one
      // list: one row, the stored id wins, and the save still works (no unique-ticket error)
      assert.equal((await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([mt5, manual]) })).status, 200);
      r = await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([{ ...mt5, id: 'mt5-777' }, manual]) });
      assert.equal(r.status, 200, r.text);
      ids = valueOf(await c.call('GET', '/api/storage/ob-trades')).map(t => t.id);
      assert.deepEqual(ids, [mt5.id, manual.id]);
      r = await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([mt5, { ...mt5, id: 'mt5-777', notes: 'copy' }, manual]) });
      assert.equal(r.status, 200, r.text);
      assert.deepEqual(valueOf(await c.call('GET', '/api/storage/ob-trades')).map(t => t.id), [mt5.id, manual.id]);
      // later saves keep working
      assert.equal((await c.call('PUT', '/api/storage/ob-trades', { value: JSON.stringify([mt5, manual, other]) })).status, 200);
    } finally { await srv.stop(); }
  });
}
