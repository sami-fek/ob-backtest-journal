(() => {
  const STYLE_ID = 'wallet-account-carousel-style-v4';
  const ROOT_ID = 'wallet-account-carousel';
  const ACCOUNT_KEY = 'my_journal_accounts_v1';
  let bound = false;
  let lastSignature = '';
  let lastMode = '';

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID}{width:100%;position:relative;overflow:hidden;user-select:none;touch-action:pan-y;margin:0;}
      #${ROOT_ID} .wallet-viewport{width:100%;overflow:hidden;position:relative;padding:4px 0 8px;}
      #${ROOT_ID} .wallet-track{display:flex;align-items:stretch;justify-content:flex-start;gap:10px;will-change:transform;transition:transform .62s cubic-bezier(.16,1,.3,1);}
      #${ROOT_ID}.dragging .wallet-track{transition:none!important;}
      #${ROOT_ID} .wallet-card{flex:0 0 78%;min-width:0;height:154px;border-radius:20px;padding:16px 17px 14px;color:#fff;position:relative;overflow:hidden;box-sizing:border-box;opacity:.42;transform:scale(.91);filter:saturate(.72);transition:transform .62s cubic-bezier(.16,1,.3,1),opacity .48s ease,filter .48s ease,box-shadow .48s ease;box-shadow:0 7px 18px rgba(15,23,42,.10);cursor:grab;}
      #${ROOT_ID} .wallet-card.active{opacity:1;transform:scale(1);filter:none;box-shadow:0 15px 30px rgba(15,23,42,.23),inset 0 1px 0 rgba(255,255,255,.25);z-index:2;}
      #${ROOT_ID} .wallet-card.demo{background:linear-gradient(135deg,#5f78cf 0%,#4964b9 52%,#3c56a5 100%);}
      #${ROOT_ID} .wallet-card.real{background:linear-gradient(135deg,#55c9a4 0%,#35b990 55%,#21a67d 100%);}
      #${ROOT_ID} .wallet-card.funded{background:linear-gradient(135deg,#f7bd59 0%,#eea93a 55%,#df9227 100%);}
      #${ROOT_ID} .wallet-card::before{content:"";position:absolute;width:175px;height:175px;right:-78px;top:-105px;border-radius:999px;background:rgba(255,255,255,.12);pointer-events:none;}
      #${ROOT_ID} .wallet-card::after{content:"";position:absolute;width:240px;height:80px;right:-70px;bottom:-42px;border-radius:50%;background:rgba(255,255,255,.055);transform:rotate(-12deg);pointer-events:none;}
      #${ROOT_ID} .wallet-head,#${ROOT_ID} .wallet-body,#${ROOT_ID} .wallet-foot{position:relative;z-index:1;}
      #${ROOT_ID} .wallet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
      #${ROOT_ID} .wallet-type{font-size:9px;text-transform:uppercase;letter-spacing:.12em;font-weight:800;color:rgba(255,255,255,.72);margin-bottom:5px;}
      #${ROOT_ID} .wallet-name{font-size:14px;line-height:1.1;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      #${ROOT_ID} .wallet-mark{width:27px;height:27px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.13);color:rgba(255,255,255,.82);}
      #${ROOT_ID} .wallet-body{margin-top:22px;}
      #${ROOT_ID} .wallet-label{font-size:8px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:rgba(255,255,255,.67);margin-bottom:4px;}
      #${ROOT_ID} .wallet-balance{font-family:'JetBrains Mono',monospace;font-size:25px;line-height:1;font-weight:900;letter-spacing:-.045em;white-space:nowrap;}
      #${ROOT_ID} .wallet-foot{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:8px;border-top:1px solid rgba(255,255,255,.18);font-size:8px;color:rgba(255,255,255,.68);}
      #${ROOT_ID} .wallet-return{font-weight:900;color:#a7f3d0;}
      #${ROOT_ID} .wallet-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px;padding:0 3px;}
      #${ROOT_ID} .wallet-portfolio{font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;transition:color .2s ease;}
      #${ROOT_ID} .wallet-add{border:0;background:transparent;color:#64748b;padding:4px 7px;border-radius:7px;font-size:10px;font-weight:800;cursor:pointer;transition:background .18s ease,color .18s ease,opacity .18s ease,transform .18s ease;white-space:nowrap;}
      #${ROOT_ID} .wallet-add:hover{background:rgba(37,99,235,.08);color:#2563eb;opacity:1;transform:translateY(-1px);}
      #${ROOT_ID} .wallet-capital{font-size:10px;font-weight:600;color:#a9b8ca;margin-top:8px;padding:0 3px;transition:color .2s ease;}
      #${ROOT_ID} .wallet-arrow{position:absolute;top:45%;transform:translateY(-50%);z-index:6;width:22px;height:22px;border-radius:999px;border:1px solid rgba(148,163,184,.28);background:rgba(255,255,255,.86);backdrop-filter:blur(7px);color:#64748b;display:grid;place-items:center;cursor:pointer;box-shadow:0 4px 12px rgba(15,23,42,.10);opacity:.82;transition:all .18s ease;}
      #${ROOT_ID} .wallet-arrow:hover{opacity:1;color:#2563eb;transform:translateY(-50%) scale(1.06);}
      #${ROOT_ID} .wallet-arrow.left{left:3px;}#${ROOT_ID} .wallet-arrow.right{right:3px;}
      #${ROOT_ID} .wallet-controls{display:flex;align-items:center;justify-content:center;margin-top:0;}
      #${ROOT_ID} .wallet-dots{display:flex;align-items:center;justify-content:center;gap:4px;margin-top:1px;}
      #${ROOT_ID} .wallet-dot{width:6px;height:6px;border-radius:999px;background:#dbe4f2;transition:all .28s cubic-bezier(.16,1,.3,1);}.wallet-dot.active{width:15px;background:#2563eb;}
      #${ROOT_ID} .wallet-hint{text-align:center;font-size:8px;color:#94a3b8;margin-top:3px;letter-spacing:.03em;}
      @media(max-width:639px){#${ROOT_ID} .wallet-card{flex-basis:82%;height:148px;}}
      @media(min-width:900px){#${ROOT_ID} .wallet-card{flex-basis:76%;}}
    `;
    document.head.appendChild(s);
  }

  function readAccounts() {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '{}'); } catch (_) {}
    const modes = ['Demo','Real','Funded'];
    const fallback = {
      Demo:[{id:'demo-1',name:'Demo 01',startingBalance:100000,balance:100000}],
      Real:[{id:'real-1',name:'Real 01',startingBalance:100000,balance:100000}],
      Funded:[{id:'funded-1',name:'Funded 01',startingBalance:100000,balance:100000}]
    };
    return modes.flatMap(mode => (Array.isArray(data[mode]) && data[mode].length ? data[mode] : fallback[mode]).map(a => ({...a,mode})));
  }

  function accountReturn(a) {
    const risk = Number(window.riskPercent) || 1;
    const base = Number(a.startingBalance ?? a.balance ?? 100000) || 100000;
    let r = 0;
    if (Array.isArray(window.trades)) r = window.trades.filter(t => t.mode === a.mode && t.accountId === a.id).reduce((sum,t)=>sum+(Number(t.rMultiple)||0),0);
    const balance = base + r * base * (risk/100);
    return {balance,base,pct:base ? ((balance-base)/base)*100 : 0};
  }

  function currentIndex(list) {
    const select = document.getElementById('accountSelector');
    const mode = typeof activeMode === 'undefined' ? 'Demo' : activeMode;
    const exact = select ? list.findIndex(a => a.mode === mode && a.id === select.value) : -1;
    if (exact >= 0) return exact;
    const modeIndex = list.findIndex(a => a.mode === mode);
    return modeIndex >= 0 ? modeIndex : 0;
  }

  function setAccount(item) {
    if (!item) return;
    if (typeof window.switchMode === 'function') window.switchMode(item.mode);
    const apply = () => {
      const select = document.getElementById('accountSelector');
      if (!select) return false;
      const option = [...select.options].find(o => o.value === item.id);
      if (!option) return false;
      select.value = item.id;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      lastSignature='';
      return true;
    };
    if (!apply()) setTimeout(apply,100);
    setTimeout(render,180);
  }

  function move(delta) {
    const list = readAccounts();
    if (list.length < 2) return;
    const i = currentIndex(list);
    setAccount(list[(i + delta + list.length) % list.length]);
  }

  function transform(root,index,drag=0,animate=true) {
    const viewport=root.querySelector('.wallet-viewport');
    const track=root.querySelector('.wallet-track');
    const card=track?.children[0];
    if(!viewport||!track||!card)return;
    const width=card.getBoundingClientRect().width;
    const gap=parseFloat(getComputedStyle(track).gap)||10;
    const inset=Math.max(0,(viewport.clientWidth-width)/2);
    track.style.transition=animate?'transform .62s cubic-bezier(.16,1,.3,1)':'none';
    track.style.transform=`translate3d(${inset-index*(width+gap)+drag}px,0,0)`;
  }

  function render() {
    const panel=document.getElementById('accountBalanceDisplay')?.closest('.bg-gradient-to-br');
    if(!panel||typeof activeMode==='undefined'||activeMode==='Backtest')return;
    injectStyles();
    panel.style.background='transparent';panel.style.boxShadow='none';panel.style.border='0';panel.style.padding='0';
    const legacy=document.getElementById('accountCardHeader');if(legacy)legacy.style.display='none';
    const display=document.getElementById('accountBalanceDisplay');if(display)display.style.display='none';
    const badge=document.getElementById('accountReturnBadge');if(badge)badge.style.display='none';

    const list=readAccounts();if(!list.length)return;
    const active=currentIndex(list);
    const sig=`${activeMode}|${active}|${list.map(a=>`${a.mode}:${a.id}:${a.name}:${a.startingBalance}:${a.balance}`).join(';')}`;
    let root=document.getElementById(ROOT_ID);
    if(!root){root=document.createElement('div');root.id=ROOT_ID;panel.insertBefore(root,panel.firstChild);}

    const modeChanged = lastMode !== activeMode;
    if(sig===lastSignature && !modeChanged){ transform(root,active,0,true); return; }
    lastMode=activeMode;
    lastSignature=sig;

    root.innerHTML=`
      <div class="wallet-viewport">
        <div class="wallet-track">
          ${list.map((item,i)=>{const p=accountReturn(item);return `<article class="wallet-card ${item.mode.toLowerCase()} ${i===active?'active':''}" data-index="${i}">
            <div class="wallet-head"><div class="min-w-0"><div class="wallet-type">${esc(item.mode)} account</div><div class="wallet-name">${esc(item.name)}</div></div><span class="wallet-mark"><i class="fa-solid fa-wallet text-[9px]"></i></span></div>
            <div class="wallet-body"><div class="wallet-label">Balance</div><div class="wallet-balance">$${p.balance.toLocaleString('en-US',{minimumFractionDigits:2})}</div></div>
            <div class="wallet-foot"><span>Account balance</span><span class="wallet-return">${p.pct>=0?'+':''}${p.pct.toFixed(2)}%</span></div>
          </article>`;}).join('')}
        </div>
      </div>
      <div class="wallet-meta"><span class="wallet-portfolio">Portfolio Balance</span><button type="button" class="wallet-add" id="walletAdd">＋ Add account</button></div>
      <div class="wallet-capital">Base Capital: $${accountReturn(list[active]).base.toLocaleString('en-US',{minimumFractionDigits:0})}</div>
      ${list.length>1?`<button type="button" class="wallet-arrow left" id="walletPrev" aria-label="Previous account"><i class="fa-solid fa-chevron-left text-[8px]"></i></button><button type="button" class="wallet-arrow right" id="walletNext" aria-label="Next account"><i class="fa-solid fa-chevron-right text-[8px]"></i></button><div class="wallet-controls"><div class="wallet-dots">${list.map((_,i)=>`<span class="wallet-dot ${i===active?'active':''}"></span>`).join('')}</div></div><div class="wallet-hint">Swipe left or right to switch account</div>`:''}
    `;
    transform(root,active,0,true);
    bind(root);
  }

  function bind(root){
    if(root.__walletBound)return;root.__walletBound=true;
    let startX=0,startY=0,dragging=false;
    const begin=e=>{if(e.target.closest('button'))return;const p=e.touches?.[0]||e;startX=p.clientX;startY=p.clientY;dragging=true;root.classList.add('dragging');};
    const drag=e=>{if(!dragging)return;const p=e.touches?.[0]||e;const dx=p.clientX-startX;const dy=p.clientY-startY;if(Math.abs(dx)>Math.abs(dy)+7){e.preventDefault?.();const list=readAccounts();transform(root,currentIndex(list),dx,false);}};
    const end=e=>{if(!dragging)return;const p=e.changedTouches?.[0]||e;const dx=p.clientX-startX;const dy=p.clientY-startY;dragging=false;root.classList.remove('dragging');if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.15)move(dx<0?1:-1);else{const list=readAccounts();transform(root,currentIndex(list),0,true);}};
    root.addEventListener('touchstart',begin,{passive:true});root.addEventListener('touchmove',drag,{passive:false});root.addEventListener('touchend',end,{passive:true});
    root.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')begin(e);});root.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')drag(e);});root.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')end(e);});root.addEventListener('pointercancel',e=>{if(e.pointerType==='mouse')end(e);});
    root.querySelector('#walletPrev')?.addEventListener('click',e=>{e.stopPropagation();move(-1);});
    root.querySelector('#walletNext')?.addEventListener('click',e=>{e.stopPropagation();move(1);});
    root.querySelector('#walletAdd')?.addEventListener('click',e=>{e.stopPropagation();const select=document.getElementById('accountSelector');if(!select)return;select.value='__add_account__';select.dispatchEvent(new Event('change',{bubbles:true}));});
  }

  function boot(){injectStyles();render();if(!bound){bound=true;window.addEventListener('resize',()=>{const root=document.getElementById(ROOT_ID);if(root)transform(root,currentIndex(readAccounts()),0,false);});setInterval(render,700);}}
  if(document.readyState==='complete')setTimeout(boot,120);else window.addEventListener('load',()=>setTimeout(boot,120));
})();
