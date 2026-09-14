import crypto from 'node:crypto';

const ACCOUNT_STORAGE_KEY = 'my_journal_accounts_v1';
const TOKEN_SESSION = '__mt5_bridge_tokens_v2';
const LINK_PREFIX = 'mt5_link:';
const STATE_PREFIX = 'mt5_state:';
const HISTORY_PREFIX = 'mt5_history:';
const TOKEN_PREFIX = 'mt5_token_hash:';
const MODES = new Set(['Demo', 'Real', 'Funded']);
const MAX_POSITIONS = 1000;
const MAX_HISTORY = 5000;

const key = (prefix, id) => prefix + id;
const now = () => new Date().toISOString();
const requestId = () => crypto.randomBytes(8).toString('hex');
const text = (value, max = 160) => String(value ?? '').trim().slice(0, max);
const parseJson = value => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
const number = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(-1e15, Math.min(1e15, n)) : fallback;
};
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');

class Mt5Error extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function requireAccountId(value) {
  const id = text(value, 128);
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) throw new Mt5Error(400, 'MT5_ACCOUNT_ID_INVALID', 'accountId must be a safe account identifier');
  return id;
}
function requireMode(value) {
  const modeValue = text(value, 20);
  if (!MODES.has(modeValue)) throw new Mt5Error(400, 'MT5_MODE_INVALID', 'mode must be Demo, Real, or Funded');
  return modeValue;
}
function requireLogin(value) {
  const loginValue = text(value, 32);
  if (!/^\\d{3,32}$/.test(loginValue)) throw new Mt5Error(400, 'MT5_LOGIN_INVALID', 'login must contain 3 to 32 digits');
  return loginValue;
}
function requireServer(value) {
  const serverValue = text(value, 128);
  if (!serverValue || /[\\u0000-\\u001f\\u007f]/.test(serverValue)) throw new Mt5Error(400, 'MT5_SERVER_INVALID', 'server is required and contains invalid characters');
  return serverValue;
}
function optionalLogin(value) { return value == null || value === '' ? null : requireLogin(value); }
function optionalServer(value) { return value == null || value === '' ? null : requireServer(value); }
function safeLabel(value, fallback) {
  const label = text(value || fallback, 160);
  if (!label) throw new Mt5Error(400, 'MT5_LABEL_INVALID', 'label is invalid');
  return label;
}
function fail(res, id, error, fallbackStatus, fallbackCode, fallbackMessage) {
  const status = error instanceof Mt5Error ? error.status : fallbackStatus;
  const code = error instanceof Mt5Error ? error.code : fallbackCode;
  const result = { error: error instanceof Mt5Error ? error.message : fallbackMessage, code, requestId: id };
  if (process.env.NODE_ENV !== 'production' && error?.message && !(error instanceof Mt5Error)) result.details = error.message;
  console.error('[MT5 ' + id + '] ' + code, error);
  return res.status(status).json(result);
}
function publicLink(value) {
  if (!value) return null;
  const { token, tokenHash, ...safe } = value;
  return safe;
}
function getAccountRecord(value, accountId, modeValue) {
  const data = parseJson(value);
  const accounts = data && Array.isArray(data[modeValue]) ? data[modeValue] : [];
  const account = accounts.find(item => item && String(item.id) === accountId);
  if (!account) throw new Mt5Error(404, 'MT5_JOURNAL_ACCOUNT_NOT_FOUND', 'selected journal account was not found in this session');
  if (account.mode && account.mode !== modeValue) throw new Mt5Error(409, 'MT5_ACCOUNT_MODE_MISMATCH', 'journal account belongs to a different mode');
  return account;
}
function normalizeTimestamp(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? new Date(value * 1000).toISOString() : new Date(value).toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? text(value, 64) : parsed.toISOString();
}
function normalizeDirection(value) {
  const direction = text(value, 16).toLowerCase();
  if (direction === 'buy' || direction === 'long') return 'Buy';
  if (direction === 'sell' || direction === 'short') return 'Sell';
  return text(value, 16);
}
function normalizePosition(value) {
  const source = value && typeof value === 'object' ? value : {};
  const ticket = text(source.ticket ?? source.positionTicket ?? source.id, 64);
  if (!ticket) return null;
  const direction = normalizeDirection(source.direction ?? source.type ?? source.side);
  return {
    ticket,
    symbol: text(source.symbol ?? source.pair, 32),
    type: direction,
    direction,
    volume: number(source.volume ?? source.lots ?? source.lot),
    openTime: normalizeTimestamp(source.openTime ?? source.open_time ?? source.time),
    openPrice: number(source.openPrice ?? source.open_price ?? source.price),
    sl: number(source.sl ?? source.stopLoss ?? source.stop_loss),
    tp: number(source.tp ?? source.takeProfit ?? source.take_profit),
    currentPrice: number(source.currentPrice ?? source.current_price ?? source.priceCurrent),
    profit: number(source.profit ?? source.pnl ?? source.floatingPnl),
    swap: number(source.swap),
    commission: number(source.commission),
    comment: text(source.comment, 160),
    magic: text(source.magic, 64),
    updatedAt: now()
  };
}
function normalizeClosedTrade(value) {
  const source = value && typeof value === 'object' ? value : {};
  const ticket = text(source.ticket ?? source.dealTicket ?? source.positionTicket ?? source.id, 64);
  if (!ticket) return null;
  const direction = normalizeDirection(source.direction ?? source.type ?? source.side);
  return {
    ticket,
    symbol: text(source.symbol ?? source.pair, 32),
    type: direction,
    direction,
    volume: number(source.volume ?? source.lots ?? source.lot),
    openTime: normalizeTimestamp(source.openTime ?? source.open_time),
    closeTime: normalizeTimestamp(source.closeTime ?? source.close_time ?? source.time),
    openPrice: number(source.openPrice ?? source.open_price),
    closePrice: number(source.closePrice ?? source.close_price ?? source.price),
    sl: number(source.sl ?? source.stopLoss ?? source.stop_loss),
    tp: number(source.tp ?? source.takeProfit ?? source.take_profit),
    profit: number(source.profit ?? source.pnl),
    commission: number(source.commission),
    swap: number(source.swap),
    comment: text(source.comment, 160),
    magic: text(source.magic, 64),
    updatedAt: now()
  };
}
function normalizeState(source, tokenInfo) {
  const value = source && typeof source === 'object' ? source : {};
  const rawPositions = Array.isArray(value.positions) ? value.positions : (Array.isArray(value.openPositions) ? value.openPositions : []);
  const positionsByTicket = new Map();
  for (const item of rawPositions.slice(0, MAX_POSITIONS)) {
    const position = normalizePosition(item);
    if (position) positionsByTicket.set(position.ticket, position);
  }
  const positions = [...positionsByTicket.values()];
  const computedPnl = positions.reduce((sum, item) => sum + item.profit + item.swap, 0);
  return {
    login: tokenInfo.login,
    server: tokenInfo.server,
    currency: text(value.currency, 16),
    balance: number(value.balance),
    equity: number(value.equity),
    margin: number(value.margin),
    freeMargin: number(value.freeMargin ?? value.free_margin),
    unrealizedPnl: number(value.unrealizedPnl ?? value.floatingPnl, computedPnl),
    leverage: number(value.leverage),
    serverTime: normalizeTimestamp(value.serverTime ?? value.server_time ?? value.time),
    positions,
    syncedAt: now()
  };
}
function mergeHistory(existingValue, incoming) {
  const existing = parseJson(existingValue);
  const byTicket = new Map();
  const oldTrades = Array.isArray(existing) ? existing : [];
  for (const item of oldTrades) if (item?.ticket) byTicket.set(String(item.ticket), item);
  for (const item of incoming) {
    const trade = normalizeClosedTrade(item);
    if (trade) byTicket.set(trade.ticket, trade);
  }
  return [...byTicket.values()].slice(-MAX_HISTORY);
}

export function registerMt5Routes(app, storage) {
  const { getSessionId, getStoredValue, setStoredValue, deleteStoredValue } = storage;

  async function readToken(token) {
    const hash = tokenHash(token);
    const info = parseJson(await getStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, hash)));
    if (!info?.sessionId || !info.accountId || info.status === 'revoked') throw new Mt5Error(401, 'MT5_TOKEN_INVALID', 'bridge token is invalid or revoked');
    const link = parseJson(await getStoredValue(info.sessionId, key(LINK_PREFIX, info.accountId)));
    if (!link || link.tokenHash !== hash || link.status === 'revoked') throw new Mt5Error(401, 'MT5_LINK_REVOKED', 'MT5 link is no longer active');
    return { hash, info, link };
  }

  app.post('/api/mt5/link', async (req, res) => {
    const id = requestId(); res.setHeader('X-Request-Id', id);
    try {
      const sessionId = getSessionId(req, res);
      const accountId = requireAccountId(req.body?.accountId);
      const modeValue = requireMode(req.body?.mode);
      const loginValue = requireLogin(req.body?.login);
      const serverValue = requireServer(req.body?.server);
      getAccountRecord(await getStoredValue(sessionId, ACCOUNT_STORAGE_KEY), accountId, modeValue);
      const label = safeLabel(req.body?.label, loginValue + ' - ' + serverValue);
      const linkKey = key(LINK_PREFIX, accountId);
      const old = parseJson(await getStoredValue(sessionId, linkKey));
      const token = 'obmt5_' + crypto.randomBytes(32).toString('base64url');
      const hash = tokenHash(token);
      const linkedAt = now();
      const link = { version: 2, accountId, mode: modeValue, login: loginValue, server: serverValue, label, tokenHash: hash, linkedAt, lastSyncAt: null, status: 'linked' };
      await setStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, hash), JSON.stringify({ version: 2, sessionId, accountId, mode: modeValue, login: loginValue, server: serverValue, createdAt: linkedAt, status: 'active' }));
      try {
        await setStoredValue(sessionId, linkKey, JSON.stringify(link));
        await deleteStoredValue(sessionId, key(STATE_PREFIX, accountId));
        await deleteStoredValue(sessionId, key(HISTORY_PREFIX, accountId));
      } catch (error) {
        await deleteStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, hash)).catch(() => {});
        throw error;
      }
      if (old?.tokenHash) await deleteStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, old.tokenHash));
      if (old?.token) await deleteStoredValue(TOKEN_SESSION, key('mt5_token:', old.token));
      const safeLink = publicLink(link);
      return res.status(201).json({ ok: true, token, link: safeLink, accountId, mode: modeValue, server: serverValue, label, linkedAt });
    } catch (error) {
      return fail(res, id, error, 500, 'MT5_LINK_FAILED', 'MT5 link failed');
    }
  });

  app.post('/api/mt5/sync', async (req, res) => {
    const id = requestId(); res.setHeader('X-Request-Id', id);
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const token = text(body.token ?? body.bridgeToken ?? body.bridge_token, 200);
      if (!token) throw new Mt5Error(400, 'MT5_TOKEN_REQUIRED', 'bridge token is required');
      const { hash, info, link } = await readToken(token);
      const source = body.state && typeof body.state === 'object' ? { ...body, ...body.state } : (body.data && typeof body.data === 'object' ? { ...body, ...body.data } : body);
      const loginValue = optionalLogin(source.login);
      const serverValue = optionalServer(source.server);
      if (loginValue && loginValue !== info.login) throw new Mt5Error(403, 'MT5_LOGIN_MISMATCH', 'login does not match the linked account');
      if (serverValue && serverValue !== info.server) throw new Mt5Error(403, 'MT5_SERVER_MISMATCH', 'server does not match the linked account');
      const state = normalizeState(source, info);
      await setStoredValue(info.sessionId, key(STATE_PREFIX, info.accountId), JSON.stringify(state));
      const rawClosed = Array.isArray(source.closedTrades) ? source.closedTrades : (Array.isArray(source.history) ? source.history : []);
      if (rawClosed.length) {
        const history = mergeHistory(await getStoredValue(info.sessionId, key(HISTORY_PREFIX, info.accountId)), rawClosed);
        await setStoredValue(info.sessionId, key(HISTORY_PREFIX, info.accountId), JSON.stringify(history));
      }
      link.lastSyncAt = state.syncedAt;
      link.status = 'synced';
      await setStoredValue(info.sessionId, key(LINK_PREFIX, info.accountId), JSON.stringify(link));
      return res.json({ ok: true, accountId: info.accountId, mode: info.mode, syncedAt: state.syncedAt, positionCount: state.positions.length });
    } catch (error) {
      return fail(res, id, error, 500, 'MT5_SYNC_FAILED', 'MT5 sync failed');
    }
  });

  app.get('/api/mt5/state', async (req, res) => {
    const id = requestId(); res.setHeader('X-Request-Id', id);
    try {
      const sessionId = getSessionId(req, res);
      const accountId = requireAccountId(req.query?.accountId);
      const link = parseJson(await getStoredValue(sessionId, key(LINK_PREFIX, accountId)));
      if (!link || link.status === 'revoked') return res.json({ ok: true, linked: false, state: null });
      return res.json({ ok: true, linked: true, account: publicLink(link), state: parseJson(await getStoredValue(sessionId, key(STATE_PREFIX, accountId))) });
    } catch (error) {
      return fail(res, id, error, 500, 'MT5_STATE_FAILED', 'MT5 state read failed');
    }
  });

  app.get('/api/mt5/history', async (req, res) => {
    const id = requestId(); res.setHeader('X-Request-Id', id);
    try {
      const sessionId = getSessionId(req, res);
      const accountId = requireAccountId(req.query?.accountId);
      const link = parseJson(await getStoredValue(sessionId, key(LINK_PREFIX, accountId)));
      if (!link || link.status === 'revoked') return res.json({ ok: true, linked: false, closedTrades: [] });
      return res.json({ ok: true, linked: true, accountId, closedTrades: parseJson(await getStoredValue(sessionId, key(HISTORY_PREFIX, accountId))) || [] });
    } catch (error) {
      return fail(res, id, error, 500, 'MT5_HISTORY_FAILED', 'MT5 history read failed');
    }
  });

  app.post('/api/mt5/unlink', async (req, res) => {
    const id = requestId(); res.setHeader('X-Request-Id', id);
    try {
      const sessionId = getSessionId(req, res);
      const accountId = requireAccountId(req.body?.accountId);
      const linkKey = key(LINK_PREFIX, accountId);
      const link = parseJson(await getStoredValue(sessionId, linkKey));
      if (!link) return res.json({ ok: true, linked: false });
      await deleteStoredValue(sessionId, linkKey);
      await deleteStoredValue(sessionId, key(STATE_PREFIX, accountId));
      await deleteStoredValue(sessionId, key(HISTORY_PREFIX, accountId));
      if (link.tokenHash) await deleteStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, link.tokenHash));
      if (link.token) await deleteStoredValue(TOKEN_SESSION, key('mt5_token:', link.token));
      return res.json({ ok: true, linked: false, accountId });
    } catch (error) {
      return fail(res, id, error, 500, 'MT5_UNLINK_FAILED', 'MT5 unlink failed');
    }
  });
}
