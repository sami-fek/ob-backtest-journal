// The shape of GET /api/mt5/live (server.js), in one place.
//
//  - test/mt5-live-contract.test.js checks that the real endpoint returns exactly these fields
//    with these types, and that the browser code reads no field outside them.
//  - The browser checks that answer /api/mt5/live with fixed data (qa/check-positions.mjs,
//    qa/check-equity.mjs) build that data with liveAccount() / livePosition() / liveAnswer(),
//    which refuse any field not listed here.
// So the fake and the real answer cannot drift apart: change a field here and in server.js
// together, or a test fails.
//
// Types: 'number', 'string', 'boolean', 'iso' (ISO 8601 instant), 'day' (YYYY-MM-DD), 'array';
// '|null' allows null.

export const LIVE_ANSWER_FIELDS = {
  ok: 'boolean', available: 'boolean', positionsAvailable: 'boolean', staleAfterSeconds: 'number', serverTime: 'iso', accounts: 'object',
};

export const LIVE_ACCOUNT_FIELDS = {
  equity: 'number|null', balance: 'number|null', takenAt: 'iso|null', stale: 'boolean',
  day: 'day|null', dayStartEquity: 'number|null', dayMinEquity: 'number|null',
  serverOffsetMinutes: 'number|null', linked: 'boolean', lastSeenAt: 'iso|null', positions: 'array',
};

export const LIVE_POSITION_FIELDS = {
  ticket: 'string', symbol: 'string|null', direction: 'string|null', volume: 'number|null',
  openTime: 'iso|null', openPrice: 'number|null', currentPrice: 'number|null', sl: 'number|null', tp: 'number|null',
  profit: 'number|null', swap: 'number|null', updatedAt: 'iso|null',
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
/** true when value has the contract type (e.g. 'number|null'). */
export function typeOk(value, spec) {
  return spec.split('|').some(t => {
    if (t === 'null') return value === null;
    if (t === 'iso') return typeof value === 'string' && ISO_RE.test(value);
    if (t === 'day') return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (t === 'array') return Array.isArray(value);
    if (t === 'object') return !!value && typeof value === 'object' && !Array.isArray(value);
    if (t === 'number') return typeof value === 'number' && Number.isFinite(value);
    return typeof value === t;
  });
}

/** Every problem with `obj` against `fields`: missing, extra or wrongly typed fields. */
export function contractProblems(obj, fields, where) {
  const out = [];
  for (const k of Object.keys(fields)) {
    if (!(k in obj)) out.push(`${where}.${k} is missing`);
    else if (!typeOk(obj[k], fields[k])) out.push(`${where}.${k} = ${JSON.stringify(obj[k])} is not ${fields[k]}`);
  }
  for (const k of Object.keys(obj)) if (!(k in fields)) out.push(`${where}.${k} is not in the contract`);
  return out;
}

function build(fields, defaults, overrides, where) {
  const out = { ...defaults, ...overrides };
  const problems = contractProblems(out, fields, where);
  if (problems.length) throw new Error(`fake ${where} does not match the real /api/mt5/live: ${problems.join('; ')}`);
  return out;
}

/** A fake open position with only real fields. */
export function livePosition(overrides = {}) {
  return build(LIVE_POSITION_FIELDS, {
    ticket: '5001', symbol: 'EURUSD', direction: 'Sell', volume: 0.5, openTime: new Date(Date.now() - 3_600_000).toISOString(),
    openPrice: 1.085, currentPrice: 1.0875, sl: 1.09, tp: 1.075, profit: -12.5, swap: -0.4, updatedAt: new Date().toISOString(),
  }, overrides, 'position');
}

/** A fake account entry with only real fields (positions are built with livePosition). */
export function liveAccount(overrides = {}) {
  const { positions = [], ...rest } = overrides;
  return build(LIVE_ACCOUNT_FIELDS, {
    equity: null, balance: null, takenAt: null, stale: true, day: null, dayStartEquity: null, dayMinEquity: null,
    serverOffsetMinutes: null, linked: true, lastSeenAt: null,
  }, { ...rest, positions: positions.map(p => livePosition(p)) }, 'account');
}

/** A fake answer: { accountId: liveAccount(...) }. */
export function liveAnswer(accounts) {
  return build(LIVE_ANSWER_FIELDS, { ok: true, available: true, positionsAvailable: true, staleAfterSeconds: 300, serverTime: new Date().toISOString() }, { accounts }, 'answer');
}
