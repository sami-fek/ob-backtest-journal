// Part 5: no-trade windows, the stale state and the offset parsing behind them.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/time-prefs.js';
import '../public/news-core.js';
import { parseFeed } from '../supabase/functions/_shared/news.js';

const N = globalThis.obNews;
const MIN = 60_000, H = 3_600_000;
const T = Date.parse('2026-11-18T13:30:00Z');
const fresh = (events, now = T) => ({ ok: true, events, lastSuccessAt: new Date(now - 2 * H).toISOString() });
const cpi = { title: 'CPI m/m', currency: 'USD', impact: 'High', time: '2026-11-18T13:30:00.000Z' };

test('stale: no successful fetch for more than 12 hours, never fetched, or unreadable', () => {
  assert.equal(N.status({ ok: true, events: [], lastSuccessAt: new Date(T - 12 * H - MIN).toISOString() }, T).level, 'stale');
  assert.equal(N.status({ ok: true, events: [], lastSuccessAt: new Date(T - 12 * H - MIN).toISOString() }, T).message, 'news data stale - do not trade');
  assert.equal(N.status({ ok: true, events: [], lastSuccessAt: new Date(T - 11 * H - 59 * MIN).toISOString() }, T).level, 'clear');
  assert.equal(N.status({ ok: true, events: [], lastSuccessAt: null }, T).reason, 'never');
  assert.equal(N.status(null, T).reason, 'unavailable');
  assert.equal(N.status({ ok: false, error: 'tables missing' }, T).level, 'stale');
  // stale data with events in it is still stale: an old calendar can miss a window
  assert.equal(N.status({ ok: true, events: [cpi], lastSuccessAt: new Date(T - 13 * H).toISOString() }, T - 5 * MIN).level, 'stale');
});

test('an empty feed and a broken feed look different', () => {
  const empty = N.status(fresh([]), T);
  const broken = N.status({ ok: false }, T);
  assert.equal(empty.level, 'clear'); assert.equal(empty.next, null);
  assert.equal(broken.level, 'stale');
});

test('window boundaries: 15 minutes either side of the event, both ends included', () => {
  const at = ms => N.status(fresh([cpi]), ms);
  assert.equal(at(T - 15 * MIN - 1000).level, 'clear', '15:01 before: outside');
  assert.equal(at(T - 15 * MIN - 1000).next.title, 'CPI m/m', 'and it is the next window');
  assert.equal(at(T - 15 * MIN).level, 'window', 'exactly 15:00 before: inside');
  assert.equal(at(T).level, 'window');
  assert.equal(at(T + 15 * MIN).level, 'window', 'exactly 15:00 after: inside');
  assert.equal(at(T + 15 * MIN + 1000).level, 'clear', '15:01 after: outside');
  assert.equal(at(T).until, T + 15 * MIN);
  // overlapping windows: until the later end
  const sales = { ...cpi, title: 'Retail Sales', time: new Date(T + 10 * MIN).toISOString() };
  const both = N.status(fresh([cpi, sales]), T + 5 * MIN);
  assert.equal(both.active.length, 2); assert.equal(both.until, T + 25 * MIN);
});

test('offset parsing: the same 08:30 New York release at -05:00 and at -04:00 lands on the right UTC time', () => {
  const feed = JSON.stringify([
    { title: 'CPI m/m', country: 'USD', date: '2026-03-06T08:30:00-05:00', impact: 'High' }, // before US daylight time
    { title: 'CPI m/m', country: 'USD', date: '2026-03-13T08:30:00-04:00', impact: 'High' }, // after (8 Mar 2026)
  ]);
  const events = parseFeed(feed).events.map(e => ({ title: e.title, currency: e.currency, time: e.event_time_utc }));
  assert.deepEqual(events.map(e => e.time), ['2026-03-06T13:30:00.000Z', '2026-03-13T12:30:00.000Z']);
  const data = { ok: true, events, lastSuccessAt: '2026-03-13T06:00:00.000Z' };
  assert.equal(N.status(data, Date.parse('2026-03-13T12:20:00Z')).level, 'window', 'the -04:00 event: window opens at 12:15 UTC');
  assert.equal(N.status(data, Date.parse('2026-03-13T13:20:00Z')).level, 'clear', 'not at the -05:00 time');
});

test('days and the week are in the display timezone (Africa/Addis_Ababa)', () => {
  const late = { title: 'RBA', currency: 'USD', time: '2026-11-15T22:30:00.000Z' }; // Sunday 22:30 UTC = Monday 01:30 in Addis
  const week = N.week([cpi, late], 'Africa/Addis_Ababa', T);
  assert.deepEqual(week.map(d => d.weekday), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.equal(week[0].day, '2026-11-16');
  assert.deepEqual(week[0].events.map(e => e.title), ['RBA']);
  assert.equal(week[2].today, true);
  assert.deepEqual(week[2].events.map(e => e.title), ['CPI m/m']);
  assert.deepEqual(N.dayEvents([late], 'UTC', '2026-11-15').map(e => e.title), ['RBA'], 'in UTC it is still Sunday');
});
