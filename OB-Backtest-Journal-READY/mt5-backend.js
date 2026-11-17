import crypto from 'node:crypto';
import './public/time-prefs.js'; // globalThis.obTimeCore: trade dates in the user's timezone
import './public/rule-presets.js'; // globalThis.obRules: Maven bans EAs (no MT5 link for its accounts)
// deal → journal trade, shared with the mt5-ingest Edge Function
import { now, text, number, normalizeTimestamp, normalizeClosedTrade, normalizePosition, buildJournalTradeFromClosed } from './mt5-core.js';
export { dateOnly } from './mt5-core.js';

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
const requestId = () => crypto.randomBytes(8).toString('hex');
const parseJson = value => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
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

function mergeJournalTrades(existingValue, incomingClosed, info, account, tz) {
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
    const trade = buildJournalTradeFromClosed(normalized, info, account, tz);
    // A blown account still receives every MT5 trade (losing real trades is worse than any
    // discipline signal); they are marked as logged after the breach.
    if (account && account.blown && typeof account.blown === 'object') trade.postBreach = true;
    additions.push(trade);
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
      if (!sessionId) return res.status(401).json({ ok: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
      const accountId = requireAccountId(req.body?.accountId);
      const modeValue = requireMode(req.body?.mode);
      const loginValue = requireLogin(req.body?.login);
      const serverValue = requireServer(req.body?.server);
      const accountRecord = getAccountRecord(await getStoredValue(sessionId, ACCOUNT_STORAGE_KEY), accountId, modeValue);
      // The firm bans EAs (Maven preset): the logger is never linked to this account.
      if (!globalThis.obRules.eaAllowed(accountRecord)) throw new Mt5Error(403, 'MT5_EA_NOT_PERMITTED', globalThis.obRules.EA_BLOCKED_MSG);
      const label = safeLabel(req.body?.label, loginValue + ' - ' + serverValue);
      const linkKey = key(LINK_PREFIX, accountId);
      const old = parseJson(await getStoredValue(sessionId, linkKey));
      // One key for both paths: the EA key server.js issues (hash in ea_keys, for the
      // mt5-ingest Edge Function) is also this bridge's token. When it cannot be issued
      // (journal not on the tables yet, migration 004 missing) the bridge still links,
      // and the answer says why direct logging is not available.
      let eaKey = null, eaKeyError = null;
      if (typeof storage.issueEaKey === 'function') {
        try {
          const issued = await storage.issueEaKey(sessionId, { accountId, login: loginValue, server: serverValue });
          if (issued.status === 201 && issued.body?.key) eaKey = issued.body;
          else eaKeyError = issued.body?.error || ('EA key not issued (HTTP ' + issued.status + ')');
        } catch (error) { eaKeyError = 'EA key not issued: ' + (error?.message || error); }
      }
      const token = eaKey ? eaKey.key : 'obmt5_' + crypto.randomBytes(32).toString('base64url');
      const hash = tokenHash(token);
      const linkedAt = now();
      const link = { version: 2, accountId, mode: modeValue, login: loginValue, server: serverValue, label, tokenHash: hash, linkedAt, lastSyncAt: null, status: 'linked' };
      // The old bridge's token record (for /api/mt5/sync). Through the gateway's storage proxy it
      // is refused (it is not a signed-in user's record), which made every Link MT5 fail with a 500.
      // With an EA key the record is not needed (MYJournalLogger uses mt5-ingest), so it is best
      // effort; without one, the reason the EA key was not issued is returned instead.
      try {
        await setStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, hash), JSON.stringify({ version: 2, sessionId, accountId, mode: modeValue, login: loginValue, server: serverValue, createdAt: linkedAt, status: 'active' }));
      } catch (error) {
        if (!eaKey) throw new Mt5Error(409, 'MT5_LINK_UNAVAILABLE', eaKeyError || 'MT5 linking is not available');
        console.warn('[MT5 ' + id + '] old bridge token not stored (not needed with an EA key):', error?.message || error);
      }
      try {
        await setStoredValue(sessionId, linkKey, JSON.stringify(link));
        await deleteStoredValue(sessionId, key(STATE_PREFIX, accountId));
        await deleteStoredValue(sessionId, key(HISTORY_PREFIX, accountId));
      } catch (error) {
        await deleteStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, hash)).catch(() => {});
        throw error;
      }
      if (old?.tokenHash) await deleteStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, old.tokenHash)).catch(() => {});
      if (old?.token) await deleteStoredValue(TOKEN_SESSION, key('mt5_token:', old.token)).catch(() => {});
      const safeLink = publicLink(link);
      return res.status(201).json({
        ok: true, token, link: safeLink, accountId, mode: modeValue, server: serverValue, label, linkedAt,
        eaKey: eaKey ? { keyHint: eaKey.keyHint, ingestUrl: eaKey.ingestUrl, allowUrl: eaKey.allowUrl } : null,
        ...(eaKeyError ? { eaKeyError } : {})
      });
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
          let tz = '';
          try { tz = parseJson(await getStoredValue(info.sessionId, 'ob-os-settings'))?.timezone || ''; } catch (_) {}
          const { journal, added } = mergeJournalTrades(existingJournal, rawClosed, info, accountRecord, tz);
          if (added > 0) {
            await setStoredValue(info.sessionId, TRADES_STORAGE_KEY, JSON.stringify(journal));
            addedToJournal = added; // the server re-checks the account's rules on this write (server.js checkRules)
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
      if (!sessionId) return res.status(401).json({ ok: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
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
      if (!sessionId) return res.status(401).json({ ok: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
      const accountId = requireAccountId(req.query?.accountId);
      const link = parseJson(await getStoredValue(sessionId, key(LINK_PREFIX, accountId)));
      if (!link || link.status === 'revoked') return res.json({ ok: true, linked: false, closedTrades: [] });
      return res.json({ ok: true, linked: true, accountId, closedTrades: parseJson(await getStoredValue(sessionId, key(HISTORY_PREFIX, accountId))) || [] });
    } catch (error) {
      return fail(res, id, error, 500, 'MT5_HISTORY_FAILED', 'MT5 history read failed');
    }
  });

  // GET /api/mt5/status — returns ALL linked accounts for this session in one call.
  // Used by the frontend status panel to render the full integration overview
  // without needing to know account IDs in advance.
  app.get('/api/mt5/status', async (req, res) => {
    const id = requestId(); res.setHeader('X-Request-Id', id);
    try {
      const sessionId = getSessionId(req, res);
      if (!sessionId) return res.status(401).json({ ok: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
      const accountsRaw = await getStoredValue(sessionId, ACCOUNT_STORAGE_KEY);
      const accountsData = parseJson(accountsRaw) || {};

      // Collect all account IDs across all modes
      const allAccounts = [];
      for (const [mode, list] of Object.entries(accountsData)) {
        if (!Array.isArray(list)) continue;
        for (const acc of list) {
          if (acc?.id) allAccounts.push({ id: String(acc.id), name: acc.name || acc.id, mode });
        }
      }

      // For each account, read link + state
      const results = await Promise.all(allAccounts.map(async acc => {
        const link  = parseJson(await getStoredValue(sessionId, key(LINK_PREFIX,  acc.id)));
        const state = parseJson(await getStoredValue(sessionId, key(STATE_PREFIX, acc.id)));
        if (!link || link.status === 'revoked') {
          return { accountId: acc.id, accountName: acc.name, mode: acc.mode, linked: false };
        }
        return {
          accountId:    acc.id,
          accountName:  acc.name,
          mode:         acc.mode,
          linked:       true,
          login:        link.login,
          server:       link.server,
          label:        link.label,
          linkedAt:     link.linkedAt,
          lastSyncAt:   link.lastSyncAt,
          syncStatus:   link.status,
          balance:      state?.balance ?? null,
          equity:       state?.equity  ?? null,
          currency:     state?.currency ?? null,
          positionCount: state ? (state.positions?.length ?? 0) : null,
          syncedAt:     state?.syncedAt ?? null
        };
      }));

      return res.json({ ok: true, accounts: results });
    } catch (error) {
      return fail(res, id, error, 500, 'MT5_STATUS_FAILED', 'MT5 status read failed');
    }
  });

  app.post('/api/mt5/unlink', async (req, res) => {
    const id = requestId(); res.setHeader('X-Request-Id', id);
    try {
      const sessionId = getSessionId(req, res);
      if (!sessionId) return res.status(401).json({ ok: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
      const accountId = requireAccountId(req.body?.accountId);
      const linkKey = key(LINK_PREFIX, accountId);
      const link = parseJson(await getStoredValue(sessionId, linkKey));
      if (!link) return res.json({ ok: true, linked: false });
      await deleteStoredValue(sessionId, linkKey);
      await deleteStoredValue(sessionId, key(STATE_PREFIX, accountId));
      await deleteStoredValue(sessionId, key(HISTORY_PREFIX, accountId));
      if (link.tokenHash) await deleteStoredValue(TOKEN_SESSION, key(TOKEN_PREFIX, link.tokenHash)).catch(() => {});
      if (link.token) await deleteStoredValue(TOKEN_SESSION, key('mt5_token:', link.token)).catch(() => {});
      // the same key stops working for mt5-ingest too
      if (typeof storage.revokeEaKey === 'function') await storage.revokeEaKey(sessionId, accountId).catch(error => console.warn('[MT5 ' + id + '] EA key revoke failed:', error?.message || error));
      return res.json({ ok: true, linked: false, accountId });
    } catch (error) {
      return fail(res, id, error, 500, 'MT5_UNLINK_FAILED', 'MT5 unlink failed');
    }
  });
}
