/**
 * discipline-engine.js
 * Hard-stop and daily-trade-limit enforcement for MY Journal.
 *
 * Reads from:
 *   window.trades        — normalized trade array (patched by ui-rules.js for account scope)
 *   window.activeMode    — current mode string
 *   window.hardStopLosses  — consecutive-loss threshold (from settings)
 *   window.maxDailyTrades  — daily trade cap (from settings)
 *   localStorage `my_journal_active_account_<mode>_v1`
 *
 * Provides:
 *   window.getDisciplineState()  — returns current discipline snapshot
 *   Patches handleTradeSubmit to intercept rule violations
 *   Updates Discipline & Rules Status panel + Home dashboard on each render
 */
(() => {
  const STYLE_ID = 'ob-discipline-engine-style-v1';
  const BANNER_ID = 'ob-discipline-banner';
  const MODAL_ID  = 'ob-discipline-modal';

  // ─── helpers ────────────────────────────────────────────────────────────────

  function safeInt(val, fallback) {
    const n = parseInt(val, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function getHardStop() { try { return safeInt(window.hardStopLosses, 2); } catch (_) { return 2; } }
  function getDailyMax()  { try { return safeInt(window.maxDailyTrades, 2); } catch (_) { return 2; } }
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

  // ─── core discipline computation ────────────────────────────────────────────

  /**
   * Returns a full discipline snapshot for the current mode+account.
   * {
   *   consecutiveLosses: number,   — current losing streak at end of sorted history
   *   hardStopThreshold: number,
   *   hardStopTriggered: boolean,  — streak >= threshold
   *   hardStopDate: string|null,   — date of the trade that triggered the stop
   *   tradesAfterStop: number,     — trades logged AFTER stop was first triggered
   *   todayCount: number,          — trades already logged today
   *   dailyMax: number,
   *   dailyLimitReached: boolean,
   *   todayDate: string,
   * }
   */
  function computeDisciplineState() {
    const list        = scopedTrades();
    const hardStop    = getHardStop();
    const dailyMax    = getDailyMax();
    const today       = todayKey();

    // Sort chronologically (oldest first)
    const sorted = [...list].sort((a, b) => {
      const da = String(a.date || ''), db = String(b.date || '');
      return da < db ? -1 : da > db ? 1 : 0;
    });

    // Consecutive-loss streak at the tail of history
    let streak = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const r = String(sorted[i].result || '').toLowerCase();
      if (r === 'loss') { streak++; }
      else { break; }
    }

    // Find earliest point the hard stop was triggered (first time streak hit threshold)
    let hardStopDate   = null;
    let currentRun     = 0;
    let stopTriggered  = false;
    let stopIndex      = -1;

    for (let i = 0; i < sorted.length; i++) {
      const r = String(sorted[i].result || '').toLowerCase();
      if (r === 'loss') {
        currentRun++;
        if (!stopTriggered && currentRun >= hardStop) {
          stopTriggered = true;
          stopIndex     = i;
          hardStopDate  = sorted[i].date || null;
        }
      } else {
        // A win or BE resets the streak counter, but only if it came BEFORE
        // the stop was triggered. After the stop, we keep tracking post-stop trades.
        if (!stopTriggered) currentRun = 0;
      }
    }

    // Count post-stop trades (trades logged after stopIndex, regardless of result)
    const tradesAfterStop = stopTriggered ? (sorted.length - 1 - stopIndex) : 0;

    // Today's trade count
    const todayCount = list.filter(t => String(t.date || '') === today).length;

    return {
      consecutiveLosses: streak,
      hardStopThreshold: hardStop,
      hardStopTriggered: stopTriggered,
      hardStopDate,
      tradesAfterStop,
      todayCount,
      dailyMax,
      dailyLimitReached: todayCount >= dailyMax,
      todayDate: today,
    };
  }

  window.getDisciplineState = computeDisciplineState;

  // ─── styles ─────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${BANNER_ID} {
        border-radius: 16px;
        padding: 14px 18px;
        display: flex;
        align-items: flex-start;
        gap: 14px;
        margin-bottom: 20px;
        border: 1px solid;
        animation: ob-slide-in .22s cubic-bezier(.16,1,.3,1);
      }
      #${BANNER_ID}.ob-banner-stop {
        background: #fff0f1;
        border-color: #fca5a5;
        color: #7f1d1d;
      }
      #${BANNER_ID}.ob-banner-daily {
        background: #fffbeb;
        border-color: #fcd34d;
        color: #78350f;
      }
      #${BANNER_ID} .ob-banner-icon {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        flex-shrink: 0;
        font-size: 16px;
      }
      #${BANNER_ID}.ob-banner-stop  .ob-banner-icon { background: #fee2e2; color: #dc2626; }
      #${BANNER_ID}.ob-banner-daily .ob-banner-icon { background: #fef3c7; color: #d97706; }
      #${BANNER_ID} .ob-banner-body { flex: 1; }
      #${BANNER_ID} .ob-banner-title { font-size: 13px; font-weight: 800; margin-bottom: 3px; }
      #${BANNER_ID} .ob-banner-sub   { font-size: 11px; opacity: .8; line-height: 1.5; }
      #${BANNER_ID} .ob-banner-close {
        background: transparent;
        border: 0;
        cursor: pointer;
        color: inherit;
        opacity: .5;
        font-size: 16px;
        padding: 0 4px;
        flex-shrink: 0;
      }
      #${BANNER_ID} .ob-banner-close:hover { opacity: 1; }

      /* Confirmation modal */
      #${MODAL_ID} {
        position: fixed; inset: 0; z-index: 200;
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
        background: rgba(15,23,42,.35);
        backdrop-filter: blur(6px);
      }
      #${MODAL_ID}.hidden { display: none; }
      #${MODAL_ID} .ob-dm-box {
        width: min(420px,100%);
        border-radius: 24px;
        border: 1px solid rgba(255,255,255,.9);
        background: rgba(255,255,255,.97);
        box-shadow: 0 32px 80px rgba(15,23,42,.22);
        overflow: hidden;
        padding: 28px 26px;
      }
      #${MODAL_ID} .ob-dm-icon {
        width: 52px; height: 52px; border-radius: 16px;
        display: grid; place-items: center;
        font-size: 22px; margin-bottom: 16px;
      }
      #${MODAL_ID}.ob-modal-stop  .ob-dm-icon { background: #fee2e2; color: #dc2626; }
      #${MODAL_ID}.ob-modal-daily .ob-dm-icon { background: #fef3c7; color: #d97706; }
      #${MODAL_ID} h3 { font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 8px; }
      #${MODAL_ID} p  { font-size: 13px; color: #475569; line-height: 1.6; margin: 0 0 22px; }
      #${MODAL_ID} .ob-dm-actions { display: flex; gap: 10px; }
      #${MODAL_ID} .ob-dm-back {
        flex: 1; padding: 11px; border-radius: 12px;
        background: #f1f5f9; border: 0; font-size: 13px; font-weight: 700;
        color: #475569; cursor: pointer;
        transition: background .15s;
      }
      #${MODAL_ID} .ob-dm-back:hover { background: #e2e8f0; }
      #${MODAL_ID} .ob-dm-override {
        flex: 1; padding: 11px; border-radius: 12px;
        background: #dc2626; border: 0; font-size: 13px; font-weight: 700;
        color: #fff; cursor: pointer;
        transition: background .15s;
      }
      #${MODAL_ID}.ob-modal-daily .ob-dm-override { background: #d97706; }
      #${MODAL_ID} .ob-dm-override:hover { opacity: .9; }

      /* Discipline status panel enhancements */
      .ob-streak-pill {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 3px 9px; border-radius: 20px;
        font-size: 10px; font-weight: 800; font-family: 'JetBrains Mono', monospace;
      }
      .ob-streak-safe   { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
      .ob-streak-warn   { background: #fffbeb; color: #92400e; border: 1px solid #fcd34d; }
      .ob-streak-danger { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }

      @keyframes ob-slide-in {
        from { opacity: 0; transform: translateY(-6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(s);
  }

  // ─── banner ──────────────────────────────────────────────────────────────────

  let bannerDismissed = false;

  function renderBanner(state) {
    const trading = document.getElementById('pageTrading');
    if (!trading) return;

    // Remove any existing banner first
    document.getElementById(BANNER_ID)?.remove();

    // Don't show on Backtest mode — no hard stop applies
    if (getMode() === 'Backtest') return;
    if (bannerDismissed) return;

    const showStop  = state.hardStopTriggered;
    const showDaily = state.dailyLimitReached;
    if (!showStop && !showDaily) return;

    injectStyles();
    const banner = document.createElement('div');
    banner.id = BANNER_ID;

    if (showStop) {
      banner.className = `${BANNER_ID} ob-banner-stop`;
      const postStopNote = state.tradesAfterStop > 0
        ? ` ${state.tradesAfterStop} trade${state.tradesAfterStop > 1 ? 's' : ''} logged after the stop — marked as rule violations.`
        : ' Do not log another trade today.';
      banner.innerHTML = `
        <div class="ob-banner-icon"><i class="fa-solid fa-hand"></i></div>
        <div class="ob-banner-body">
          <div class="ob-banner-title">HARD STOP — ${state.consecutiveLosses} consecutive loss${state.consecutiveLosses > 1 ? 'ses' : ''} reached</div>
          <div class="ob-banner-sub">Trading is paused for today after hitting your ${state.hardStopThreshold}-loss rule.${postStopNote}</div>
        </div>
        <button class="ob-banner-close" aria-label="Dismiss" onclick="document.getElementById('${BANNER_ID}')?.remove(); window.__obDisciplineBannerDismissed=true;">×</button>
      `;
    } else {
      banner.className = `${BANNER_ID} ob-banner-daily`;
      banner.innerHTML = `
        <div class="ob-banner-icon"><i class="fa-solid fa-calendar-xmark"></i></div>
        <div class="ob-banner-body">
          <div class="ob-banner-title">DAILY LIMIT REACHED — ${state.todayCount}/${state.dailyMax} trades today</div>
          <div class="ob-banner-sub">You have hit your maximum daily trade count. Any additional trades will be flagged as violations.</div>
        </div>
        <button class="ob-banner-close" aria-label="Dismiss" onclick="document.getElementById('${BANNER_ID}')?.remove(); window.__obDisciplineBannerDismissed=true;">×</button>
      `;
    }

    // Insert banner before the first child of pageTrading
    trading.insertBefore(banner, trading.firstElementChild);
  }

  // ─── discipline status panel ─────────────────────────────────────────────────

  function updateDisciplinePanel(state) {
    // Streak pill next to "Discipline & Rules Status" heading
    const header = document.querySelector('#pageJournal .glass-card h3, #pageTrading .glass-card h3');
    const disciplineCard = document.getElementById('statCleanTrades')?.closest('.glass-card');
    if (!disciplineCard) return;

    // Add / update streak row
    let streakRow = disciplineCard.querySelector('#ob-discipline-streak-row');
    if (!streakRow) {
      streakRow = document.createElement('div');
      streakRow.id = 'ob-discipline-streak-row';
      streakRow.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-50/60 border border-slate-100';
      // Insert after the pending-review row
      const pendingRow = document.getElementById('statPendingReview')?.closest('.flex');
      if (pendingRow) pendingRow.after(streakRow);
      else disciplineCard.appendChild(streakRow);
    }

    const streak = state.consecutiveLosses;
    const threshold = state.hardStopThreshold;
    const pillClass = streak === 0 ? 'ob-streak-safe'
                    : streak >= threshold ? 'ob-streak-danger'
                    : streak >= threshold - 1 ? 'ob-streak-warn'
                    : 'ob-streak-safe';
    const icon = streak === 0 ? 'fa-circle-check' : streak >= threshold ? 'fa-hand' : 'fa-triangle-exclamation';
    const iconColor = streak === 0 ? 'text-emerald-600' : streak >= threshold ? 'text-rose-600' : 'text-amber-600';

    streakRow.innerHTML = `
      <div class="flex items-center gap-2.5">
        <i class="fa-solid ${icon} ${iconColor} text-sm"></i>
        <span class="text-xs font-semibold text-slate-800">Losing Streak</span>
      </div>
      <span class="ob-streak-pill ${pillClass}">${streak}/${threshold}</span>
    `;

    // Update pass badge to include hard-stop context
    const badge = document.getElementById('disciplinePassBadge');
    if (badge && state.hardStopTriggered && getMode() !== 'Backtest') {
      badge.textContent = 'HARD STOP';
      badge.className = 'text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded';
    }
  }

  // ─── home dashboard discipline indicators ────────────────────────────────────

  function updateHomeDiscipline(state) {
    const el = document.getElementById('homeDiscipline');
    if (!el) return;
    if (getMode() === 'Backtest') return;

    if (state.hardStopTriggered) {
      el.textContent = 'STOPPED';
      el.className = 'text-2xl font-bold font-mono text-rose-600';
    } else if (state.dailyLimitReached) {
      el.textContent = 'LIMIT';
      el.className = 'text-2xl font-bold font-mono text-amber-600';
    }
    // Don't override the checklist-based discipline % if no hard-stop — that
    // remains handled by renderHomeOverview() in index.html.
  }

  // ─── modal ───────────────────────────────────────────────────────────────────

  /**
   * Shows a confirmation modal when the user tries to submit a trade that
   * would violate the hard stop or daily limit.
   * Calls `onProceed(true)` if user overrides, `onProceed(false)` if they cancel.
   */
  function showViolationModal(type, state, onProceed) {
    injectStyles();
    document.getElementById(MODAL_ID)?.remove();

    const isStop = type === 'stop';
    const modal  = document.createElement('div');
    modal.id     = MODAL_ID;
    modal.className = `${MODAL_ID} ${isStop ? 'ob-modal-stop' : 'ob-modal-daily'}`;

    const title   = isStop
      ? `Hard Stop — ${state.hardStopThreshold} consecutive losses`
      : `Daily Limit — ${state.dailyMax} trades`;
    const message = isStop
      ? `You have ${state.consecutiveLosses} consecutive ${state.consecutiveLosses > 1 ? 'losses' : 'loss'}. Your rule is to stop trading after ${state.hardStopThreshold} consecutive losses. Logging this trade will mark it as a rule violation.`
      : `You have already logged ${state.todayCount} trade${state.todayCount > 1 ? 's' : ''} today, reaching your daily limit of ${state.dailyMax}. Logging this trade will mark it as a rule violation.`;
    const icon = isStop ? 'fa-hand' : 'fa-calendar-xmark';

    modal.innerHTML = `
      <div class="ob-dm-box">
        <div class="ob-dm-icon"><i class="fa-solid ${icon}"></i></div>
        <h3>${title}</h3>
        <p>${message}<br><br><strong>Do you want to log this as a rule violation anyway?</strong></p>
        <div class="ob-dm-actions">
          <button class="ob-dm-back" id="obDmBack">← Go Back</button>
          <button class="ob-dm-override" id="obDmOverride">Log as Violation</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const remove = () => modal.remove();

    modal.querySelector('#obDmBack').onclick = () => { remove(); onProceed(false); };
    modal.querySelector('#obDmOverride').onclick = () => { remove(); onProceed(true); };
    modal.addEventListener('click', e => { if (e.target === modal) { remove(); onProceed(false); } });
  }

  // ─── patch handleTradeSubmit ─────────────────────────────────────────────────

  function patchTradeSubmit() {
    const original = window.handleTradeSubmit;
    if (typeof original !== 'function' || original.__disciplinePatched) return;

    const patched = function (event) {
      // Don't intercept Backtest — discipline rules don't apply there
      if (getMode() === 'Backtest') return original.apply(this, arguments);

      event.preventDefault();
      const state = computeDisciplineState();

      // Determine violation type (hard stop takes priority over daily limit)
      const violationType = state.hardStopTriggered ? 'stop'
                          : state.dailyLimitReached  ? 'daily'
                          : null;

      if (!violationType) {
        // No violation — submit normally
        return original.apply(this, arguments);
      }

      // Show confirmation modal
      showViolationModal(violationType, state, (proceed) => {
        if (!proceed) return;

        // User chose to override: let the original handler run,
        // then mark the newly created trade as a violation by pre-failing its checklist.
        const beforeIds = new Set((Array.isArray(window.trades) ? window.trades : []).map(t => t.id));
        original.apply(this, [event]);

        // Find the newly added trade and mark first checklist item as fail
        // so it immediately shows as a Violation in the rule status column.
        setTimeout(() => {
          const newTrade = (Array.isArray(window.trades) ? window.trades : [])
            .find(t => !beforeIds.has(t.id));
          if (newTrade) {
            if (!Array.isArray(newTrade.checklist) || newTrade.checklist.length === 0) {
              const steps = typeof window.checklistFor === 'function'
                ? window.checklistFor(newTrade.strategy)
                : [];
              newTrade.checklist = steps.map(() => 'notset');
            }
            // Mark it as a post-stop/over-limit violation
            newTrade.disciplineViolation = violationType;
            if (typeof window.saveState === 'function') window.saveState();
            // Re-render to show updated rule status
            if (typeof window.renderAll === 'function') window.renderAll();
          }
          // Refresh banner/panel
          refresh();
        }, 80);
      });
    };

    patched.__disciplinePatched = true;
    window.handleTradeSubmit = patched;
  }

  // ─── main refresh ────────────────────────────────────────────────────────────

  function refresh() {
    const state = computeDisciplineState();
    injectStyles();
    renderBanner(state);
    updateDisciplinePanel(state);
    updateHomeDiscipline(state);
  }

  // ─── patch render functions ──────────────────────────────────────────────────

  function patchRenders() {
    ['renderAll', 'renderTradingConsole', 'renderHomeOverview'].forEach(name => {
      const original = window[name];
      if (typeof original !== 'function' || original.__disciplineEnginePatched) return;
      const patched = function (...args) {
        const result = original.apply(this, args);
        // Schedule after the original render completes
        setTimeout(refresh, 0);
        return result;
      };
      patched.__disciplineEnginePatched = true;
      window[name] = patched;
    });
  }

  function patchMode() {
    const original = window.switchMode;
    if (typeof original !== 'function' || original.__disciplineModePatched) return;
    const patched = function (...args) {
      const result = original.apply(this, args);
      // Reset banner dismiss when switching modes
      window.__obDisciplineBannerDismissed = false;
      setTimeout(refresh, 60);
      return result;
    };
    patched.__disciplineModePatched = true;
    window.switchMode = patched;
  }

  // ─── boot ────────────────────────────────────────────────────────────────────

  function boot() {
    injectStyles();
    patchTradeSubmit();
    patchRenders();
    patchMode();
    refresh();

    // Re-run after all other scripts have had time to finish their own patches
    [200, 600, 1200, 2000].forEach(ms => setTimeout(() => {
      patchTradeSubmit();
      patchRenders();
      patchMode();
      refresh();
    }, ms));

    window.addEventListener('wallet-accounts-updated', () => setTimeout(refresh, 50));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
