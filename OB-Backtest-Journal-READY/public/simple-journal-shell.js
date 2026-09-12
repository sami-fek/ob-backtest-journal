// Simple journal shell: turns the existing journal into focused pages without replacing its data or core logic.
(function simpleJournalShell(){
  if (document.getElementById('simple-journal-shell')) return;

  const style = document.createElement('style');
  style.id = 'simple-journal-shell-styles';
  style.textContent = `
    body.simple-journal{padding:0 20px 48px;background:
      radial-gradient(900px 500px at 8% -10%,rgba(215,230,253,.95) 0%,transparent 62%),
      radial-gradient(850px 520px at 100% 0%,rgba(219,234,254,.9) 0%,transparent 58%),var(--bg)}
    .simple-shell{max-width:1180px;margin:0 auto;padding-top:18px}
    .simple-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 14px;padding:4px 2px}
    .simple-brand{display:flex;align-items:center;gap:10px}.simple-logo{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(145deg,#5b8df6,#2f6fed);color:#fff;font-weight:800;box-shadow:0 8px 18px -10px rgba(47,111,237,.7)}
    .simple-title{font-size:17px;font-weight:750;letter-spacing:-.02em;color:#0B1E4D}.simple-sub{font-size:10.5px;color:var(--ink-faint);margin-top:2px}
    .simple-nav{display:flex;gap:5px;overflow-x:auto;padding:6px;border:1px solid var(--line-strong);border-radius:15px;background:rgba(255,255,255,.76);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 10px 30px -20px rgba(30,64,175,.45);margin-bottom:16px}
    .simple-nav button{border:1px solid transparent;background:transparent;color:var(--ink-soft);border-radius:10px;padding:9px 13px;font:650 11px inherit;cursor:pointer;white-space:nowrap;transition:.15s ease}
    .simple-nav button:hover{background:rgba(47,111,237,.07);color:var(--accent)}.simple-nav button.active{background:rgba(47,111,237,.11);border-color:rgba(47,111,237,.18);color:var(--accent)}
    .simple-page{display:none;animation:simpleFade .16s ease}.simple-page.active{display:block}@keyframes simpleFade{from{opacity:.4;transform:translateY(2px)}to{opacity:1;transform:none}}
    .simple-page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:0 2px 12px}.simple-page-head h1{font-size:22px;margin:0;color:#0B1E4D;letter-spacing:-.025em}.simple-page-head p{font-size:11px;color:var(--ink-faint);margin:4px 0 0}
    .simple-mode-badge{padding:6px 10px;border-radius:999px;background:rgba(47,111,237,.09);border:1px solid rgba(47,111,237,.16);font-size:10px;font-weight:700;color:var(--accent);white-space:nowrap}
    .simple-shell .panel{box-shadow:0 12px 32px -22px rgba(30,64,175,.38);margin-bottom:12px}
    .simple-shell .stats{margin-bottom:12px}.simple-shell .top{display:none}
    .simple-note{font-size:11px;color:var(--ink-faint);padding:10px 12px;border:1px dashed var(--line-strong);border-radius:12px;background:rgba(255,255,255,.42);margin-bottom:12px}
    .simple-placeholder{padding:34px 18px;text-align:center;border:1px dashed var(--line-strong);border-radius:16px;background:rgba(255,255,255,.42);color:var(--ink-faint);font-size:12px}
    @media(max-width:700px){body.simple-journal{padding:0 10px 32px}.simple-shell{padding-top:10px}.simple-head{margin-bottom:9px}.simple-nav{margin-bottom:12px}.simple-nav button{padding:8px 10px}.simple-page-head h1{font-size:19px}.simple-page-head{align-items:flex-start}.simple-mode-badge{font-size:9px}}
  `;
  document.head.appendChild(style);
  document.body.classList.add('simple-journal');

  const wrap = document.querySelector('.wrap');
  if (!wrap) return;
  document.getElementById('phase1-nav')?.remove();
  document.getElementById('backup-panel')?.classList.add('simple-hidden-tool');
  document.getElementById('mt5-panel')?.classList.add('simple-hidden-tool');

  const shell = document.createElement('div'); shell.id='simple-journal-shell'; shell.className='simple-shell';
  const head=document.createElement('div'); head.className='simple-head';
  head.innerHTML='<div class="simple-brand"><div class="simple-logo">OB</div><div><div class="simple-title">OB Trading Journal</div><div class="simple-sub">Backtest · Demo · Real</div></div></div>';
  shell.appendChild(head);
  const nav=document.createElement('nav'); nav.className='simple-nav'; nav.setAttribute('aria-label','Journal navigation');
  const pages=[
    ['dashboard','Dashboard','Overview & performance'],
    ['backtest','Backtest','Log and review backtests'],
    ['demo','Demo','Practice execution'],
    ['real','Real','Live trade journal'],
    ['violations','Rule Violations','Discipline history'],
    ['analytics','Analytics','Performance breakdowns']
  ];
  pages.forEach(([id,label])=>{const b=document.createElement('button');b.type='button';b.dataset.page=id;b.textContent=label;nav.appendChild(b)});
  shell.appendChild(nav);

  const pageEls={};
  pages.forEach(([id,label,desc])=>{const p=document.createElement('section');p.className='simple-page';p.dataset.page=id;p.innerHTML=`<div class="simple-page-head"><div><h1>${label}</h1><p>${desc}</p></div>${['backtest','demo','real'].includes(id)?`<span class="simple-mode-badge">${label}</span>`:''}</div>`;shell.appendChild(p);pageEls[id]=p});

  // Keep the original wrapper as the application host, but put its existing panels into focused page containers.
  const existing=[...wrap.children]; existing.forEach(el=>{ if(el!==shell && !el.matches('#simple-journal-shell')) el.dataset.simpleOriginalParent='wrap'; });
  wrap.innerHTML=''; wrap.appendChild(shell);

  function panel(selector){return document.querySelector(selector)?.closest('.panel') || document.querySelector(selector)}
  function panelsBy(selectors){return selectors.map(panel).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i)}
  function move(el,target){if(el && target && el.parentNode!==target) target.appendChild(el)}

  const top=existing.find(x=>x.classList?.contains('top'));
  const stats=existing.find(x=>x.classList?.contains('stats'));
  const equity=panel('#equity');
  const context=panel('#phase1-context');
  const form=panel('#f-add');
  const log=panel('#table-wrap');
  const ai=panel('#ai-coach-panel');
  const analytics=panelsBy(['#analytics-panel','#analytics-comparison','#analytics-risk-panel','#analytics-insights-panel']);
  const discipline=panelsBy(['#discipline-panel','#discipline-dashboard-panel','#discipline-trend-panel','#discipline-breakdown-panel','#vio-summary']);
  const otherDiscipline=[...document.querySelectorAll('.panel')].filter(p=>/discipline|violation/i.test((p.id||'')+' '+(p.textContent||'')) && !analytics.includes(p));
  const backup=document.getElementById('backup-panel'); const mt5=document.getElementById('mt5-panel');

  if(stats) move(stats,pageEls.dashboard);
  if(equity) move(equity,pageEls.dashboard);
  if(top) top.remove();

  // Trading workspace is intentionally shared by the three modes; only the selected account changes.
  [context,form,log,ai].forEach(x=>move(x,pageEls.backtest));
  analytics.forEach(x=>move(x,pageEls.analytics));
  [...discipline,...otherDiscipline].forEach(x=>move(x,pageEls.violations));
  // Legacy settings/admin tools are not journal tabs anymore. Keep them available in the DOM for compatibility,
  // but don't surface them as primary sections.
  [backup,mt5].forEach(x=>{if(x)x.style.display='none'});

  function accounts(){return Array.isArray(window.phase1Accounts)?window.phase1Accounts:[]}
  function setMode(type){
    const list=accounts(); const acc=list.find(a=>String(a.type).toLowerCase()===type.toLowerCase());
    if(!acc) return false;
    try{
      if(typeof phase1Context!=='undefined') phase1Context.accountId=acc.id;
      if(typeof phase1EnsureContext==='function') phase1EnsureContext();
      if(typeof phase1Set==='function') phase1Set('ob-context',phase1Context);
      if(typeof phase1RenderControls==='function') phase1RenderControls();
      if(typeof render==='function') render();
    }catch(e){console.warn('Simple journal mode switch:',e)}
    return true;
  }

  function activate(id,updateHash=true){
    if(!pageEls[id]) id='dashboard';
    Object.entries(pageEls).forEach(([k,p])=>p.classList.toggle('active',k===id));
    nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
    if(['backtest','demo','real'].includes(id)) setMode(id);
    // The shared trading workspace follows the selected mode and remains in that page.
    if(['backtest','demo','real'].includes(id)) [context,form,log,ai].forEach(x=>move(x,pageEls[id]));
    if(updateHash){try{history.replaceState(null,'',`#${id}`)}catch{}}
    window.scrollTo({top:0,behavior:'smooth'});
  }
  nav.addEventListener('click',e=>{const b=e.target.closest('button[data-page]');if(b)activate(b.dataset.page)});
  const initial=(location.hash||'').slice(1); activate(pageEls[initial]?initial:'dashboard',false);

  // Re-home dynamically created panels (analytics/discipline modules may render after this shell).
  const observer=new MutationObserver(()=>{
    const a=panel('#analytics-panel'); if(a)move(a,pageEls.analytics);
    ['#analytics-comparison','#analytics-risk-panel','#analytics-insights-panel'].forEach(s=>{const x=document.getElementById(s);if(x)move(x,pageEls.analytics)});
    ['#discipline-panel','#discipline-dashboard-panel','#discipline-trend-panel','#discipline-breakdown-panel'].forEach(s=>{const x=document.getElementById(s);if(x)move(x,pageEls.violations)});
    const bp=document.getElementById('backup-panel'),mp=document.getElementById('mt5-panel'); if(bp)bp.style.display='none';if(mp)mp.style.display='none';
  });
  observer.observe(wrap,{childList:true,subtree:true});
  window.simpleJournalShell={activate};
})();
