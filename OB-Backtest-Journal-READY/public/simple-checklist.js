// Simple journal checklist: lightweight pre-trade checklist shared by Backtest, Demo and Real.
(function simpleChecklist(){
  if (window.simpleChecklistReady) return;
  window.simpleChecklistReady = true;

  const templates = {
    'Model OB': [
      'HTF bias identified',
      'Relevant liquidity identified',
      'Liquidity swept',
      'Aggressive displacement',
      'Clear FVG created',
      'Relevant BOS confirmed',
      'Valid last opposing candle / OB',
      'OB + FVG POI marked',
      'Retracement reached POI',
      'Invalidation defined',
      'RR ≥ 1:2',
      'Risk ≤ 1%'
    ],
    'Model A': [
      'HTF bias identified',
      'Relevant liquidity identified',
      'Liquidity swept',
      'BOS confirmed',
      'Clean pullback into POI',
      'Entry trigger confirmed',
      'Invalidation defined',
      'SL beyond invalidation',
      'RR ≥ 1:2',
      'Risk ≤ 1%'
    ]
  };

  let current = [];
  let pending = null;

  function strategyName(){
    try { return typeof phase1Strategy === 'function' ? phase1Strategy(phase1Context.strategyId)?.name || 'Model OB' : 'Model OB'; }
    catch { return 'Model OB'; }
  }
  function ensurePanel(){
    const context = document.getElementById('phase1-context');
    const form = document.querySelector('#f-add')?.closest('.panel');
    const host = context?.parentNode || form?.parentNode;
    if (!host) return null;
    let panel = document.getElementById('simple-checklist-panel');
    if (!panel) { panel=document.createElement('div'); panel.id='simple-checklist-panel'; panel.className='panel glass simple-checklist-panel'; host.insertBefore(panel, form || null); }
    return panel;
  }
  function styles(){
    if(document.getElementById('simple-checklist-styles'))return;
    const s=document.createElement('style');s.id='simple-checklist-styles';s.textContent=`
      .simple-checklist-panel{margin-bottom:12px}.simple-checklist-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:9px}.simple-checklist-head h2{margin:0}.simple-checklist-head small{display:block;font-size:10px;color:var(--ink-faint);margin-top:3px}.simple-checklist-actions{display:flex;gap:5px}.simple-check-btn{border:1px solid var(--line-strong);background:rgba(255,255,255,.72);color:var(--ink-soft);border-radius:8px;padding:6px 9px;font:600 10px inherit;cursor:pointer}.simple-check-btn:hover{border-color:var(--accent);color:var(--accent)}.simple-check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.simple-check-item{display:flex;align-items:center;gap:8px;padding:8px 9px;border:1px solid var(--line);border-radius:9px;background:rgba(255,255,255,.45);font-size:11px;cursor:pointer}.simple-check-item input{accent-color:var(--accent);width:14px;height:14px;margin:0}.simple-check-item.checked{border-color:rgba(47,111,237,.2);background:rgba(47,111,237,.06)}.simple-check-foot{display:flex;justify-content:space-between;gap:8px;margin-top:8px;font-size:10px;color:var(--ink-faint)}.simple-check-count{font-weight:700;color:var(--ink-soft)}@media(max-width:650px){.simple-check-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }
  function render(){
    styles(); const p=ensurePanel(); if(!p)return;
    const name=strategyName(); const items=templates[name]||templates['Model OB'];
    if(current.length!==items.length) current=items.map((_,i)=>!!current[i]);
    p.innerHTML=`<div class="simple-checklist-head"><div><h2>Pre-trade checklist</h2><small>${escapeHtml(name)} · complete before logging the trade</small></div><div class="simple-checklist-actions"><button type="button" class="simple-check-btn" id="simple-check-all">All</button><button type="button" class="simple-check-btn" id="simple-check-clear">Clear</button></div></div><div class="simple-check-grid">${items.map((x,i)=>`<label class="simple-check-item ${current[i]?'checked':''}"><input type="checkbox" data-check-index="${i}" ${current[i]?'checked':''}><span>${escapeHtml(x)}</span></label>`).join('')}</div><div class="simple-check-foot"><span>Unchecked items are treated as checklist violations.</span><span class="simple-check-count">${current.filter(Boolean).length}/${items.length}</span></div>`;
    p.querySelectorAll('[data-check-index]').forEach(input=>input.onchange=()=>{current[Number(input.dataset.checkIndex)]=input.checked;render();});
    p.querySelector('#simple-check-all').onclick=()=>{current=items.map(()=>true);render();};
    p.querySelector('#simple-check-clear').onclick=()=>{current=items.map(()=>false);render();};
  }
  function snapshot(){
    const name=strategyName(); const items=templates[name]||templates['Model OB'];
    return {template:name,items:items.map((label,i)=>({label,checked:!!current[i]})),complete:current.length===items.length&&current.every(Boolean)};
  }
  const originalSave=typeof saveTrades==='function'?saveTrades:null;
  if(originalSave){
    window.saveTrades=async function(...args){
      if(pending&&Array.isArray(trades)&&trades.length){const t=trades[trades.length-1];t.checklist=pending; t.checklistComplete=pending.complete; pending=null;}
      return originalSave.apply(this,args);
    };
  }
  document.addEventListener('click',e=>{
    if(e.target?.id==='f-add') pending=snapshot();
  },true);

  window.simpleChecklist={get:snapshot,reset:()=>{current=[];render();}};
  const observer=new MutationObserver(()=>{ if(document.getElementById('f-add')) render(); });
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(render,100);
})();
