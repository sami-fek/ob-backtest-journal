// GENERATED from mt5-core.js by scripts/sync-edge-shared.mjs. Do not edit here.
// mt5-core.js — MT5 deal → journal trade, shared by the Render gateway (mt5-backend.js)
// and the mt5-ingest Edge Function (supabase/functions/_shared/vendor/mt5-core.js is a copy,
// written by scripts/sync-edge-shared.mjs). No imports and no I/O: it runs in Node and Deno.
// Trade days use globalThis.obTimeCore (public/time-prefs.js) when it is loaded.

export const now = () => new Date().toISOString();
export const text = (value, max = 160) => String(value ?? '').trim().slice(0, max);
export const number = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(-1e15, Math.min(1e15, n)) : fallback;
};

export const CHECKLISTS = {
  'Model A': [
    'Higher-timeframe bias identified',
    'BOS confirmed',
    'Pullback / entry into the defined zone',
    'Invalidation defined before entry',
    'SL at/beyond invalidation',
    'TP at next liquidity / structural target',
    'Minimum 1:2 RR'
  ],
  'Model OB': [
    'Bias identified',
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

/** Epoch seconds, epoch ms or a date string → ISO (UTC). Unparseable text is kept as text. */
export function normalizeTimestamp(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? new Date(value * 1000).toISOString() : new Date(value).toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? text(value, 64) : parsed.toISOString();
}
export function normalizeDirection(value) {
  const direction = text(value, 16).toLowerCase();
  if (direction === 'buy' || direction === 'long') return 'Buy';
  if (direction === 'sell' || direction === 'short') return 'Sell';
  return text(value, 16);
}
export function normalizePosition(value) {
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
export function normalizeClosedTrade(value) {
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

// Calendar day of an MT5 time in the user's saved timezone (UTC when none is saved),
// so trades closed near midnight land on the right day.
export function dateOnly(iso, tz) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const core = globalThis.obTimeCore;
  if (tz && core && core.validTz(tz)) return core.isoInTz(d, tz);
  return d.toISOString().slice(0, 10);
}

export function resultFromProfit(profit) {
  const p = Number(profit) || 0;
  if (p > 0.005) return 'Win';
  if (p < -0.005) return 'Loss';
  return 'BE';
}

export function directionFromMT5(direction) {
  const d = String(direction || '').toLowerCase();
  if (d === 'buy') return 'LONG';
  if (d === 'sell') return 'SHORT';
  return 'LONG';
}

/** A normalized closed deal → the journal trade the app stores. info: { accountId, mode }. */
export function buildJournalTradeFromClosed(closed, info, account, tz) {
  const strategy = 'Model OB';
  const steps = CHECKLISTS[strategy] || CHECKLISTS['Model OB'];
  const profit = Number(closed.profit || 0) + Number(closed.swap || 0) + Number(closed.commission || 0);
  const closeDate = dateOnly(closed.closeTime, tz) || dateOnly(closed.openTime, tz) || dateOnly(new Date().toISOString(), tz);

  // Auto-calculate R-multiple when price levels are available
  let rMultiple = 0;
  const entry = Number(closed.openPrice  || 0);
  const exit  = Number(closed.closePrice || 0);
  const sl    = Number(closed.sl         || 0);
  const dir   = directionFromMT5(closed.direction || closed.type);

  if (entry > 0 && exit > 0 && sl > 0 && entry !== sl) {
    const riskPerUnit = Math.abs(entry - sl);
    const gainPerUnit = dir === 'LONG' ? (exit - entry) : (entry - exit);
    rMultiple = Math.round((gainPerUnit / riskPerUnit) * 100) / 100;
  }

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
    session: '',
    direction: dir,
    result: resultFromProfit(profit),
    rMultiple,
    pnl: Number(profit.toFixed(2)),
    entryPrice: entry,
    exitPrice: exit,
    sl: sl,
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
