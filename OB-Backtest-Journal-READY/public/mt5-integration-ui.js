/**
 * mt5-integration-ui.js  v3.0
 * Complete MT5 integration status panel, link/unlink flow,
 * open-positions panel, and live polling.
 *
 * Uses:
 *   GET  /api/mt5/status          — all accounts + link state for this session
 *   POST /api/mt5/link            — create a bridge token for an account
 *   POST /api/mt5/unlink          — revoke a bridge token
 *   GET  /api/mt5/state?accountId — live account state + open positions
 *   GET  /api/mt5/history?accountId — closed trade history
 */
(() => {
  const K = 'my_journal_accounts_v1';
  const MODES = new Set(['Demo', 'Real', 'Funded']);
  const STYLE_ID = 'mt5-integration-ui-style-v3';
  const STATUS_PANEL_ID = 'mt5-status-panel';
  const POSITIONS_PANEL_ID = 'mt5OpenPositions';

  let pollTimer = null;
  let lastStatusSig = '';

  // ─── helpers ────────────────────────────────────────────────────────────────

  const mode = () => { try { return MODES.has(activeMode) ? activeMode : 'Demo'; } catch { return 'Demo'; } };
  const list = () => { try { const x = JSON.parse(localStorage.getItem(K) || '{}'); return Array.isArray(x[mode()]) ? x[mode()] : []; } catch { return []; } };
  const activeId = () => localStorage.getItem(`my_journal_active_account_${mode()}_v1`) || list()[0]?.id;
  const activeAcc = () => list().find(a => a.id === activeId()) || list()[0];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = iso => { if (!iso) return '—'; try { return new Date(iso).toLocaleString(); } catch { return iso; } };
  const fmtMoney = (n, currency) => `${Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'} ${currency || ''}`.trim();

  const save = accounts => {
    const x = JSON.parse(localStorage.getItem(K) || '{}');
    x[mode()] = accounts;
    localStorage.setItem(K, JSON.stringify(x));
    if (typeof window.persistAccountState === 'function') {
      try { window.persistAccountState(JSON.stringify(x)); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('wallet-accounts-updated'));
  };

  const toast = msg => {
    if (typeof window.showAccountToast === 'function') window.showAccountToast(msg);
    else console.info('[MT5]', msg);
  };

  // ─── styles ──────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${STATUS_PANEL_ID} { margin-bottom: 20px; }
      #${STATUS_PANEL_ID} .mt5-sp-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 18px; border-bottom: 1px solid #e2e8f0;
      }
      #${STATUS_PANEL_ID} .mt5-sp-title {
        font-size: 13px; font-weight: 800; color: #0f172a;
        display: flex; align-items: center; gap: 8px;
      }
      #${STATUS_PANEL_ID} .mt5-sp-actions { display: flex; gap: 8px; }
      #${STATUS_PANEL_ID} .mt5-btn {
        height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid;
        font-size: 11px; font-weight: 700; cursor: pointer; transition: all .15s;
        display: inline-flex; align-items: center; gap: 5px;
      }
      #${STATUS_PANEL_ID} .mt5-btn-primary  { background: #2563eb; border-color: #2563eb; color: #fff; }
      #${STATUS_PANEL_ID} .mt5-btn-primary:hover { background: #1d4ed8; }
      #${STATUS_PANEL_ID} .mt5-btn-ghost    { background: #f8fafc; border-color: #e2e8f0; color: #475569; }
      #${STATUS_PANEL_ID} .mt5-btn-ghost:hover { background: #f1f5f9; color: #1e293b; }
      #${STATUS_PANEL_ID} .mt5-btn-danger   { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
      #${STATUS_PANEL_ID} .mt5-btn-danger:hover { background: #fee2e2; }
      #${STATUS_PANEL_ID} .mt5-account-row {
        display: flex; align-items: center; gap: 12px; padding: 12px 18px;
        border-bottom: 1px solid #f1f5f9; flex-wrap: wrap;
      }
      #${STATUS_PANEL_ID} .mt5-account-row:last-child { border-bottom: 0; }
      #${STATUS_PANEL_ID} .mt5-dot {
        width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
      }
      #${STATUS_PANEL_ID} .mt5-dot-synced  { background: #16a34a; box-shadow: 0 0 6px rgba(22,163,74,.4); }
      #${STATUS_PANEL_ID} .mt5-dot-linked  { background: #f59e0b; }
      #${STATUS_PANEL_ID} .mt5-dot-none    { background: #cbd5e1; }
      #${STATUS_PANEL_ID} .mt5-acc-name  { font-size: 12px; font-weight: 700; color: #0f172a; min-width: 100px; }
      #${STATUS_PANEL_ID} .mt5-acc-meta  { font-size: 10px; color: #64748b; flex: 1; }
      #${STATUS_PANEL_ID} .mt5-acc-bal   { font-size: 12px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: #2563eb; }
      #${STATUS_PANEL_ID} .mt5-acc-sync  { font-size: 9px; color: #94a3b8; white-space: nowrap; }
      #${STATUS_PANEL_ID} .mt5-status-badge {
        font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em;
        padding: 2px 7px; border-radius: 6px;
      }
      #${STATUS_PANEL_ID} .mt5-badge-synced  { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
      #${STATUS_PANEL_ID} .mt5-badge-linked  { background: #fffbeb; color: #92400e; border: 1px solid #fcd34d; }
      #${STATUS_PANEL_ID} .mt5-badge-none    { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }
      #${STATUS_PANEL_ID} .mt5-history-btn {
        font-size: 10px; color: #2563eb; font-weight: 700;
        background: none; border: 0; cursor: pointer; text-decoration: underline;
        padding: 0;
      }
      /* History modal */
      #mt5-history-modal {
        position: fixed; inset: 0; z-index: 180;
        display: flex; align-items: center; justify-content: center;
        padding: 16px; background: rgba(15,23,42,.3); backdrop-filter: blur(4px);
      }
      #mt5-history-modal.hidden { display: none; }
      #mt5-history-modal .mt5-hm-box {
        width: min(760px, 100%); max-height: 80vh; overflow: hidden;
        border-radius: 20px; background: #fff; box-shadow: 0 32px 80px rgba(15,23,42,.2);
        display: flex; flex-direction: column;
      }
      #mt5-history-modal .mt5-hm-head {
        padding: 16px 20px; border-bottom: 1px solid #e2e8f0;
        display: flex; align-items: center; justify-content: space-between;
        flex-shrink: 0;
      }
      #mt5-history-modal .mt5-hm-body { overflow-y: auto; flex: 1; }
      #mt5-history-modal table { width: 100%; border-collapse: collapse; font-size: 11px; }
      #mt5-history-modal th { padding: 8px 12px; text-align: left; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; background: #f8fafc; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; }
      #mt5-history-modal th:not(:first-child) { text-align: right; }
      #mt5-history-modal td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
      #mt5-history-modal td:not(:first-child) { text-align: right; font-family: 'JetBrains Mono', monospace; }
      #mt5-history-modal tbody tr:hover { background: #f8fafc; }

      /* Open positions panel */
      #${POSITIONS_PANEL_ID} { margin-bottom: 20px; }
      #${POSITIONS_PANEL_ID} .mt5-pos-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 18px; border-bottom: 1px solid #e2e8f0;
      }
      #${POSITIONS_PANEL_ID} .mt5-pos-row {
        display: grid;
        grid-template-columns: 1fr 60px 70px 80px 80px 80px 80px 70px;
        gap: 0; font-size: 11px; font-family: 'JetBrains Mono', monospace;
        border-bottom: 1px solid #f8fafc; padding: 8px 18px;
        align-items: center;
      }
      #${POSITIONS_PANEL_ID} .mt5-pos-row.head {
        font-size: 9px; font-weight: 800; text-transform: uppercase;
        letter-spacing: .06em; color: #94a3b8;
        font-family: inherit; background: #f8fafc;
      }
      #${POSITIONS_PANEL_ID} .mt5-pos-row > *:not(:first-child) { text-align: right; }
      #${POSITIONS_PANEL_ID} .mt5-pos-buy  { color: #16a34a; font-weight: 800; }
      #${POSITIONS_PANEL_ID} .mt5-pos-sell { color: #dc2626; font-weight: 800; }
      #${POSITIONS_PANEL_ID} .mt5-pos-pnl-pos { color: #16a34a; font-weight: 800; }
      #${POSITIONS_PANEL_ID} .mt5-pos-pnl-neg { color: #dc2626; font-weight: 800; }
    `;
    document.head.appendChild(s);
  }

  // ─── overlay helper ──────────────────────────────────────────────────────────

  function overlay(html, done) {
    document.getElementById('mt5IntegrationModal')?.remove();
    const o = document.createElement('div');
    o.id = 'mt5IntegrationModal';
    o.className = 'fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-950/30 backdrop-blur-md';
    o.innerHTML = `<div class="w-full max-w-[520px] rounded-[26px] border border-white/90 bg-white/98 shadow-2xl overflow-hidden">${html}</div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e => { if (e.target === o) o.remove(); });
    done?.(o);
    return o;
  }

  // ─── link flow ───────────────────────────────────────────────────────────────

  function openLinkModal(accountId) {
    const acc = list().find(a => a.id === accountId);
    if (!acc) return;
    overlay(`
      <div class="p-6">
        <div class="flex justify-between items-start mb-5">
          <div>
            <div class="text-[10px] uppercase tracking-widest font-bold text-blue-600">${esc(mode())} · ${esc(acc.name)}</div>
            <h3 class="mt-1 text-xl font-bold text-slate-900">Link MT5 account</h3>
            <p class="mt-1 text-xs text-slate-500">Read-only bridge. The journal never places or closes MT5 trades.</p>
          </div>
          <button data-x class="h-9 w-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:text-slate-700">×</button>
        </div>
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1.5">MT5 Login / Account number</label>
            <input id="m5login" type="text" inputmode="numeric" placeholder="e.g. 12345678"
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono text-slate-800 focus:outline-none focus:border-blue-400">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1.5">Broker server name</label>
            <input id="m5server" type="text" placeholder="e.g. Exness-MT5Trial9"
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-blue-400">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1.5">Label (optional)</label>
            <input id="m5label" type="text" placeholder="e.g. My Demo Account"
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-blue-400">
          </div>
        </div>
        <div class="mt-5 rounded-2xl bg-blue-50 border border-blue-100 p-4 text-xs text-blue-800 space-y-1">
          <div class="font-bold">How it works:</div>
          <div>1. Enter your MT5 login and broker server, then click Link account.</div>
          <div>2. Copy the token that appears.</div>
          <div>3. Paste the token into the OB_Journal_Bridge EA in MetaTrader 5.</div>
          <div>4. Trades will sync automatically every 5 seconds.</div>
        </div>
        <div id="m5error" class="hidden mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold"></div>
        <div class="mt-6 flex justify-end gap-2">
          <button data-x class="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button id="m5save" class="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2">
            <i class="fa-solid fa-link text-xs"></i> Link account
          </button>
        </div>
      </div>
    `, o => {
      o.querySelectorAll('[data-x]').forEach(b => b.onclick = () => o.remove());
      document.getElementById('m5save').onclick = async () => {
        const login  = document.getElementById('m5login').value.trim();
        const server = document.getElementById('m5server').value.trim();
        const label  = document.getElementById('m5label').value.trim();
        const errEl  = document.getElementById('m5error');
        errEl.classList.add('hidden');

        if (!login || !/^\d{3,32}$/.test(login)) {
          errEl.textContent = 'Enter a valid MT5 login number (3–32 digits).';
          errEl.classList.remove('hidden'); return;
        }
        if (!server) {
          errEl.textContent = 'Enter the exact broker server name (e.g. Exness-MT5Trial9).';
          errEl.classList.remove('hidden'); return;
        }

        const btn = document.getElementById('m5save');
        btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> Linking…';

        try {
          const r = await fetch('/api/mt5/link', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: acc.id, mode: mode(), login, server, label: label || undefined })
          });
          const j = await r.json().catch(() => ({}));

          if (!r.ok) {
            errEl.textContent = j.error || `Link failed (HTTP ${r.status}).`;
            errEl.classList.remove('hidden');
            btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-link text-xs"></i> Link account';
            return;
          }

          if (!j.token) throw new Error('Server did not return a bridge token.');

          // Store token in accounts
          const all = list();
          const target = all.find(a => a.id === acc.id);
          if (target) { target.mt5 = { linked: true, login, server, label, token: j.token, lastSync: null }; }
          save(all);

          // Show token
          o.querySelector('.w-full.max-w-\\[520px\\]').innerHTML = `
            <div class="p-6 space-y-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg"><i class="fa-solid fa-circle-check"></i></div>
                <div>
                  <h3 class="text-lg font-bold text-slate-900">MT5 linked successfully</h3>
                  <p class="text-xs text-slate-500">${esc(acc.name)} · ${esc(mode())} · ${esc(server)}</p>
                </div>
              </div>
              <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div class="text-xs font-bold text-slate-600">Bridge token — paste this into the EA's InpBridgeToken field:</div>
                <div class="flex gap-2">
                  <input id="m5tokenInput" readonly value="${esc(j.token)}"
                    class="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-mono text-slate-700 bg-white select-all">
                  <button id="m5copyBtn" class="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                    <i class="fa-solid fa-copy text-[10px]"></i> Copy
                  </button>
                </div>
                <p class="text-[10px] text-slate-500">Keep this token private. It grants the EA permission to sync data to this account.</p>
              </div>
              <div class="p-4 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-800 space-y-1">
                <div class="font-bold">Next steps:</div>
                <div>1. Open MetaTrader 5 → Tools → Options → Expert Advisors → Allow WebRequest</div>
                <div>2. Add: <span class="font-mono">https://ob-backtest-journal.onrender.com</span></div>
                <div>3. Attach OB_Journal_Bridge.mq5 to any chart and set InpBridgeToken to the token above.</div>
                <div>4. Trades will appear in your journal automatically.</div>
              </div>
              <div class="flex justify-end">
                <button id="m5done" class="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700">Done</button>
              </div>
            </div>`;
          document.getElementById('m5copyBtn').onclick = async () => {
            await navigator.clipboard?.writeText(j.token).catch(() => {});
            document.getElementById('m5copyBtn').innerHTML = '<i class="fa-solid fa-check text-[10px]"></i> Copied';
            setTimeout(() => { const b = document.getElementById('m5copyBtn'); if (b) b.innerHTML = '<i class="fa-solid fa-copy text-[10px]"></i> Copy'; }, 2000);
          };
          document.getElementById('m5done').onclick = () => { o.remove(); refreshStatusPanel(); startPoll(); };
          refreshStatusPanel();
        } catch (err) {
          errEl.textContent = err.message || 'Link failed. Check console for details.';
          errEl.classList.remove('hidden');
          btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-link text-xs"></i> Link account';
        }
      };
      setTimeout(() => document.getElementById('m5login')?.focus(), 50);
    });
  }

  // ─── unlink ──────────────────────────────────────────────────────────────────

  async function unlinkAccount(accountId) {
    const acc = list().find(a => a.id === accountId);
    if (!acc?.mt5?.linked) return;
    if (!confirm(`Unlink MT5 from "${acc.name}"? The account stays — only the bridge is removed.`)) return;
    try {
      await fetch('/api/mt5/unlink', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId })
      });
    } catch (e) { console.warn('[MT5] unlink API error:', e.message); }
    const all = list();
    const target = all.find(a => a.id === accountId);
    if (target) { delete target.mt5; delete target.mt5State; delete target.mt5Equity; delete target.mt5UnrealizedPnl; }
    save(all);
    toast('MT5 unlinked.');
    refreshStatusPanel();
    renderPositions();
  }

  // ─── history modal ───────────────────────────────────────────────────────────

  async function openHistory(accountId, accountName) {
    let modal = document.getElementById('mt5-history-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mt5-history-modal';
      modal.className = 'hidden';
      modal.innerHTML = `<div class="mt5-hm-box">
        <div class="mt5-hm-head">
          <div>
            <div id="mt5HmTitle" class="text-sm font-bold text-slate-900"></div>
            <div id="mt5HmSub" class="text-xs text-slate-400 mt-0.5"></div>
          </div>
          <button id="mt5HmClose" class="text-slate-400 hover:text-slate-700"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="mt5-hm-body" id="mt5HmBody"><div class="p-8 text-center text-slate-400 text-sm">Loading…</div></div>
      </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
      document.getElementById('mt5HmClose').onclick = () => modal.classList.add('hidden');
    }
    document.getElementById('mt5HmTitle').textContent = `Closed Trade History — ${accountName}`;
    document.getElementById('mt5HmSub').textContent = 'All closed trades received from MT5 (newest first)';
    modal.classList.remove('hidden');

    try {
      const r = await fetch(`/api/mt5/history?accountId=${encodeURIComponent(accountId)}`, { credentials: 'same-origin', cache: 'no-store' });
      const j = await r.json();
      const trades = Array.isArray(j.closedTrades) ? [...j.closedTrades].reverse() : [];
      const body = document.getElementById('mt5HmBody');

      if (!trades.length) {
        body.innerHTML = '<div class="p-8 text-center text-slate-400 text-sm">No closed trades received yet. Make sure the EA is running and syncing.</div>';
        return;
      }

      body.innerHTML = `<table>
        <thead><tr>
          <th>Date</th><th>Symbol</th><th>Dir</th><th>Volume</th>
          <th>Entry</th><th>Exit</th><th>SL</th><th>TP</th><th>P/L</th>
        </tr></thead>
        <tbody>
          ${trades.slice(0, 500).map(t => {
            const pnl = Number(t.profit || 0);
            const pnlClass = pnl >= 0 ? 'color:#16a34a' : 'color:#dc2626';
            const dir = String(t.direction || t.type || '').toLowerCase();
            const dirClass = dir === 'buy' ? 'color:#16a34a;font-weight:800' : 'color:#dc2626;font-weight:800';
            return `<tr>
              <td>${t.closeTime ? new Date(t.closeTime).toLocaleDateString() : '—'}</td>
              <td style="font-weight:700">${esc(t.symbol || '—')}</td>
              <td style="${dirClass}">${dir.toUpperCase()}</td>
              <td>${Number(t.volume || 0).toFixed(2)}</td>
              <td>${Number(t.openPrice || 0).toFixed(5)}</td>
              <td>${Number(t.closePrice || 0).toFixed(5)}</td>
              <td>${t.sl ? Number(t.sl).toFixed(5) : '—'}</td>
              <td>${t.tp ? Number(t.tp).toFixed(5) : '—'}</td>
              <td style="${pnlClass}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
    } catch (err) {
      document.getElementById('mt5HmBody').innerHTML = `<div class="p-8 text-center text-rose-500 text-sm">Failed to load history: ${esc(err.message)}</div>`;
    }
  }

  // ─── status panel ─────────────────────────────────────────────────────────────

  async function refreshStatusPanel() {
    injectStyles();
    const trading = document.getElementById('pageTrading');
    if (!trading) {
      document.getElementById(STATUS_PANEL_ID)?.remove();
      return;
    }

    let panel = document.getElementById(STATUS_PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = STATUS_PANEL_ID;
      panel.className = 'glass-card overflow-hidden';
      // Insert at the very top of pageTrading, before anything else
      const firstChild = trading.firstElementChild;
      if (firstChild) trading.insertBefore(panel, firstChild);
      else trading.appendChild(panel);
    }

    // Fetch status from server
    let accounts = [];
    try {
      const r = await fetch('/api/mt5/status', { credentials: 'same-origin', cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        // Filter to current mode only
        accounts = (j.accounts || []).filter(a => a.mode === mode());
      }
    } catch (e) { /* server may not be running locally */ }

    // Fallback to local account list + localStorage mt5 data
    if (!accounts.length) {
      accounts = list().map(a => ({
        accountId: a.id,
        accountName: a.name,
        mode: mode(),
        linked: !!a.mt5?.linked,
        login: a.mt5?.login || null,
        server: a.mt5?.server || null,
        label: a.mt5?.label || null,
        lastSyncAt: a.mt5?.lastSync || null,
        syncStatus: a.mt5?.linked ? 'linked' : 'none',
        balance: a.mt5State?.balance ?? null,
        equity: a.mt5State?.equity ?? null,
        currency: a.mt5State?.currency || null,
        positionCount: a.mt5State?.positions?.length ?? null,
        syncedAt: a.mt5State?.syncedAt ?? null,
      }));
    }

    const sig = JSON.stringify(accounts);
    if (sig === lastStatusSig && panel.children.length > 0) return; // no change
    lastStatusSig = sig;

    const hasLinked = accounts.some(a => a.linked);
    const currentModeLabel = mode();

    panel.innerHTML = `
      <div class="mt5-sp-header">
        <div class="mt5-sp-title">
          <i class="fa-solid fa-plug text-blue-600"></i>
          MT5 Integration — ${currentModeLabel}
          ${mode() === 'Backtest'
            ? '<span style="font-size:9px;background:#f8fafc;color:#64748b;border:1px solid #e2e8f0;padding:2px 8px;border-radius:6px;font-weight:800;text-transform:uppercase;letter-spacing:.06em">BACKTEST MODE</span>'
            : hasLinked
              ? '<span style="font-size:9px;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;padding:2px 8px;border-radius:6px;font-weight:800;text-transform:uppercase;letter-spacing:.06em">● ACTIVE</span>'
              : '<span style="font-size:9px;background:#f8fafc;color:#64748b;border:1px solid #e2e8f0;padding:2px 8px;border-radius:6px;font-weight:800;text-transform:uppercase;letter-spacing:.06em">NOT CONNECTED</span>'
          }
        </div>
        <div class="mt5-sp-actions">
          <button class="mt5-btn mt5-btn-ghost" onclick="window.dispatchEvent(new CustomEvent('open-mt5-help'))">
            <i class="fa-solid fa-circle-question" style="font-size:10px"></i> How to connect
          </button>
        </div>
      </div>
      <div id="mt5-accounts-list">
        ${mode() === 'Backtest'
          ? `<div style="padding:16px 18px;font-size:12px;color:#64748b;display:flex;align-items:center;gap:10px">
               <i class="fa-solid fa-circle-info" style="color:#94a3b8"></i>
               MT5 integration is only available in Demo, Real, and Funded modes.
               Switch modes using the selector above.
             </div>`
          : accounts.length === 0
            ? `<div style="padding:16px 18px;font-size:12px;color:#94a3b8;display:flex;align-items:center;gap:10px">
                 <i class="fa-solid fa-circle-exclamation" style="color:#cbd5e1"></i>
                 No ${currentModeLabel} accounts found.
                 <button onclick="typeof window.openAddAccountModal === 'function' && window.openAddAccountModal()"
                   style="margin-left:auto;padding:5px 12px;border-radius:8px;border:1px solid #2563eb;background:#eff6ff;color:#2563eb;font-size:11px;font-weight:700;cursor:pointer">
                   + Add account first
                 </button>
               </div>`
            : accounts.map(a => {
                const statusDot = a.syncStatus === 'synced' ? 'mt5-dot-synced' : a.linked ? 'mt5-dot-linked' : 'mt5-dot-none';
                const badge = a.syncStatus === 'synced' ? 'mt5-badge-synced' : a.linked ? 'mt5-badge-linked' : 'mt5-badge-none';
                const badgeText = a.syncStatus === 'synced' ? '● Synced' : a.linked ? '◐ Linked' : '○ Not linked';
                const lastSync = a.syncedAt ? `Last sync: ${fmtDate(a.syncedAt)}` : a.lastSyncAt ? `Linked: ${fmtDate(a.lastSyncAt)}` : '';
                const balStr = a.balance != null ? fmtMoney(a.balance, a.currency) : '';
                const posStr = a.positionCount != null ? `${a.positionCount} open position${a.positionCount !== 1 ? 's' : ''}` : '';

                return `<div class="mt5-account-row">
                  <span class="mt5-dot ${statusDot}"></span>
                  <span class="mt5-acc-name">${esc(a.accountName)}</span>
                  <span class="mt5-status-badge ${badge}">${badgeText}</span>
                  ${a.linked ? `
                    <span class="mt5-acc-meta">${esc(a.login || '')}${a.server ? ' · ' + esc(a.server) : ''}</span>
                    ${balStr ? `<span class="mt5-acc-bal">${esc(balStr)}</span>` : ''}
                    ${posStr ? `<span class="mt5-acc-sync">${esc(posStr)}</span>` : ''}
                    ${lastSync ? `<span class="mt5-acc-sync" title="${esc(a.syncedAt || '')}">${esc(lastSync)}</span>` : ''}
                    <div style="display:flex;gap:6px;margin-left:auto;flex-shrink:0">
                      <button class="mt5-history-btn" onclick="window.__mt5OpenHistory('${esc(a.accountId)}','${esc(a.accountName)}')">
                        <i class="fa-solid fa-clock-rotate-left" style="font-size:9px"></i> History
                      </button>
                      <button class="mt5-btn mt5-btn-danger" style="height:24px;padding:0 8px;font-size:10px"
                        onclick="window.__mt5Unlink('${esc(a.accountId)}')">
                        Unlink
                      </button>
                    </div>
                  ` : `
                    <span class="mt5-acc-meta" style="flex:1">Click to connect this account to MT5 for automatic trade sync</span>
                    <button class="mt5-btn mt5-btn-primary" style="margin-left:auto;flex-shrink:0"
                      onclick="window.__mt5Link('${esc(a.accountId)}')">
                      <i class="fa-solid fa-link" style="font-size:10px"></i> Link MT5
                    </button>
                  `}
                </div>`;
              }).join('')
        }
      </div>
    `;
  }

  // ─── open positions panel ─────────────────────────────────────────────────────

  function renderPositions() {
    injectStyles();
    const trading = document.getElementById('pageTrading');
    if (!trading || mode() === 'Backtest') {
      document.getElementById(POSITIONS_PANEL_ID)?.remove();
      return;
    }

    const acc = activeAcc();
    const state = acc?.mt5State;
    const positions = state?.positions || [];

    if (!acc?.mt5?.linked && !positions.length) {
      document.getElementById(POSITIONS_PANEL_ID)?.remove();
      return;
    }

    let panel = document.getElementById(POSITIONS_PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = POSITIONS_PANEL_ID;
      panel.className = 'glass-card overflow-hidden';
      // Insert after the status panel, or at top of trading page
      const statusPanel = document.getElementById(STATUS_PANEL_ID);
      const anchor = statusPanel?.nextElementSibling || trading.firstElementChild;
      if (anchor) trading.insertBefore(panel, anchor);
      else trading.appendChild(panel);
    }

    const totalPnl = positions.reduce((s, p) => s + Number(p.profit || 0) + Number(p.swap || 0), 0);
    const pnlClass = totalPnl >= 0 ? 'color:#16a34a' : 'color:#dc2626';
    const currency = state?.currency || '';

    panel.innerHTML = `
      <div class="mt5-pos-header">
        <div>
          <div style="font-size:13px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:8px">
            <i class="fa-solid fa-chart-simple text-blue-600"></i>
            Open Positions — ${esc(acc.mt5?.server || 'MT5')}
            <span style="font-size:9px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;padding:2px 7px;border-radius:6px;font-weight:800">${positions.length} OPEN</span>
          </div>
          <div style="font-size:10px;color:#64748b;margin-top:2px">
            Balance: <strong>${fmtMoney(state?.balance, currency)}</strong> ·
            Equity: <strong>${fmtMoney(state?.equity, currency)}</strong> ·
            Floating P/L: <strong style="${pnlClass}">${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}</strong>
            ${state?.syncedAt ? ` · Synced: ${fmtDate(state.syncedAt)}` : ''}
          </div>
        </div>
      </div>
      ${positions.length === 0
        ? `<div style="padding:20px 18px;font-size:12px;color:#94a3b8;text-align:center">No open positions.</div>`
        : `<div class="mt5-pos-row head">
            <span>Symbol</span><span>Dir</span><span>Volume</span>
            <span>Entry</span><span>SL</span><span>TP</span><span>Current</span><span>P/L</span>
          </div>
          ${positions.map(p => {
            const pnl = Number(p.profit || 0) + Number(p.swap || 0);
            const dirClass = String(p.direction || '').toLowerCase() === 'buy' ? 'mt5-pos-buy' : 'mt5-pos-sell';
            const pnlClass2 = pnl >= 0 ? 'mt5-pos-pnl-pos' : 'mt5-pos-pnl-neg';
            return `<div class="mt5-pos-row">
              <span style="font-weight:700">${esc(p.symbol || '—')}</span>
              <span class="${dirClass}">${esc(String(p.direction || '').toUpperCase())}</span>
              <span>${Number(p.volume || 0).toFixed(2)}</span>
              <span>${Number(p.openPrice || 0).toFixed(5)}</span>
              <span>${p.sl ? Number(p.sl).toFixed(5) : '—'}</span>
              <span>${p.tp ? Number(p.tp).toFixed(5) : '—'}</span>
              <span>${Number(p.currentPrice || 0).toFixed(5)}</span>
              <span class="${pnlClass2}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</span>
            </div>`;
          }).join('')}`
      }
    `;
  }

  // ─── sync / poll ─────────────────────────────────────────────────────────────

  async function syncState() {
    if (mode() === 'Backtest') return;
    const acc = activeAcc();
    if (!acc?.mt5?.linked) return;

    try {
      const r = await fetch(`/api/mt5/state?accountId=${encodeURIComponent(acc.id)}`, {
        credentials: 'same-origin', cache: 'no-store'
      });
      if (!r.ok) return;
      const j = await r.json();
      if (!j.state) return;

      const all = list();
      const target = all.find(a => a.id === acc.id);
      if (!target) return;

      const prevSig = JSON.stringify([target.mt5State?.syncedAt, target.mt5State?.balance, target.mt5State?.positions?.length]);
      const newSig  = JSON.stringify([j.state.syncedAt, j.state.balance, j.state.positions?.length]);
      if (prevSig === newSig) return; // nothing changed

      target.mt5State = j.state;
      if (Number(j.state.balance) > 0) target.balance = Number(j.state.balance);
      target.mt5Equity = Number(j.state.equity || 0);
      target.mt5UnrealizedPnl = (j.state.positions || []).reduce((n, v) => n + Number(v.profit || 0) + Number(v.swap || 0), 0);
      save(all);

      renderPositions();
      refreshStatusPanel();

      // If new trades were added to the journal since last sync, reload them
      if (typeof window.loadState === 'function' && j.journalAdded > 0) {
        await window.loadState();
        if (typeof window.renderAll === 'function') window.renderAll();
      }
    } catch (_) { /* silent — offline or server not ready */ }
  }

  function startPoll() {
    clearInterval(pollTimer);
    if (mode() === 'Backtest') return;
    const acc = activeAcc();
    if (!acc?.mt5?.linked) return;
    syncState(); // immediate first sync
    pollTimer = setInterval(syncState, 4000);
  }

  function stopPoll() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // ─── settings page MT5 status ─────────────────────────────────────────────────

  function updateSettingsBridgeStatus() {
    const el = document.getElementById('mt5BridgeStatus');
    const dot = el?.previousElementSibling?.querySelector('.w-3.h-3.rounded-full');
    const desc = el?.previousElementSibling?.querySelector('span.text-slate-500');
    if (!el) return;
    const acc = activeAcc();
    if (acc?.mt5?.linked) {
      el.textContent = 'CONNECTED';
      el.className = 'px-2.5 py-1 bg-emerald-100 text-emerald-700 font-bold rounded-lg text-[10px]';
      if (dot) dot.className = 'w-3 h-3 rounded-full bg-emerald-500';
      if (desc) desc.textContent = `Linked to ${acc.mt5.server} (${acc.mt5.login}). Last sync: ${fmtDate(acc.mt5.lastSync || null)}`;
    } else {
      el.textContent = 'NOT CONNECTED';
      el.className = 'px-2.5 py-1 bg-slate-200 text-slate-600 font-bold rounded-lg text-[10px]';
      if (dot) dot.className = 'w-3 h-3 rounded-full bg-slate-400';
      if (desc) desc.textContent = 'Read-only trade tracking. Connect an MT5 account via the Trading page.';
    }
  }

  // ─── global bindings (called from inline HTML) ─────────────────────────────────

  window.__mt5Link     = accountId => openLinkModal(accountId);
  window.__mt5Unlink   = accountId => unlinkAccount(accountId);
  window.__mt5OpenHistory = (accountId, name) => openHistory(accountId, name);
  window.openMt5Integration = () => {
    const acc = activeAcc();
    if (acc) openLinkModal(acc.id);
  };

  window.addEventListener('open-mt5-connect', e => {
    const acc = activeAcc();
    if (acc) openLinkModal(acc.id);
  });

  window.addEventListener('open-mt5-help', () => {
    overlay(`
      <div class="p-6 space-y-4">
        <div class="flex justify-between items-start">
          <h3 class="text-lg font-bold text-slate-900">MT5 Integration Guide</h3>
          <button data-x class="h-8 w-8 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:text-slate-700">×</button>
        </div>
        <div class="space-y-3 text-sm text-slate-600">
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div class="font-bold text-slate-800 mb-1">Step 1 — Link your account</div>
            Click "Link MT5" on the account you want to connect. Enter your MT5 login and broker server name.
          </div>
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div class="font-bold text-slate-800 mb-1">Step 2 — Install the EA</div>
            Copy the bridge token. Open MetaTrader 5, compile OB_Journal_Bridge.mq5, attach it to any chart, and paste the token into InpBridgeToken.
          </div>
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div class="font-bold text-slate-800 mb-1">Step 3 — Allow WebRequest</div>
            In MT5: Tools → Options → Expert Advisors → Allow WebRequest → add <span class="font-mono text-blue-600">https://ob-backtest-journal.onrender.com</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div class="font-bold text-slate-800 mb-1">Step 4 — Trades appear automatically</div>
            Open positions sync every 5 seconds. Closed trades appear in your journal with P/L and auto-calculated R-multiple (if SL was set).
          </div>
        </div>
        <div class="flex justify-end">
          <button data-x class="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700">Got it</button>
        </div>
      </div>
    `, o => o.querySelectorAll('[data-x]').forEach(b => b.onclick = () => o.remove()));
  });

  // ─── boot ─────────────────────────────────────────────────────────────────────

  function boot() {
    injectStyles();
    refreshStatusPanel();
    renderPositions();
    updateSettingsBridgeStatus();
    startPoll();

    // Re-run when mode or account changes
    const origMode = window.switchMode;
    if (typeof origMode === 'function' && !origMode.__mt5v3Patched) {
      window.switchMode = function (...args) {
        const result = origMode.apply(this, args);
        stopPoll();
        lastStatusSig = '';
        setTimeout(() => {
          refreshStatusPanel();
          renderPositions();
          updateSettingsBridgeStatus();
          startPoll();
        }, 80);
        return result;
      };
      window.switchMode.__mt5v3Patched = true;
    }

    const origTab = window.switchTab;
    if (typeof origTab === 'function' && !origTab.__mt5v3Patched) {
      window.switchTab = function (tab, ...rest) {
        const result = origTab.call(this, tab, ...rest);
        if (tab === 'trading' || tab === 'settings') {
          setTimeout(() => {
            refreshStatusPanel();
            renderPositions();
            updateSettingsBridgeStatus();
          }, 60);
        }
        return result;
      };
      window.switchTab.__mt5v3Patched = true;
    }

    window.addEventListener('wallet-accounts-updated', () => {
      lastStatusSig = '';
      refreshStatusPanel();
      renderPositions();
      updateSettingsBridgeStatus();
      startPoll();
    });

    // Retry patches for late-loading scripts
    [300, 800, 1600, 3000].forEach(ms => setTimeout(() => {
      if (!window.switchMode.__mt5v3Patched) boot();
    }, ms));
  }

  if (document.body) boot();
  else window.addEventListener('DOMContentLoaded', boot, { once: true });
})();
