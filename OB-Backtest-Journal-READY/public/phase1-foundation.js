// Phase 1 foundation: account, strategy and trading-mode context.
// Injected into the existing journal script so it can reuse the current data/rendering.
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
let phase1BaseLoadResolve;
const phase1BaseLoaded = new Promise(resolve => { phase1BaseLoadResolve = resolve; });

async function phase1Get(key, fallback) {
  try {
    const raw = await storageGet(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value ?? fallback;
  } catch { return fallback; }
}
async function phase1Set(key, value) { return storageSet(key, JSON.stringify(value)); }
function phase1Account(id) { return phase1Accounts.find(a => a.id === id) || phase1Accounts[0]; }
function phase1Strategy(id) { return phase1Strategies.find(s => s.id === id) || phase1Strategies[0]; }
function phase1Mode() { return phase1Account(phase1Context.accountId)?.type || 'Backtest'; }
function phase1EnsureContext() {
  if (!phase1Accounts.some(a => a.id === phase1Context.accountId)) phase1Context.accountId = phase1Accounts[0]?.id || 'backtest-main';
  if (!phase1Strategies.some(s => s.id === phase1Context.strategyId)) phase1Context.strategyId = phase1Strategies[0]?.id || 'model-a';
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
  const style = document.createElement('style');
  style.id = 'phase1-styles';
  style.textContent = `
    .phase1-context{margin-bottom:14px;}
    .phase1-grid{display:grid;grid-template-columns:1.1fr 1.1fr 1.1fr auto;gap:8px;align-items:end;}
    .phase1-actions{display:flex;gap:6px;align-items:end;}
    .phase1-mini{font-size:11px;color:var(--ink-faint);margin-top:8px;line-height:1.4;}
    .phase1-create{background:rgba(255,255,255,.7);border:1px solid var(--line-strong);color:var(--ink-soft);border-radius:9px;padding:7px 10px;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;}
    .phase1-create:hover{border-color:var(--accent);color:var(--accent);}
    .phase1-chip{display:inline-flex;align-items:center;gap:5px;background:rgba(47,111,237,.08);border:1px solid rgba(47,111,237,.16);color:var(--accent);border-radius:999px;padding:3px 8px;font-size:10.5px;font-weight:600;margin-left:6px;}
    .phase1-context h2{display:flex;align-items:center;flex-wrap:wrap;}
    @media(max-width:700px){.phase1-grid{grid-template-columns:1fr 1fr}.phase1-actions{grid-column:1/-1}.phase1-actions .phase1-create{flex:1}}
  `;
  document.head.appendChild(style);
}

function phase1RenderControls() {
  let panel = document.getElementById('phase1-context');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'phase1-context';
    panel.className = 'panel glass phase1-context';
    const logPanel = [...document.querySelectorAll('.panel')].find(p => p.querySelector('#f-add'));
    logPanel?.parentNode.insertBefore(panel, logPanel);
  }
  const accountOptions = phase1Accounts.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} · ${escapeHtml(a.type)}</option>`).join('');
  const strategyOptions = phase1Strategies.filter(s => s.active !== false).map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
  panel.innerHTML = `
    <h2>Trading context <small>every new trade is stored under the selected account and strategy</small><span class="phase1-chip">${escapeHtml(phase1Mode())}</span></h2>
    <div class="phase1-grid">
      <div class="field"><label>Account</label><select id="phase1-account">${accountOptions}</select></div>
      <div class="field"><label>Strategy</label><select id="phase1-strategy">${strategyOptions}</select></div>
      <div class="field"><label>Mode</label><select id="phase1-mode" disabled><option>${escapeHtml(phase1Mode())}</option></select></div>
      <div class="phase1-actions"><button class="phase1-create" id="phase1-new-account" type="button">+ Account</button><button class="phase1-create" id="phase1-new-strategy" type="button">+ Strategy</button></div>
    </div>
    <div class="phase1-mini">Switching accounts filters the journal and analytics to that account. Backtest, Demo, Real and Funded stay separated.</div>
  `;
  const accountEl = document.getElementById('phase1-account');
  const strategyEl = document.getElementById('phase1-strategy');
  accountEl.value = phase1Context.accountId;
  strategyEl.value = phase1Context.strategyId;
  accountEl.onchange = async () => {
    phase1Context.accountId = accountEl.value;
    phase1EnsureContext();
    await phase1Set('ob-context', phase1Context);
    phase1RenderControls();
    render();
  };
  strategyEl.onchange = async () => {
    phase1Context.strategyId = strategyEl.value;
    await phase1Set('ob-context', phase1Context);
    render();
  };
  document.getElementById('phase1-new-account').onclick = async () => {
    const type = prompt('Account type: Backtest, Demo, Real, or Funded', 'Demo');
    if (!type) return;
    const normalized = ['Backtest','Demo','Real','Funded'].find(x => x.toLowerCase() === type.trim().toLowerCase());
    if (!normalized) { alert('Use Backtest, Demo, Real, or Funded.'); return; }
    const name = prompt('Account name', normalized === 'Backtest' ? 'Backtest 02' : `${normalized} 02`);
    if (!name?.trim()) return;
    const id = `${normalized.toLowerCase()}-${Date.now()}`;
    phase1Accounts.push({ id, name: name.trim(), type: normalized });
    phase1Context.accountId = id;
    await phase1Set('ob-accounts', phase1Accounts);
    await phase1Set('ob-context', phase1Context);
    phase1RenderControls();
    render();
  };
  document.getElementById('phase1-new-strategy').onclick = async () => {
    const name = prompt('Strategy name', 'Model C');
    if (!name?.trim()) return;
    const id = `strategy-${Date.now()}`;
    phase1Strategies.push({ id, name: name.trim(), active: true });
    phase1Context.strategyId = id;
    await phase1Set('ob-strategies', phase1Strategies);
    await phase1Set('ob-context', phase1Context);
    phase1RenderControls();
    render();
  };
}

const phase1OriginalGetFiltered = getFiltered;
getFiltered = function() {
  const base = phase1OriginalGetFiltered();
  if (!phase1Ready) return base;
  return base.filter(t => (t.accountId || 'backtest-main') === phase1Context.accountId && (t.strategyId || 'model-ob') === phase1Context.strategyId);
};

const phase1AddButton = document.getElementById('f-add');
phase1AddButton?.addEventListener('click', async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const pair = document.getElementById('f-pair').value;
  const tf = document.getElementById('f-tf').value;
  const regime = document.getElementById('f-regime').value;
  const rVal = document.getElementById('f-r').value;
  const date = document.getElementById('f-date').value;
  const errEl = document.getElementById('f-err');
  if (!date || !selectedDir || !selectedRes || rVal === '') { errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  trades.push({ id: Date.now(), date, pair, tf, regime, dir: selectedDir, result: selectedRes, r: Math.abs(parseFloat(rVal)), hasDetail:false, clean:null, source: phase1Mode() === 'Backtest' ? 'backtest' : 'manual', mode: phase1Mode(), accountId: phase1Context.accountId, strategyId: phase1Context.strategyId });
  await saveTrades();
  document.getElementById('f-r').value = '';
  document.querySelectorAll('#f-dir button, #f-res button').forEach(b=>b.classList.remove('active'));
  selectedDir = null; selectedRes = null;
  render();
}, true);

const phase1OriginalRender = render;
render = async function() {
  await phase1OriginalRender();
  if (!phase1Ready) phase1BaseLoadResolve();
  phase1PatchTable();
};
function phase1PatchTable() {
  const table = document.querySelector('table.log');
  if (!table || table.dataset.phase1 === '1') return;
  const head = table.querySelector('thead tr');
  if (!head) return;
  const cells = [...head.children];
  const ruleIndex = cells.findIndex(c => c.textContent.trim() === 'Rule');
  if (ruleIndex < 0) return;
  const modeTh = document.createElement('th'); modeTh.textContent = 'Mode';
  const strategyTh = document.createElement('th'); strategyTh.textContent = 'Strategy';
  head.insertBefore(modeTh, head.children[ruleIndex]);
  head.insertBefore(strategyTh, head.children[ruleIndex + 1]);
  [...table.querySelectorAll('tbody tr')].forEach((row, i) => {
    const visibleTrades = getFiltered().sort((a,b)=> b.date.localeCompare(a.date) || b.id-a.id);
    const t = visibleTrades[i];
    if (!t) return;
    const modeTd = document.createElement('td'); modeTd.textContent = t.mode || 'Backtest';
    const strategyTd = document.createElement('td'); strategyTd.textContent = phase1Strategy(t.strategyId)?.name || t.strategyId || 'Model OB';
    row.insertBefore(modeTd, row.children[ruleIndex]);
    row.insertBefore(strategyTd, row.children[ruleIndex + 1]);
  });
  table.dataset.phase1 = '1';
}

async function phase1Init() {
  phase1Styles();
  await phase1BaseLoaded;
  phase1Accounts = await phase1Get('ob-accounts', []);
  phase1Strategies = await phase1Get('ob-strategies', []);
  if (!phase1Accounts.length) { phase1Accounts = PHASE1_DEFAULT_ACCOUNTS.map(x => ({...x})); await phase1Set('ob-accounts', phase1Accounts); }
  if (!phase1Strategies.length) { phase1Strategies = PHASE1_DEFAULT_STRATEGIES.map(x => ({...x})); await phase1Set('ob-strategies', phase1Strategies); }
  phase1Context = await phase1Get('ob-context', phase1Context);
  phase1EnsureContext();
  await phase1Set('ob-context', phase1Context);
  await phase1MigrateTrades();
  phase1Ready = true;
  phase1RenderControls();
  await render();
}
phase1Init().catch(err => console.error('Phase 1 foundation init failed:', err));
