(() => {
  const STYLE_ID = 'calendar-heatmap-ui-v1';
  const HEATMAP_ID = 'calendarHeatmapEnhanced';
  let viewDate = new Date();
  let booted = false;

  const modes = ['Backtest', 'Demo', 'Real', 'Funded'];
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function mode() {
    try { return typeof activeMode !== 'undefined' ? activeMode : 'Demo'; } catch (_) { return 'Demo'; }
  }

  function selectedAccountId(m) {
    if (m === 'Backtest') return null;
    return localStorage.getItem(`my_journal_active_account_${m}_v1`) || null;
  }

  function accounts() {
    try { return JSON.parse(localStorage.getItem('my_journal_accounts_v1') || '{}'); } catch (_) { return {}; }
  }

  function risk() {
    try { return Number(riskPercent) || 1; } catch (_) { return 1; }
  }

  function baseForTrade(t) {
    if (t.mode === 'Backtest') {
      try { return Number(initialCapital) || 100000; } catch (_) { return 100000; }
    }
    const data = accounts();
    const list = Array.isArray(data[t.mode]) ? data[t.mode] : [];
    const acc = list.find(a => a.id === t.accountId);
    return Number(acc?.startingBalance ?? acc?.balance ?? 100000) || 100000;
  }

  function relevantTrades() {
    if (!Array.isArray(window.trades)) return [];
    const m = mode();
    const aid = selectedAccountId(m);
    return window.trades.filter(t => t.mode === m && (m === 'Backtest' || !aid || t.accountId === aid));
  }

  function tradeDate(t) {
    const d = new Date(`${t.date}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dayStats(y, m, d) {
    const key = `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayTrades = relevantTrades().filter(t => t.date === key);
    let pnl = 0;
    dayTrades.forEach(t => { pnl += (Number(t.rMultiple) || 0) * baseForTrade(t) * (risk() / 100); });
    return { count: dayTrades.length, pnl, trades: dayTrades };
  }

  function monthBounds() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    return { y, m, first: new Date(y,m,1), last: new Date(y,m+1,0), days: new Date(y,m+1,0).getDate() };
  }

  function formatMonth(y,m) { return new Date(y,m,1).toLocaleDateString('en-US',{month:'long',year:'numeric'}); }

  function pnlClass(pnl) {
    if (pnl > 0) return 'pnl-win';
    if (pnl < 0) return 'pnl-loss';
    return 'pnl-flat';
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${HEATMAP_ID}{font-family:inherit}
      #${HEATMAP_ID} .cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
      #${HEATMAP_ID} .cal-head{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;text-align:center;padding:2px 0}
      #${HEATMAP_ID} .cal-cell{min-height:58px;border:1px solid #e8edf4;border-radius:11px;background:#f8fafc;padding:7px;position:relative;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
      #${HEATMAP_ID} .cal-cell:not(.empty):hover{transform:translateY(-1px);box-shadow:0 5px 14px rgba(15,23,42,.08);border-color:#cbd5e1}
      #${HEATMAP_ID} .cal-cell.empty{background:transparent;border-color:transparent}
      #${HEATMAP_ID} .cal-day{font:700 10px/1 'JetBrains Mono',monospace;color:#64748b}
      #${HEATMAP_ID} .cal-pnl{font:800 10px/1.1 'JetBrains Mono',monospace;margin-top:7px}
      #${HEATMAP_ID} .cal-count{font:800 9px/1 'JetBrains Mono',monospace;margin-top:5px;color:#64748b}
      #${HEATMAP_ID} .pnl-win{background:#ecfdf5;border-color:#bbf7d0}.pnl-win .cal-pnl{color:#059669}
      #${HEATMAP_ID} .pnl-loss{background:#fff1f2;border-color:#fecdd3}.pnl-loss .cal-pnl{color:#e11d48}
      #${HEATMAP_ID} .pnl-flat{background:#f8fafc}.pnl-flat .cal-pnl{color:#94a3b8}
      #${HEATMAP_ID} .cal-today{box-shadow:inset 0 0 0 2px #93c5fd}
      #${HEATMAP_ID} .cal-nav{width:30px;height:30px;border:1px solid #e2e8f0;background:white;border-radius:9px;display:grid;place-items:center;color:#64748b;cursor:pointer;transition:all .16s ease}
      #${HEATMAP_ID} .cal-nav:hover{color:#2563eb;background:#eff6ff;border-color:#bfdbfe}
      #${HEATMAP_ID} .cal-summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      #${HEATMAP_ID} .cal-summary-pill{padding:5px 9px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font:700 9px 'JetBrains Mono',monospace;color:#64748b}
      @media(max-width:639px){#${HEATMAP_ID} .cal-grid{gap:3px}#${HEATMAP_ID} .cal-cell{min-height:48px;padding:5px;border-radius:8px}#${HEATMAP_ID} .cal-pnl{font-size:8px}#${HEATMAP_ID} .cal-count{font-size:8px}}
    `;
    document.head.appendChild(s);
  }

  function buildCalendar() {
    injectStyles();
    const {y,m,first,days} = monthBounds();
    const start = first.getDay();
    const stats = Array.from({length:days},(_,i)=>dayStats(y,m,i+1));
    const monthTrades = relevantTrades().filter(t => { const d=tradeDate(t); return d && d.getFullYear()===y && d.getMonth()===m; });
    const totalPnl = stats.reduce((s,x)=>s+x.pnl,0);
    const totalTrades = stats.reduce((s,x)=>s+x.count,0);
    const wins = monthTrades.filter(t=>t.result==='Win').length;
    const losses = monthTrades.filter(t=>t.result==='Loss').length;
    const today = new Date();

    let cells = '';
    for(let i=0;i<start;i++) cells += '<div class="cal-cell empty"></div>';
    for(let d=1;d<=days;d++){
      const st=stats[d-1], cls=pnlClass(st.pnl);
      const isToday=today.getFullYear()===y&&today.getMonth()===m&&today.getDate()===d;
      const pnl=st.pnl===0?'—':`${st.pnl>0?'+':''}$${Math.abs(st.pnl).toLocaleString('en-US',{maximumFractionDigits:0})}`;
      cells += `<div class="cal-cell ${cls} ${isToday?'cal-today':''}" title="${formatMonth(y,m)} ${d}: ${st.count} trade${st.count===1?'':'s'}, ${esc(pnl)}"><div class="cal-day">${d}</div><div class="cal-pnl">${pnl}</div>${st.count?`<div class="cal-count">${st.count} trade${st.count===1?'':'s'}</div>`:'<div class="cal-count">No trades</div>'}</div>`;
    }

    return `<div id="${HEATMAP_ID}" class="glass-card p-5 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2"><i class="fa-solid fa-calendar-days text-blue-600"></i> P&L Calendar Heatmap</h3>
          <p class="text-xs text-slate-400">Daily P&L and trade count for ${esc(formatMonth(y,m))}</p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="cal-nav" data-cal-prev aria-label="Previous month"><i class="fa-solid fa-chevron-left text-[9px]"></i></button>
          <div class="min-w-[125px] text-center text-xs font-bold text-slate-700">${esc(formatMonth(y,m))}</div>
          <button type="button" class="cal-nav" data-cal-next aria-label="Next month"><i class="fa-solid fa-chevron-right text-[9px]"></i></button>
        </div>
      </div>
      <div class="cal-summary">
        <span class="cal-summary-pill">${totalTrades} trades</span>
        <span class="cal-summary-pill">${wins}W · ${losses}L</span>
        <span class="cal-summary-pill">Net P&L: ${totalPnl>=0?'+':''}$${Math.abs(totalPnl).toLocaleString('en-US',{maximumFractionDigits:0})}</span>
      </div>
      <div class="cal-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div class="cal-head">${x}</div>`).join('')}${cells}</div>
      <div class="text-[9px] text-slate-400">Each day shows the number of trades taken and that day's aggregated P&L.</div>
    </div>`;
  }

  function findTradingHeatmapHost() {
    const existing = document.getElementById('calendarHeatmapEnhanced');
    if (existing) return existing;
    const heading = [...document.querySelectorAll('h3,h2')].find(el => el.textContent.toLowerCase().includes('p&l calendar heatmap'));
    return heading?.closest('.glass-card') || null;
  }

  function mountOnTrading() {
    const host = findTradingHeatmapHost();
    if (host && !host.id.includes(HEATMAP_ID)) {
      const parent = host.parentElement;
      if (!parent) return;
      host.replaceWith(document.createRange().createContextualFragment(buildCalendar()));
      return;
    }
    if (document.getElementById(HEATMAP_ID)) return;
    const trading = document.getElementById('pageTrading');
    if (!trading) return;
    const candidates = [...trading.querySelectorAll('.glass-card')];
    const pnl = candidates.find(c => c.textContent.includes('P&L Calendar') || c.textContent.includes('Portfolio Balance'));
    if (pnl?.parentElement) pnl.replaceWith(document.createRange().createContextualFragment(buildCalendar()));
  }

  function mountOnPage(pageId) {
    const page=document.getElementById(pageId); if(!page) return;
    const old=document.getElementById(`${HEATMAP_ID}-${pageId}`); if(old) old.remove();
    const node=document.createElement('div'); node.id=`${HEATMAP_ID}-${pageId}`; node.innerHTML=buildCalendar();
    page.insertBefore(node.firstElementChild,page.firstElementChild?.nextSibling || null);
  }

  function refreshAll() {
    const existing=document.getElementById(HEATMAP_ID);
    if(existing) existing.outerHTML=buildCalendar();
    mountOnTrading();
    mountOnPage('pageJournal');
    mountOnPage('pageAnalytics');
    bind();
  }

  function bind() {
    document.querySelectorAll(`#${HEATMAP_ID} [data-cal-prev]`).forEach(b=>b.onclick=()=>{viewDate.setMonth(viewDate.getMonth()-1);refreshAll();});
    document.querySelectorAll(`#${HEATMAP_ID} [data-cal-next]`).forEach(b=>b.onclick=()=>{viewDate.setMonth(viewDate.getMonth()+1);refreshAll();});
  }

  function patchRender(name) {
    const original=window[name];
    if(typeof original!=='function'||original.__calendarHeatmapPatched)return;
    const patched=function(...args){const r=original.apply(this,args);setTimeout(refreshAll,0);return r;};
    patched.__calendarHeatmapPatched=true;window[name]=patched;
  }

  function boot(){
    if(booted)return;booted=true;
    const now=new Date(); viewDate=new Date(now.getFullYear(),now.getMonth(),1);
    injectStyles();
    ['renderHeatmaps','renderTradingConsole','renderJournalTable','renderAnalyticsKPIs','updateCharts'].forEach(patchRender);
    refreshAll();
    const oldSwitch=window.switchMode;
    if(typeof oldSwitch==='function'&&!oldSwitch.__calendarModePatched){
      const patched=function(...args){const r=oldSwitch.apply(this,args);setTimeout(refreshAll,50);return r;};
      patched.__calendarModePatched=true;window.switchMode=patched;
    }
    const oldTab=window.switchTab;
    if(typeof oldTab==='function'&&!oldTab.__calendarTabPatched){
      const patched=function(...args){const r=oldTab.apply(this,args);setTimeout(refreshAll,50);return r;};
      patched.__calendarTabPatched=true;window.switchTab=patched;
    }
    window.addEventListener('wallet-accounts-updated',()=>setTimeout(refreshAll,50));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
