(() => {
  const GRID_ID = 'calendarHeatmapGrid';
  const STYLE_ID = 'journal-pnl-heatmap-style-v2';
  let viewDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let booted = false;

  const getMode = () => { try { return typeof activeMode !== 'undefined' ? activeMode : 'Demo'; } catch (_) { return 'Demo'; } };
  const getTrades = () => { try { return Array.isArray(trades) ? trades : []; } catch (_) { return []; } };
  const getAccounts = () => { try { return JSON.parse(localStorage.getItem('my_journal_accounts_v1') || '{}'); } catch (_) { return {}; } };
  const getAccountId = mode => mode === 'Backtest' ? null : (localStorage.getItem(`my_journal_active_account_${mode}_v1`) || null);
  const getRisk = () => { try { return Number(riskPercent) || 1; } catch (_) { return 1; } };
  const getCapital = () => { try { return Number(initialCapital) || 100000; } catch (_) { return 100000; } };
  const baseFor = trade => {
    if (trade.mode === 'Backtest') return getCapital();
    const list = Array.isArray(getAccounts()[trade.mode]) ? getAccounts()[trade.mode] : [];
    const account = list.find(a => a.id === trade.accountId);
    return Number(account?.startingBalance ?? account?.balance ?? 100000) || 100000;
  };
  const pnlFor = trade => Number(trade.rMultiple || 0) * baseFor(trade) * (getRisk() / 100);

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${GRID_ID}.ob-jh-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px}
      #${GRID_ID} .ob-jh-head{padding:6px 3px;text-align:center;font-size:9px;font-weight:800;color:#94a3b8}
      #${GRID_ID} .ob-jh-cell{min-height:62px;padding:6px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;display:flex;flex-direction:column;justify-content:space-between}
      #${GRID_ID} .ob-jh-empty{background:#f8fafc;border-color:#f1f5f9}
      #${GRID_ID} .ob-jh-day{font:700 9px 'JetBrains Mono',monospace;color:#64748b}
      #${GRID_ID} .ob-jh-pnl{font:800 11px 'JetBrains Mono',monospace}
      #${GRID_ID} .ob-jh-count{font:700 8px 'JetBrains Mono',monospace;color:#94a3b8}
      #${GRID_ID} .ob-jh-win{background:#eaf7f0;border-color:#c6e8d5}.ob-jh-win .ob-jh-pnl{color:#159570}
      #${GRID_ID} .ob-jh-loss{background:#fff0f1;border-color:#f3c8ce}.ob-jh-loss .ob-jh-pnl{color:#df5a66}
      #${GRID_ID} .ob-jh-flat{background:#fff}.ob-jh-flat .ob-jh-pnl{color:#94a3b8}
      #${GRID_ID} .ob-jh-week{background:#fafafa;padding:7px;border:1px solid #e2e8f0;border-radius:8px;display:flex;flex-direction:column;justify-content:space-between}
      #${GRID_ID} .ob-jh-week-label{font-size:8px;color:#94a3b8;font-weight:800}.ob-jh-week-pnl{font:800 11px 'JetBrains Mono',monospace;color:#159570}.ob-jh-week-count{font:700 8px 'JetBrains Mono',monospace;color:#94a3b8}
      .ob-jh-nav{width:27px;height:27px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#64748b;display:grid;place-items:center;cursor:pointer}.ob-jh-nav:hover{color:#2563eb;border-color:#bfdbfe;background:#f8fafc}
      @media(max-width:700px){#${GRID_ID}.ob-jh-grid{grid-template-columns:repeat(8,minmax(43px,1fr));overflow-x:auto}.ob-jh-cell{min-height:56px;padding:5px}}
    `;
    document.head.appendChild(style);
  }

  function relevantTrades() {
    const mode = getMode();
    const accountId = getAccountId(mode);
    return getTrades().filter(t => t.mode === mode && (mode === 'Backtest' || !accountId || t.accountId === accountId));
  }

  function monthData() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const first = new Date(y, m, 1).getDay();
    const stats = {};
    relevantTrades().forEach(t => {
      const parts = String(t.date || '').split('-').map(Number);
      if (parts.length !== 3 || parts[0] !== y || parts[1] !== m + 1) return;
      const d = parts[2];
      if (!stats[d]) stats[d] = { pnl: 0, count: 0 };
      stats[d].pnl += pnlFor(t);
      stats[d].count++;
    });
    return { y, m, days, first, stats };
  }

  const money = value => !value ? '$0' : `${value > 0 ? '+' : '-'}$${Math.abs(Math.round(value)).toLocaleString('en-US')}`;

  function render() {
    const grid = document.getElementById(GRID_ID);
    const page = document.getElementById('pageTrading');
    if (!grid || !page) return;
    injectStyles();

    const card = grid.closest('.glass-card');
    if (card) card.style.display = '';

    const data = monthData();
    const monthName = new Date(data.y, data.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const all = Object.values(data.stats);
    const total = all.reduce((sum, x) => sum + x.pnl, 0);
    const count = all.reduce((sum, x) => sum + x.count, 0);

    const label = document.getElementById('heatmapMonthLabel');
    if (label) {
      label.textContent = `P&L Calendar Heatmap (${monthName})`;
      const controls = label.closest('.border-b')?.querySelector('.flex.items-center.gap-2.text-xs');
      if (controls && !controls.querySelector('[data-ob-jh-prev]')) {
        controls.innerHTML = `<button type="button" class="ob-jh-nav" data-ob-jh-prev aria-label="Previous month"><i class="fa-solid fa-chevron-left text-[9px]"></i></button><span class="font-mono text-[10px] text-slate-500 min-w-[96px] text-center">${monthName}</span><button type="button" class="ob-jh-nav" data-ob-jh-next aria-label="Next month"><i class="fa-solid fa-chevron-right text-[9px]"></i></button><button type="button" class="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-500" data-ob-jh-today>This month</button>`;
        controls.querySelector('[data-ob-jh-prev]').onclick = () => { viewDate.setMonth(viewDate.getMonth() - 1); render(); };
        controls.querySelector('[data-ob-jh-next]').onclick = () => { viewDate.setMonth(viewDate.getMonth() + 1); render(); };
        controls.querySelector('[data-ob-jh-today]').onclick = () => { const n = new Date(); viewDate = new Date(n.getFullYear(), n.getMonth(), 1); render(); };
      } else if (controls) {
        const span = controls.querySelector('span'); if (span) span.textContent = monthName;
      }
    }

    const empty = i => `<div class="ob-jh-cell ob-jh-empty"></div>`;
    let html = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => `<div class="ob-jh-head">${day}</div>`).join('') + '<div class="ob-jh-head">WEEK</div>';
    for (let i = 0; i < data.first; i++) html += empty(i);
    for (let d = 1; d <= data.days; d++) {
      const s = data.stats[d] || { pnl: 0, count: 0 };
      const cls = s.pnl > 0 ? 'ob-jh-win' : s.pnl < 0 ? 'ob-jh-loss' : 'ob-jh-flat';
      html += `<div class="ob-jh-cell ${cls}"><div class="ob-jh-day">${d}</div><div class="ob-jh-pnl">${s.count ? money(s.pnl) : '$0'}</div><div class="ob-jh-count">${s.count ? `${s.count} trade${s.count === 1 ? '' : 's'}` : 'No trades'}</div></div>`;
    }
    const rows = Math.ceil((data.first + data.days) / 7);
    for (let row = 0; row < rows; row++) {
      let wp = 0, wt = 0;
      const start = row * 7 - data.first + 1;
      for (let d = start; d < start + 7; d++) if (d >= 1 && d <= data.days && data.stats[d]) { wp += data.stats[d].pnl; wt += data.stats[d].count; }
      html += `<div class="ob-jh-week"><div class="ob-jh-week-label">Week ${row + 1}</div><div class="ob-jh-week-pnl">${money(wp)}</div><div class="ob-jh-week-count">${wt} trade${wt === 1 ? '' : 's'}</div></div>`;
    }
    grid.classList.add('ob-jh-grid');
    grid.innerHTML = html;

    const subtitle = card?.querySelector('p');
    if (subtitle) subtitle.textContent = `${count} trades • Monthly P&L ${money(total)} • account/mode filtered`;
  }

  function removeExtraHeatmaps() {
    document.querySelectorAll('#pageAnalytics .glass-card').forEach(card => {
      const text = card.textContent.toLowerCase();
      if (text.includes('full monthly performance heatmap')) card.style.display = 'none';
    });
    document.getElementById('journalPnlHeatmap')?.remove();
  }

  function patchNavigation(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.__obHeatmapPatched) return;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      setTimeout(() => { removeExtraHeatmaps(); render(); }, 40);
      return result;
    };
    wrapped.__obHeatmapPatched = true;
    window[name] = wrapped;
  }

  function boot() {
    if (booted) return;
    booted = true;
    removeExtraHeatmaps();
    render();
    patchNavigation('switchTab');
    patchNavigation('switchMode');
    window.addEventListener('wallet-accounts-updated', () => setTimeout(render, 50));
    window.addEventListener('resize', () => setTimeout(render, 20));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
