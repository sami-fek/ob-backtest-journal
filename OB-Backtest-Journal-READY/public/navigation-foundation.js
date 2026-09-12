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
  function panelContaining(selector){
    const el = first(selector);
    return el?.closest('.panel') || el;
  }

  addId(wrap, 'nav-home');
  const context = addId(first('#phase1-context')?.closest('.panel') || first('#phase1-context'), 'nav-trading');
  const addForm = panelContaining('#f-add');
  const logPanel = panelContaining('#table-wrap');
  const analyticsPanel = panelContaining('#equity') || panelContaining('.breakdown-grid');
  const violationPanel = panelContaining('#vio-summary');
  if (addForm && !context) addId(addForm, 'nav-trading');
  addId(addForm, 'nav-trading-form');
  addId(logPanel, 'nav-journal');
  addId(analyticsPanel, 'nav-analytics');
  addId(violationPanel, 'nav-discipline');

  const nav = document.createElement('nav');
  nav.id = 'phase1-nav';
  nav.setAttribute('aria-label','Trading system navigation');
  nav.innerHTML = `
    <span class="phase1-nav-brand">OB SYSTEM</span>
    <button class="phase1-nav-btn" data-nav-target="nav-home">Home</button>
    <button class="phase1-nav-btn" data-nav-target="nav-trading">Trading</button>
    <button class="phase1-nav-btn" data-nav-target="nav-journal">Journal</button>
    <button class="phase1-nav-btn" data-nav-target="nav-trading-form">Backtest</button>
    <button class="phase1-nav-btn" data-nav-target="nav-analytics">Analytics</button>
    <button class="phase1-nav-btn" data-nav-action="accounts">Accounts</button>
    <button class="phase1-nav-btn" data-nav-action="strategies">Strategies</button>
    <button class="phase1-nav-btn future" type="button" title="Settings will be added in a later Phase">Settings</button>
    <span class="phase1-nav-status">Phase 1 foundation</span>
  `;
  wrap.insertBefore(nav, wrap.firstElementChild);

  function scrollToId(id){
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('phase1-section-focus');
    el.scrollIntoView({behavior:'smooth',block:'start'});
  }

  nav.querySelectorAll('[data-nav-target]').forEach(btn => {
    btn.addEventListener('click',()=>{
      nav.querySelectorAll('.phase1-nav-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      scrollToId(btn.dataset.navTarget);
    });
  });

  nav.querySelector('[data-nav-action="accounts"]')?.addEventListener('click',()=>{
    const managerBtn = document.getElementById('phase1-manage');
    if (managerBtn && !document.getElementById('phase1-manager')?.offsetParent) managerBtn.click();
    scrollToId('nav-trading');
  });
  nav.querySelector('[data-nav-action="strategies"]')?.addEventListener('click',()=>{
    const managerBtn = document.getElementById('phase1-manage');
    if (managerBtn && !document.getElementById('phase1-manager')?.offsetParent) managerBtn.click();
    scrollToId('nav-trading');
  });

  const observer = new IntersectionObserver(entries=>{
    const visible = entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if (!visible) return;
    const btn = nav.querySelector(`[data-nav-target="${visible.target.id}"]`);
    if (!btn) return;
    nav.querySelectorAll('.phase1-nav-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  },{rootMargin:'-82px 0px -55% 0px',threshold:[0,.25,.5]});

  ['nav-home','nav-trading','nav-journal','nav-trading-form','nav-analytics'].forEach(id=>{
    const el=document.getElementById(id); if(el) observer.observe(el);
  });
})();
