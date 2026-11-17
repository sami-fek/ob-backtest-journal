// The shape of GET /api/news (server.js), in one place.
//
//  - test/news-contract.test.js checks that the real endpoint returns exactly these fields
//    with these types (the normal answer and the 503 "unavailable" answer), and that the
//    browser code (news-core.js, news-panel.js) reads no field outside them.
//  - qa/check-news.mjs builds its fake answers with newsAnswer() / newsEvent() /
//    newsUnavailable(), which refuse any field not listed here.
// So the fake and the real answer cannot drift apart: change a field here and in server.js
// together, or a test fails.
//
// The type checks are shared with the /api/mt5/live contract.
import { contractProblems } from './mt5-live-contract.js';
export { contractProblems };

export const NEWS_ANSWER_FIELDS = {
  ok: 'boolean', events: 'array', lastSuccessAt: 'iso|null', lastAttemptAt: 'iso|null',
  lastStatus: 'string|null', lastError: 'string|null', serverTime: 'iso',
};

export const NEWS_EVENT_FIELDS = {
  title: 'string', currency: 'string', impact: 'string', time: 'iso',
};

// 503 when the news tables cannot be read; the page shows it as stale.
export const NEWS_UNAVAILABLE_FIELDS = { ok: 'boolean', code: 'string', error: 'string' };

function build(fields, defaults, overrides, where) {
  const out = { ...defaults, ...overrides };
  const problems = contractProblems(out, fields, where);
  if (problems.length) throw new Error(`fake ${where} does not match the real /api/news: ${problems.join('; ')}`);
  return out;
}

/** A fake high-impact event with only real fields. */
export function newsEvent(overrides = {}) {
  return build(NEWS_EVENT_FIELDS, { title: 'CPI m/m', currency: 'USD', impact: 'High', time: new Date().toISOString() }, overrides, 'event');
}

/** A fake normal answer (events are built with newsEvent). */
export function newsAnswer(overrides = {}) {
  const { events = [], ...rest } = overrides;
  return build(NEWS_ANSWER_FIELDS, {
    ok: true, lastSuccessAt: null, lastAttemptAt: rest.lastSuccessAt ?? null, lastStatus: rest.lastSuccessAt ? 'ok' : null,
    lastError: null, serverTime: new Date().toISOString(),
  }, { ...rest, events: events.map(e => newsEvent(e)) }, 'answer');
}

/** A fake 503 answer. */
export function newsUnavailable(error = 'The news data could not be read (has migration 004_edge_functions.sql run?).') {
  return build(NEWS_UNAVAILABLE_FIELDS, { ok: false, code: 'NEWS_UNAVAILABLE', error }, {}, 'unavailable answer');
}
