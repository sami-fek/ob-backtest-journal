// Phase 1 navigation foundation: organize the existing journal without replacing it.
(function phase1Navigation(){
  if (document.getElementById('phase1-nav')) return;

  const style = document.createElement('style');
  style.id = 'phase1-nav-styles';
  style.textContent = `
    .phase1-nav{position:sticky;top:10px;z-index:20;display:flex;align-items:center;gap:5px;overflow-x:auto;padding:6px;margin:0 0 14px;border:1px solid var(--line-strong);border-radius:14px;background:rgba(255,255,255,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 8px 24px -18px rgba(30,64,175,.4)}
    .phase1-nav-brand{font-size:11px;font-weight:700;color:#0B1E4D;padding:6px 9px;white-space:nowrap;margin-right:2px}
    .phase1-nav-btn{border:1px solid transparent;background:transparent;color:var(--ink-soft);border-radius:9px;padding:7px 10px;font:600 11px inherit;cursor:pointer;white-space:nowrap}
    .phase1-nav-btn:hover{background:rgba(47,111,237,.07);color:var(--accent)}
    .phase1-nav-btn.active{background:rgba(47,111,237,.1);border-color:rgba(47,111,237,.18);color:var(--accent)}
    .phase1-nav-btn.future{opacity:.5;cursor:default}
    .phase1-nav-status{margin-left:auto;font-size:10px;color:var(--ink-faint);padding:0 8px;white-space:nowrap}
    .phase1-section-focus{scroll-margin-top:82px}
    @media(max-width:700px){.phase1-nav{top:4px}.phase1-nav-status{display:none}.phase1-nav-brand{display:none}}
  `;
  document.head.appendChild(style);

  const wrap = document.querySelector('.wrap');
  if (!wrap) return;
  function first(selector){ return document.querySelector(selector); }
  function addId(el, id){ if (el && !el.id) el.id = id; return el; }
  function panelContaining(selector){ const el = first(selector); return el?.closest('.panel') || el; }

  addId(wrap, 'nav-home');
  const context = addId(first('#phase1-context')?.closest('.panel') || first('#phase1-context'), 'nav-trading');
  const addForm = panelContaining('#f-add');
  const logPanel = panelContaining('#table-wrap');
  const analyticsPanel = panelContaining('#equity') || panelContaining('.breakdown-grid');
  const violationPanel = panelContaining('#vio-summary');
  if (addForm && !context) addId(addForm, 'nav-trading');
  addId(addForm, 'nav-trading-form'); addId(logPanel, 'nav-journal'); addId(analyticsPanel, 'nav-analytics'); addId(violationPanel, 'nav-discipline');

  const nav = document.createElement('nav'); nav.id = 'phase1-nav'; nav.setAttribute('aria-label','Trading system navigation');
  nav.innerHTML = `<span class="phase1-nav-brand">OB SYSTEM</span><button class="phase1-nav-btn" data-nav-target="nav-home">Home</button><button class="phase1-nav-btn" data-nav-target="nav-trading">Trading</button><button class="phase1-nav-btn" data-nav-target="nav-journal">Journal</button><button class="phase1-nav-btn" data-nav-target="nav-trading-form">Backtest</button><button class="phase1-nav-btn" data-nav-target="nav-analytics">Analytics</button><button class="phase1-nav-btn" data-nav-action="accounts">Accounts</button><button class="phase1-nav-btn" data-nav-action="strategies">Strategies</button><button class="phase1-nav-btn" data-nav-action="settings">Settings</button><span class="phase1-nav-status">Trading system</span>`;
  wrap.insertBefore(nav, wrap.firstElementChild);

  function scrollToId(id){const el=document.getElementById(id);if(!el)return;el.classList.add('phase1-section-focus');el.scrollIntoView({behavior:'smooth',block:'start'})}
  nav.querySelectorAll('[data-nav-target]').forEach(btn=>btn.addEventListener('click',()=>{nav.querySelectorAll('.phase1-nav-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');scrollToId(btn.dataset.navTarget)}));
  nav.querySelector('[data-nav-action="accounts"]')?.addEventListener('click',()=>{document.getElementById('phase1-manage')?.click();scrollToId('nav-trading')});
  nav.querySelector('[data-nav-action="strategies"]')?.addEventListener('click',()=>{document.getElementById('phase1-manage')?.click();scrollToId('nav-trading')});
  nav.querySelector('[data-nav-action="settings"]')?.addEventListener('click',()=>document.getElementById('backup-panel')?.scrollIntoView({behavior:'smooth',block:'start'}));

  const observer = new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!visible)return;const btn=nav.querySelector(`[data-nav-target="${visible.target.id}"]`);if(!btn)return;nav.querySelectorAll('.phase1-nav-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active')},{rootMargin:'-82px 0px -55% 0px',threshold:[0,.25,.5]});
  ['nav-home','nav-trading','nav-journal','nav-trading-form','nav-analytics'].forEach(id=>{const el=document.getElementById(id);if(el)observer.observe(el)});

  // Phase 4 backup foundation: export/import user-owned local journal state.
  function read(k){try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}}
  function backup(){return {version:1,exportedAt:new Date().toISOString(),trades:read('ob-trades')||[],accounts:read('ob-accounts')||[],strategies:read('ob-strategies')||[],context:read('ob-context')||null,analyticsFilters:read('ob-analytics-filters')||null}}
  function exportBackup(){const blob=new Blob([JSON.stringify(backup(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`ob-trading-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);localStorage.setItem('ob-last-backup',new Date().toISOString());renderBackup()}
  function importBackup(file){const reader=new FileReader();reader.onload=()=>{try{const d=JSON.parse(reader.result);if(!d||!Array.isArray(d.trades))throw new Error('Invalid backup file');localStorage.setItem('ob-trades',JSON.stringify(d.trades));if(Array.isArray(d.accounts))localStorage.setItem('ob-accounts',JSON.stringify(d.accounts));if(Array.isArray(d.strategies))localStorage.setItem('ob-strategies',JSON.stringify(d.strategies));if(d.context)localStorage.setItem('ob-context',JSON.stringify(d.context));if(d.analyticsFilters)localStorage.setItem('ob-analytics-filters',JSON.stringify(d.analyticsFilters));window.location.reload()}catch(e){window.alert('Backup could not be restored: '+e.message)}};reader.readAsText(file)}
  function renderBackup(){let p=document.getElementById('backup-panel');if(!p){p=document.createElement('div');p.id='backup-panel';p.className='panel glass';const a=document.getElementById('analytics-comparison')||document.getElementById('analytics-panel')||document.querySelector('.wrap');a?.parentNode?.insertBefore(p,a?.nextSibling||null)}const last=localStorage.getItem('ob-last-backup');p.innerHTML=`<h2>Settings <small>backup & data ownership</small></h2><div class="backup-row"><div><strong>Journal backup</strong><span>Export trades, accounts, strategies and analytics context as JSON.</span><small>${last?'Last backup: '+new Date(last).toLocaleString():'No backup recorded yet'}</small></div><div class="backup-actions"><button id="backup-export" type="button">Export backup</button><button id="backup-import" type="button">Import backup</button><input id="backup-file" type="file" accept="application/json,.json" hidden></div></div>`;document.getElementById('backup-export').onclick=exportBackup;document.getElementById('backup-import').onclick=()=>document.getElementById('backup-file').click();document.getElementById('backup-file').onchange=e=>e.target.files[0]&&importBackup(e.target.files[0])}
  const bs=document.createElement('style');bs.textContent=`#backup-panel{margin-bottom:14px}.backup-row{display:flex;justify-content:space-between;gap:12px;align-items:center}.backup-row strong,.backup-row span,.backup-row small{display:block}.backup-row span{font-size:10px;color:var(--ink-soft);margin-top:3px}.backup-row small{font-size:9px;color:var(--ink-faint);margin-top:5px}.backup-actions{display:flex;gap:7px}.backup-actions button{border:1px solid var(--line-strong);background:rgba(255,255,255,.7);border-radius:8px;padding:8px 11px;font:600 10px inherit;color:var(--ink-soft);cursor:pointer}.backup-actions button:first-child{background:rgba(47,111,237,.1);color:var(--accent)}@media(max-width:650px){.backup-row{flex-direction:column;align-items:stretch}.backup-actions button{flex:1}}`;document.head.appendChild(bs);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderBackup,{once:true});else renderBackup();
})();
