// news.js — fetch-news: the ForexFactory weekly feed → news_events (Part 4).
// Plain JavaScript with no Deno or Node APIs: the Edge Function and the Node tests both run it.
//
// Rules (research/news-sources.md, DECISIONS.md):
//   1. keep country (a currency code) in USD, GBP, EUR and impact "High"
//   2. the UTC offset is read from each date string (-05:00 in US winter, -04:00 in summer);
//      a date without an offset is refused, never assumed
//   3. the body must parse as a JSON array; anything else (the HTML "Request Denied" page)
//      is a failed fetch and the stored events are kept as they are
//   4. event_key = title | currency | UTC instant (the feed has no ids)
//   5. events are upserted and never deleted, so past weeks survive Sunday's rollover
//   6. at most one call to the feed per MIN_INTERVAL_MINUTES, whatever calls this function
//
// db: { query(sql, params) → rows, tx(fn(db)) }.

export const NEWS_SOURCE_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
export const NEWS_CURRENCIES = ['USD', 'GBP', 'EUR'];
// The schedule fetches on Sunday at 00:00 and again at 00:30 UTC (the new week's file), so the
// guard is shorter than an hour. ForexFactory allows 2 downloads per 5 minutes.
export const MIN_INTERVAL_MINUTES = 25;
export const STALE_AFTER_HOURS = 12;
const MAX_BODY_BYTES = 2_000_000;

const OFFSET_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|([+-])(\d{2}):?(\d{2}))$/;

/** "2026-11-10T08:30:00-05:00" → Date (UTC) using the string's own offset; null without one. */
export function parseOffsetDate(value) {
  const m = OFFSET_DATE_RE.exec(String(value ?? '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '0', z, sign, oh, om] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59 || +s > 59) return null;
  const offsetMin = z === 'Z' ? 0 : (sign === '-' ? -1 : 1) * (Number(oh) * 60 + Number(om));
  if (Math.abs(offsetMin) > 14 * 60) return null;
  const local = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  const check = new Date(local);
  if (check.getUTCDate() !== +d || check.getUTCMonth() !== +mo - 1) return null; // 2026-02-30
  return new Date(local - offsetMin * 60_000);
}

/**
 * Feed body (text) → { ok: true, events, seen, skipped } or { ok: false, error }.
 * events: [{ title, currency, impact, event_time_utc (ISO), event_key }].
 */
export function parseFeed(body) {
  let data;
  try { data = JSON.parse(body); } catch { data = undefined; }
  if (!Array.isArray(data)) {
    const looksHtml = /^\s*</.test(String(body || ''));
    return { ok: false, error: looksHtml ? 'feed returned HTML, not a JSON array (rate limited?)' : 'feed body is not a JSON array' };
  }
  const events = [], seenKeys = new Set();
  let skipped = 0;
  for (const e of data) {
    if (!e || typeof e !== 'object') { skipped++; continue; }
    const currency = String(e.country ?? '').trim().toUpperCase();
    const impact = String(e.impact ?? '').trim();
    if (!NEWS_CURRENCIES.includes(currency) || impact.toLowerCase() !== 'high') continue;
    const title = String(e.title ?? '').trim();
    const at = parseOffsetDate(e.date);
    if (!title || !at) { skipped++; continue; } // a high-impact row we cannot place: counted, never guessed
    const iso = at.toISOString();
    const key = `${title}|${currency}|${iso}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    events.push({ title, currency, impact: 'High', event_time_utc: iso, event_key: key });
  }
  return { ok: true, events, seen: data.length, skipped };
}

/** Latest attempt and latest successful fetch for a source. */
export async function newsFetchState(db, source = NEWS_SOURCE_URL) {
  const [last] = await db.query(`select id, started_at, status from public.news_fetches where source = $1 order by started_at desc limit 1`, [source]);
  const [ok] = await db.query(`select finished_at from public.news_fetches where source = $1 and status = 'ok' order by finished_at desc limit 1`, [source]);
  return { lastAttemptAt: last ? new Date(last.started_at).toISOString() : null, lastSuccessAt: ok ? new Date(ok.finished_at).toISOString() : null };
}

/**
 * One run of fetch-news. Calls the feed only when no attempt was made in the last
 * MIN_INTERVAL_MINUTES (so retries and extra calls are harmless). Returns a summary.
 * fetchImpl: fetch; now: Date (tests); url: the feed.
 */
export async function runFetchNews({ db, fetchImpl, now = new Date(), url = NEWS_SOURCE_URL }) {
  const nowIso = now.toISOString();
  // Claim the attempt first, in one statement: a second call inside the window finds it.
  const claimed = await db.query(
    `insert into public.news_fetches (source, started_at, status)
     select $1, $2::timestamptz, 'running'
     where not exists (select 1 from public.news_fetches where source = $1 and started_at > $2::timestamptz - make_interval(mins => $3))
     returning id`, [url, nowIso, MIN_INTERVAL_MINUTES]);
  if (!claimed.length) {
    const state = await newsFetchState(db, url);
    return { ok: true, skipped: true, reason: `fetched less than ${MIN_INTERVAL_MINUTES} minutes ago`, ...state };
  }
  const id = claimed[0].id;
  const finish = (status, fields) => db.query(
    `update public.news_fetches set status = $2, finished_at = $3::timestamptz, http_status = $4, events_seen = $5, events_kept = $6, error = $7 where id = $1`,
    [id, status, nowIso, fields.http ?? null, fields.seen ?? null, fields.kept ?? null, fields.error ?? null]);

  let res, body;
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'MYJournal-news/1.0 (personal journal; at most a few requests a day)' }, signal: AbortSignal.timeout(20_000) });
    body = await res.text();
  } catch (err) {
    await finish('failed', { error: `request failed: ${String(err && err.message || err).slice(0, 300)}` });
    return { ok: false, error: 'request failed', ...(await newsFetchState(db, url)) };
  }
  if (!res.ok) {
    await finish('failed', { http: res.status, error: `HTTP ${res.status}` });
    return { ok: false, error: `HTTP ${res.status}`, ...(await newsFetchState(db, url)) };
  }
  if (body.length > MAX_BODY_BYTES) {
    await finish('failed', { http: res.status, error: 'body too large' });
    return { ok: false, error: 'body too large', ...(await newsFetchState(db, url)) };
  }
  const parsed = parseFeed(body);
  if (!parsed.ok) {
    await finish('failed', { http: res.status, error: parsed.error });
    return { ok: false, error: parsed.error, ...(await newsFetchState(db, url)) };
  }
  await db.tx(async tx => {
    for (const e of parsed.events) {
      await tx.query(
        `insert into public.news_events (title, currency, event_time_utc, impact, event_key, source, fetched_at)
         values ($1, $2, $3::timestamptz, $4, $5, $6, $7::timestamptz)
         on conflict (event_key) do update set impact = excluded.impact, source = excluded.source, fetched_at = excluded.fetched_at`,
        [e.title, e.currency, e.event_time_utc, e.impact, e.event_key, 'forexfactory', nowIso]);
    }
  });
  await finish('ok', { http: res.status, seen: parsed.seen, kept: parsed.events.length, error: parsed.skipped ? `${parsed.skipped} row(s) without a usable title or dated offset were skipped` : null });
  return { ok: true, skipped: false, seen: parsed.seen, kept: parsed.events.length, unplaced: parsed.skipped, ...(await newsFetchState(db, url)) };
}
