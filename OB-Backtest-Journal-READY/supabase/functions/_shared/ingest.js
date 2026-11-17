// ingest.js — mt5-ingest: closed deals and equity from MYJournalLogger (Parts 4, 6, 8).
// Plain JavaScript with no Deno or Node APIs: the Edge Function and the Node tests both run it.
//
// The EA sends its key in the x-ea-key header. Only the key's SHA-256 hash is stored
// (ea_keys); the hash names the account, so the EA can only write to that one account.
//
// Body (JSON):
//   { login, server, serverOffsetMinutes,                 broker server time minus UTC
//     deals: [{ ticket (position ticket, the dedup key), symbol, direction 'buy'|'sell',
//               volume, openTime, closeTime (UTC, ISO or epoch seconds), openPrice,
//               closePrice, sl, tp, profit, commission, swap, magic, comment }],
//     equity, balance }                                    optional, stored as a snapshot
//
// Every closed deal is accepted, even on a blown account: losing a real trade is worse than
// any discipline signal. Such trades are saved with post_breach = true, and so are the ones
// in this batch that closed after the trade that blew the account.
// A retry never creates a second row: (user_id, account_id, mt5_ticket) is unique.
import './vendor/time-prefs.js';
import './vendor/rule-presets.js';
import { tradeToRow } from './vendor/relational-core.js';
import { normalizeClosedTrade, buildJournalTradeFromClosed } from './vendor/mt5-core.js';
import { loadSettings, checkUserRules } from './journal-db.js';

export const MAX_DEALS = 500;
const MODES = { real: 'Real', demo: 'Demo', funded: 'Funded' };
const COLUMNS = ['user_id', 'id', 'account_id', 'mode', 'symbol', 'direction', 'trade_date', 'open_time', 'close_time', 'pnl', 'r_multiple',
  'result', 'strategy', 'timeframe', 'regime', 'session', 'source', 'mt5_ticket', 'notes', 'review_status', 'post_breach', 'position', 'created_at', 'extra'];

export class IngestError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const finiteOrNull = v => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
function offsetMinutes(v) {
  const n = Number(v);
  return Number.isInteger(n) && Math.abs(n) <= 14 * 60 ? n : null;
}

/** The account an EA key belongs to, or an IngestError. */
export async function accountForKey(db, key) {
  const k = String(key ?? '').trim();
  if (!k) throw new IngestError(401, 'EA_KEY_REQUIRED', 'Send the EA key in the x-ea-key header.');
  if (k.length > 200) throw new IngestError(401, 'EA_KEY_INVALID', 'EA key is invalid or revoked.');
  const [row] = await db.query(
    `select k.key_hash, k.user_id, k.account_id, k.mt5_login, k.mt5_server, a.type, a.preset, a.extra::text as extra
     from public.ea_keys k join public.accounts a on a.user_id = k.user_id and a.id = k.account_id
     where k.key_hash = $1 and k.revoked_at is null`, [await sha256Hex(k)]);
  if (!row) throw new IngestError(401, 'EA_KEY_INVALID', 'EA key is invalid or revoked.');
  return row;
}

export async function runIngest({ db, key, body, now = new Date() }) {
  const nowIso = now.toISOString();
  const k = await accountForKey(db, key);
  const b = body && typeof body === 'object' ? body : {};
  if (b.login != null && b.login !== '' && k.mt5_login && String(b.login) !== String(k.mt5_login)) {
    throw new IngestError(403, 'MT5_LOGIN_MISMATCH', 'This EA key belongs to another MT5 login.');
  }
  if (!globalThis.obRules.eaAllowed({ preset: k.preset })) throw new IngestError(403, 'MT5_EA_NOT_PERMITTED', globalThis.obRules.EA_BLOCKED_MSG);
  const mode = MODES[k.type];
  if (!mode) throw new IngestError(409, 'MT5_BACKTEST', 'MT5 is not used for Backtest accounts.');
  const deals = Array.isArray(b.deals) ? b.deals : [];
  if (deals.length > MAX_DEALS) throw new IngestError(413, 'MT5_TOO_MANY_DEALS', `Send at most ${MAX_DEALS} deals per request.`);

  const extra = JSON.parse(k.extra || '{}');
  const wasBlown = !!(extra.blown && typeof extra.blown === 'object');
  const tz = (await loadSettings(db, k.user_id)).timezone || '';
  const offset = offsetMinutes(b.serverOffsetMinutes);

  // Valid deals, oldest first: each new trade goes on top of the app's list.
  const normalized = [];
  let invalid = 0;
  for (const raw of deals) {
    const c = normalizeClosedTrade(raw);
    if (!c || !/^\d{1,20}$/.test(c.ticket) || !c.closeTime || Number.isNaN(Date.parse(c.closeTime))) { invalid++; continue; }
    normalized.push(c);
  }
  normalized.sort((x, y) => Date.parse(x.closeTime) - Date.parse(y.closeTime));

  const inserted = [];
  let duplicates = 0;
  if (normalized.length) {
    await db.tx(async tx => {
      const [{ low }] = await tx.query(`select coalesce(min(position), 0) as low from public.trades where user_id = $1`, [k.user_id]);
      let position = Number(low);
      for (const c of normalized) {
        const trade = buildJournalTradeFromClosed(c, { accountId: k.account_id, mode }, null, tz);
        trade.id = `mt5-${k.account_id}-${c.ticket}`;          // unique per account (tickets repeat across brokers)
        trade.reviewStatus = 'Not reviewed';
        if (wasBlown) trade.postBreach = true;
        const { row } = tradeToRow(trade, k.user_id, position - 1);
        row.created_at = nowIso;
        const values = COLUMNS.map(col => (col === 'extra' ? JSON.stringify(row.extra) : row[col] ?? null));
        const placeholders = COLUMNS.map((col, i) => `$${i + 1}${col === 'extra' ? '::json' : ''}`).join(', ');
        const got = await tx.query(`insert into public.trades (${COLUMNS.join(', ')}) values (${placeholders}) on conflict do nothing returning id`, values);
        if (got.length) { position--; inserted.push({ id: trade.id, closeTime: c.closeTime }); } else duplicates++;
      }
    });
  }

  const equity = finiteOrNull(b.equity), balance = finiteOrNull(b.balance);
  let equitySaved = false;
  if (equity !== null && balance !== null) {
    await db.query(`insert into public.equity_snapshots (user_id, account_id, equity, balance, server_offset_minutes, taken_at)
      values ($1, $2, $3, $4, $5, $6::timestamptz)`, [k.user_id, k.account_id, equity, balance, offset, nowIso]);
    equitySaved = true;
  }
  await db.query(`update public.ea_keys set last_used_at = $2::timestamptz, last_server_offset_minutes = coalesce($3, last_server_offset_minutes)
    where key_hash = $1`, [k.key_hash, nowIso, offset]);

  // New trades: re-check the rules (the browser is not the only thing enforcing them).
  let blownNow = false, markedPostBreach = 0;
  if (inserted.length) {
    const recorded = await checkUserRules(db, k.user_id, nowIso);
    const mine = recorded.find(r => r.id === String(k.account_id));
    if (mine) {
      blownNow = true;
      const [breachRow] = await db.query(`select close_time from public.trades where user_id = $1 and id = $2`, [k.user_id, mine.blown.tradeId]);
      const after = breachRow && breachRow.close_time ? Date.parse(new Date(breachRow.close_time).toISOString()) : null;
      const ids = after === null ? [] : inserted.filter(t => t.id !== mine.blown.tradeId && Date.parse(t.closeTime) > after).map(t => t.id);
      for (const id of ids) {
        await db.query(`update public.trades set post_breach = true where user_id = $1 and id = $2`, [k.user_id, id]);
        markedPostBreach++;
      }
    }
  }

  return {
    ok: true, accountId: k.account_id, mode,
    accepted: inserted.length, duplicates, invalid, equitySaved,
    blown: wasBlown || blownNow, postBreach: wasBlown ? inserted.length : markedPostBreach,
    serverTime: nowIso,
  };
}
