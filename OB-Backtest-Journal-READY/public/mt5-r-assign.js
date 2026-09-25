/**
 * mt5-r-assign.js
 * R-multiple assignment workflow for MT5-imported trades.
 *
 * When a trade drawer is opened for a trade with source === 'mt5',
 * this script injects a compact panel ABOVE the checklist with:
 *   - Entry price  (pre-filled from trade.entryPrice)
 *   - Stop Loss price input
 *   - Session selector  (pre-filled from trade.session, often blank)
 *   - Timeframe selector (pre-filled from trade.timeframe, often blank)
 *   - Strategy selector
 *   - "Calculate R" button — derives rMultiple from price levels or from
 *     raw pnl / account risk as a fallback
 *
 * The panel is removed automatically when a non-MT5 drawer is opened.
 * On save, the updated fields are persisted with the trade record.
 */
(() => {
  const PANEL_ID = 'ob-mt5-r-panel';
  const STYLE_ID = 'ob-mt5-r-assign-style';

  // ─── helpers ─────────────────────────────────────────────────────────────────

  function getTrades()       { try { return Array.isArray(window.trades) ? window.trades : []; } catch (_) { return []; } }
  function getRisk()         { try { return Number(window.riskPercent)   || 1;      } catch (_) { return 1; } }
  function getCapital()      { try { return Number(window.initialCapital) || 100000; } catch (_) { return 100000; } }
  function getMode()         { try { return typeof window.activeMode !== 'undefined' ? window.activeMode : 'Demo'; } catch (_) { return 'Demo'; } }

  function accountStartingBalance() {
    const mode = getMode();
    if (mode === 'Backtest') return getCapital();
    const aid = localStorage.getItem(`my_journal_active_account_${mode}_v1`);
    try {
      const data = JSON.parse(localStorage.getItem('my_journal_accounts_v1') || '{}');
      const list = Array.isArray(data[mode]) ? data[mode] : [];
      const acc  = list.find(a => a.id === aid) || list[0];
      return Number(acc?.startingBalance ?? acc?.balance ?? 100000) || 100000;
    } catch (_) { return 100000; }
  }

  // ─── styles ───────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${PANEL_ID} {
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        border-radius: 14px;
        padding: 14px;
        margin-bottom: 4px;
      }
      #${PANEL_ID} .rp-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }
      #${PANEL_ID} .rp-badge {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .06em;
        text-transform: uppercase;
        background: #2563eb;
        color: #fff;
        padding: 2px 8px;
        border-radius: 6px;
      }
      #${PANEL_ID} .rp-title {
        font-size: 11px;
        font-weight: 700;
        color: #1e40af;
      }
      #${PANEL_ID} .rp-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 10px;
      }
      #${PANEL_ID} .rp-field label {
        display: block;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .06em;
        color: #64748b;
        margin-bottom: 3px;
      }
      #${PANEL_ID} .rp-field input,
      #${PANEL_ID} .rp-field select {
        width: 100%;
        background: #fff;
        border: 1px solid #bfdbfe;
        border-radius: 9px;
        padding: 6px 9px;
        font-size: 11px;
        font-family: 'JetBrains Mono', monospace;
        color: #1e293b;
        outline: none;
        transition: border-color .15s;
        box-sizing: border-box;
      }
      #${PANEL_ID} .rp-field input:focus,
      #${PANEL_ID} .rp-field select:focus { border-color: #2563eb; }
      #${PANEL_ID} .rp-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      #${PANEL_ID} .rp-calc {
        flex: 1;
        padding: 7px 12px;
        background: #2563eb;
        color: #fff;
        border: 0;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: background .15s;
      }
      #${PANEL_ID} .rp-calc:hover { background: #1d4ed8; }
      #${PANEL_ID} .rp-result {
        font-size: 12px;
        font-weight: 800;
        font-family: 'JetBrains Mono', monospace;
        min-width: 64px;
        text-align: right;
      }
      #${PANEL_ID} .rp-result.positive { color: #16a34a; }
      #${PANEL_ID} .rp-result.negative { color: #dc2626; }
      #${PANEL_ID} .rp-result.neutral  { color: #94a3b8; }
      #${PANEL_ID} .rp-info {
        font-size: 10px;
        color: #64748b;
        margin-top: 8px;
        line-height: 1.5;
      }
      #${PANEL_ID} .rp-info strong { color: #1e40af; }
    `;
    document.head.appendChild(s);
  }

  // ─── build / remove panel ─────────────────────────────────────────────────────

  function removePanel() {
    document.getElementById(PANEL_ID)?.remove();
  }

  function buildPanel(trade) {
    removePanel();
    injectStyles();

    const container = document.querySelector('#tradeDrawer .flex-1.overflow-y-auto');
    if (!container) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    const entryVal  = trade.entryPrice  ? trade.entryPrice.toFixed(5)  : '';
    const exitVal   = trade.exitPrice   ? trade.exitPrice.toFixed(5)   : '';
    const pnlVal    = typeof trade.pnl === 'number' ? trade.pnl.toFixed(2) : '0.00';
    const direction = trade.direction || 'LONG';

    // Current R display
    const existingR = Number(trade.rMultiple) || 0;
    const rDisplay  = existingR !== 0
      ? `${existingR >= 0 ? '+' : ''}${existingR.toFixed(2)} R`
      : '— R';
    const rClass = existingR > 0 ? 'positive' : existingR < 0 ? 'negative' : 'neutral';

    panel.innerHTML = `
      <div class="rp-header">
        <span class="rp-badge">MT5</span>
        <span class="rp-title">Assign R-Multiple</span>
      </div>
      <div class="rp-grid">
        <div class="rp-field">
          <label>Entry Price</label>
          <input type="number" id="rp-entry" step="any" placeholder="e.g. 1.08450" value="${entryVal}">
        </div>
        <div class="rp-field">
          <label>Stop Loss Price</label>
          <input type="number" id="rp-sl" step="any" placeholder="e.g. 1.08200">
        </div>
        <div class="rp-field">
          <label>Exit Price</label>
          <input type="number" id="rp-exit" step="any" placeholder="auto-filled" value="${exitVal}">
        </div>
        <div class="rp-field">
          <label>Risk % (fallback)</label>
          <input type="number" id="rp-risk" step="0.1" min="0.01" max="100" value="${getRisk()}">
        </div>
        <div class="rp-field">
          <label>Session</label>
          <select id="rp-session">
            <option value="">— Select —</option>
            <option value="London"${trade.session==='London'?' selected':''}>London</option>
            <option value="New York"${trade.session==='New York'?' selected':''}>New York</option>
            <option value="London/NY"${trade.session==='London/NY'?' selected':''}>London/NY</option>
            <option value="Asia"${trade.session==='Asia'?' selected':''}>Asia</option>
            <option value="Other"${trade.session==='Other'?' selected':''}>Other</option>
          </select>
        </div>
        <div class="rp-field">
          <label>Timeframe</label>
          <select id="rp-tf">
            <option value="">— Select —</option>
            <option value="4H"${trade.timeframe==='4H'?' selected':''}>4H</option>
            <option value="1H"${trade.timeframe==='1H'?' selected':''}>1H</option>
            <option value="15M"${trade.timeframe==='15M'?' selected':''}>15M</option>
            <option value="5M"${trade.timeframe==='5M'?' selected':''}>5M</option>
            <option value="1M"${trade.timeframe==='1M'?' selected':''}>1M</option>
          </select>
        </div>
      </div>
      <div class="rp-actions">
        <button class="rp-calc" id="rp-calc-btn">Calculate R</button>
        <span class="rp-result ${rClass}" id="rp-result-display">${rDisplay}</span>
      </div>
      <div class="rp-info">
        Raw P&L from MT5: <strong>${pnlVal > 0 ? '+' : ''}$${pnlVal}</strong> &nbsp;·&nbsp;
        Direction: <strong>${direction}</strong><br>
        R = (Exit − Entry) ÷ (Entry − SL) for longs, inverted for shorts.<br>
        If SL is blank, R is estimated from P&L ÷ (Risk% × Capital).
      </div>
    `;

    // Insert before the checklist section (first child of the scrollable area)
    container.insertBefore(panel, container.firstElementChild);

    // Wire the Calculate button
    document.getElementById('rp-calc-btn').onclick = () => calculateAndApply(trade);
  }

  // ─── R calculation ────────────────────────────────────────────────────────────

  function calculateAndApply(trade) {
    const entry    = parseFloat(document.getElementById('rp-entry')?.value);
    const sl       = parseFloat(document.getElementById('rp-sl')?.value);
    const exit     = parseFloat(document.getElementById('rp-exit')?.value);
    const riskPct  = parseFloat(document.getElementById('rp-risk')?.value) || getRisk();
    const session  = document.getElementById('rp-session')?.value || '';
    const tf       = document.getElementById('rp-tf')?.value || '';

    let rMultiple = 0;
    let method = '';

    const dir = String(trade.direction || 'LONG').toUpperCase();

    // Method 1: price-based R (most accurate)
    if (Number.isFinite(entry) && Number.isFinite(sl) && Number.isFinite(exit) && entry !== sl) {
      const riskPerUnit = Math.abs(entry - sl);
      const gainPerUnit = dir === 'SHORT'
        ? (entry - exit)   // short: profit when price falls
        : (exit  - entry); // long:  profit when price rises
      rMultiple = gainPerUnit / riskPerUnit;
      method = 'price';
    }
    // Method 2: pnl-based fallback
    else if (typeof trade.pnl === 'number' && trade.pnl !== 0 && riskPct > 0) {
      const capital     = accountStartingBalance();
      const riskDollars = capital * (riskPct / 100);
      rMultiple = trade.pnl / riskDollars;
      method = 'pnl';
    }

    rMultiple = Math.round(rMultiple * 100) / 100; // 2 dp

    // Update result display
    const display = document.getElementById('rp-result-display');
    if (display) {
      display.textContent = `${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(2)} R`;
      display.className   = `rp-result ${rMultiple > 0 ? 'positive' : rMultiple < 0 ? 'negative' : 'neutral'}`;
    }

    if (rMultiple === 0 && method === '') {
      // Nothing to apply yet — user hasn't provided enough data
      return;
    }

    // Apply to the trade object immediately so Save picks it up
    trade.rMultiple = rMultiple;
    if (session) trade.session   = session;
    if (tf)      trade.timeframe = tf;

    // If we derived R from prices, also store the SL for reference
    if (method === 'price' && Number.isFinite(sl)) trade.sl = sl;

    // Update the drawer subtitle to reflect new R
    const subtitle = document.getElementById('drawerSubtitle');
    if (subtitle) {
      subtitle.textContent = `${trade.date} — ${(trade.direction || 'LONG').charAt(0).toUpperCase() + (trade.direction || 'LONG').slice(1).toLowerCase()} — ${trade.result} — ${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(2)}R${trade.session ? ' — ' + trade.session : ''}`;
    }

    // Re-evaluate the save gate
    if (typeof window.__checkDrawerSaveReady === 'function') {
      window.__checkDrawerSaveReady();
    }
  }

  // ─── patch openDrawer ─────────────────────────────────────────────────────────

  function patchOpenDrawer() {
    const original = window.openDrawer;
    if (typeof original !== 'function' || original.__mt5RAssignPatched) return;

    const patched = function (id) {
      const result = original.apply(this, arguments);

      // After the original drawer renders, check if this is an MT5 trade
      setTimeout(() => {
        const trade = getTrades().find(t => t.id === id);
        if (trade && trade.source === 'mt5') {
          buildPanel(trade);
        } else {
          removePanel();
        }
      }, 0);

      return result;
    };

    patched.__mt5RAssignPatched = true;
    window.openDrawer = patched;
  }

  // ─── patch saveDrawer to persist rp fields ────────────────────────────────────

  function patchSaveDrawer() {
    const original = window.saveDrawer;
    if (typeof original !== 'function' || original.__mt5RAssignSavePatched) return;

    const patched = function () {
      // Flush any uncommitted rp field values before save
      const id = window.__obJournalOpenTradeId || window.currentDrawerTradeId;
      const trade = getTrades().find(t => t.id === id);
      if (trade && trade.source === 'mt5') {
        const session = document.getElementById('rp-session')?.value;
        const tf      = document.getElementById('rp-tf')?.value;
        if (session) trade.session   = session;
        if (tf)      trade.timeframe = tf;
      }
      return original.apply(this, arguments);
    };

    patched.__mt5RAssignSavePatched = true;
    window.saveDrawer = patched;
  }

  // ─── boot ─────────────────────────────────────────────────────────────────────

  function boot() {
    injectStyles();
    patchOpenDrawer();
    patchSaveDrawer();

    // Retry after other scripts finish wrapping openDrawer/saveDrawer
    [200, 500, 1000, 2000].forEach(ms => setTimeout(() => {
      patchOpenDrawer();
      patchSaveDrawer();
    }, ms));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
