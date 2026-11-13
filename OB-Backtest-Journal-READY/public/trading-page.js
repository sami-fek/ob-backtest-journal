/**
 * trading-page.js — Trading page v2 (BUILD-PLAN-2, Part 1 step 3):
 * "Can I trade right now, and how do I log it?" (time frame: this session)
 *
 *  1. One slim toolbar strip: mode switch · account · MT5 status · rule status
 *     (replaces the old mode bar, the MT5 status panel and the hard-stop /
 *     daily-limit banner, which stay in the DOM hidden by trading-page.css).
 *  2. "Can I trade?" panel: trades left today, losses left before the hard stop,
 *     daily loss room. Values come from the discipline engine
 *     (getDisciplineState / 'ob-discipline-state') and the account's saved
 *     daily loss limit. Nothing here changes or enforces a rule.
 *  3. LOG A TRADE stays the existing form (index.html), with the green button.
 *  4. Today's trades for the active account, with "Full history → Journal".
 *  5. MT5 open positions (mt5-integration-ui.js) stay below.
 */
(() => {
  'use strict';
  const MODES = [{ id: 'Real', label: 'Live' }, { id: 'Demo', label: 'Demo' }, { id: 'Funded', label: 'Funded' }, { id: 'Backtest', label: 'Backtest' }];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sym = () => (window.obPrefs ? window.obPrefs.get().currencySymbol : '$');
  function money(v, signed = true) {
    const n = Number(v) || 0;
    return `${n < 0 ? '-' : signed && n > 0 ? '+' : ''}${sym()}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const cls = v => (v > 0 ? 'ds-pos' : v < 0 ? 'ds-neg' : '');
  const fmtR = v => `${v > 0 ? '+' : ''}${(Number(v) || 0).toFixed(2)}R`;
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const pnlFor = t => (window.obCalendarKit ? window.obCalendarKit.pnlFor(t) : (Number(t.rMultiple) || 0) * 1000);

  let queued = false;
  let discipline = null;
  let mt5 = { mode: null, at: 0, list: null };

  // ── scope (same rules as the Dashboard) ───────────────────────────────────
  const mode = () => window.activeMode || 'Real';
  function accountsOf(m) { try { const d = JSON.parse(localStorage.getItem('my_journal_accounts_v1') || '{}'); return Array.isArray(d[m]) ? d[m] : []; } catch (_) { return []; } }
  function liveAccounts(m) { const all = accountsOf(m); const live = all.filter(a => a && a.status !== 'archived'); return live.length ? live : all; }
  function activeAccount() {
    const m = mode();
    if (m === 'Backtest') return null;
    const list = liveAccounts(m);
    let id = null; try { id = localStorage.getItem(`my_journal_active_account_${m}_v1`); } catch (_) {}
    return list.find(a => a.id === id) || list[0] || null;
  }
  function scopedTrades() {
    const m = mode(); const acc = activeAccount();
    return (Array.isArray(window.trades) ? window.trades : []).filter(t => t.mode === m && (m === 'Backtest' || (acc && t.accountId === acc.id)));
  }
  function disciplineState() {
    if (discipline && discipline.mode === mode()) return discipline;
    try { return typeof window.getDisciplineState === 'function' ? { ...window.getDisciplineState(), mode: mode() } : null; } catch (_) { return null; }
  }

  // ── MT5 status (same endpoint as the MT5 panel; local fallback) ──────────
  async function loadMt5(force) {
    const m = mode();
    if (!force && mt5.mode === m && Date.now() - mt5.at < 5000) return;
    mt5 = { mode: m, at: Date.now(), list: mt5.mode === m ? mt5.list : null };
    let list = null;
    try {
      const r = await fetch('/api/mt5/status', { credentials: 'same-origin', cache: 'no-store' });
      if (r.ok) { const j = await r.json(); list = (j.accounts || []).filter(a => a.mode === m); }
    } catch (_) {}
    if (!list || !list.length) {
      list = liveAccounts(m).map(a => ({ accountId: a.id, linked: !!a.mt5?.linked, login: a.mt5?.login || null, server: a.mt5?.server || null, syncStatus: a.mt5?.linked ? 'linked' : 'none', positionCount: a.mt5State?.positions?.length ?? null }));
    }
    mt5 = { mode: m, at: Date.now(), list };
    queue();
  }

  // ── pieces ───────────────────────────────────────────────────────────────
  function stripHtml(d) {
    const m = mode(); const acc = activeAccount(); const accounts = liveAccounts(m);
    // MT5
    let mt5Html;
    if (m === 'Backtest') mt5Html = `<span class="tp-chip"><i class="fa-solid fa-plug"></i> MT5 · not used in Backtest</span>`;
    else if (!acc) mt5Html = `<span class="tp-chip"><i class="fa-solid fa-plug"></i> MT5 · no ${esc(m === 'Real' ? 'Live' : m)} account</span>`;
    else {
      const st = (mt5.list || []).find(a => a.accountId === acc.id) || { linked: !!acc.mt5?.linked, syncStatus: acc.mt5?.linked ? 'linked' : 'none' };
      const synced = st.syncStatus === 'synced';
      const label = synced ? 'Synced' : st.linked ? 'Linked' : 'Not linked';
      const tone = synced ? 'pos' : st.linked ? 'warn' : '';
      mt5Html = `<span class="tp-chip ${tone}" title="${esc(st.linked ? `${st.login || ''}${st.server ? ' · ' + st.server : ''}` : 'Read-only MT5 sync is not linked for this account')}"><span class="ds-dot"></span> MT5 · ${label}${st.linked && st.positionCount != null ? ` · ${plural(st.positionCount, 'open position', 'open positions')}` : ''}</span>
        ${st.linked
          ? `<button type="button" class="ds-btn ds-btn-secondary ds-btn-sm" data-mt5="history"><i class="fa-solid fa-clock-rotate-left"></i> History</button><button type="button" class="ds-btn ds-btn-secondary ds-btn-sm tp-danger" data-mt5="unlink">Unlink</button>`
          : `<button type="button" class="ds-btn ds-btn-secondary ds-btn-sm" data-mt5="link"><i class="fa-solid fa-link"></i> Link MT5</button>`}
        <button type="button" class="ds-btn ds-btn-secondary ds-btn-sm ds-icon-btn" data-mt5="help" aria-label="How to connect MT5" title="How to connect MT5"><i class="fa-solid fa-circle-question"></i></button>`;
    }
    // Rule status (what the hard-stop / daily-limit banner used to say)
    let rule = '';
    if (m !== 'Backtest' && d) {
      if (d.consecutiveLosses >= d.hardStopThreshold && d.hardStopTriggered) {
        rule = `<span class="tp-chip neg" title="Trading is paused after hitting your ${d.hardStopThreshold}-loss rule."><i class="fa-solid fa-hand"></i> Hard stop · ${plural(d.consecutiveLosses, 'loss', 'losses')} in a row</span>`;
      } else if (d.dailyLimitReached) {
        rule = `<span class="tp-chip neg" title="Further submissions today will be rejected by the server."><i class="fa-solid fa-calendar-xmark"></i> Daily limit · ${d.todayCount}/${d.dailyMax} trades</span>`;
      } else if (d.hardStopTriggered) {
        const after = d.tradesAfterStop > 0 ? ` · ${plural(d.tradesAfterStop, 'trade', 'trades')} logged after it` : '';
        rule = `<span class="tp-chip warn" title="Your ${d.hardStopThreshold}-loss rule was hit earlier${d.hardStopDate ? ' on ' + d.hardStopDate : ''}${after}."><i class="fa-solid fa-flag"></i> ${d.hardStopThreshold}-loss rule hit${d.hardStopDate ? ` on ${esc(d.hardStopDate)}` : ''}${after}</span>`;
      } else {
        rule = `<span class="tp-chip pos"><i class="fa-solid fa-shield-halved"></i> Rules OK</span>`;
      }
    }
    return `<div class="tp-strip-l">
        <div class="ds-seg tp-modes" role="radiogroup" aria-label="Account mode">${MODES.map(x => `<button type="button" role="radio" data-mode="${x.id}" aria-checked="${x.id === m}">${x.id === 'Real' ? '<span class="ds-dot ds-pos"></span>' : ''}${x.label}</button>`).join('')}</div>
        ${m !== 'Backtest' ? `<select class="ds-select" id="tpAccount" aria-label="Account">${accounts.map(a => `<option value="${esc(a.id)}" ${acc && a.id === acc.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}<option value="__add__">+ Add account…</option></select>` : ''}
      </div>
      <div class="tp-strip-r">${mt5Html}${rule ? `<span class="tp-sep" aria-hidden="true"></span>${rule}` : ''}</div>`;
  }

  function verdict(d, room) {
    if (mode() === 'Backtest') return { tone: 'neutral', title: 'Backtest', text: 'No hard stop, daily limit or loss limit applies in Backtest. Log freely.' };
    if (!d) return { tone: 'neutral', title: 'Checking…', text: 'Reading your rules.' };
    const lossesLeft = d.hardStopThreshold - d.consecutiveLosses;
    const tradesLeft = d.dailyMax - d.todayCount;
    const reasons = [];
    if (lossesLeft <= 0) reasons.push(`you hit your hard stop (${plural(d.consecutiveLosses, 'loss', 'losses')} in a row)`);
    if (tradesLeft <= 0) reasons.push(`you reached your daily limit of ${plural(d.dailyMax, 'trade', 'trades')}`);
    if (room && room.left <= 0) reasons.push("you used today's loss limit");
    if (reasons.length) return { tone: 'neg', title: 'No — stop for today', text: `Stop: ${reasons.join(', and ')}.` };
    const warn = [];
    if (lossesLeft === 1) warn.push('one more loss hits your hard stop');
    if (tradesLeft === 1) warn.push('this is your last trade today');
    if (room && room.left < room.limit * 0.25) warn.push(`only ${money(room.left, false)} of loss room left`);
    if (warn.length) return { tone: 'warn', title: 'Yes, carefully', text: `${warn.join('; ').replace(/^./, c => c.toUpperCase())}.` };
    return { tone: 'pos', title: 'Yes — you can trade', text: `${plural(tradesLeft, 'trade', 'trades')} and ${plural(lossesLeft, 'loss', 'losses')} of room before a rule stops you.` };
  }

  function canTradeHtml(d) {
    const m = mode(); const acc = activeAccount();
    const today = todayIso();
    const todays = scopedTrades().filter(t => String(t.date).slice(0, 10) === today);
    const todayPnl = todays.reduce((s, t) => s + pnlFor(t), 0);
    const limit = acc && Number(acc.dailyLossLimit) > 0 ? Number(acc.dailyLossLimit) : null;
    const room = limit ? { limit, used: Math.max(0, -todayPnl), left: Math.max(0, limit - Math.max(0, -todayPnl)) } : null;
    const v = verdict(d, room);
    const tone = (left, of) => (left <= 0 ? 'neg' : left === 1 || (of && left < of * 0.25) ? 'warn' : 'pos');
    const metric = (label, big, of, pct, t, sub) => `<div class="tp-metric">
        <span class="ds-label">${label}</span>
        <div class="tp-metric-val"><b class="ds-num ${t === 'neg' ? 'ds-neg' : t === 'warn' ? 'ds-warn' : ''}">${big}</b>${of ? `<span class="ds-sub"> ${of}</span>` : ''}</div>
        ${pct == null ? '' : `<div class="ds-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${esc(label)}"><i class="${t}" style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`}
        <span class="ds-sub">${sub}</span></div>`;
    let metrics;
    if (m === 'Backtest' || !d) {
      metrics = `<div class="tp-metric tp-metric-wide"><span class="ds-sub">${m === 'Backtest' ? 'Limits are tracked for Live, Demo and Funded accounts.' : ''}</span></div>`;
    } else {
      const tl = Math.max(0, d.dailyMax - d.todayCount), ll = Math.max(0, d.hardStopThreshold - d.consecutiveLosses);
      metrics = metric('Trades left today', tl, `/ ${d.dailyMax}`, (tl / (d.dailyMax || 1)) * 100, tone(tl, d.dailyMax), `${plural(d.todayCount, 'trade', 'trades')} logged today`)
        + metric('Losses left before hard stop', ll, `/ ${d.hardStopThreshold}`, (ll / (d.hardStopThreshold || 1)) * 100, tone(ll, d.hardStopThreshold), `${plural(d.consecutiveLosses, 'loss', 'losses')} in a row now`)
        + (room
          ? metric('Daily loss room left', money(room.left, false), `/ ${money(limit, false)}`, (room.left / limit) * 100, room.left <= 0 ? 'neg' : room.left < limit * 0.25 ? 'warn' : 'pos', `Today's P&amp;L <span class="${cls(todayPnl)}">${money(todayPnl)}</span>`)
          : metric('Daily loss room left', '—', '', null, '', `No daily loss limit on this account · <button type="button" class="ds-link" data-go-acc>Set one</button>`));
    }
    return `<div class="ds-section-head"><h2 class="ds-label">Can I trade?</h2><span class="ds-period">today${acc ? ' · ' + esc(acc.name) : m === 'Backtest' ? ' · Backtest' : ''}</span></div>
      <div class="ds-card tp-can tp-${v.tone}" role="status" aria-live="polite">
        <div class="tp-verdict"><span class="tp-light" aria-hidden="true"></span><div><b>${v.title}</b><p class="ds-sub">${v.text}</p></div></div>
        <div class="tp-metrics">${metrics}</div>
      </div>`;
  }

  function ruleStatus(t) {
    const chk = Array.isArray(t.checklist) ? t.checklist : [];
    if (chk.some(s => s === 'fail')) return '<span class="ds-pill neg">Violation</span>';
    if (chk.some(s => s !== 'notset')) return '<span class="ds-pill pos">Clean</span>';
    return '<span class="ds-pill">Pending</span>';
  }
  function todayHtml() {
    const today = todayIso(); const acc = activeAccount(); const m = mode();
    const list = scopedTrades().filter(t => String(t.date).slice(0, 10) === today).slice().reverse();
    const net = list.reduce((s, t) => s + pnlFor(t), 0);
    const rows = list.map(t => {
      const p = pnlFor(t); const short = t.direction === 'SHORT';
      return `<li class="tp-row">
        <button type="button" class="tp-open" data-open="${esc(t.id)}" aria-label="Open trade ${esc(t.pair)}">
          <span class="db2-side ${short ? 'short' : 'long'}">${short ? 'Short' : 'Long'}</span>
          <span class="tp-main"><b>${esc(t.pair || '—')}</b><small>${esc(t.strategy || '—')} · ${esc(t.timeframe || '')}${t.session ? ' · ' + esc(t.session) : ''}</small></span>
          <span class="tp-rule">${ruleStatus(t)}</span>
          <span class="tp-res"><b class="ds-num ${cls(p)}">${money(p)}</b><small><span class="${cls(t.rMultiple)}">${fmtR(t.rMultiple)}</span> · ${esc(t.result === 'BE' ? 'Breakeven' : t.result || '—')}</small></span>
        </button>
        <button type="button" class="ds-btn ds-btn-secondary ds-icon-btn tp-del" data-del="${esc(t.id)}" aria-label="Delete trade ${esc(t.pair)}" title="Delete trade"><i class="fa-solid fa-trash"></i></button>
      </li>`;
    }).join('');
    return `<div class="ds-section-head"><h2 class="ds-label">Today's trades</h2><span class="ds-period">today${acc ? ' · ' + esc(acc.name) : m === 'Backtest' ? ' · Backtest' : ''}${list.length ? ` · net <span class="${cls(net)}">${money(net)}</span>` : ''}</span>
        <div class="tp-today-links"><button type="button" class="ds-btn ds-btn-secondary ds-btn-sm" data-csv title="Copy all ${esc(m === 'Real' ? 'Live' : m)} trades as CSV"><i class="fa-solid fa-copy"></i> Copy CSV</button><button type="button" class="ds-link" data-go="journal">Full history <i class="fa-solid fa-arrow-right"></i> Journal</button></div></div>
      <div class="ds-card tp-today-card">${list.length ? `<ul class="tp-list">${rows}</ul>` : `<div class="db2-none">No trades logged today${acc ? ` on ${esc(acc.name)}` : ''}. Use <b>Log a trade</b> above.</div>`}</div>`;
  }

  // ── render ───────────────────────────────────────────────────────────────
  function ensure(page, id, cls, beforeEl) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; el.className = cls; }
    if (el.parentElement !== page) page.insertBefore(el, beforeEl || page.firstChild);
    return el;
  }
  function render() {
    queued = false;
    const page = document.getElementById('pageTrading');
    if (!page || page.classList.contains('hidden')) return;
    const d = disciplineState();
    const strip = ensure(page, 'tpStrip', 'tp-strip');
    const can = ensure(page, 'tpCan', 'ds-section');
    const today = ensure(page, 'tpToday', 'ds-section');
    strip.innerHTML = stripHtml(d);
    can.innerHTML = canTradeHtml(d);
    today.innerHTML = todayHtml();
    bind(page);
    if (mode() !== 'Backtest') loadMt5(false);
  }
  function bind(page) {
    page.querySelectorAll('#tpStrip [data-mode]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.mode !== mode() && typeof window.switchMode === 'function') { discipline = null; window.switchMode(b.dataset.mode); queue(); }
    }));
    page.querySelector('#tpAccount')?.addEventListener('change', e => {
      if (e.target.value === '__add__') {
        const acc = activeAccount(); e.target.value = acc ? acc.id : '';
        if (typeof window.openAddAccountModal === 'function') window.openAddAccountModal();
        else if (typeof window.openAccountCenter === 'function') window.openAccountCenter('accounts');
        return;
      }
      try { localStorage.setItem(`my_journal_active_account_${mode()}_v1`, e.target.value); } catch (_) {}
      window.dispatchEvent(new CustomEvent('wallet-accounts-updated'));
      discipline = null;
      if (typeof window.switchMode === 'function') window.switchMode(mode());
      queue();
    });
    page.querySelectorAll('#tpStrip [data-mt5]').forEach(b => b.addEventListener('click', () => {
      const acc = activeAccount(); const a = b.dataset.mt5;
      if (a === 'help') return window.dispatchEvent(new CustomEvent('open-mt5-help'));
      if (!acc) return;
      if (a === 'link' && window.__mt5Link) window.__mt5Link(acc.id);
      if (a === 'unlink' && window.__mt5Unlink) Promise.resolve(window.__mt5Unlink(acc.id)).finally(() => loadMt5(true));
      if (a === 'history' && window.__mt5OpenHistory) window.__mt5OpenHistory(acc.id, acc.name);
    }));
    page.querySelector('#tpCan [data-go-acc]')?.addEventListener('click', () => {
      const acc = activeAccount();
      if (acc && typeof window.openEditAccountModal === 'function') window.openEditAccountModal(acc.id);
      else if (typeof window.openAccountCenter === 'function') window.openAccountCenter('accounts');
    });
    page.querySelectorAll('#tpToday [data-open]').forEach(b => b.addEventListener('click', () => window.openDrawer && window.openDrawer(b.dataset.open)));
    page.querySelectorAll('#tpToday [data-del]').forEach(b => b.addEventListener('click', () => window.deleteTrade && window.deleteTrade(b.dataset.del)));
    page.querySelector('#tpToday [data-csv]')?.addEventListener('click', () => window.copyTableCSV && window.copyTableCSV());
    page.querySelector('#tpToday [data-go]')?.addEventListener('click', () => window.switchTab && window.switchTab('journal'));
  }

  function queue() { if (queued) return; queued = true; setTimeout(render, 40); }
  window.obTradingRefresh = queue;
  function wrap(name, after) {
    const fn = window[name];
    if (typeof fn !== 'function' || fn.__obTpWrapped) return;
    const w = function (...a) { const r = fn.apply(this, a); after(a); return r; };
    w.__obTpWrapped = true;
    window[name] = w;
  }
  function boot() {
    const page = document.getElementById('pageTrading');
    if (!page) return;
    const wrapAll = () => {
      wrap('switchTab', ([tab]) => { if (tab === 'trading') { queue(); if (window.obDisciplineRefresh) window.obDisciplineRefresh(); } });
      wrap('switchMode', () => { discipline = null; queue(); });
      wrap('renderAll', () => queue());
    };
    wrapAll();
    [400, 1200, 2600].forEach(ms => setTimeout(wrapAll, ms));
    window.addEventListener('wallet-accounts-updated', queue);
    window.addEventListener('ob-discipline-state', e => {
      const prev = discipline ? JSON.stringify(discipline) : '';
      discipline = e.detail || null;
      if (JSON.stringify(discipline) !== prev) queue();
    });
    // The (hidden) MT5 status panel re-renders when the server state changes: refresh the chip.
    new MutationObserver(() => { if (document.getElementById('mt5-status-panel')) loadMt5(true); })
      .observe(page, { childList: true });
    let panelObs = null;
    setInterval(() => {
      const p = document.getElementById('mt5-status-panel');
      if (p && p.__tpObserved !== true) { p.__tpObserved = true; panelObs = new MutationObserver(() => loadMt5(true)); panelObs.observe(p, { childList: true, subtree: true }); }
    }, 1500);
    new MutationObserver(() => queue()).observe(page, { attributes: true, attributeFilter: ['class'] });
    [300, 1200, 2500].forEach(ms => setTimeout(queue, ms));
  }
  if (document.readyState === 'complete') setTimeout(boot, 0);
  else window.addEventListener('load', () => setTimeout(boot, 0), { once: true });
})();
