/**
 * rule-status.js — drawdown and daily loss enforcement in the app (Part 3).
 *
 * The state of an account (ok / warn / blown / unknown) comes from rule-presets.js
 * (accountState), the same code the server runs. The server is the authority: it records
 * BLOWN on the account and refuses a manual trade for a blown account (POST /api/trades →
 * 423) unless it carries a recorded BLOWN override.
 *
 * Here:
 *  - window.obRuleState(account)   the account's state for its current run
 *  - Add trade / calendar "+" on a blown Real, Demo or Funded account: the new-trade form does
 *    not open. A dialog explains why; typing BLOWN records an override
 *    (POST /api/accounts/:id/override) and then opens the form for exactly one trade, saved
 *    with postBreach. A blown Backtest is never locked: the form opens as usual and the trade
 *    is marked postBreach (obRules.blocksManualEntry).
 *  - window.obStartNewRun(account) archives the run (account_runs) and starts the next one
 *    from a starting balance you type (POST /api/accounts/:id/new-run).
 *  - Analytics: previous runs and the override count (GET /api/rules/log).
 * MT5 trades are never blocked (they do not go through the form).
 */
(() => {
  'use strict';
  if (/^\/auth\.html$/i.test(location.pathname)) return;
  const R = () => window.obRules;
  const ACC_KEY = 'my_journal_accounts_v1';
  const RULE_FIELDS = ['blown', 'runNumber', 'runStartedAt'];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sym = () => (window.obTime ? window.obTime.sym() : '$');
  const money = v => `${Number(v) < 0 ? '-' : ''}${sym()}${Math.abs(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDay = d => (window.obTime ? window.obTime.date(d) : d);
  const fmtInstant = v => (window.obTime ? window.obTime.instant(v) : String(v || ''));
  const settings = () => { try { return (typeof window.obGetSettings === 'function' && window.obGetSettings()) || {}; } catch (_) { return {}; } };

  // ── accounts and trades (same scope as the Dashboard and Trading pages) ──
  function accountsDoc() { try { const d = JSON.parse(localStorage.getItem(ACC_KEY) || '{}'); return d && typeof d === 'object' ? d : {}; } catch (_) { return {}; } }
  function find(id) {
    for (const [type, list] of Object.entries(accountsDoc())) {
      if (!Array.isArray(list)) continue;
      const acc = list.find(a => a && String(a.id) === String(id));
      if (acc) return { type, acc };
    }
    return null;
  }
  function activeFor(mode) {
    const list = (accountsDoc()[mode] || []).filter(a => a && a.status !== 'archived');
    if (mode === 'Backtest') return list[0] || null;
    let id = null; try { id = localStorage.getItem(`my_journal_active_account_${mode}_v1`); } catch (_) {}
    return list.find(a => a.id === id) || list[0] || null;
  }
  function tradesOf(type, acc) {
    const all = Array.isArray(window.trades) ? window.trades : [];
    return all.filter(t => t && t.mode === type && (type === 'Backtest' || t.accountId === acc.id));
  }
  function pnlFor(acc) {
    const kit = window.obCalendarKit;
    // MT5 trades count with the broker's own P/L, as on the server (obRules.brokerPnl)
    if (kit && typeof kit.pnlFor === 'function') return t => { const b = R().brokerPnl(t); return b !== null ? b : kit.pnlFor(t); };
    const s = settings();
    return t => R().pnlOf(t, acc, { riskPct: s.riskPercent, initialCapital: s.initialCapital });
  }
  /** State of an account's current run (null without rule-presets.js). */
  function stateFor(acc) {
    if (!acc || !R()) return null;
    const f = find(acc.id);
    const type = (f && f.type) || acc.type;
    return R().accountState(f ? f.acc : acc, tradesOf(type, f ? f.acc : acc), { pnlFor: pnlFor(acc) });
  }
  window.obRuleState = stateFor;
  window.obBlownReason = blown => (R() ? R().blownReason(blown, money, fmtDay) : '');

  // ── small UI pieces ─────────────────────────────────────────────────────────
  function toast(msg) {
    let t = document.getElementById('obRuleToast');
    if (!t) { t = document.createElement('div'); t.id = 'obRuleToast'; t.className = 'ac-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function dialog(html) {
    document.getElementById('obRuleDialog')?.remove();
    const o = document.createElement('div');
    o.id = 'obRuleDialog'; o.className = 'ds-overlay';
    o.innerHTML = `<div class="ds-dialog ob-rule-dialog" role="dialog" aria-modal="true" aria-labelledby="obRuleTitle">${html}</div>`;
    document.body.appendChild(o);
    const onKey = e => { if (e.key === 'Escape') close(); };
    const close = () => { o.remove(); document.removeEventListener('keydown', onKey, true); };
    document.addEventListener('keydown', onKey, true);
    o.addEventListener('click', e => { if (e.target === o) close(); });
    o.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    setTimeout(() => o.querySelector('input')?.focus(), 0);
    return { el: o, close };
  }
  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    let data = {}; try { data = await r.json(); } catch (_) {}
    return { ok: r.ok, status: r.status, data };
  }
  function refreshApp() {
    window.dispatchEvent(new CustomEvent('wallet-accounts-updated'));
    try { if (typeof window.switchMode === 'function') window.switchMode(window.activeMode); } catch (_) {}
    loadLog(true);
  }

  // ── BLOWN: the form does not open ──────────────────────────────────────────
  /**
   * opts.onOverride(id): called after the override is recorded (one trade).
   * opts.blown: the server's record when it refused a save.
   */
  function showBlown(acc, opts = {}) {
    const s = stateFor(acc);
    const blown = (s && s.blown) || opts.blown || null;
    const at = blown && blown.at ? ` Recorded ${esc(fmtInstant(blown.at))}.` : '';
    const d = dialog(`
      <div class="ds-dialog-head">
        <div><div class="ds-label">${esc(acc.name)} · run ${s ? s.runNumber : 1}</div>
          <h3 class="ds-dialog-title" id="obRuleTitle"><span class="ds-neg">BLOWN</span>: manual trades are blocked</h3>
          <p class="ds-dialog-text">${esc(window.obBlownReason(blown) || 'The account broke its rules.')}.${at}</p></div>
        <button type="button" class="ds-close" data-close aria-label="Close">×</button>
      </div>
      <div class="ds-dialog-body">
        <p class="ds-dialog-text">MT5 trades are still logged automatically, marked as after the breach. To log a manual trade anyway, type <b>BLOWN</b>. Each override allows one trade, is recorded with its time and is counted in Analytics.</p>
        <label class="ds-field"><span class="ds-label">Type BLOWN to override</span><input class="ds-input" id="obBlownWord" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text"></label>
        <p class="ds-dialog-text ds-neg" id="obBlownErr" hidden></p>
      </div>
      <div class="ds-dialog-actions">
        <button type="button" class="ds-btn ds-btn-secondary" data-close>Cancel</button>
        <button type="button" class="ds-btn ds-btn-secondary" id="obBlownRun">Start new run</button>
        <button type="button" class="ds-btn ds-btn-primary" id="obBlownGo" disabled>Log one trade anyway</button>
      </div>`);
    const input = d.el.querySelector('#obBlownWord');
    const go = d.el.querySelector('#obBlownGo');
    const err = d.el.querySelector('#obBlownErr');
    input.addEventListener('input', () => { go.disabled = input.value !== R().BLOWN_WORD; });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !go.disabled) go.click(); });
    d.el.querySelector('#obBlownRun').addEventListener('click', () => { d.close(); startNewRun(acc); });
    go.addEventListener('click', async () => {
      go.disabled = true;
      const r = await post(`/api/accounts/${encodeURIComponent(acc.id)}/override`, { confirm: input.value });
      if (!r.ok || !r.data.override) {
        err.textContent = r.data.error || `The override was not recorded (${r.status}), so the trade stays blocked.`;
        err.hidden = false; go.disabled = false;
        return;
      }
      d.close();
      loadLog(true);
      if (typeof opts.onOverride === 'function') await opts.onOverride(r.data.override.id);
    });
  }
  window.obShowBlown = showBlown;
  // The server refused a save (423): show why; an override then lets that same draft through.
  window.obShowBlownBlock = body => {
    const f = body && body.accountId ? find(body.accountId) : null;
    const acc = f ? f.acc : activeFor(window.activeMode);
    if (!acc) { toast((body && body.error) || 'This account is BLOWN.'); return; }
    showBlown(acc, {
      blown: body && body.blown,
      onOverride: id => {
        const draft = window.__obPendingNewTrade;
        if (draft) { draft.ruleOverride = id; draft.postBreach = true; }
        toast('Override recorded. Press Save again to log the trade.');
      },
    });
  };

  // ── Start new run ──────────────────────────────────────────────────────────
  function startNewRun(acc) {
    const s = stateFor(acc);
    const n = s ? s.runNumber : 1;
    const d = dialog(`
      <div class="ds-dialog-head">
        <div><div class="ds-label">${esc(acc.name)}</div>
          <h3 class="ds-dialog-title" id="obRuleTitle">Start run ${n + 1}</h3>
          <p class="ds-dialog-text">Run ${n} ends now${s && s.state === 'blown' ? ' as BLOWN' : ' (manual reset)'} and stays visible in Analytics. Run ${n + 1} starts from the balance you enter: trades from earlier runs no longer count toward drawdown or the daily loss limit.</p></div>
        <button type="button" class="ds-close" data-close aria-label="Close">×</button>
      </div>
      <div class="ds-dialog-body">
        <label class="ds-field"><span class="ds-label">New starting balance</span><span class="ds-input-wrap"><input class="ds-input ds-num" id="obRunStart" inputmode="decimal" value="${esc(acc.startingBalance ?? '')}"><span class="ds-input-suffix">${esc(sym())}</span></span></label>
        <p class="ds-dialog-text ds-neg" id="obRunErr" hidden></p>
      </div>
      <div class="ds-dialog-actions">
        <button type="button" class="ds-btn ds-btn-secondary" data-close>Cancel</button>
        <button type="button" class="ds-btn ds-btn-primary" id="obRunGo">Start run ${n + 1}</button>
      </div>`);
    const go = d.el.querySelector('#obRunGo');
    const err = d.el.querySelector('#obRunErr');
    go.addEventListener('click', async () => {
      const v = Number(String(d.el.querySelector('#obRunStart').value).replace(/,/g, ''));
      if (!(v > 0)) { err.textContent = 'Enter a starting balance greater than 0.'; err.hidden = false; return; }
      go.disabled = true;
      const r = await post(`/api/accounts/${encodeURIComponent(acc.id)}/new-run`, { startingBalance: v });
      if (!r.ok || typeof r.data.accounts !== 'string') {
        err.textContent = r.data.error || `The new run was not started (${r.status}).`; err.hidden = false; go.disabled = false;
        return;
      }
      try { localStorage.setItem(ACC_KEY, r.data.accounts); } catch (_) {}
      d.close();
      refreshApp();
      toast(`Run ${n + 1} started for ${acc.name}.`);
    });
  }
  window.obStartNewRun = startNewRun;

  // ── Add trade / calendar "+" ───────────────────────────────────────────────
  let passThrough = false;
  function patchSubmit() {
    const original = window.handleTradeSubmit;
    if (typeof original !== 'function' || original.__obRulesPatched) return;
    const patched = async function (event) {
      if (passThrough) return original.apply(this, arguments);
      const mode = window.activeMode;
      const acc = activeFor(mode);
      const s = acc ? stateFor(acc) : null;
      if (!s || s.state !== 'blown') return original.apply(this, arguments);
      if (!R().blocksManualEntry(mode)) {
        // Backtest: never locked, no override; the new trade is marked as after the breach.
        const result = await original.apply(this, arguments);
        const draft = window.__obPendingNewTrade;
        if (draft) draft.postBreach = true;
        return result;
      }
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      showBlown(acc, {
        onOverride: async id => {
          passThrough = true;
          try { await original.apply(this, [event]); } finally { passThrough = false; }
          const draft = window.__obPendingNewTrade; // the form opened as an unsaved draft
          if (draft) { draft.ruleOverride = id; draft.postBreach = true; }
        },
      });
    };
    patched.__obRulesPatched = true;
    window.handleTradeSubmit = patched;
  }
  patchSubmit();
  [300, 1000, 2500, 5000].forEach(ms => setTimeout(patchSubmit, ms));

  // ── keep the server's rule fields in this browser ─────────────────────────
  // The server records BLOWN; bring that record (and run changes) into the local copy.
  let syncTimer = 0;
  async function syncRuleFields() {
    let server = null;
    try {
      const r = await fetch('/api/storage/' + ACC_KEY, { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) return;
      server = JSON.parse((await r.json()).value || 'null');
    } catch (_) { return; }
    if (!server || typeof server !== 'object') return;
    const local = accountsDoc();
    const byId = new Map();
    for (const list of Object.values(server)) if (Array.isArray(list)) for (const a of list) if (a && a.id != null) byId.set(String(a.id), a);
    let changed = false;
    for (const list of Object.values(local)) {
      if (!Array.isArray(list)) continue;
      for (const a of list) {
        const sv = a && byId.get(String(a.id));
        if (!sv) continue;
        for (const f of [...RULE_FIELDS, 'startingBalance']) {
          if (f === 'startingBalance' && JSON.stringify(sv.runNumber) === JSON.stringify(a.runNumber)) continue; // only a new run changes it here
          if (JSON.stringify(a[f]) === JSON.stringify(sv[f])) continue;
          if (sv[f] === undefined) delete a[f]; else a[f] = sv[f];
          changed = true;
        }
      }
    }
    if (changed) { try { localStorage.setItem(ACC_KEY, JSON.stringify(local)); } catch (_) {} refreshApp(); }
  }
  const syncSoon = () => { clearTimeout(syncTimer); syncTimer = setTimeout(syncRuleFields, 1500); };
  function wrapRenderAll() {
    const fn = window.renderAll;
    if (typeof fn !== 'function' || fn.__obRulesWrapped) return;
    // after every data load: the rule fields, and Analytics in the saved formats and time zone
    const w = function (...a) { const r = fn.apply(this, a); syncSoon(); renderAnalytics(); return r; };
    w.__obRulesWrapped = true;
    window.renderAll = w;
  }
  [400, 1200, 2600].forEach(ms => setTimeout(wrapRenderAll, ms));
  setTimeout(syncRuleFields, 2000);

  // ── Analytics: previous runs and overrides ─────────────────────────────────
  let log = null, logAt = 0, logLoading = null;
  function loadLog(force) {
    if (!force && log && Date.now() - logAt < 15000) return Promise.resolve(log);
    if (logLoading) return logLoading;
    logLoading = fetch('/api/rules/log', { credentials: 'same-origin', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).catch(() => null)
      .then(j => { log = j; logAt = Date.now(); logLoading = null; renderAnalytics(); return j; });
    return logLoading;
  }
  function renderAnalytics() {
    const page = document.getElementById('pageAnalytics');
    if (!page || page.classList.contains('hidden')) return;
    let sec = document.getElementById('obRulesAnalytics');
    if (!sec) {
      sec = document.createElement('section'); sec.id = 'obRulesAnalytics'; sec.className = 'ds-section ob-rules-an';
      sec.dataset.apNoscope = '1'; // all runs: the Analytics period filter does not apply here
      page.appendChild(sec);
    }
    const acc = activeFor(window.activeMode);
    if (!acc) { sec.hidden = true; return; }
    sec.hidden = false;
    const s = stateFor(acc);
    const runs = ((log && log.runs) || []).filter(r => String(r.account_id) === String(acc.id)).sort((a, b) => a.run_number - b.run_number);
    const ovAll = (log && log.overrides) || [];
    const ov = ovAll.filter(o => String(o.account_id) === String(acc.id));
    const label = st => ({ blown: '<span class="ds-pill neg">BLOWN</span>', warn: '<span class="ds-pill warn">Warning</span>', ok: s && s.understated ? '<span class="ds-pill">OK · understated</span>' : '<span class="ds-pill">OK</span>', unknown: '<span class="ds-pill warn">Not checked</span>', none: '<span class="ds-pill">No preset</span>' }[st] || '');
    const rows = runs.map(r => `<tr><td>Run ${r.run_number}</td><td>${esc(fmtDay(String(r.started_at).slice(0, 10)))} – ${esc(fmtDay(String(r.ended_at || '').slice(0, 10)))}</td><td class="ds-num">${esc(money(r.starting_balance))}</td><td class="ds-num">${r.peak_balance == null ? '—' : esc(money(r.peak_balance))}</td><td>${r.end_reason === 'blown' ? '<span class="ds-pill neg">Blown</span>' : 'Manual reset'}</td></tr>`).join('');
    const current = s ? `<tr><td>Run ${s.runNumber} (now)</td><td>${s.runStartedAt ? esc(fmtDay(String(s.runStartedAt).slice(0, 10))) : 'start'} – now</td><td class="ds-num">${esc(money(acc.startingBalance))}</td><td class="ds-num">${s.peak == null ? '—' : esc(money(s.peak))}</td><td>${label(s.state)}</td></tr>` : '';
    const ovNote = log && log.overridesAvailable === false ? '<p class="ds-sub ds-warn">Override history is not available on the server yet (migration 003_rule_overrides.sql).</p>' : '';
    sec.innerHTML = `<div class="ds-section-head"><h2 class="ds-label">Runs &amp; overrides</h2><span class="ds-period">${esc(acc.name)} · all runs</span></div>
      <div class="ds-grid">
        <div class="ds-card ds-span-4 ds-t-3"><div class="ds-label">BLOWN overrides</div><div class="ds-big ${ov.length ? 'ds-neg' : ''}">${ov.length}</div>
          <div class="ds-sub">${ov.length ? `last ${esc(fmtInstant(ov[ov.length - 1].created_at))} · ${ov.filter(o => o.used_by_trade).length} used for a trade` : 'none on this account'}${ovAll.length !== ov.length ? ` · ${ovAll.length} on all accounts` : ''}</div>${ovNote}</div>
        <div class="ds-card ds-span-8 ds-t-6"><div class="ds-label">Runs</div>
          ${s && s.state !== 'none' || runs.length ? `<div class="ob-rules-table"><table><thead><tr><th>Run</th><th>Dates</th><th>Start</th><th>Peak</th><th>End</th></tr></thead><tbody>${rows}${current}</tbody></table></div>` : '<div class="ds-sub">This account has no rule preset, so no runs are tracked.</div>'}</div>
      </div>`;
  }
  window.addEventListener('ob-analytics-refresh', () => loadLog(false));
  function wrapSwitchTab() {
    const fn = window.switchTab;
    if (typeof fn !== 'function' || fn.__obRulesWrapped) return;
    const w = function (...a) { const r = fn.apply(this, a); if (a[0] === 'analytics') setTimeout(() => loadLog(false), 60); return r; };
    w.__obRulesWrapped = true;
    window.switchTab = w;
  }
  [400, 1200, 2600].forEach(ms => setTimeout(wrapSwitchTab, ms));
})();
