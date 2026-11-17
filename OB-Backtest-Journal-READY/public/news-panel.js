/**
 * news-panel.js — the high-impact news panel and the no-trade warning (Part 5).
 *
 *  - Dashboard: a "High-impact news" section (dashboard.js renders <section id="dbNews">
 *    and fills it with window.obNewsPanel.html()): today's USD/GBP/EUR high-impact events
 *    in the saved display timezone with their ±15 minute no-trade window, the window you are
 *    in now, and the week ahead (Monday to Sunday) so dangerous days show in advance.
 *  - The new-trade form: inside a window, or when the news data is stale, a warning at the
 *    top of the form. WARN ONLY: entry is never blocked by news. Not shown in Backtest
 *    (a backtest trade is not placed now).
 *  - Stale: no successful fetch for 12 hours, or the data could not be loaded, shows red
 *    "news data stale - do not trade", never "no news". A fresh feed with no events today
 *    says so, with the time it was checked.
 *
 * Data: GET /api/news (the database). The browser never calls the news source.
 * Logic: news-core.js (window.obNews). Checks: qa/check-news.mjs.
 */
(() => {
  'use strict';
  if (/^\/auth\.html$/i.test(location.pathname)) return;
  const N = () => window.obNews;
  const REFRESH_MS = 5 * 60_000;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tz = () => (window.obTime ? window.obTime.tz() : Intl.DateTimeFormat().resolvedOptions().timeZone);
  const clock = ms => (window.obTime ? window.obTime.clock(new Date(ms).toISOString()) : new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  const when = iso => (window.obTime ? window.obTime.instant(iso) : new Date(iso).toLocaleString('en-GB'));
  const fmtDay = day => (window.obTime ? window.obTime.date(day) : day);

  let data = null;        // last /api/news answer (or { ok: false, error })
  let loadedAt = 0;
  let loading = null;

  function range() {
    // the current week in the display timezone, one day of margin on each side
    const now = Date.now();
    return { from: new Date(now - 8 * 86_400_000).toISOString(), to: new Date(now + 8 * 86_400_000).toISOString() };
  }
  function load(force) {
    if (!force && data && Date.now() - loadedAt < REFRESH_MS) return Promise.resolve(data);
    if (loading) return loading;
    const r = range();
    loading = fetch(`/api/news?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async res => { const body = await res.json().catch(() => null); return body && typeof body === 'object' ? body : { ok: false, error: `News request failed (${res.status}).` }; })
      .catch(() => ({ ok: false, error: 'The news data could not be loaded (offline?).' }))
      .then(body => { data = body; loadedAt = Date.now(); loading = null; refresh(); return body; });
    return loading;
  }
  const current = () => (N() ? N().status(data, Date.now()) : { level: 'stale', reason: 'unavailable', message: 'news data stale - do not trade' });

  const pill = cur => `<span class="ob-news-cur">${esc(cur)}</span>`;
  function eventRow(e, now) {
    const w = N().windowOf(e);
    const live = N().inWindow(e, now);
    const past = w.end < now;
    return `<li class="ob-news-row${live ? ' live' : ''}${past ? ' past' : ''}">
      <span class="ob-news-time ds-num">${esc(clock(w.at))}</span>${pill(e.currency)}<span class="ob-news-title">${esc(e.title)}</span>
      <span class="ob-news-win ds-sub">${live ? '<b>no-trade now</b> · ' : ''}${esc(clock(w.start))}–${esc(clock(w.end))}</span></li>`;
  }

  /** Inner HTML of <section id="dbNews">. */
  function html() {
    if (!N()) return '';
    if (!data && !loading) load(false);
    const now = Date.now();
    const st = current();
    const zone = tz();
    const events = (data && data.ok && Array.isArray(data.events)) ? data.events : [];
    const today = N().dayOfInstant(now, zone);
    const todays = N().dayEvents(events, zone, today);
    const head = `<div class="ds-section-head"><h2 class="ds-label">High-impact news</h2><span class="ds-period">USD · GBP · EUR · ±${N().WINDOW_MINUTES} min · ${esc(zone)}</span></div>`;

    let banner;
    if (!data) banner = `<div class="ob-news-banner muted" role="status">Loading news…</div>`;
    else if (st.level === 'stale') {
      const last = st.lastSuccessAt ? `Last successful update ${esc(when(st.lastSuccessAt))}.` : 'No successful update yet.';
      banner = `<div class="ob-news-banner stale" role="alert"><b>${esc(st.message)}</b><span>${last} ${st.reason === 'unavailable' ? esc(st.error || '') : `Updates are expected every 6 hours; after ${N().STALE_HOURS} hours without one, a window could be missing.`}</span></div>`;
    } else if (st.level === 'window') {
      banner = `<div class="ob-news-banner window" role="alert"><b>No-trade window now</b><span>${st.active.map(e => `${esc(e.title)} (${esc(e.currency)}) at ${esc(clock(Date.parse(e.time)))}`).join(' · ')} · until ${esc(clock(st.until))}</span></div>`;
    } else {
      const next = st.next;
      const nextTxt = next
        ? `Next window ${esc(clock(N().windowOf(next).start))}–${esc(clock(N().windowOf(next).end))}${N().dayOfInstant(Date.parse(next.time), zone) !== today ? ` on ${esc(fmtDay(N().dayOfInstant(Date.parse(next.time), zone)))}` : ''}: ${esc(next.title)} (${esc(next.currency)}).`
        : 'No more high-impact news this week.';
      banner = `<div class="ob-news-banner clear" role="status"><b>No window now</b><span>${nextTxt} Updated ${esc(when(st.lastSuccessAt))}.</span></div>`;
    }

    const fresh = data && st.level !== 'stale';
    const todayList = todays.length
      ? `<ul class="ob-news-list">${todays.map(e => eventRow(e, now)).join('')}</ul>`
      : fresh ? `<div class="ds-sub ob-news-none">No high-impact USD, GBP or EUR news today.</div>`
      : `<div class="ds-sub ob-news-none ds-neg">Unknown: the news data is stale, so today's events cannot be shown.</div>`;

    const days = N().week(events, zone, now);
    const weekHtml = `<ol class="ob-news-week">${days.map(d => `<li class="ob-news-day${d.events.length ? ' danger' : ''}${d.today ? ' today' : ''}">
        <div class="ob-news-day-head"><b>${esc(d.weekday)}</b><span class="ds-sub">${esc(fmtDay(d.day))}</span>${d.events.length ? `<span class="ob-news-count" aria-label="${d.events.length} high-impact events">${d.events.length}</span>` : ''}</div>
        ${d.events.length ? `<div class="ob-news-day-list">${d.events.map(e => `<span>${esc(clock(Date.parse(e.time)))} ${pill(e.currency)} ${esc(e.title)}</span>`).join('')}</div>` : `<div class="ds-sub">${fresh ? '—' : '?'}</div>`}
      </li>`).join('')}</ol>`;

    return `${head}
      ${banner}
      <div class="ds-grid">
        <div class="ds-card ds-span-5 ds-t-6"><div class="db2-stat-top"><span class="ds-label">Today</span><span class="ds-period">${esc(fmtDay(today))}</span></div>${todayList}</div>
        <div class="ds-card ds-span-7 ds-t-6"><div class="db2-stat-top"><span class="ds-label">This week</span><span class="ds-period">${esc(fmtDay(days[0].day))} – ${esc(fmtDay(days[6].day))}</span></div>${fresh ? '' : '<div class="ds-sub ds-neg">Stale: days may be missing events.</div>'}${weekHtml}</div>
      </div>`;
  }

  function refresh() {
    const el = document.getElementById('dbNews');
    if (el && !el.closest('.hidden')) el.innerHTML = html();
    formWarning();
  }

  // ── the new-trade form: warn only ─────────────────────────────────────────
  function formWarning() {
    const drawer = document.getElementById('tradeDrawer');
    if (!drawer) return;
    const open = !drawer.classList.contains('hidden');
    const isNew = !!window.__obPendingNewTrade;
    const backtest = window.activeMode === 'Backtest';
    const st = current();
    let box = document.getElementById('obNewsFormWarn');
    const show = open && isNew && !backtest && data && (st.level === 'stale' || st.level === 'window');
    if (!show) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'obNewsFormWarn';
      box.setAttribute('role', 'alert');
      const body = drawer.querySelector('.overflow-y-auto') || drawer.querySelector('.drawer-panel') || drawer;
      body.prepend(box);
    }
    box.className = `ob-news-warn ${st.level}`;
    box.innerHTML = st.level === 'stale'
      ? `<b>${esc(st.message)}</b><span>The news calendar has not updated for ${N().STALE_HOURS}+ hours, so a no-trade window may be missing. Saving is still allowed.</span>`
      : `<b>No-trade window now</b><span>${st.active.map(e => `${esc(e.title)} (${esc(e.currency)}) at ${esc(clock(Date.parse(e.time)))}`).join(' · ')}, until ${esc(clock(st.until))}. A warning only: saving is still allowed.</span>`;
  }
  function watchDrawer() {
    const drawer = document.getElementById('tradeDrawer');
    if (!drawer || drawer.__obNewsWatched) return;
    drawer.__obNewsWatched = true;
    new MutationObserver(() => { if (!drawer.classList.contains('hidden')) { if (Date.now() - loadedAt > REFRESH_MS) load(true); } formWarning(); })
      .observe(drawer, { attributes: true, attributeFilter: ['class'] });
  }

  window.obNewsPanel = { html, refresh, load, status: current };

  const start = () => {
    watchDrawer();
    load(true);
    setInterval(refresh, 30_000);            // windows open and close on the minute
    setInterval(() => load(true), REFRESH_MS);
  };
  // backend-sync.js (added at the end of the page) knows whether someone is signed in;
  // a signed-out visitor on the homepage makes no news request.
  window.addEventListener('load', () => { (window.obSignedInCheck || Promise.resolve(true)).then(ok => { if (ok) start(); }); });
})();
