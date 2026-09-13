(() => {
  const ROOT_ID = 'journalPnlHeatmap';
  const STYLE_ID = 'journal-pnl-heatmap-style';
  let viewDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let booted = false;

  function getMode() { try { return typeof activeMode !== 'undefined' ? activeMode : 'Demo'; } catch (_) { return 'Demo'; } }
  function getTrades() { try { return Array.isArray(trades) ? trades : []; } catch (_) { return []; } }
  function getAccountId(mode) { if (mode === 'Backtest') return null; return localStorage.getItem(`my_journal_active_account_${mode}_v1`) || null; }
  function getAccounts() { try { return JSON.parse(localStorage.getItem('my_journal_accounts_v1') || '{}'); } catch (_) { return {}; } }
  function riskPercentValue() { try { return Number(riskPercent) || 1; } catch (_) { return 1; } }
  function initialCapitalValue() { try { return Number(initialCapital) || 100000; } catch (_) { return 100000; } }
  function startingBalanceForTrade(t) {
    if (t.mode === 'Backtest') return initialCapitalValue();
    const data = getAccounts(), list = Array.isArray(data[t.mode]) ? data[t.mode] : [], account = list.find(a => a.id === t.accountId);
    return Number(account?.startingBalance ?? account?.balance ?? 100000) || 100000;
  }
  function relevantTrades() {
    const mode = getMode(), accountId = getAccountId(mode);
    return getTrades().filter(t => t.mode === mode && (mode === 'Backtest' || !accountId || t.accountId === accountId));
  }
  function tradePnl(t) { return (Number(t.rMultiple) || 0) * startingBalanceForTrade(t) * (riskPercentValue() / 100); }
  function monthData() {
    const y=viewDate.getFullYear(), m=viewDate.getMonth(), days=new Date(y,m+1,0).getDate(), firstDay=new Date(y,m,1).getDay(), stats={};
    relevantTrades().forEach(t => { if(!t.date)return; const p=String(t.date).split('-').map(Number); if(p.length!==3||p[0]!==y||p[1]!==m+1)return; const d=p[2]; if(!stats[d])stats[d]={pnl:0,count:0}; stats[d].pnl+=tradePnl(t); stats[d].count+=1; });
    return {y,m,days,firstDay,stats};
  }
  function money(v) { if(!v)return '$0'; const sign=v>0?'+':'-'; return `${sign}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`; }
  function injectStyles() {
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style'); style.id=STYLE_ID; style.textContent=`
      #${ROOT_ID}{font-family:inherit}
      #${ROOT_ID} .jh-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr)) 82px;gap:2px}
      #${ROOT_ID} .jh-head{padding:7px 6px;text-align:center;font-size:10px;font-weight:800;color:#94a3b8;border-bottom:1px solid #e2e8f0}
      #${ROOT_ID} .jh-cell{min-height:72px;padding:7px;border:1px solid #e2e8f0;background:#fff;display:flex;flex-direction:column;justify-content:space-between}
      #${ROOT_ID} .jh-empty{background:#f8fafc}.jh-day{font:700 10px 'JetBrains Mono',monospace;color:#64748b}.jh-pnl{font:800 12px 'JetBrains Mono',monospace}.jh-count{font:700 9px 'JetBrains Mono',monospace;color:#94a3b8}
      #${ROOT_ID} .jh-win{background:#eaf7f0;border-color:#c6e8d5}.jh-win .jh-pnl{color:#159570}.jh-loss{background:#fff0f1;border-color:#f3c8ce}.jh-loss .jh-pnl{color:#df5a66}.jh-flat{background:#fff}.jh-flat .jh-pnl{color:#94a3b8}
      #${ROOT_ID} .jh-week{background:#fafafa;padding:8px;border:1px solid #e2e8f0;display:flex;flex-direction:column;justify-content:space-between}.jh-week-label{font-size:9px;color:#94a3b8;font-weight:800}.jh-week-pnl{font:800 12px 'JetBrains Mono',monospace;color:#159570}.jh-week-count{font:700 9px 'JetBrains Mono',monospace;color:#94a3b8}
      #${ROOT_ID} .jh-nav{width:28px;height:28px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#64748b;display:grid;place-items:center;cursor:pointer}.jh-nav:hover{background:#f8fafc;color:#2563eb;border-color:#bfdbfe}
      @media(max-width:700px){#${ROOT_ID} .jh-grid{grid-template-columns:repeat(7,minmax(45px,1fr));overflow-x:auto}#${ROOT_ID} .jh-week{display:none}#${ROOT_ID} .jh-cell{min-height:62px;padding:5px}#${ROOT_ID} .jh-pnl{font-size:10px}}
    `; document.head.appendChild(style);
  }
  function build() {
    injectStyles(); const {y,m,days,firstDay,stats}=monthData(), monthName=new Date(y,m,1).toLocaleDateString('en-US',{month:'long',year:'numeric'}), all=Object.values(stats), totalPnl=all.reduce((s,x)=>s+x.pnl,0), totalTrades=all.reduce((s,x)=>s+x.count,0);
    let cells=''; for(let i=0;i<firstDay;i++)cells+='<div class="jh-cell jh-empty"></div>';
    for(let d=1;d<=days;d++){const st=stats[d]||{pnl:0,count:0},cls=st.pnl>0?'jh-win':st.pnl<0?'jh-loss':'jh-flat',pnl=st.count?money(st.pnl):'$0';cells+=`<div class="jh-cell ${cls}"><div class="jh-day">${d}</div><div class="jh-pnl">${pnl}</div><div class="jh-count">${st.count?`${st.count} trade${st.count===1?'':'s'}`:'No trades'}</div></div>`;}
    const rows=Math.ceil((firstDay+days)/7); for(let r=0;r<rows;r++){let wp=0,wt=0;const start=r*7-firstDay+1;for(let d=start;d<start+7;d++)if(d>=1&&d<=days&&stats[d]){wp+=stats[d].pnl;wt+=stats[d].count;}cells+=`<div class="jh-week"><div class="jh-week-label">Week ${r+1}</div><div class="jh-week-pnl">${money(wp)}</div><div class="jh-week-count">${wt} trade${wt===1?'':'s'}</div></div>`;}
    return `<section id="${ROOT_ID}" class="glass-card p-5"><div class="flex items-center justify-between gap-3 mb-4"><div><h2 class="text-sm font-bold text-slate-900">P&L Calendar Heatmap</h2><p class="text-xs text-slate-400 mt-1">Daily P&L and trade activity</p></div><div class="flex items-center gap-2"><button type="button" class="jh-nav" data-jh-prev><i class="fa-solid fa-chevron-left text-[9px]"></i></button><div class="text-xs font-bold text-slate-700 min-w-[110px] text-center">${monthName}</div><button type="button" class="jh-nav" data-jh-next><i class="fa-solid fa-chevron-right text-[9px]"></i></button><button type="button" class="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-500" data-jh-today>This month</button></div></div><div class="flex items-center gap-2 mb-4 text-[10px] font-mono text-slate-400"><span>Monthly P&L: <b class="text-slate-700">${money(totalPnl)}</b></span><span>•</span><span>${totalTrades} trades</span></div><div class="jh-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div class="jh-head">${x}</div>`).join('')}<div class="jh-head">WEEK</div>${cells}</div></section>`;
  }
  function targetRow(){const trading=document.getElementById('pageTrading');const canvas=document.getElementById('chartEquityConsole');const eq=canvas?.closest('.glass-card');return trading&&eq?eq.parentNode:null;}
  function mount(){
    const trading=document.getElementById('pageTrading'); if(!trading)return;
    injectStyles(); const old=document.getElementById(ROOT_ID); if(old)old.remove();
    const frag=document.createRange().createContextualFragment(build()); const root=frag.firstElementChild; const row=targetRow();
    if(row)row.appendChild(root); else trading.appendChild(root);
    bind();
  }
  function bind(){const root=document.getElementById(ROOT_ID);if(!root)return;root.querySelector('[data-jh-prev]')?.addEventListener('click',()=>{viewDate.setMonth(viewDate.getMonth()-1);mount();});root.querySelector('[data-jh-next]')?.addEventListener('click',()=>{viewDate.setMonth(viewDate.getMonth()+1);mount();});root.querySelector('[data-jh-today]')?.addEventListener('click',()=>{const n=new Date();viewDate=new Date(n.getFullYear(),n.getMonth(),1);mount();});}
  function patchTab(){const original=window.switchTab;if(typeof original!=='function'||original.__journalHeatmapPatched)return;const wrapped=function(...args){const result=original.apply(this,args);setTimeout(mount,30);return result;};wrapped.__journalHeatmapPatched=true;window.switchTab=wrapped;}
  function patchMode(){const original=window.switchMode;if(typeof original!=='function'||original.__journalHeatmapModePatched)return;const wrapped=function(...args){const result=original.apply(this,args);setTimeout(mount,30);return result;};wrapped.__journalHeatmapModePatched=true;window.switchMode=wrapped;}
  function boot(){if(booted)return;booted=true;patchTab();patchMode();mount();window.addEventListener('wallet-accounts-updated',()=>setTimeout(mount,30));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
