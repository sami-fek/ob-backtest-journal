// Phase 1 foundation: account, strategy and trading-mode context.
const PHASE1_DEFAULT_ACCOUNTS = [
  { id: 'backtest-main', name: 'Backtest', type: 'Backtest' },
  { id: 'demo-main', name: 'Demo 01', type: 'Demo' },
  { id: 'real-main', name: 'Real 01', type: 'Real' },
  { id: 'funded-main', name: 'Funded 01', type: 'Funded' }
];
const PHASE1_DEFAULT_STRATEGIES = [
  { id: 'model-a', name: 'Model A', active: true },
  { id: 'model-ob', name: 'Model OB', active: true }
];
let phase1Accounts = [];
let phase1Strategies = [];
let phase1Context = { accountId: 'backtest-main', strategyId: 'model-ob' };
let phase1Ready = false;
let phase1ManagerOpen = false;
let phase1BaseLoadResolve;
const phase1BaseLoaded = new Promise(resolve => { phase1BaseLoadResolve = resolve; });

async function phase1Get(key, fallback) {
  try { const raw = await storageGet(key); if (!raw) return fallback; return JSON.parse(raw) ?? fallback; }
  catch { return fallback; }
}
async function phase1Set(key, value) { return storageSet(key, JSON.stringify(value)); }
function phase1Account(id) { return phase1Accounts.find(a => a.id === id) || phase1Accounts[0]; }
function phase1Strategy(id) { return phase1Strategies.find(s => s.id === id) || phase1Strategies[0]; }
function phase1Mode() { return phase1Account(phase1Context.accountId)?.type || 'Backtest'; }
function phase1EnsureContext() {
  if (!phase1Accounts.some(a => a.id === phase1Context.accountId)) phase1Context.accountId = phase1Accounts[0]?.id || 'backtest-main';
  const active = phase1Strategies.filter(s => s.active !== false);
  if (!phase1Strategies.some(s => s.id === phase1Context.strategyId) || phase1Strategy(phase1Context.strategyId)?.active === false) phase1Context.strategyId = active[0]?.id || phase1Strategies[0]?.id || 'model-a';
}
async function phase1MigrateTrades() {
  let changed = false;
  for (const t of trades) {
    if (!t.source) { t.source = 'backtest'; changed = true; }
    if (!t.mode) { t.mode = 'Backtest'; changed = true; }
    if (!t.accountId) { t.accountId = 'backtest-main'; changed = true; }
    if (!t.strategyId) { t.strategyId = 'model-ob'; changed = true; }
  }
  if (changed) await saveTrades();
}
function phase1Styles() {
  if (document.getElementById('phase1-styles')) return;
  const style = document.createElement('style'); style.id = 'phase1-styles';
  style.textContent = `
    .phase1-context{margin-bottom:14px}.phase1-grid{display:grid;grid-template-columns:1.1fr 1.1fr 1.1fr auto;gap:8px;align-items:end}.phase1-actions{display:flex;gap:6px;align-items:end}.phase1-mini{font-size:11px;color:var(--ink-faint);margin-top:8px;line-height:1.4}.phase1-create{background:rgba(255,255,255,.7);border:1px solid var(--line-strong);color:var(--ink-soft);border-radius:9px;padding:7px 10px;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap}.phase1-create:hover{border-color:var(--accent);color:var(--accent)}.phase1-chip{display:inline-flex;align-items:center;background:rgba(47,111,237,.08);border:1px solid rgba(47,111,237,.16);color:var(--accent);border-radius:999px;padding:3px 8px;font-size:10.5px;font-weight:600;margin-left:6px}.phase1-context h2{display:flex;align-items:center;flex-wrap:wrap}.phase1-manager{margin-top:14px;border-top:1px solid var(--line);padding-top:14px}.phase1-manager-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.phase1-manager-title{font-size:10.5px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.04em;margin-bottom:7px;font-weight:600}.phase1-list{display:flex;flex-direction:column;gap:6px}.phase1-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:rgba(255,255,255,.5)}.phase1-item-main{min-width:0;display:flex;flex-direction:column;gap:2px}.phase1-item-name{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.phase1-item-meta{font-size:10.5px;color:var(--ink-faint)}.phase1-item-actions{display:flex;gap:5px;flex:0 0 auto}.phase1-small-btn{background:rgba(255,255,255,.75);border:1px solid var(--line-strong);color:var(--ink-soft);border-radius:7px;padding:5px 8px;font-size:10.5px;cursor:pointer;font-family:inherit}.phase1-small-btn:hover{border-color:var(--accent);color:var(--accent)}.phase1-small-btn.warn:hover{border-color:var(--loss);color:var(--loss)}.phase1-empty{font-size:11px;color:var(--ink-faint);padding:8px 2px}.phase1-add-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.phase1-add-row input,.phase1-add-row select{font-size:12px;padding:6px 8px}.phase1-status{font-size:10.5px;color:var(--ink-faint);margin-top:7px}@media(max-width:700px){.phase1-grid{grid-template-columns:1fr 1fr}.phase1-actions{grid-column:1/-1}.phase1-actions .phase1-create{flex:1}.phase1-manager-grid{grid-template-columns:1fr}}
  `; document.head.appendChild(style);
}
async function phase1SaveState() { await phase1Set('ob-accounts', phase1Accounts); await phase1Set('ob-strategies', phase1Strategies); await phase1Set('ob-context', phase1Context); }
function phase1RenderManager() {
  const manager = document.getElementById('phase1-manager'); if (!manager) return;
  manager.style.display = phase1ManagerOpen ? 'block' : 'none'; if (!phase1ManagerOpen) return;
  const accounts = phase1Accounts.map(a => `<div class="phase1-item"><div class="phase1-item-main"><span class="phase1-item-name">${escapeHtml(a.name)}</span><span class="phase1-item-meta">${escapeHtml(a.type)}${a.id === phase1Context.accountId ? ' · Current' : ''}</span></div><div class="phase1-item-actions"><button class="phase1-small-btn" type="button" data-p1-edit-account="${escapeHtml(a.id)}">Rename</button></div></div>`).join('');
  const strategies = phase1Strategies.map(s => `<div class="phase1-item"><div class="phase1-item-main"><span class="phase1-item-name">${escapeHtml(s.name)}</span><span class="phase1-item-meta">${s.active === false ? 'Inactive' : 'Active'}${s.id === phase1Context.strategyId ? ' · Current' : ''}</span></div><div class="phase1-item-actions"><button class="phase1-small-btn" type="button" data-p1-edit-strategy="${escapeHtml(s.id)}">Rename</button><button class="phase1-small-btn warn" type="button" data-p1-toggle-strategy="${escapeHtml(s.id)}">${s.active === false ? 'Activate' : 'Deactivate'}</button></div></div>`).join('');
  manager.innerHTML = `<div class="phase1-manager-grid"><div><div class="phase1-manager-title">Accounts</div><div class="phase1-list">${accounts || '<div class="phase1-empty">No accounts yet.</div>'}</div><div class="phase1-add-row"><input id="phase1-account-name" placeholder="New account name"><select id="phase1-account-type"><option>Backtest</option><option>Demo</option><option>Real</option><option>Funded</option></select></div><button class="phase1-create" id="phase1-add-account" type="button" style="margin-top:6px;width:100%">+ Add account</button></div><div><div class="phase1-manager-title">Strategies</div><div class="phase1-list">${strategies || '<div class="phase1-empty">No strategies yet.</div>'}</div><div class="phase1-add-row"><input id="phase1-strategy-name" placeholder="New strategy name"><span></span></div><button class="phase1-create" id="phase1-add-strategy" type="button" style="margin-top:6px;width:100%">+ Add strategy</button></div></div><div class="phase1-status">Accounts are not deleted here so historical trades cannot be orphaned. Strategies can be deactivated and remain available for historical trades.</div>`;
  manager.querySelectorAll('[data-p1-edit-account]').forEach(btn => btn.onclick = async () => { const a = phase1Account(btn.dataset.p1EditAccount); const name = prompt('Account name', a?.name || 'Account'); if (!a || !name?.trim()) return; a.name = name.trim(); await phase1SaveState(); phase1RenderControls(); render(); });
  manager.querySelectorAll('[data-p1-edit-strategy]').forEach(btn => btn.onclick = async () => { const s = phase1Strategy(btn.dataset.p1EditStrategy); const name = prompt('Strategy name', s?.name || 'Strategy'); if (!s || !name?.trim()) return; s.name = name.trim(); await phase1SaveState(); phase1RenderControls(); render(); });
  manager.querySelectorAll('[data-p1-toggle-strategy]').forEach(btn => btn.onclick = async () => { const s = phase1Strategy(btn.dataset.p1ToggleStrategy); if (!s) return; if (s.id === phase1Context.strategyId && s.active !== false) { alert('Switch to another strategy before deactivating the current strategy.'); return; } s.active = s.active === false; await phase1SaveState(); phase1RenderControls(); });
  document.getElementById('phase1-add-account').onclick = async () => { const name = document.getElementById('phase1-account-name').value.trim(); const type = document.getElementById('phase1-account-type').value; if (!name) return; const id = `${type.toLowerCase()}-${Date.now()}`; phase1Accounts.push({id,name,type}); phase1Context.accountId = id; await phase1SaveState(); phase1RenderControls(); render(); };
  document.getElementById('phase1-add-strategy').onclick = async () => { const name = document.getElementById('phase1-strategy-name').value.trim(); if (!name) return; const id = `strategy-${Date.now()}`; phase1Strategies.push({id,name,active:true}); phase1Context.strategyId = id; await phase1SaveState(); phase1RenderControls(); render(); };
}
function phase1RenderControls() {
  let panel = document.getElementById('phase1-context');
  if (!panel) { panel = document.createElement('div'); panel.id = 'phase1-context'; panel.className = 'panel glass phase1-context'; const logPanel = [...document.querySelectorAll('.panel')].find(p => p.querySelector('#f-add')); logPanel?.parentNode.insertBefore(panel, logPanel); }
  const accountOptions = phase1Accounts.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} · ${escapeHtml(a.type)}</option>`).join('');
  const strategyOptions = phase1Strategies.filter(s => s.active !== false).map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
  panel.innerHTML = `<h2>Trading context <small>every new trade is stored under the selected account and strategy</small><span class="phase1-chip">${escapeHtml(phase1Mode())}</span></h2><div class="phase1-grid"><div class="field"><label>Account</label><select id="phase1-account">${accountOptions}</select></div><div class="field"><label>Strategy</label><select id="phase1-strategy">${strategyOptions}</select></div><div class="field"><label>Mode</label><select id="phase1-mode" disabled><option>${escapeHtml(phase1Mode())}</option></select></div><div class="phase1-actions"><button class="phase1-create" id="phase1-manage" type="button">${phase1ManagerOpen ? 'Close manager' : 'Manage'}</button></div></div><div class="phase1-mini">Switching accounts filters the journal and analytics to that account. Backtest, Demo, Real and Funded stay separated.</div><div class="phase1-manager" id="phase1-manager"></div>`;
  const accountEl = document.getElementById('phase1-account'), strategyEl = document.getElementById('phase1-strategy'); accountEl.value = phase1Context.accountId; strategyEl.value = phase1Context.strategyId;
  accountEl.onchange = async () => { phase1Context.accountId = accountEl.value; phase1EnsureContext(); await phase1Set('ob-context', phase1Context); phase1RenderControls(); render(); };
  strategyEl.onchange = async () => { phase1Context.strategyId = strategyEl.value; await phase1Set('ob-context', phase1Context); render(); };
  document.getElementById('phase1-manage').onclick = () => { phase1ManagerOpen = !phase1ManagerOpen; phase1RenderControls(); phase1RenderManager(); };
  phase1RenderManager();
}

const phase1OriginalGetFiltered = getFiltered;
getFiltered = function() { const base = phase1OriginalGetFiltered(); if (!phase1Ready) return base; return base.filter(t => (t.accountId || 'backtest-main') === phase1Context.accountId && (t.strategyId || 'model-ob') === phase1Context.strategyId); };
const phase1AddButton = document.getElementById('f-add');
phase1AddButton?.addEventListener('click', async (event) => { event.preventDefault(); event.stopImmediatePropagation(); const pair = document.getElementById('f-pair').value, tf = document.getElementById('f-tf').value, regime = document.getElementById('f-regime').value, rVal = document.getElementById('f-r').value, date = document.getElementById('f-date').value, errEl = document.getElementById('f-err'); if (!date || !selectedDir || !selectedRes || rVal === '') { errEl.style.display = 'block'; return; } errEl.style.display = 'none'; trades.push({id:Date.now(),date,pair,tf,regime,dir:selectedDir,result:selectedRes,r:Math.abs(parseFloat(rVal)),hasDetail:false,clean:null,source:phase1Mode()==='Backtest'?'backtest':'manual',mode:phase1Mode(),accountId:phase1Context.accountId,strategyId:phase1Context.strategyId}); await saveTrades(); document.getElementById('f-r').value=''; document.querySelectorAll('#f-dir button,#f-res button').forEach(b=>b.classList.remove('active')); selectedDir=null; selectedRes=null; render(); }, true);
const phase1OriginalRender = render;
render = async function() { await phase1OriginalRender(); if (!phase1Ready) phase1BaseLoadResolve(); phase1PatchTable(); };
function phase1PatchTable() { const table=document.querySelector('table.log'); if(!table||table.dataset.phase1==='1')return; const head=table.querySelector('thead tr'); if(!head)return; const cells=[...head.children], ruleIndex=cells.findIndex(c=>c.textContent.trim()==='Rule'); if(ruleIndex<0)return; const modeTh=document.createElement('th');modeTh.textContent='Mode';const strategyTh=document.createElement('th');strategyTh.textContent='Strategy';head.insertBefore(modeTh,head.children[ruleIndex]);head.insertBefore(strategyTh,head.children[ruleIndex+1]);[...table.querySelectorAll('tbody tr')].forEach((row,i)=>{const visibleTrades=getFiltered().sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id),t=visibleTrades[i];if(!t)return;const modeTd=document.createElement('td');modeTd.textContent=t.mode||'Backtest';const strategyTd=document.createElement('td');strategyTd.textContent=phase1Strategy(t.strategyId)?.name||t.strategyId||'Model OB';row.insertBefore(modeTd,row.children[ruleIndex]);row.insertBefore(strategyTd,row.children[ruleIndex+1]);});table.dataset.phase1='1'; }
async function phase1Init(){ phase1Styles(); await phase1BaseLoaded; phase1Accounts=await phase1Get('ob-accounts',[]); phase1Strategies=await phase1Get('ob-strategies',[]); if(!phase1Accounts.length){phase1Accounts=PHASE1_DEFAULT_ACCOUNTS.map(x=>({...x}));await phase1Set('ob-accounts',phase1Accounts);} if(!phase1Strategies.length){phase1Strategies=PHASE1_DEFAULT_STRATEGIES.map(x=>({...x}));await phase1Set('ob-strategies',phase1Strategies);} phase1Context=await phase1Get('ob-context',phase1Context);phase1EnsureContext();await phase1Set('ob-context',phase1Context);await phase1MigrateTrades();phase1Ready=true;phase1RenderControls();await render(); }
phase1Init().catch(err=>console.error('Phase 1 foundation init failed:',err));
