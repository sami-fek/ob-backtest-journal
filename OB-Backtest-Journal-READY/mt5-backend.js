import crypto from 'node:crypto';

const TOKEN_SESSION = '__mt5_bridge_tokens_v1';
const LINK_PREFIX = 'mt5_link:';
const STATE_PREFIX = 'mt5_state:';
const TOKEN_PREFIX = 'mt5_token:';
const MODES = new Set(['Demo', 'Real', 'Funded']);

const key = (prefix, id) => prefix + id;
const now = () => new Date().toISOString();
const requestId = () => crypto.randomBytes(8).toString('hex');
const text = (value, max = 160) => String(value ?? '').trim().slice(0, max);
const json = value => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
const number = (value, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? Math.max(-1e15, Math.min(1e15, n)) : fallback; };

function accountId(value) {
  const id = text(value, 128);
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) throw new Error('accountId must be a safe account identifier');
  return id;
}
function mode(value) {
  const valueText = text(value, 20);
  if (!MODES.has(valueText)) throw new Error('mode must be Demo, Real, or Funded');
  return valueText;
}
function login(value) {
  const valueText = text(value, 32);
  if (!/^\d{3,32}$/.test(valueText)) throw new Error('login must contain 3 to 32 digits');
  return valueText;
}
function server(value) {
  const valueText = text(value, 128);
  if (!valueText || /[\u0000-\u001f\u007f]/.test(valueText)) throw new Error('server is required');
  return valueText;
}
function fail(res, id, status, code, message, error) {
  console.error('[MT5 ' + id + '] ' + code, error);
  const result = { error: message, code, requestId: id };
  if (error?.message) result.details = error.message;
  return res.status(status).json(result);
}
function publicLink(value) {
  if (!value) return null;
  const { token, ...safe } = value;
  return safe;
}
function normalizePosition(value) {
  const p = value && typeof value === 'object' ? value : {};
  return {
    ticket: text(p.ticket ?? p.id, 64), symbol: text(p.symbol, 32), type: text(p.type ?? p.side, 16),
    volume: number(p.volume ?? p.lots), openTime: p.openTime ?? p.time ?? null,
    openPrice: number(p.openPrice ?? p.price), sl: number(p.sl), tp: number(p.tp),
    profit: number(p.profit ?? p.pnl), swap: number(p.swap), commission: number(p.commission),
    comment: text(p.comment, 160), magic: text(p.magic, 64)
  };
}
function normalizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const positions = Array.isArray(source.positions) ? source.positions : (Array.isArray(source.openPositions) ? source.openPositions : []);
  return {
    balance: number(source.balance), equity: number(source.equity), margin: number(source.margin),
    freeMargin: number(source.freeMargin ?? source.free_margin), currency: text(source.currency, 16),
    leverage: number(source.leverage), serverTime: source.serverTime ?? source.time ?? null,
    positions: positions.slice(0, 1000).map(normalizePosition), syncedAt: now()
  };
}

export function registerMt5Routes(app, storage) {
  const { getSessionId, getStoredValue, setStoredValue, deleteStoredValue } = storage;
  app.post('/api/mt5/link', async (req, res) => {
    const id = requestId(); res.setHeader('X-Request-Id', id);
    try {
      const sessionId = getSessionId(req, res);
      const idValue = accountId(req.body?.accountId), modeValue = mode(req.body?.mode);
      const loginValue = login(req.body?.login), serverValue = server(req.body?.server);
      const label = text(req.body?.label || (loginValue + ' - ' + serverValue), 160);
      const linkKey = key(LINK_PREFIX, idValue);
      const old = json(await getStoredValue(sessionId, linkKey));
      const token = 'obmt5_' + crypto.randomBytes(24).toString('base64url');
      const linkedAt = now();
      const link = { accountId: idValue, mode: modeValue, login: loginValue, server: serverValue, label, token, linkedAt, lastSyncAt: null };
      await setStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, token), JSON.stringify({ sessionId, accountId: idValue, mode: modeValue, login: loginValue, server: serverValue, createdAt: linkedAt }));
      try {
        await setStoredValue(sessionId, linkKey, JSON.stringify(link));
        await deleteStoredValue(sessionId, key(STATE_PREFIX, idValue));
      } catch (error) {
        await deleteStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, token)).catch(() => {}); throw error;
      }
      if (old?.token) await deleteStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, old.token));
      return res.status(201).json({ ok: true, token, accountId: idValue, mode: modeValue, server: serverValue, label, linkedAt });
    } catch (error) { return fail(res, id, 500, 'MT5_LINK_FAILED', 'MT5 link failed', error); }
  });

  app.post('/api/mt5/sync', async (req, res) => {
    const id = requestId(); res.setHeader('X-Request-Id', id);
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const token = text(body.token ?? body.bridgeToken ?? body.bridge_token, 200);
      if (!token) return fail(res, id, 400, 'MT5_TOKEN_REQUIRED', 'bridge token is required');
      const tokenInfo = json(await getStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, token)));
      if (!tokenInfo?.sessionId || !tokenInfo.accountId) return fail(res, id, 401, 'MT5_TOKEN_INVALID', 'bridge token is invalid or revoked');
      if (body.accountId && text(body.accountId, 128) !== tokenInfo.accountId) return fail(res, id, 403, 'MT5_ACCOUNT_MISMATCH', 'accountId does not match the linked account');
      if (body.login && text(body.login, 32) !== tokenInfo.login) return fail(res, id, 403, 'MT5_LOGIN_MISMATCH', 'login does not match the linked account');
      const source = body.state && typeof body.state === 'object' ? body.state : (body.data && typeof body.data === 'object' ? body.data : body);
      const state = normalizeState(source), linkKey = key(LINK_PREFIX, tokenInfo.accountId);
      const link = json(await getStoredValue(tokenInfo.sessionId, linkKey));
      if (!link || link.token !== token) return fail(res, id, 401, 'MT5_LINK_REVOKED', 'MT5 link is no longer active');
      await setStoredValue(tokenInfo.sessionId, key(STATE_PREFIX, tokenInfo.accountId), JSON.stringify(state));
      link.lastSyncAt = state.syncedAt;
      await setStoredValue(tokenInfo.sessionId, linkKey, JSON.stringify(link));
      return res.json({ ok: true, accountId: tokenInfo.accountId, mode: tokenInfo.mode, syncedAt: state.syncedAt });
    } catch (error) { return fail(res, id, 500, 'MT5_SYNC_FAILED', 'MT5 sync failed', error); }
  });

  app.get('/api/mt5/state', async (req, res) => {
    const id = requestId(); res.setHeader('X-Request-Id', id);
    try {
      const sessionId = getSessionId(req, res), idValue = accountId(req.query?.accountId);
      const link = json(await getStoredValue(sessionId, key(LINK_PREFIX, idValue)));
      if (!link) return res.json({ ok: true, linked: false, state: null });
      return res.json({ ok: true, linked: true, account: publicLink(link), state: json(await getStoredValue(sessionId, key(STATE_PREFIX, idValue))) });
    } catch (error) { return fail(res, id, 500, 'MT5_STATE_FAILED', 'MT5 state read failed', error); }
  });

  app.post('/api/mt5/unlink', async (req, res) => {
    const id = requestId(); res.setHeader('X-Request-Id', id);
    try {
      const sessionId = getSessionId(req, res), idValue = accountId(req.body?.accountId), linkKey = key(LINK_PREFIX, idValue);
      const link = json(await getStoredValue(sessionId, linkKey));
      if (!link) return res.json({ ok: true, linked: false });
      await deleteStoredValue(sessionId, linkKey);
      await deleteStoredValue(sessionId, key(STATE_PREFIX, idValue));
      if (link.token) await deleteStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, link.token));
      return res.json({ ok: true, linked: false, accountId: idValue });
    } catch (error) { return fail(res, id, 500, 'MT5_UNLINK_FAILED', 'MT5 unlink failed', error); }
  });
}
