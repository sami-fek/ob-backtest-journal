/**
 * news-core.js — no-trade windows around high-impact news (Part 5). Pure: no DOM, no network.
 *
 * The events come from the database (news_events, filled by the fetch-news Edge Function)
 * through GET /api/news. The browser never calls the news source.
 *
 *   WINDOW_MINUTES         15 before and 15 after each event (DECISIONS.md)
 *   STALE_HOURS            no successful fetch for 12 hours = stale (two missed 6-hour cycles)
 *   inWindow(e, now)       now inside [event − 15 min, event + 15 min], both ends included
 *   status(data, now)      { level: 'stale' | 'window' | 'clear', ... }
 *                          stale: the server could not answer, never fetched, or the last
 *                          successful fetch is older than 12 h. That is "do not trade", not
 *                          "no news": an empty feed (fresh, no events) and a broken feed
 *                          (stale) never look the same.
 *   dayEvents(events, tz, day)  events on a calendar day in a timezone
 *   week(events, tz, now)       Monday..Sunday of the current week in that timezone
 *
 * Browser: window.obNews. Node: globalThis.obNews. Needs time-prefs.js (obTimeCore).
 * Tests: test/news-core.test.js.
 */
(function (root) {
  'use strict';
  const MIN = 60_000;
  const WINDOW_MINUTES = 15;
  const STALE_HOURS = 12;
  const STALE_MSG = 'news data stale - do not trade';
  const core = () => root.obTimeCore;

  const at = e => Date.parse(e && e.time);
  const valid = e => e && Number.isFinite(at(e));
  function windowOf(e) { const t = at(e); return { at: t, start: t - WINDOW_MINUTES * MIN, end: t + WINDOW_MINUTES * MIN }; }
  function inWindow(e, now) { const w = windowOf(e); return now >= w.start && now <= w.end; }
  function sorted(events) { return (Array.isArray(events) ? events : []).filter(valid).sort((a, b) => at(a) - at(b)); }

  /** true when there has been no successful fetch, or the last one is older than STALE_HOURS. */
  function isStale(lastSuccessAt, now) {
    const t = Date.parse(lastSuccessAt);
    return !Number.isFinite(t) || now - t > STALE_HOURS * 3_600_000;
  }

  /**
   * data: the /api/news answer ({ ok, events, lastSuccessAt, ... }) or null when the
   * request failed. now: ms.
   */
  function status(data, now) {
    if (!data || data.ok !== true) {
      return { level: 'stale', reason: 'unavailable', message: STALE_MSG, lastSuccessAt: (data && data.lastSuccessAt) || null, error: (data && data.error) || 'The news data could not be loaded.' };
    }
    if (isStale(data.lastSuccessAt, now)) {
      return { level: 'stale', reason: data.lastSuccessAt ? 'old' : 'never', message: STALE_MSG, lastSuccessAt: data.lastSuccessAt || null };
    }
    const events = sorted(data.events);
    const active = events.filter(e => inWindow(e, now));
    const next = events.find(e => windowOf(e).start > now) || null;
    if (active.length) return { level: 'window', active, until: Math.max(...active.map(e => windowOf(e).end)), next, lastSuccessAt: data.lastSuccessAt };
    return { level: 'clear', next, lastSuccessAt: data.lastSuccessAt };
  }

  function dayOfInstant(ms, tz) {
    const c = core();
    return c && tz && c.validTz(tz) ? c.isoInTz(new Date(ms), tz) : new Date(ms).toISOString().slice(0, 10);
  }
  function dayEvents(events, tz, day) { return sorted(events).filter(e => dayOfInstant(at(e), tz) === day); }
  function addDays(day, n) { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  /** [{ day, weekday, events }] for Monday..Sunday of the week that contains `now` in tz. */
  function week(events, tz, now) {
    const today = dayOfInstant(now, tz);
    const wd = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
    const monday = addDays(today, -((wd + 6) % 7));
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return names.map((weekday, i) => { const day = addDays(monday, i); return { day, weekday, today: day === today, events: dayEvents(events, tz, day) }; });
  }

  root.obNews = { WINDOW_MINUTES, STALE_HOURS, STALE_MSG, windowOf, inWindow, isStale, status, dayEvents, week, dayOfInstant, addDays };
})(typeof window !== 'undefined' ? window : globalThis);
