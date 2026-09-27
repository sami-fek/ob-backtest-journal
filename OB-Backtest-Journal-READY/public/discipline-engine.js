/**
 * discipline-engine.js  v2.0
 *
 * Discipline enforcement for MY Journal.
 *
 * DAILY TRADE LIMIT (max 3 per day):
 *   - Enforced server-side by POST /api/trades returning HTTP 429.
 *   - handleTradeSubmit in index.html calls /api/trades and shows a
 *     hard-block modal when the server rejects the trade.
 *   - This engine reads /api/trades/daily-count to show the live count
 *     in the banner and discipline panel. It does NOT show an override
 *     modal for the daily limit — the server already rejected the trade.
 *
 * CONSECUTIVE-LOSS HARD STOP:
 *   - Computed client-side from the trades array.
 *   - Shows a confirmation modal before the trade is logged (not a hard
 *     server rejection, but a user discipline checkpoint).
 *   - If the user proceeds, the trade is marked as a post-stop violation.
 */
(() => {
  const STYLE_ID  = 'ob-discipline-engine-style-v2';
  const BANNER_ID = 'ob-discipline-banner';
  const MODAL_ID  = 'ob-discipline-modal';

  // ─── helpers ────────────────────────────────────────────────────────────────

  function safeInt(val, fallback) {
    const n = parseInt(val, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function getHardStop() { try { return safeInt(window.hardStopLosses, 2); } catch (_) { return 2; } }
  function getDailyMax()  { try { return safeInt(window.maxDailyTrades, 3); } catch (_) { return 3; } }
  function getMode()      { try { return typeof window.activeMode !== 'undefined' ? window.activeMode : 'Demo'; } catch (_) { return 'Demo'; } }

  function accountId(mode) {
    if (mode === 'Backtest') return null;
    return localStorage.getItem(`my_journal_active_account_${mode}_v1`) || null;
  }

  function scopedTrades() {
    if (!Array.isArray(window.trades)) return [];
    const mode = getMode();
    const aid  = accountId(mode);
    return window.trades.filter(t => {
      if (t.mode !== mode) return false;
      if (mode === 'Backtest') return true;
      return !aid || !t.accountId || t.accountId === aid;
    });
  }

  function todayKey() { return new Date().toISOString().slice(0, 10); }

  // ─── server-backed daily count ────────────────────────────────────────────────

  // Cache: { mode, date, count, limit, limitReached, fetchedAt }
  let _dailyCountCache = null;

  async function fetchDailyCount() {
    const mode = getMode();
    if (mode === 'Backtest') return { count: 0, limit: getDailyMax(), limitReached: false };
    const date = todayKey();

    // Use cache if fresh (< 3 seconds)
    if (_dailyCountCache && _dailyCountCache.mode === mode && _dailyCountCache.date === date
        && (Date.now() - _dailyCountCache.fetchedAt) < 3000) {
      return _dailyCountCache;
    }

    try {
      const r = await fetch(
        `/api/trades/daily-count?mode=${encodeURIComponent(mode)}&date=${date}`,
        { credentials: 'same-origin', cache: 'no-store' }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      _dailyCountCache = { ...j, fetchedAt: Date.now() };
      return _dailyCountCache;
    } catch (_) {
      // Server unreachable — fall back to client-side count
      const count = scopedTrades().filter(t => String(t.date || '').slice(0, 10) === date).length;
      const limit = getDailyMax();
      return { count, limit, limitReached: count >= limit };
    }
  }

  // Invalidate cache after a trade is added or deleted
  function invalidateDailyCount() { _dailyCountCache = null; }

  // ─── core discipline snapshot ─────────────────────────────────────────────────

  function computeConsecutiveLosses() {
    const list = scopedTrades();
    const sorted = [...list].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    let streak = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (String(sorted[i].result || '').toLowerCase() === 'loss') streak++;
      else break;
    }
    return streak;
  }

  function computeHardStopState() {
    const list = scopedTrades();
    const hardStop = getHardStop();
    const sorted = [...list].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    let currentRun = 0, stopTriggered = false, stopIndex = -1, hardStopDate = null;
    for (let i = 0; i < sorted.length; i++) {
      const r = String(sorted[i].result || '').toLowerCase();
      if (r === 'loss') {
        currentRun++;
        if (!stopTriggered && currentRun >= hardStop) {
          stopTriggered = true; stopIndex = i; hardStopDate = sorted[i].date || null;
        }
      } else {
        if (!stopTriggered) currentRun = 0;
      }
    }
    return {
      hardStopTriggered: stopTriggered,
      hardStopDate,
      tradesAfterStop: stopTriggered ? (sorted.length - 1 - stopIndex) : 0,
    };
  }

  /**
   * Full discipline snapshot.
   * dailyCount / dailyLimit / dailyLimitReached are read from the last
   * fetchDailyCount() result (cached). Call refreshAsync() to update.
   */
  function computeDisciplineState(dailyData) {
    const streak    = computeConsecutiveLosses();
    const hardStop  = getHardStop();
    const { hardStopTriggered, hardStopDate, tradesAfterStop } = computeHardStopState();
    const daily     = dailyData || { count: 0, limit: getDailyMax(), limitReached: false };

    return {
      consecutiveLosses:  streak,
      hardStopThreshold:  hardStop,
      hardStopTriggered,
      hardStopDate,
      tradesAfterStop,
      todayCount:         daily.count,
      dailyMax:           daily.limit,
      dailyLimitReached:  daily.limitReached,
      todayDate:          todayKey(),
    };
  }

  window.getDisciplineState = () => computeDisciplineState(_dailyCountCache);

  // ─── styles ──────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${BANNER_ID} {
        border-radius: 16px; padding: 14px 18px;
        display: flex; align-items: flex-start; gap: 14px;
        margin-bottom: 20px; border: 1px solid;
        animation: ob-slide-in .22s cubic-bezier(.16,1,.3,1);
      }
      #${BANNER_ID}.ob-banner-stop  { background:#fff0f1; border-color:#fca5a5; color:#7f1d1d; }
      #${BANNER_ID}.ob-banner-daily { background:#fffbeb; border-color:#fcd34d; color:#78350f; }
      #${BANNER_ID} .ob-banner-icon {
        width:36px;height:36px;border-radius:10px;display:grid;place-items:center;flex-shrink:0;font-size:16px;
      }
      #${BANNER_ID}.ob-banner-stop  .ob-banner-icon { background:#fee2e2; color:#dc2626; }
      #${BANNER_ID}.ob-banner-daily .ob-banner-icon { background:#fef3c7; color:#d97706; }
      #${BANNER_ID} .ob-banner-body { flex:1; }
      #${BANNER_ID} .ob-banner-title { font-size:13px; font-weight:800; margin-bottom:3px; }
      #${BANNER_ID} .ob-banner-sub   { font-size:11px; opacity:.8; line-height:1.5; }
      #${BANNER_ID} .ob-banner-close { background:transparent;border:0;cursor:pointer;color:inherit;opacity:.5;font-size:16px;padding:0 4px;flex-shrink:0; }
      #${BANNER_ID} .ob-banner-close:hover { opacity:1; }

      /* Hard-stop confirmation modal */
      #${MODAL_ID} {
        position:fixed;inset:0;z-index:200;
        display:flex;align-items:center;justify-content:center;
        padding:16px; background:rgba(15,23,42,.35); backdrop-filter:blur(6px);
      }
      #${MODAL_ID}.hidden { display:none; }
      #${MODAL_ID} .ob-dm-box {
        width:min(420px,100%); border-radius:24px; border:1px solid rgba(255,255,255,.9);
        background:rgba(255,255,255,.97); box-shadow:0 32px 80px rgba(15,23,42,.22);
        overflow:hidden; padding:28px 26px;
      }
      #${MODAL_ID} .ob-dm-icon { width:52px;height:52px;border-radius:16px;display:grid;place-items:center;font-size:22px;margin-bottom:16px; }
      #${MODAL_ID}.ob-modal-stop .ob-dm-icon { background:#fee2e2; color:#dc2626; }
      #${MODAL_ID} h3 { font-size:18px; font-weight:800; color:#0f172a; margin:0 0 8px; }
      #${MODAL_ID} p  { font-size:13px; color:#475569; line-height:1.6; margin:0 0 22px; }
      #${MODAL_ID} .ob-dm-actions { display:flex; gap:10px; }
      #${MODAL_ID} .ob-dm-back { flex:1;padding:11px;border-radius:12px;background:#f1f5f9;border:0;font-size:13px;font-weight:700;color:#475569;cursor:pointer; }
      #${MODAL_ID} .ob-dm-back:hover { background:#e2e8f0; }
      #${MODAL_ID} .ob-dm-override { flex:1;padding:11px;border-radius:12px;background:#dc2626;border:0;font-size:13px;font-weight:700;color:#fff;cursor:pointer; }
      #${MODAL_ID} .ob-dm-override:hover { opacity:.9; }

      /* Discipline panel additions */
      .ob-streak-pill { display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:800;font-family:'JetBrains Mono',monospace; }
      .ob-streak-safe   { background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; }
      .ob-streak-warn   { background:#fffbeb; color:#92400e; border:1px solid #fcd34d; }
      .ob-streak-danger { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; }

      @keyframes ob-slide-in { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
    `;
    document.head.appendChild(s);
  }

  // ─── banner ──────────────────────────────────────────────────────────────────

  function renderBanner(state) {
    const trading = document.getElementById('pageTrading');
    if (!trading) return;
    document.getElementById(BANNER_ID)?.remove();
    if (getMode() === 'Backtest') return;

    const showStop  = state.hardStopTriggered;
    const showDaily = state.dailyLimitReached;
    if (!showStop && !showDaily) return;

    injectStyles();
    const banner = document.createElement('div');
    banner.id = BANNER_ID;

    if (showStop) {
      const postNote = state.tradesAfterStop > 0
        ? ` ${state.tradesAfterStop} trade${state.tradesAfterStop > 1 ? 's' : ''} logged after the stop.`
        : ' Do not log another trade today.';
      banner.className = `${BANNER_ID} ob-banner-stop`;
      banner.innerHTML = `
        <div class="ob-banner-icon"><i class="fa-solid fa-hand"></i></div>
        <div class="ob-banner-body">
          <div class="ob-banner-title">HARD STOP — ${state.consecutiveLosses} consecutive loss${state.consecutiveLosses > 1 ? 'ses' : ''}</div>
          <div class="ob-banner-sub">Trading is paused after hitting your ${state.hardStopThreshold}-loss rule.${postNote}</div>
        </div>
        <button class="ob-banner-close" aria-label="Dismiss" onclick="this.closest('#${BANNER_ID}')?.remove()">×</button>`;
    } else {
      banner.className = `${BANNER_ID} ob-banner-daily`;
      banner.innerHTML = `
        <div class="ob-banner-icon"><i class="fa-solid fa-calendar-xmark"></i></div>
        <div class="ob-banner-body">
          <div class="ob-banner-title">DAILY LIMIT REACHED — ${state.todayCount}/${state.dailyMax} trades today</div>
          <div class="ob-banner-sub">You have hit your daily limit of ${state.dailyMax} trades. Any further submissions will be rejected by the server.</div>
        </div>
        <button class="ob-banner-close" aria-label="Dismiss" onclick="this.closest('#${BANNER_ID}')?.remove()">×</button>`;
    }

    trading.insertBefore(banner, trading.firstElementChild);
  }

  // ─── discipline panel streak row ─────────────────────────────────────────────

  function updateDisciplinePanel(state) {
    const disciplineCard = document.getElementById('statCleanTrades')?.closest('.glass-card');
    if (!disciplineCard) return;

    let streakRow = disciplineCard.querySelector('#ob-discipline-streak-row');
    if (!streakRow) {
      streakRow = document.createElement('div');
      streakRow.id = 'ob-discipline-streak-row';
      streakRow.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-50/60 border border-slate-100';
      const pendingRow = document.getElementById('statPendingReview')?.closest('.flex');
      if (pendingRow) pendingRow.after(streakRow);
      else disciplineCard.appendChild(streakRow);
    }

    const streak    = state.consecutiveLosses;
    const threshold = state.hardStopThreshold;
    const pillClass = streak === 0 ? 'ob-streak-safe'
                    : streak >= threshold ? 'ob-streak-danger'
                    : streak >= threshold - 1 ? 'ob-streak-warn'
                    : 'ob-streak-safe';
    const icon      = streak === 0 ? 'fa-circle-check' : streak >= threshold ? 'fa-hand' : 'fa-triangle-exclamation';
    const iconColor = streak === 0 ? 'text-emerald-600' : streak >= threshold ? 'text-rose-600' : 'text-amber-600';

    streakRow.innerHTML = `
      <div class="flex items-center gap-2.5">
        <i class="fa-solid ${icon} ${iconColor} text-sm"></i>
        <span class="text-xs font-semibold text-slate-800">Losing Streak</span>
      </div>
      <span class="ob-streak-pill ${pillClass}">${streak}/${threshold}</span>`;

    // Daily count row
    let dailyRow = disciplineCard.querySelector('#ob-discipline-daily-row');
    if (!dailyRow) {
      dailyRow = document.createElement('div');
      dailyRow.id = 'ob-discipline-daily-row';
      dailyRow.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-50/60 border border-slate-100';
      streakRow.after(dailyRow);
    }
    const dailyClass = state.dailyLimitReached ? 'ob-streak-danger' : state.todayCount > 0 ? 'ob-streak-warn' : 'ob-streak-safe';
    const dailyIcon  = state.dailyLimitReached ? 'fa-ban text-rose-600' : 'fa-calendar-day text-slate-500';
    dailyRow.innerHTML = `
      <div class="flex items-center gap-2.5">
        <i class="fa-solid ${dailyIcon} text-sm"></i>
        <span class="text-xs font-semibold text-slate-800">Trades Today</span>
      </div>
      <span class="ob-streak-pill ${dailyClass}">${state.todayCount}/${state.dailyMax}</span>`;

    const badge = document.getElementById('disciplinePassBadge');
    if (badge && state.hardStopTriggered && getMode() !== 'Backtest') {
      badge.textContent = 'HARD STOP';
      badge.className = 'text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded';
    } else if (badge && state.dailyLimitReached && getMode() !== 'Backtest') {
      badge.textContent = 'LIMIT REACHED';
      badge.className = 'text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded';
    }
  }

  // ─── home dashboard ───────────────────────────────────────────────────────────

  function updateHomeDiscipline(state) {
    const el = document.getElementById('homeDiscipline');
    if (!el || getMode() === 'Backtest') return;
    if (state.hardStopTriggered) {
      el.textContent = 'STOPPED';
      el.className = 'text-2xl font-bold font-mono text-rose-600';
    } else if (state.dailyLimitReached) {
      el.textContent = 'LIMIT';
      el.className = 'text-2xl font-bold font-mono text-amber-600';
    }
  }

  // ─── hard-stop confirmation modal (for consecutive losses only) ───────────────

  function showHardStopModal(state, onProceed) {
    injectStyles();
    document.getElementById(MODAL_ID)?.remove();
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = `${MODAL_ID} ob-modal-stop`;
    modal.innerHTML = `
      <div class="ob-dm-box">
        <div class="ob-dm-icon"><i class="fa-solid fa-hand"></i></div>
        <h3>Hard Stop — ${state.hardStopThreshold} consecutive losses</h3>
        <p>You have ${state.consecutiveLosses} consecutive ${state.consecutiveLosses > 1 ? 'losses' : 'loss'}.
           Your rule is to stop trading after ${state.hardStopThreshold} consecutive losses.
           Logging this trade will mark it as a rule violation.<br><br>
           <strong>Do you want to log this as a violation anyway?</strong></p>
        <div class="ob-dm-actions">
          <button class="ob-dm-back" id="obDmBack">← Go Back</button>
          <button class="ob-dm-override" id="obDmOverride">Log as Violation</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#obDmBack').onclick    = () => { modal.remove(); onProceed(false); };
    modal.querySelector('#obDmOverride').onclick = () => { modal.remove(); onProceed(true); };
    modal.addEventListener('click', e => { if (e.target === modal) { modal.remove(); onProceed(false); } });
  }

  // ─── patch handleTradeSubmit for hard-stop check ──────────────────────────────
  // The daily-limit check is now handled inside handleTradeSubmit itself
  // (via /api/trades returning 429). This wrapper only intercepts the
  // consecutive-loss hard-stop, which is a softer client-side discipline rule.

  function patchTradeSubmit() {
    const original = window.handleTradeSubmit;
    if (typeof original !== 'function' || original.__disciplineV2Patched) return;

    const patched = async function (event) {
      if (getMode() === 'Backtest') return original.apply(this, arguments);

      // Check consecutive-loss hard stop
      const streak   = computeConsecutiveLosses();
      const hardStop = getHardStop();

      if (streak >= hardStop) {
        // Hard-stop triggered — ask user before proceeding
        event.preventDefault();
        const state = computeDisciplineState(_dailyCountCache);
        showHardStopModal(state, async (proceed) => {
          if (!proceed) return;
          // Proceed with the original submit (which already handles the
          // server-side daily-limit check internally)
          const beforeIds = new Set((Array.isArray(window.trades) ? window.trades : []).map(t => t.id));
          await original.apply(this, [event]);
          // Mark the new trade as a post-stop violation
          setTimeout(() => {
            const newTrade = (Array.isArray(window.trades) ? window.trades : []).find(t => !beforeIds.has(t.id));
            if (newTrade) {
              newTrade.disciplineViolation = 'hardstop';
              if (typeof window.saveState === 'function') window.saveState();
              if (typeof window.renderAll === 'function') window.renderAll();
            }
            invalidateDailyCount();
            refreshAsync();
          }, 100);
        });
        return;
      }

      // No hard-stop — let the original (server-checked) submit run normally
      await original.apply(this, arguments);
      // After a successful submit, invalidate daily count cache
      setTimeout(() => { invalidateDailyCount(); refreshAsync(); }, 200);
    };

    patched.__disciplineV2Patched = true;
    window.handleTradeSubmit = patched;
  }

  // ─── also invalidate cache after deleteTrade ──────────────────────────────────

  function patchDeleteTrade() {
    const original = window.deleteTrade;
    if (typeof original !== 'function' || original.__disciplineV2Patched) return;
    const patched = function (...args) {
      const result = original.apply(this, args);
      invalidateDailyCount();
      setTimeout(refreshAsync, 200);
      return result;
    };
    patched.__disciplineV2Patched = true;
    window.deleteTrade = patched;
  }

  // ─── main async refresh ───────────────────────────────────────────────────────

  async function refreshAsync() {
    const daily = await fetchDailyCount();
    const state = computeDisciplineState(daily);
    injectStyles();
    renderBanner(state);
    updateDisciplinePanel(state);
    updateHomeDiscipline(state);
  }

  // ─── patch render functions ───────────────────────────────────────────────────

  function patchRenders() {
    ['renderAll', 'renderTradingConsole', 'renderHomeOverview'].forEach(name => {
      const original = window[name];
      if (typeof original !== 'function' || original.__disciplineV2EnginePatched) return;
      const patched = function (...args) {
        const result = original.apply(this, args);
        setTimeout(() => refreshAsync(), 0);
        return result;
      };
      patched.__disciplineV2EnginePatched = true;
      window[name] = patched;
    });
  }

  function patchMode() {
    const original = window.switchMode;
    if (typeof original !== 'function' || original.__disciplineV2ModePatched) return;
    const patched = function (...args) {
      const result = original.apply(this, args);
      invalidateDailyCount();
      setTimeout(() => refreshAsync(), 60);
      return result;
    };
    patched.__disciplineV2ModePatched = true;
    window.switchMode = patched;
  }

  // ─── boot ─────────────────────────────────────────────────────────────────────

  function boot() {
    injectStyles();
    patchTradeSubmit();
    patchDeleteTrade();
    patchRenders();
    patchMode();
    refreshAsync();

    [300, 800, 1500, 2500].forEach(ms => setTimeout(() => {
      patchTradeSubmit();
      patchDeleteTrade();
      patchRenders();
      patchMode();
    }, ms));

    window.addEventListener('wallet-accounts-updated', () => {
      invalidateDailyCount();
      setTimeout(refreshAsync, 60);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
