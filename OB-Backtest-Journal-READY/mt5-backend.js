import crypto from 'node:crypto';

const ACCOUNT_STORAGE_KEY = 'my_journal_accounts_v1';
const TRADES_STORAGE_KEY = 'ob-trades';
const TOKEN_SESSION = '__mt5_bridge_tokens_v2';
const LINK_PREFIX = 'mt5_link:';
const STATE_PREFIX = 'mt5_state:';
const HISTORY_PREFIX = 'mt5_history:';
const TOKEN_PREFIX = 'mt5_token_hash:';
const MODES = new Set(['Demo', 'Real', 'Funded']);
const MAX_POSITIONS = 1000;
const MAX_HISTORY = 5000;
const MAX_JOURNAL_TRADES = 5000;

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

const CHECKLISTS = {
  'Model A': [
    'Higher-timeframe bias identified',
    'Liquidity identified',
    'Liquidity sweep occurred',
    'BOS confirmed',
    'Pullback / entry into the defined zone',
    'Invalidation defined before entry',
    'SL at/beyond invalidation',
    'TP at next liquidity / structural target',
    'Minimum 1:2 RR'
  ],
  'Model OB': [
    'Bias identified',
    'Liquidity identified',
    'Liquidity sweep occurred',
    'Aggressive displacement (not a slow grind)',
    'Displacement created a clear FVG',
    'Displacement broke the most recent relevant high/low',
    'BOS confirmed',
    'Valid OB = last opposing candle immediately before displacement',
    'Precise invalidation defined before entry',
    'Retracement into OB/FVG POI',
    'Entry on retracement (no candle confirmation required)',
    'SL at/beyond invalidation',
    'TP at next liquidity / structural target',
    'Minimum 1:2 RR (1:3 / 1:4 only for A+ setups)'
  ]
};

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
  if (!/^\d{3,32}$/.test(loginValue)) throw new Mt5Error(400, 'MT5_LOGIN_INVALID', 'login must contain 3 to 32 digits');
  return loginValue;
}
function requireServer(value) {
  const serverValue = text(value, 128);
  if (!serverValue || /[\u0000-\u001f\u007f]/.test(serverValue)) throw new Mt5Error(400, 'MT5_SERVER_INVALID', 'server is required and contains invalid characters');
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

// ---- journal conversion ----

function dateOnly(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function resultFromProfit(profit) {
  const p = Number(profit) || 0;
  if (p > 0.005) return 'Win';
  if (p < -0.005) return 'Loss';
  return 'BE';
}

function directionFromMT5(direction) {
  const d = String(direction || '').toLowerCase();
  if (d === 'buy') return 'LONG';
  if (d === 'sell') return 'SHORT';
  return 'LONG';
}

function buildJournalTradeFromClosed(closed, info, account) {
  const strategy = 'Model OB';
  const steps = CHECKLISTS[strategy] || CHECKLISTS['Model OB'];
  const profit = Number(closed.profit || 0) + Number(closed.swap || 0) + Number(closed.commission || 0);
  const closeDate = dateOnly(closed.closeTime) || dateOnly(closed.openTime) || dateOnly(new Date().toISOString());
  return {
    id: 'mt5-' + closed.ticket,
    mt5Ticket: String(closed.ticket),
    mt5AccountId: info.accountId,
    source: 'mt5',
    mode: info.mode,
    accountId: info.accountId,
    date: closeDate,
    pair: closed.symbol || '',
    timeframe: '',
    regime: '',
    direction: directionFromMT5(closed.direction || closed.type),
    result: resultFromProfit(profit),
    rMultiple: 0,
    pnl: Number(profit.toFixed(2)),
    entryPrice: Number(closed.openPrice || 0),
    exitPrice: Number(closed.closePrice || 0),
    sl: Number(closed.sl || 0),
    tp: Number(closed.tp || 0),
    volume: Number(closed.volume || 0),
    openTime: closed.openTime || '',
    closeTime: closed.closeTime || '',
    commission: Number(closed.commission || 0),
    swap: Number(closed.swap || 0),
    strategy,
    notes: '',
    checklist: steps.map(() => 'notset'),
    screenshots: []
  };
}

function mergeJournalTrades(existingValue, incomingClosed, info, account) {
  const existing = parseJson(existingValue);
  const journal = Array.isArray(existing) ? existing : [];
  const seenTickets = new Set();
  for (const t of journal) {
    if (t?.mt5Ticket) seenTickets.add(String(t.mt5Ticket));
  }
  const additions = [];
  for (const closed of incomingClosed) {
    const normalized = normalizeClosedTrade(closed);
    if (!normalized) continue;
    if (seenTickets.has(normalized.ticket)) continue;
    seenTickets.add(normalized.ticket);
    additions.push(buildJournalTradeFromClosed(normalized, info, account));
  }
  if (!additions.length) return { journal, added: 0 };
  // Newest first
  const merged = [...additions, ...journal].slice(0, MAX_JOURNAL_TRADES);
  return { journal: merged, added: additions.length };
}

export function registerMt5Routes(app, storage) {
  const { getSessionId, getStoredValue, setStoredValue, deleteStoredValue } = storage;

  async function readToken(token) {
    const hash = tokenHash(token);
    const info = parseJson(await getStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, hash)));
    if (!info?.sessionId || !info?.accountId || info.status === 'revoked') throw new Mt5Error(401, 'MT5_TOKEN_INVALID', 'bridge token is invalid or revoked');
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

      const rawClosed = Array.isArray(source.closedTrades) ? source.closedTrades
                      : (Array.isArray(source.history) ? source.history : []);

      let addedToJournal = 0;

      if (rawClosed.length) {
        // 1. Merge into MT5 history store (dedup by ticket)
        const history = mergeHistory(await getStoredValue(info.sessionId, key(HISTORY_PREFIX, info.accountId)), rawClosed);
        await setStoredValue(info.sessionId, key(HISTORY_PREFIX, info.accountId), JSON.stringify(history));

        // 2. Merge into journal trades store (dedup by mt5Ticket)
        try {
          const accountRecord = getAccountRecord(await getStoredValue(info.sessionId, ACCOUNT_STORAGE_KEY), info.accountId, info.mode);
          const existingJournal = await getStoredValue(info.sessionId, TRADES_STORAGE_KEY);
          const { journal, added } = mergeJournalTrades(existingJournal, rawClosed, info, accountRecord);
          if (added > 0) {
            await setStoredValue(info.sessionId, TRADES_STORAGE_KEY, JSON.stringify(journal));
            addedToJournal = added;
          }
        } catch (e) {
          // Account record may have been deleted; log but don't fail the sync.
          console.warn('[MT5 ' + id + '] journal conversion skipped:', e?.message || e);
        }
      }

      link.lastSyncAt = state.syncedAt;
      link.status = 'synced';
      await setStoredValue(info.sessionId, key(LINK_PREFIX, info.accountId), JSON.stringify(link));

      return res.json({
        ok: true,
        accountId: info.accountId,
        mode: info.mode,
        syncedAt: state.syncedAt,
        positionCount: state.positions.length,
        journalAdded: addedToJournal
      });
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
