// Phase 3 foundation: one shared analytics filter context for every analytics view.
(function(){
  const KEY='ob-analytics-filters';
  const defaults={symbol:'all',strategy:'all',account:'current',mode:'all',session:'all',day:'all',timeframe:'all',regime:'all',direction:'all',from:'',to:''};
  const read=()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}};
  let state=read();
  const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
  const val=(t,...keys)=>{for(const k of keys){if(t[k]!==undefined&&t[k]!==null&&String(t[k])!=='')return String(t[k]);}return 'Unspecified'};
  function accountId(){return state.account==='current'?(window.phase1Context?.accountId||window.obContext?.accountId||null):state.account;}
  function base(){return typeof getFiltered==='function'?[...getFiltered()]:[]}
  function day(t){if(t.dayOfWeek)return String(t.dayOfWeek);const s=String(t.date||'').slice(0,10),d=new Date(s+'T00:00:00');return Number.isNaN(d.getTime())?'Unspecified':['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}
  function matches(t){
    const aid=val(t,'accountId');
    if(state.account!=='current'&&state.account!=='all'&&aid!==state.account)return false;
    if(state.symbol!=='all'&&val(t,'pair','symbol')!==state.symbol)return false;
    if(state.strategy!=='all'&&val(t,'strategyId','strategy')!==state.strategy)return false;
    if(state.mode!=='all'&&val(t,'mode','source').toLowerCase()!==state.mode.toLowerCase())return false;
    if(state.session!=='all'&&val(t,'session')!==state.session)return false;
    if(state.day!=='all'&&day(t)!==state.day)return false;
    if(state.timeframe!=='all'&&val(t,'timeframe','tf')!==state.timeframe)return false;
    if(state.regime!=='all'&&val(t,'marketRegime','regime')!==state.regime)return false;
    if(state.direction!=='all'&&val(t,'direction','dir').toLowerCase()!==state.direction.toLowerCase())return false;
    const date=String(t.date||'').slice(0,10);if(state.from&&date<state.from)return false;if(state.to&&date>state.to)return false;
    return true;
  }
  function options(list,field){return [...new Set(list.map(t=>val(t,...field)))].filter(Boolean).sort()}
  function render(){
    let p=document.getElementById('analytics-filter-bar');if(!p){p=document.createElement('div');p.id='analytics-filter-bar';p.className='panel glass';const a=document.getElementById('analytics-panel');if(a)a.parentNode.insertBefore(p,a);else document.body.prepend(p)}
    const all=base();const symbols=options(all,['pair','symbol']), strategies=options(all,['strategyId','strategy']), sessions=options(all,['session']), tfs=options(all,['timeframe','tf']), regimes=options(all,['marketRegime','regime']);
    const modes=['Backtest','Demo','Real','Funded'].filter(x=>all.some(t=>val(t,'mode','source').toLowerCase()===x.toLowerCase()));
    const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].filter(x=>all.some(t=>day(t)===x));
    const select=(id,label,opts)=>`<div class="af-field"><label>${label}</label><select id="${id}"><option value="all">All</option>${opts.map(x=>`<option value="${escapeHtml(String(x))}">${escapeHtml(String(x))}</option>`).join('')}</select></div>`;
    p.innerHTML=`<div class="af-head"><div><strong>Analytics filters</strong><span>One filter context powers every analytics view</span></div><button id="af-clear" type="button">Clear all</button></div><div class="af-grid">${select('af-symbol','Pair',symbols)}${select('af-strategy','Strategy',strategies)}${select('af-mode','Mode',modes)}${select('af-session','Session',sessions)}${select('af-day','Day',days)}${select('af-tf','Timeframe',tfs)}${select('af-regime','Market regime',regimes)}${select('af-direction','Direction',['Long','Short'])}<div class="af-field"><label>From</label><input id="af-from" type="date" value="${escapeHtml(state.from)}"></div><div class="af-field"><label>To</label><input id="af-to" type="date" value="${escapeHtml(state.to)}"></div></div>`;
    const map={symbol:'af-symbol',strategy:'af-strategy',mode:'af-mode',session:'af-session',day:'af-day',timeframe:'af-tf',regime:'af-regime',direction:'af-direction'};
    Object.entries(map).forEach(([k,id])=>{const e=document.getElementById(id);e.value=state[k];e.onchange=()=>{state[k]=e.value;save();apply()}});
    ['from','to'].forEach(k=>{const e=document.getElementById('af-'+k);e.onchange=()=>{state[k]=e.value;save();apply()}});
    document.getElementById('af-clear').onclick=()=>{state={...defaults};save();apply()};
  }
  function apply(){
    const filtered=base().filter(matches);
    window.obAnalyticsContext={filters:{...state},accountId:accountId(),baseTrades:base(),trades:filtered,filter:matches,refresh:apply};
    const panel=document.getElementById('analytics-panel');if(panel){panel.dataset.centralFiltered='true';panel.querySelector('.analytics-scope')?.setAttribute('data-central-count',String(filtered.length));}
    if(typeof analyticsRender==='function'&&!window.__obAnalyticsFoundationRendering){window.__obAnalyticsFoundationRendering=true;window.__obAnalyticsFilterActive=true;try{analyticsRender()}finally{window.__obAnalyticsFilterActive=false;window.__obAnalyticsFoundationRendering=false}}
    render();
  }
  if(typeof getFiltered==='function'&&!window.__obAnalyticsGetFilteredWrapped){
    const originalGetFiltered=getFiltered;window.__obAnalyticsGetFilteredWrapped=true;
    getFiltered=function(){const list=originalGetFiltered.apply(this,arguments);return window.__obAnalyticsFilterActive?list.filter(matches):list};
  }
  window.obAnalyticsContext={filters:state,trades:[],filter:matches,refresh:apply};
  const style=document.createElement('style');style.textContent=`#analytics-filter-bar{margin-bottom:12px}.af-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px}.af-head strong{display:block;font-size:12px}.af-head span{display:block;font-size:10px;color:var(--ink-faint);margin-top:2px}.af-head button{border:1px solid var(--line-strong);background:rgba(255,255,255,.65);border-radius:8px;padding:6px 9px;font-size:10px;color:var(--ink-soft);cursor:pointer}.af-grid{display:grid;grid-template-columns:repeat(5,minmax(100px,1fr));gap:7px}.af-field label{display:block;font-size:9px;color:var(--ink-faint);margin-bottom:3px}.af-field select,.af-field input{width:100%;font:inherit;font-size:11px;padding:7px 8px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.72);color:var(--ink)}@media(max-width:900px){.af-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:600px){.af-grid{grid-template-columns:repeat(2,1fr)}}`;document.head.appendChild(style);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{render();apply()},{once:true});else{render();apply()}
})();
