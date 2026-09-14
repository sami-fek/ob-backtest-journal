import test from 'node:test';
import assert from 'node:assert/strict';
import { registerMt5Routes } from '../mt5-backend.js';

function makeHarness() {
  const routes = new Map();
  const values = new Map();
  const sessionId = 'browser-session';
  const app = {
    post(path, handler) { routes.set('POST ' + path, handler); },
    get(path, handler) { routes.set('GET ' + path, handler); }
  };
  const storage = {
    getStoredValue: async (sid, key) => values.get(sid + '|' + key) ?? null,
    setStoredValue: async (sid, key, value) => { values.set(sid + '|' + key, value); },
    deleteStoredValue: async (sid, key) => { values.delete(sid + '|' + key); },
    getSessionId: () => sessionId
  };
  registerMt5Routes(app, storage);
  async function call(method, path, body = {}, query = {}) {
    const response = { statusCode: 200, headers: {}, payload: null, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; } };
    await routes.get(method + ' ' + path)({ body, query, headers: {} }, response);
    return response;
  }
  return { storage, call };
}

const accounts = {
  Demo: [{ id: 'demo-1', name: 'Demo 01', balance: 100000, startingBalance: 100000 }],
  Real: [{ id: 'real-1', name: 'Real 01', balance: 100000, startingBalance: 100000 }],
  Funded: [{ id: 'funded-1', name: 'Funded 01', balance: 100000, startingBalance: 100000 }]
};

async function linkedHarness() {
  const harness = makeHarness();
  await harness.storage.setStoredValue('browser-session', 'my_journal_accounts_v1', JSON.stringify(accounts));
  const linked = await harness.call('POST', '/api/mt5/link', { accountId: 'demo-1', mode: 'Demo', login: '123456', server: 'Broker-Demo', label: 'Demo bridge' });
  assert.equal(linked.statusCode, 201);
  assert.equal(linked.payload.ok, true);
  assert.match(linked.payload.token, /^obmt5_/);
  return { ...harness, token: linked.payload.token };
}

test('links only an existing account and returns a safe token response', async () => {
  const harness = makeHarness();
  await harness.storage.setStoredValue('browser-session', 'my_journal_accounts_v1', JSON.stringify(accounts));
  const missing = await harness.call('POST', '/api/mt5/link', { accountId: 'not-real', mode: 'Demo', login: '123456', server: 'Broker-Demo' });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.payload.code, 'MT5_JOURNAL_ACCOUNT_NOT_FOUND');
  const linked = await harness.call('POST', '/api/mt5/link', { accountId: 'demo-1', mode: 'Demo', login: '123456', server: 'Broker-Demo' });
  assert.equal(linked.statusCode, 201);
  assert.equal(linked.payload.link.tokenHash, undefined);
  assert.equal(linked.payload.link.login, '123456');
});

test('sync deduplicates positions, updates them, and state removes closed positions', async () => {
  const { call, token } = await linkedHarness();
  const first = await call('POST', '/api/mt5/sync', { token, login: '123456', server: 'Broker-Demo', currency: 'USD', balance: 1000, equity: 1010, positions: [
    { ticket: 77, symbol: 'EURUSD', type: 'BUY', volume: 0.1, openTime: '2026-09-14T06:00:00Z', openPrice: 1.1, sl: 1.09, tp: 1.12, profit: 5 },
    { ticket: 77, symbol: 'EURUSD', type: 'BUY', volume: 0.1, openTime: '2026-09-14T06:00:00Z', openPrice: 1.1, sl: 1.09, tp: 1.12, profit: 7 }
  ] });
  assert.equal(first.statusCode, 200);
  assert.equal(first.payload.positionCount, 1);
  const state = await call('GET', '/api/mt5/state', {}, { accountId: 'demo-1' });
  assert.equal(state.statusCode, 200);
  assert.equal(state.payload.linked, true);
  assert.equal(state.payload.state.positions.length, 1);
  assert.equal(state.payload.state.positions[0].ticket, '77');
  assert.equal(state.payload.state.positions[0].profit, 7);
  assert.equal(state.payload.state.unrealizedPnl, 7);
  const second = await call('POST', '/api/mt5/sync', { token, login: '123456', server: 'Broker-Demo', currency: 'USD', balance: 995, equity: 995, positions: [] });
  assert.equal(second.statusCode, 200);
  const empty = await call('GET', '/api/mt5/state', {}, { accountId: 'demo-1' });
  assert.deepEqual(empty.payload.state.positions, []);
});

test('rejects invalid tokens and mismatched broker identity', async () => {
  const { call, token } = await linkedHarness();
  const invalid = await call('POST', '/api/mt5/sync', { token: 'obmt5_invalid', login: '123456', server: 'Broker-Demo', positions: [] });
  assert.equal(invalid.statusCode, 401);
  const mismatch = await call('POST', '/api/mt5/sync', { token, login: '123456', server: 'Other-Broker', positions: [] });
  assert.equal(mismatch.statusCode, 403);
});

test('stores closed trades once by ticket and preserves links after account rename', async () => {
  const { storage, call, token } = await linkedHarness();
  const response = await call('POST', '/api/mt5/sync', { token, login: '123456', server: 'Broker-Demo', positions: [], closedTrades: [
    { ticket: 9001, symbol: 'GBPUSD', direction: 'Sell', volume: 0.2, openTime: 1720000000, closeTime: 1720000300, profit: 12 },
    { ticket: 9001, symbol: 'GBPUSD', direction: 'Sell', volume: 0.2, openTime: 1720000000, closeTime: 1720000300, profit: 12 }
  ] });
  assert.equal(response.statusCode, 200);
  const history = await call('GET', '/api/mt5/history', {}, { accountId: 'demo-1' });
  assert.equal(history.payload.closedTrades.length, 1);
  const renamed = { ...accounts, Demo: [{ ...accounts.Demo[0], name: 'Renamed Demo' }] };
  await storage.setStoredValue('browser-session', 'my_journal_accounts_v1', JSON.stringify(renamed));
  const state = await call('GET', '/api/mt5/state', {}, { accountId: 'demo-1' });
  assert.equal(state.payload.linked, true);
});

test('keeps Demo and Real links isolated', async () => {
  const { storage, call, token } = await linkedHarness();
  const real = await call('POST', '/api/mt5/link', { accountId: 'real-1', mode: 'Real', login: '654321', server: 'Broker-Real' });
  assert.equal(real.statusCode, 201);
  const demoState = await call('GET', '/api/mt5/state', {}, { accountId: 'demo-1' });
  const realState = await call('GET', '/api/mt5/state', {}, { accountId: 'real-1' });
  assert.equal(demoState.payload.linked, true);
  assert.equal(realState.payload.linked, true);
  assert.notEqual(token, real.payload.token);
});
