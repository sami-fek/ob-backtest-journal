// Simple journal shell: journal-first navigation with Backtest, Demo and Real workspaces.
(function simpleJournalShell(){
  if (document.getElementById('simple-journal-shell')) return;
  const style=document.createElement('style');style.id='simple-journal-shell-styles';style.textContent=`
    body.simple-journal{padding:0 20px 48px;background:radial-gradient(900px 500px at 8% -10%,rgba(215,230,253,.95) 0%,transparent 62%),radial-gradient(850px 520px at 100% 0%,rgba(219,234,254,.9) 0%,transparent 58%),var(--bg)}
    .simple-shell{max-width:1180px;margin:0 auto;padding-top:18px}.simple-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 14px;padding:4px 2px}.simple-brand{display:flex;align-items:center;gap:10px}.simple-logo{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(145deg,#5b8df6,#2f6fed);color:#fff;font-weight:800;box-shadow:0 8px 18px -10px rgba(47,111,237,.7)}.simple-title{font-size:17px;font-weight:750;letter-spacing:-.02em;color:#0B1E4D}.simple-sub{font-size:10.5px;color:var(--ink-faint);margin-top:2px}
    .simple-nav{display:flex;gap:5px;overflow-x:auto;padding:6px;border:1px solid var(--line-strong);border-radius:15px;background:rgba(255,255,255,.76);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 10px 30px -20px rgba(30,64,175,.45);margin-bottom:16px}.simple-nav button{border:1px solid transparent;background:transparent;color:var(--ink-soft);border-radius:10px;padding:9px 14px;font:650 11px inherit;cursor:pointer;white-space:nowrap;transition:.15s ease}.simple-nav button:hover{background:rgba(47,111,237,.07);color:var(--accent)}.simple-nav button.active{background:rgba(47,111,237,.11);border-color:rgba(47,111,237,.18);color:var(--accent)}
    .simple-page{display:none;animation:simpleFade .16s ease}.simple-page.active{display:block}@keyframes simpleFade{from{opacity:.4;transform:translateY(2px)}to{opacity:1;transform:none}}.simple-page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:0 2px 12px}.simple-page-head h1{font-size:22px;margin:0;color:#0B1E4D;letter-spacing:-.025em}.simple-page-head p{font-size:11px;color:var(--ink-faint);margin:4px 0 0}.simple-mode-badge{padding:6px 10px;border-radius:999px;background:rgba(47,111,237,.09);border:1px solid rgba(47,111,237,.16);font-size:10px;font-weight:700;color:var(--accent);white-space:nowrap}
    .simple-shell .panel{box-shadow:0 12px 32px -22px rgba(30,64,175,.38);margin-bottom:12px}.simple-shell .stats{margin-bottom:12px}.simple-shell .top{display:none}.simple-hidden-tool{display:none!important}.simple-hidden-section{display:none!important}.simple-section-label{font-size:10px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint);margin:18px 2px 7px}.simple-page .simple-section-label:first-of-type{margin-top:8px}.simple-shell #table-wrap{overflow-x:auto}.simple-shell #table-wrap table{min-width:940px}.simple-shell #f-add{overflow:visible}.simple-log-btn-label{font-size:11px;font-weight:750;color:var(--accent);margin-left:6px}
    @media(max-width:700px){body.simple-journal{padding:0 10px 32px}.simple-shell{padding-top:10px}.simple-head{margin-bottom:9px}.simple-nav{margin-bottom:12px}.simple-nav button{padding:8px 11px}.simple-page-head h1{font-size:19px}.simple-page-head{align-items:flex-start}.simple-shell #table-wrap table{min-width:820px}}
  `;document.head.appendChild(style);document.body.classList.add('simple-journal');
  const wrap=document.querySelector('.wrap');if(!wrap)return;
  document.getElementById('phase1-nav')?.remove();
  [...wrap.querySelectorAll('.backdrop,.peek,.lightbox')].forEach(x=>document.body.appendChild(x));
  const shell=document.createElement('div');shell.id='simple-journal-shell';shell.className='simple-shell';
  const head=document.createElement('div');head.className='simple-head';head.innerHTML='<div class="simple-brand"><div class="simple-logo">OB</div><div><div class="simple-title">OB Trading Journal</div><div class="simple-sub">Journal · Checklist · Review · Analytics</div></div></div>';shell.appendChild(head);
  const nav=document.createElement('nav');nav.className='simple-nav';nav.setAttribute('aria-label','Journal navigation');
  const pages=[['dashboard','Dashboard','Overview'],['backtest','Backtest','Journal workspace'],['demo','Demo','Journal workspace'],['real','Real','Journal workspace']];
  pages.forEach(([id,label])=>{const b=document.createElement('button');b.type='button';b.dataset.page=id;b.textContent=label;nav.appendChild(b)});shell.appendChild(nav);
  const pageEls={};pages.forEach(([id,label,desc])=>{const p=document.createElement('section');p.className='simple-page'+(id!=='dashboard'?' simple-mode-page':'');p.dataset.page=id;p.innerHTML=`<div class="simple-page-head"><div><h1>${label}</h1><p>${desc}</p></div>${id!=='dashboard'?`<span class="simple-mode-badge">${label}</span>`:''}</div>`;shell.appendChild(p);pageEls[id]=p});
  wrap.innerHTML='';wrap.appendChild(shell);
  const panel=s=>{const e=document.querySelector(s);return e?.closest('.panel')||e};const unique=xs=>xs.filter((x,i,a)=>x&&a.indexOf(x)===i);const allPanels=()=>[...document.querySelectorAll('.panel')];
  function hideUnwantedPanels(){
    allPanels().forEach(p=>{const text=(p.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();if(text.startsWith('trading rules')||text.includes('trading rules system-wide'))p.classList.add('simple-hidden-section');});
    ['backup-panel','mt5-panel'].forEach(id=>{const x=document.getElementById(id);if(x)x.classList.add('simple-hidden-tool')});
    const insight=document.getElementById('analytics-insights-panel');if(insight)insight.remove();
  }
  function setMode(type){try{const list=(typeof phase1Accounts!=='undefined'&&Array.isArray(phase1Accounts))?phase1Accounts:[];const acc=list.find(a=>String(a.type).toLowerCase()===type.toLowerCase());if(!acc)return;if(typeof phase1Context!=='undefined')phase1Context.accountId=acc.id;if(typeof phase1EnsureContext==='function')phase1EnsureContext();if(typeof phase1Set==='function')phase1Set('ob-context',phase1Context);if(typeof phase1RenderControls==='function')phase1RenderControls();if(typeof render==='function')render();}catch(e){console.warn('Simple journal mode switch:',e)}}
  function label(text,key){const d=document.createElement('div');d.className='simple-section-label';d.textContent=text;d.dataset.simpleLabel=key;return d}
  function place(p,selector,key,title){const el=panel(selector);if(!el||el.classList.contains('simple-hidden-section'))return;p.querySelectorAll(`[data-simple-label="${key}"]`).forEach(x=>x.remove());p.appendChild(label(title,key));p.appendChild(el)}
  function arrangeMode(id){
    const p=pageEls[id];if(!p)return;hideUnwantedPanels();
    // Keep the core journal flow together and make the Trade Log the primary record view.
    place(p,'#phase1-context','context','Trading Context');
    place(p,'#simple-checklist-panel','checklist','Pre-Trade Checklist');
    place(p,'#table-wrap','trade-log','Trade Log');
    place(p,'#f-add','log-a-trade','Log A Trade');
    place(p,'#ai-coach-panel','ai','AI Coach');
    unique(['#analytics-panel','#analytics-comparison','#analytics-risk-panel'].map(panel)).forEach((el,i)=>{if(!el||el.classList.contains('simple-hidden-section'))return;const key=['analytics-main','analytics-comparison','analytics-risk'][i]||`analytics-${i}`;p.querySelectorAll(`[data-simple-label="${key}"]`).forEach(x=>x.remove());p.appendChild(label(i===0?'Analytics · Win Rate · Net R · Avg R':'Analytics detail',key));p.appendChild(el)});
    unique(['#discipline-panel','#discipline-dashboard-panel','#discipline-trend-panel','#discipline-breakdown-panel','#vio-summary'].map(panel)).forEach((el,i)=>{if(!el||el.classList.contains('simple-hidden-section'))return;const key=`violations-${i}`;p.querySelectorAll(`[data-simple-label="${key}"]`).forEach(x=>x.remove());p.appendChild(label(i===0?'Rule Violations':'Rule Violations detail',key));p.appendChild(el)});
  }
  function activate(id,hash=true){if(!pageEls[id])id='dashboard';Object.entries(pageEls).forEach(([k,p])=>p.classList.toggle('active',k===id));nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));if(id!=='dashboard'){setMode(id);arrangeMode(id)}if(hash){try{history.replaceState(null,'',`#${id}`)}catch{}}window.scrollTo({top:0,behavior:'smooth'})}
  nav.addEventListener('click',e=>{const b=e.target.closest('button[data-page]');if(b)activate(b.dataset.page)});const initial=(location.hash||'').slice(1);activate(pageEls[initial]?initial:'dashboard',false);
  let observer;
  observer=new MutationObserver(()=>{observer.disconnect();hideUnwantedPanels();['backtest','demo','real'].forEach(id=>{if(pageEls[id].classList.contains('active'))arrangeMode(id)});observer.observe(document.body,{childList:true,subtree:true});});
  observer.observe(document.body,{childList:true,subtree:true});
  window.simpleJournalShell={activate};
})();
