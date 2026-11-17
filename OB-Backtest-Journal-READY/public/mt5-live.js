/**
 * mt5-live.js — live MT5 data from MYJournalLogger (Parts 7–8), read from GET /api/mt5/live.
 *
 *   window.obMt5Live.forAccount(id)   { equity, balance, takenAt, stale, serverOffsetMinutes,
 *                                       positions: [...] } or null
 *   window.obMt5Live.isStale(live)    no report, or the newest is older than 5 minutes
 *   window.obMt5Live.positionsHtml()  the Dashboard's "Open positions" section (dashboard.js
 *                                     renders <section id="dbPositions">)
 *
 * Open positions are NOT journal entries: they live in their own table, never in the trade
 * list, so expectancy, win rate and every other statistic ignore them. When a position closes
 * the EA sends the closed trade, it becomes one journal row, and it leaves this list.
 *
 * Polls every 20 seconds while an account reports (every 5 minutes otherwise). Kept in memory
 * only: live numbers are never written into the accounts.
 */
(() => {
  'use strict';
  if (/^\/auth\.html$/i.test(location.pathname)) return;
  const FAST_MS = 20_000, SLOW_MS = 5 * 60_000, STALE_MS = 5 * 60_000;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = iso => (window.obTime ? window.obTime.instant(iso) : new Date(iso).toLocaleString('en-GB'));
  const clock = iso => (window.obTime ? window.obTime.clock(iso) : new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  const money = v => (window.obTime ? window.obTime.money(v) : `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`);
  const amount = v => (window.obTime ? window.obTime.money(v, { signed: false }) : `$${Number(v).toFixed(2)}`); // a level (equity), not a gain
  const price = v => (v == null || !Number.isFinite(Number(v)) || Number(v) === 0 ? '—' : String(Number(v)));

  let data = null, loading = null, timer = 0;
  const listeners = new Set();

  function anyReporting() { return !!(data && data.accounts && Object.keys(data.accounts).length); }

  // A position that left the list has closed: its trade is now in the journal. Reload the
  // trades (not while a trade form is open, so nothing being edited is lost).
  let reloadWanted = false;
  function tickets(d) { const s = new Set(); for (const [id, a] of Object.entries((d && d.accounts) || {})) for (const p of a.positions || []) s.add(`${id}|${p.ticket}`); return s; }
  function reloadTrades() {
    if (!reloadWanted) return;
    const drawer = document.getElementById('tradeDrawer');
    if (drawer && !drawer.classList.contains('hidden')) return; // tried again on the next poll
    reloadWanted = false;
    if (typeof window.loadState === 'function') Promise.resolve(window.loadState()).then(() => { if (typeof window.renderAll === 'function') window.renderAll(); }).catch(() => {});
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(() => load(true), anyReporting() ? FAST_MS : SLOW_MS); }
  function load(force) {
    if (!force && data) return Promise.resolve(data);
    if (loading) return loading;
    loading = fetch('/api/mt5/live', { credentials: 'same-origin', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).catch(() => null)
      .then(body => {
        loading = null;
        if (body && body.ok) {
          const before = tickets(data), after = tickets(body);
          if (data && [...before].some(t => !after.has(t))) reloadWanted = true;
          data = body;
        } else if (!data) data = { ok: false, accounts: {} };
        reloadTrades();
        refresh();
        listeners.forEach(fn => { try { fn(data); } catch (_) {} });
        window.dispatchEvent(new CustomEvent('ob-mt5-live')); // pages redraw what live equity changes
        schedule();
        return data;
      });
    return loading;
  }
  function forAccount(id) { return data && data.accounts ? data.accounts[String(id)] || null : null; }
  function isStale(live) { return !live || !live.takenAt || Date.now() - Date.parse(live.takenAt) > STALE_MS; }

  function activeAccount() {
    const mode = window.activeMode;
    if (!mode || mode === 'Backtest') return null;
    let doc = {};
    try { doc = JSON.parse(localStorage.getItem('my_journal_accounts_v1') || '{}') || {}; } catch (_) {}
    const list = (Array.isArray(doc[mode]) ? doc[mode] : []).filter(a => a && a.status !== 'archived');
    let id = null; try { id = localStorage.getItem(`my_journal_active_account_${mode}_v1`); } catch (_) {}
    return list.find(a => a.id === id) || list[0] || null;
  }

  /** Inner HTML of <section id="dbPositions">: empty when this account has no MT5 link. */
  function positionsHtml() {
    const acc = activeAccount();
    if (!acc) return '';
    const live = forAccount(acc.id);
    const linked = !!(acc.mt5 && acc.mt5.linked) || !!(live && live.linked);
    if (!live && !linked) return '';
    const head = (period) => `<div class="ds-section-head"><h2 class="ds-label">Open positions</h2><span class="ds-period">${esc(acc.name)} · ${period}</span></div>`;
    const note = `<div class="ds-sub ob-pos-note">Open positions are not journal entries: they count in your statistics only once they close.</div>`;
    if (!live || !live.takenAt) {
      return `${head('MT5')}<div class="ds-card ds-span-12"><div class="ds-sub">MT5 has not reported yet. Positions appear here once MYJournalLogger runs on this account (mt5/README.md).</div></div>`;
    }
    const stale = isStale(live);
    const positions = Array.isArray(live.positions) ? live.positions : [];
    const floating = positions.reduce((s, p) => s + (Number(p.profit) || 0) + (Number(p.swap) || 0), 0);
    const staleNote = stale ? `<div class="ob-pos-stale" role="alert"><b>Not live</b> Last report ${esc(when(live.takenAt))}, more than 5 minutes ago: these positions may have changed.</div>` : '';
    const rows = positions.map(p => {
      const pl = (Number(p.profit) || 0) + (Number(p.swap) || 0);
      const buy = String(p.direction || '').toLowerCase() === 'buy';
      return `<tr><td><b>${esc(p.symbol || '—')}</b></td><td class="${buy ? 'ds-pos' : 'ds-neg'}">${buy ? 'Buy' : 'Sell'}</td><td class="ds-num">${esc(Number(p.volume || 0).toFixed(2))}</td>
        <td>${p.openTime ? esc(when(p.openTime)) : '—'}</td><td class="ds-num">${esc(price(p.openPrice))}</td><td class="ds-num">${esc(price(p.sl))}</td><td class="ds-num">${esc(price(p.tp))}</td>
        <td class="ds-num">${esc(price(p.currentPrice))}</td><td class="ds-num ${pl > 0 ? 'ds-pos' : pl < 0 ? 'ds-neg' : ''}">${esc(money(pl))}</td></tr>`;
    }).join('');
    return `${head(stale ? 'not live' : `live · ${esc(clock(live.takenAt))}`)}
      <div class="ds-card ds-span-12 ob-pos-card">
        ${staleNote}
        <div class="ob-pos-sum"><span><span class="ds-label">Open</span> <b class="ds-num">${positions.length}</b></span><span><span class="ds-label">Floating P/L</span> <b class="ds-num ${floating > 0 ? 'ds-pos' : floating < 0 ? 'ds-neg' : ''}">${esc(money(floating))}</b></span>${live.equity != null ? `<span><span class="ds-label">Equity</span> <b class="ds-num">${esc(amount(live.equity))}</b></span>` : ''}</div>
        ${positions.length ? `<div class="ob-pos-table"><table><thead><tr><th>Symbol</th><th>Side</th><th>Lots</th><th>Opened</th><th>Entry</th><th>SL</th><th>TP</th><th>Price</th><th>P/L</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="ds-sub">No open positions.</div>`}
        ${note}
      </div>`;
  }

  function refresh() {
    const el = document.getElementById('dbPositions');
    if (el && !el.closest('.hidden')) el.innerHTML = positionsHtml();
  }

  window.obMt5Live = { load, forAccount, isStale, positionsHtml, refresh, onChange: fn => listeners.add(fn), STALE_MS };
  window.addEventListener('load', () => { (window.obSignedInCheck || Promise.resolve(true)).then(ok => { if (ok) load(true); }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && data) load(true); });
})();
