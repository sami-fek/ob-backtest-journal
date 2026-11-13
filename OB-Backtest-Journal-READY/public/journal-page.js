/**
 * journal-page.js — Journal page structure (BUILD-PLAN-2 Part 2 Step 2): "Review".
 *
 * Keeps the trade list, notes, screenshots (in the drawer), filters and the
 * Discipline & Rules Status card. Adds:
 *  - section titles ("Review", "All trades");
 *  - a "Not reviewed yet" queue: trades with no checklist ticks or no note,
 *    for the selected mode and account, newest first; "Review" opens the drawer.
 * The duplicate equity chart is removed from the Journal (it lives in Analytics):
 * its card stays in the DOM, hidden, because older layout scripts look it up.
 */
(() => {
  'use strict';
  const SHOW = 5;
  let expanded = false;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = n => (window.obNotes && typeof window.obNotes.notePlainText === 'function' ? window.obNotes.notePlainText(n) : String(n || '').replace(/<[^>]*>/g, '')).trim();

  function activeAccountId(mode) {
    try {
      const all = JSON.parse(localStorage.getItem('my_journal_accounts_v1') || '{}');
      const list = Array.isArray(all[mode]) ? all[mode] : [];
      const id = localStorage.getItem(`my_journal_active_account_${mode}_v1`);
      return (list.find(a => a.id === id) || list[0] || {}).id || null;
    } catch (_) { return null; }
  }
  function scopedTrades() {
    const m = window.activeMode || 'Real';
    const acc = m === 'Backtest' ? null : activeAccountId(m);
    return (Array.isArray(window.trades) ? window.trades : []).filter(t => t.mode === m && (m === 'Backtest' || !acc || t.accountId === acc));
  }
  /** What a trade is missing for review: [] when reviewed. */
  function missing(t) {
    const out = [];
    const ticks = (Array.isArray(t.checklist) ? t.checklist : []).filter(s => s === 'pass').length;
    if (!ticks) out.push('No checklist ticks');
    if (!plain(t.notes)) out.push('No note');
    return out;
  }
  window.obJournalReviewMissing = missing;

  function ensure(parent, id, tag, cls, before) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement(tag); el.id = id; if (cls) el.className = cls; }
    if (el.parentElement !== parent) { if (before && before.parentElement === parent) parent.insertBefore(el, before); else parent.appendChild(el); }
    return el;
  }

  function renderQueue(row) {
    const box = ensure(row, 'jpQueue', 'div', 'ds-card jp-queue', row.firstElementChild);
    const list = scopedTrades()
      .map(t => ({ t, miss: missing(t) }))
      .filter(x => x.miss.length)
      .sort((a, b) => String(b.t.date).localeCompare(String(a.t.date)));
    const shown = expanded ? list : list.slice(0, SHOW);
    const r = t => { const v = Number(t.rMultiple) || 0; return `${v > 0 ? '+' : ''}${v.toFixed(1)}R`; };
    box.innerHTML = `
      <div class="jp-q-head">
        <div><h3 class="ap-title">Not reviewed yet</h3><p class="ds-sub">Trades with no checklist ticks or no note · this account</p></div>
        <span class="ds-pill ${list.length ? 'warn' : 'pos'}">${list.length ? `${list.length} to review` : 'All reviewed'}</span>
      </div>
      ${list.length ? `<ul class="jp-q-list">${shown.map(({ t, miss }) => `
        <li><button type="button" class="jp-q-item" data-open="${esc(t.id)}" aria-label="Review ${esc(t.pair)} trade on ${esc(t.date)}">
          <span class="jp-q-main"><b>${esc(t.pair || '—')}</b><span class="ds-period">${esc(window.obTime ? window.obTime.date(t.date || '') : (t.date || ''))} · ${esc(t.strategy || '')}</span></span>
          <span class="jp-q-miss">${miss.map(m => `<span class="ds-pill warn">${m}</span>`).join('')}</span>
          <span class="jp-q-r ds-num ${(Number(t.rMultiple) || 0) > 0 ? 'ds-pos' : (Number(t.rMultiple) || 0) < 0 ? 'ds-neg' : ''}">${r(t)}</span>
          <span class="jp-q-go ds-link">Review <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
        </button></li>`).join('')}</ul>
        ${list.length > SHOW ? `<button type="button" class="ds-btn ds-btn-secondary ds-btn-sm jp-q-more">${expanded ? 'Show fewer' : `Show all ${list.length}`}</button>` : ''}`
        : '<div class="jp-q-empty">Every trade in this account has checklist ticks and a note.</div>'}`;
    box.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { if (typeof window.openDrawer === 'function') window.openDrawer(b.dataset.open); }));
    const more = box.querySelector('.jp-q-more');
    if (more) more.addEventListener('click', () => { expanded = !expanded; renderQueue(row); });
  }

  function render() {
    const page = document.getElementById('pageJournal');
    if (!page) return;
    page.classList.add('jp-v2');
    const row = document.getElementById('ob-journal-equity-discipline-row');
    // The equity card: hidden (Analytics has the R progression and the drawdown chart).
    const eq = document.getElementById('chartEquityConsole')?.closest('.glass-card');
    if (eq) eq.classList.add('jp-removed');
    const disc = document.getElementById('statCleanTrades')?.closest('.glass-card');
    if (disc) disc.classList.add('jp-discipline');
    const filters = document.getElementById('journalSearch')?.closest('.glass-card');
    if (filters) filters.classList.add('jp-filters');
    const table = document.getElementById('journalTableBody')?.closest('.glass-card');
    if (table) table.classList.add('jp-table');
    const head = (id, label, sub) => {
      const el = ensure(page, id, 'div', 'ds-section-head jp-head');
      if (!el.dataset.built) { el.dataset.built = '1'; el.innerHTML = `<h2 class="ds-label">${label}</h2><span class="ds-period">${sub}</span>`; }
    };
    head('jpHeadReview', 'Review', 'what still needs your attention');
    head('jpHeadTrades', 'All trades', 'click a row to open the trade');
    if (row && !page.classList.contains('hidden')) renderQueue(row);
  }

  let timer = 0;
  const queue = () => { clearTimeout(timer); timer = setTimeout(render, 60); };
  function wrap(name) {
    const fn = window[name];
    if (typeof fn !== 'function' || fn.__obJpWrapped) return;
    const w = function (...a) { const r = fn.apply(this, a); queue(); return r; };
    w.__obJpWrapped = true;
    window[name] = w;
  }
  function boot() {
    ['renderAll', 'switchTab', 'switchMode', 'renderJournalTable'].forEach(wrap);
    [400, 1200, 2500].forEach(ms => setTimeout(() => { ['renderAll', 'switchTab', 'switchMode', 'renderJournalTable'].forEach(wrap); queue(); }, ms));
    window.addEventListener('wallet-accounts-updated', queue);
    queue();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
