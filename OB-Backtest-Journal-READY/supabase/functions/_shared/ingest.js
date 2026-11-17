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
//     equity, balance,                                     optional, stored as a snapshot
//     positions: [{ ticket, symbol, direction, volume, openTime, openPrice, currentPrice,
//                   sl, tp, profit, swap, magic, comment }] }   open now; replaces the set
//                                                               (mt5_positions, not trades)
//
// Every closed deal is accepted, even on a blown account: losing a real trade is worse than
// any discipline signal. Such trades are saved with post_breach = true, and so are the ones
// in this batch that closed after the trade that blew the account.
// A retry never creates a second row: (user_id, account_id, mt5_ticket) is unique.
import './vendor/time-prefs.js';
import './vendor/rule-presets.js';
import { tradeToRow } from './vendor/relational-core.js';
import { normalizeClosedTrade, normalizePosition, buildJournalTradeFromClosed } from './vendor/mt5-core.js';
import { loadSettings, checkUserRules, logError } from './journal-db.js';

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

export const MAX_POSITIONS = 200;

/**
 * Replaces the account's open positions with `reported` (null: no report in this request,
 * only remove `closedTickets`). Returns the number of open positions stored.
 */
async function savePositions(db, k, reported, closedTickets, nowIso) {
  return db.tx(async tx => {
    if (closedTickets.length) {
      await tx.query(`delete from public.mt5_positions where user_id = $1 and account_id = $2 and ticket = any($3::text[])`, [k.user_id, k.account_id, closedTickets]);
    }
    if (!reported) return null;
    const list = [];
    for (const raw of reported.slice(0, MAX_POSITIONS)) {
      const p = normalizePosition(raw);
      if (!p || !/^\d{1,20}$/.test(p.ticket) || closedTickets.includes(p.ticket) || list.some(x => x.ticket === p.ticket)) continue;
      list.push(p);
    }
    await tx.query(`delete from public.mt5_positions where user_id = $1 and account_id = $2 and not (ticket = any($3::text[]))`, [k.user_id, k.account_id, list.map(p => p.ticket)]);
    for (const p of list) {
      const openTime = p.openTime && !Number.isNaN(Date.parse(p.openTime)) ? p.openTime : null;
      await tx.query(
        `insert into public.mt5_positions (user_id, account_id, ticket, symbol, direction, volume, open_time, open_price, current_price, sl, tp, profit, swap, magic, comment, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11, $12, $13, $14, $15, $16::timestamptz)
         on conflict (user_id, account_id, ticket) do update set symbol = excluded.symbol, direction = excluded.direction, volume = excluded.volume,
           open_time = excluded.open_time, open_price = excluded.open_price, current_price = excluded.current_price, sl = excluded.sl, tp = excluded.tp,
           profit = excluded.profit, swap = excluded.swap, magic = excluded.magic, comment = excluded.comment, updated_at = excluded.updated_at`,
        [k.user_id, k.account_id, p.ticket, p.symbol, p.direction, p.volume, openTime, p.openPrice, p.currentPrice, p.sl, p.tp, p.profit, p.swap, p.magic, p.comment, nowIso]);
    }
    return list.length;
  });
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

  // Open positions (Part 7): the reported set replaces the account's set. They are not trades.
  // A closed position also leaves the set. Saved after the closed trades and on its own: a
  // problem here (e.g. migration 005 not run) never costs a closed trade.
  let positionsSaved = null;
  if (Array.isArray(b.positions) || normalized.length) {
    try {
      positionsSaved = await savePositions(db, k, Array.isArray(b.positions) ? b.positions : null, normalized.map(c => c.ticket), nowIso);
    } catch (err) {
      positionsSaved = false;
      await logError(db, 'mt5-ingest', err, { step: 'positions', accountId: k.account_id });
    }
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

  // Keep 14 days of 30-second snapshots (about 40,000 rows per account); a breach is recorded
  // when its snapshot arrives, so older ones are not needed. Runs about once an hour.
  if (equitySaved && Math.floor(now.getTime() / 30_000) % 120 === 0) {
    await db.query(`delete from public.equity_snapshots where user_id = $1 and account_id = $2 and taken_at < $3::timestamptz`,
      [k.user_id, k.account_id, new Date(now.getTime() - 14 * 86_400_000).toISOString()]).catch(err => logError(db, 'mt5-ingest', err, { step: 'prune' }));
  }

  // New trades or new equity: re-check the rules (the browser is not the only thing enforcing
  // them). With live equity, a floating loss can blow a firm account before any trade closes.
  let blownNow = false, markedPostBreach = 0;
  if (inserted.length || equitySaved) {
    const recorded = await checkUserRules(db, k.user_id, nowIso);
    const mine = recorded.find(r => r.id === String(k.account_id));
    if (mine) {
      blownNow = true;
      // an equity breach has no trade that caused it: the deals in this batch closed before it
      const [breachRow] = mine.blown.tradeId
        ? await db.query(`select close_time from public.trades where user_id = $1 and id = $2`, [k.user_id, mine.blown.tradeId])
        : [];
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
    accepted: inserted.length, duplicates, invalid, equitySaved, positionsSaved,
    blown: wasBlown || blownNow, postBreach: wasBlown ? inserted.length : markedPostBreach,
    serverTime: nowIso,
  };
}
