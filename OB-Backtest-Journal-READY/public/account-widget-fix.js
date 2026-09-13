(() => {
  const STYLE_ID = 'wallet-account-carousel-style';
  const ROOT_ID = 'wallet-account-carousel';
  let boundSelect = null;
  let lastSignature = '';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Wallet-style account cards */
      #${ROOT_ID} {
        position:relative;
        width:100%;
        overflow:hidden;
        margin:0;
        touch-action:pan-y;
        user-select:none;
      }
      #${ROOT_ID} .wallet-viewport {
        width:100%;
        overflow:hidden;
        position:relative;
      }
      #${ROOT_ID} .wallet-track {
        display:flex;
        align-items:stretch;
        gap:10px;
        will-change:transform;
        padding:2px 0 7px;
        transition:transform .48s cubic-bezier(.22,.8,.24,1);
      }
      #${ROOT_ID}.is-dragging .wallet-track { transition:none; }
      #${ROOT_ID} .wallet-card {
        flex:0 0 78%;
        min-width:0;
        min-height:126px;
        border-radius:18px;
        padding:15px 16px 13px;
        color:#fff;
        position:relative;
        overflow:hidden;
        background:linear-gradient(135deg,#7186d1 0%,#5d72c3 48%,#5269b9 100%);
        border:1px solid rgba(255,255,255,.22);
        box-shadow:0 10px 22px rgba(15,23,42,.22), inset 0 1px 0 rgba(255,255,255,.16);
        transform:scale(.94);
        opacity:.62;
        transition:transform .48s cubic-bezier(.22,.8,.24,1),opacity .36s ease,filter .36s ease;
        cursor:grab;
      }
      #${ROOT_ID}.is-dragging .wallet-card { cursor:grabbing; transition:none; }
      #${ROOT_ID} .wallet-card.is-active {
        transform:scale(1);
        opacity:1;
        filter:none;
        box-shadow:0 15px 30px rgba(15,23,42,.30), inset 0 1px 0 rgba(255,255,255,.20);
      }
      #${ROOT_ID} .wallet-card::before {
        content:"";
        position:absolute;
        width:155px;
        height:155px;
        right:-70px;
        top:-92px;
        border-radius:999px;
        background:rgba(255,255,255,.11);
        pointer-events:none;
      }
      #${ROOT_ID} .wallet-card::after {
        content:"";
        position:absolute;
        width:210px;
        height:70px;
        right:-70px;
        bottom:-38px;
        border-radius:50%;
        background:rgba(255,255,255,.055);
        transform:rotate(-13deg);
        pointer-events:none;
      }
      #${ROOT_ID} .wallet-card-head,
      #${ROOT_ID} .wallet-card-balance,
      #${ROOT_ID} .wallet-card-foot { position:relative; z-index:1; }
      #${ROOT_ID} .wallet-card-head {
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:10px;
      }
      #${ROOT_ID} .wallet-card-type {
        font-size:8px;
        line-height:1;
        text-transform:uppercase;
        letter-spacing:.13em;
        font-weight:800;
        color:rgba(255,255,255,.72);
        margin-bottom:6px;
      }
      #${ROOT_ID} .wallet-card-name {
        font-size:12px;
        line-height:1.1;
        font-weight:800;
        letter-spacing:.01em;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      #${ROOT_ID} .wallet-card-mark {
        width:25px;
        height:25px;
        border-radius:8px;
        display:grid;
        place-items:center;
        color:rgba(255,255,255,.76);
        background:rgba(255,255,255,.10);
        border:1px solid rgba(255,255,255,.12);
        flex:none;
      }
      #${ROOT_ID} .wallet-add {
        appearance:none;
        border:0;
        background:transparent;
        color:rgba(255,255,255,.74);
        padding:2px 0;
        font-size:9px;
        line-height:1;
        font-weight:800;
        cursor:pointer;
        transition:opacity .18s ease,background .18s ease,color .18s ease;
        border-radius:6px;
      }
      #${ROOT_ID} .wallet-add:hover {
        color:#fff;
        opacity:1;
        background:rgba(255,255,255,.12);
        padding-left:5px;
        padding-right:5px;
      }
      #${ROOT_ID} .wallet-card-balance { margin-top:22px; }
      #${ROOT_ID} .wallet-balance-label {
        font-size:8px;
        color:rgba(255,255,255,.68);
        text-transform:uppercase;
        letter-spacing:.10em;
        font-weight:700;
        margin-bottom:4px;
      }
      #${ROOT_ID} .wallet-balance {
        font-family:'JetBrains Mono',monospace;
        font-size:22px;
        line-height:1;
        font-weight:900;
        letter-spacing:-.045em;
        white-space:nowrap;
      }
      #${ROOT_ID} .wallet-card-foot {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:8px;
        margin-top:13px;
        padding-top:8px;
        border-top:1px solid rgba(255,255,255,.15);
        font-size:8px;
        color:rgba(255,255,255,.62);
      }
      #${ROOT_ID} .wallet-return { color:#a7f3d0; font-weight:900; }
      #${ROOT_ID} .wallet-edge-arrow {
        position:absolute;
        top:50%;
        transform:translateY(-50%);
        width:20px;
        height:20px;
        border:1px solid rgba(255,255,255,.22);
        background:rgba(15,23,42,.18);
        backdrop-filter:blur(6px);
        color:rgba(255,255,255,.78);
        border-radius:999px;
        display:grid;
        place-items:center;
        z-index:5;
        cursor:pointer;
        opacity:.72;
        transition:opacity .18s ease,transform .18s ease,background .18s ease;
      }
      #${ROOT_ID} .wallet-edge-arrow:hover { opacity:1; background:rgba(15,23,42,.30); }
      #${ROOT_ID} .wallet-edge-arrow.left { left:5px; }
      #${ROOT_ID} .wallet-edge-arrow.right { right:5px; }
      #${ROOT_ID} .wallet-drag-hint {
        text-align:center;
        margin-top:1px;
        font-size:7px;
        color:rgba(191,219,254,.65);
        letter-spacing:.08em;
        text-transform:uppercase;
      }
      @media (max-width:639px) {
        #${ROOT_ID} .wallet-card { flex-basis:82%; min-height:122px; }
      }
      @media (min-width:900px) {
        #${ROOT_ID} .wallet-card { flex-basis:76%; }
      }
    `;
    document.head.appendChild(style);
  }

  function getAccounts() {
    const select = document.getElementById('accountSelector');
    if (!select) return [];
    return [...select.options]
      .filter(o => o.value && o.value !== '__add_account__')
      .map(o => {
        const raw = o.textContent.trim();
        const parts = raw.split(' — ');
        return {
          id: o.value,
          name: parts[0] || 'Account',
          balance: parts.slice(1).join(' — ') || '$0.00'
        };
      });
  }

  function activeIndex(accounts) {
    const select = document.getElementById('accountSelector');
    if (!select || !accounts.length) return 0;
    const index = accounts.findIndex(a => a.id === select.value);
    return index >= 0 ? index : 0;
  }

  function walletTransform(root, index, dragX = 0, animate = true) {
    const viewport = root.querySelector('.wallet-viewport');
    const track = root.querySelector('.wallet-track');
    const card = track?.children[0];
    if (!viewport || !track || !card) return;
    const cardWidth = card.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).gap) || 10;
    const sideInset = Math.max(0, (viewport.clientWidth - cardWidth) / 2);
    if (!animate) track.style.transition = 'none';
    else track.style.transition = '';
    track.style.transform = `translate3d(${sideInset - index * (cardWidth + gap) + dragX}px,0,0)`;
    if (!animate) requestAnimationFrame(() => { track.style.transition = ''; });
  }

  function selectAccount(index) {
    const select = document.getElementById('accountSelector');
    const accounts = getAccounts();
    if (!select || !accounts.length) return;
    const next = (index + accounts.length) % accounts.length;
    if (select.value === accounts[next].id) return;
    select.value = accounts[next].id;
    select.dispatchEvent(new Event('change', { bubbles:true }));
  }

  function render() {
    const select = document.getElementById('accountSelector');
    const panel = document.getElementById('accountBalanceDisplay')?.closest('.bg-gradient-to-br');
    const wrap = document.getElementById('accountSelectorWrap');
    if (!select || !panel || typeof activeMode === 'undefined' || activeMode === 'Backtest') return;

    injectStyles();
    if (wrap) wrap.style.display = 'none';

    // The account rules layer owns the legacy balance/header elements.
    // Keep them available for the existing logic but visually replace them with the wallet UI.
    const legacyHeader = document.getElementById('accountCardHeader');
    if (legacyHeader) legacyHeader.style.display = 'none';

    const accounts = getAccounts();
    if (!accounts.length) return;
    const active = activeIndex(accounts);
    const returnText = document.getElementById('accountReturnBadge')?.textContent || '+0.00%';
    const signature = `${activeMode}|${select.value}|${accounts.map(a => `${a.id}:${a.name}:${a.balance}`).join('|')}|${returnText}`;
    if (signature === lastSignature) {
      const root = document.getElementById(ROOT_ID);
      if (root) walletTransform(root, active, 0, true);
      return;
    }
    lastSignature = signature;

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      panel.insertBefore(root, panel.firstChild);
    }

    root.innerHTML = `
      <div class="wallet-viewport">
        <div class="wallet-track">
          ${accounts.map((a, i) => `
            <article class="wallet-card ${i === active ? 'is-active' : ''}" data-index="${i}" aria-hidden="${i !== active}">
              <div class="wallet-card-head">
                <div class="min-w-0">
                  <div class="wallet-card-type">${escapeHtml(activeMode)} account</div>
                  <div class="wallet-card-name">${escapeHtml(a.name)}</div>
                </div>
                ${i === active ? '<button type="button" class="wallet-add" id="walletAdd">＋ Add account</button>' : '<span class="wallet-card-mark"><i class="fa-solid fa-wallet text-[9px]"></i></span>'}
              </div>
              <div class="wallet-card-balance">
                <div class="wallet-balance-label">Balance</div>
                <div class="wallet-balance">${escapeHtml(a.balance)}</div>
              </div>
              <div class="wallet-card-foot">
                <span>${i === active ? 'Portfolio balance' : 'Account'}</span>
                <span class="wallet-return">${i === active ? escapeHtml(returnText) : ''}</span>
              </div>
            </article>`).join('')}
        </div>
      </div>
      ${accounts.length > 1 ? `
        <button type="button" class="wallet-edge-arrow left" id="walletPrev" aria-label="Previous account"><i class="fa-solid fa-chevron-left text-[7px]"></i></button>
        <button type="button" class="wallet-edge-arrow right" id="walletNext" aria-label="Next account"><i class="fa-solid fa-chevron-right text-[7px]"></i></button>
        <div class="wallet-drag-hint">Swipe to switch account</div>` : ''}
    `;

    walletTransform(root, active, 0, false);
    bindInteractions(root);
  }

  function bindInteractions(root) {
    if (root.__walletBound) return;
    root.__walletBound = true;

    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let dragging = false;
    let activeAtStart = 0;

    const begin = e => {
      if (e.target.closest('button')) return;
      const p = e.touches?.[0] || e;
      const accounts = getAccounts();
      startX = lastX = p.clientX;
      startY = p.clientY;
      activeAtStart = activeIndex(accounts);
      dragging = true;
      root.classList.add('is-dragging');
    };

    const move = e => {
      if (!dragging) return;
      const p = e.touches?.[0] || e;
      lastX = p.clientX;
      const dx = lastX - startX;
      const dy = p.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) + 8) {
        e.preventDefault?.();
        walletTransform(root, activeAtStart, dx, false);
      }
    };

    const finish = e => {
      if (!dragging) return;
      const p = e.changedTouches?.[0] || e;
      const dx = p.clientX - startX;
      const dy = p.clientY - startY;
      dragging = false;
      root.classList.remove('is-dragging');
      const accounts = getAccounts();
      const current = activeIndex(accounts);
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.15 && accounts.length > 1) {
        selectAccount(current + (dx < 0 ? 1 : -1));
      } else {
        walletTransform(root, current, 0, true);
      }
    };

    root.addEventListener('touchstart', begin, {passive:true});
    root.addEventListener('touchmove', move, {passive:false});
    root.addEventListener('touchend', finish, {passive:true});
    root.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') begin(e); });
    root.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') move(e); });
    root.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') finish(e); });
    root.addEventListener('pointercancel', e => { if (e.pointerType === 'mouse') finish(e); });

    root.querySelector('#walletPrev')?.addEventListener('click', e => {
      e.stopPropagation();
      const accounts = getAccounts();
      selectAccount(activeIndex(accounts) - 1);
    });
    root.querySelector('#walletNext')?.addEventListener('click', e => {
      e.stopPropagation();
      const accounts = getAccounts();
      selectAccount(activeIndex(accounts) + 1);
    });
    root.querySelector('#walletAdd')?.addEventListener('click', e => {
      e.stopPropagation();
      const select = document.getElementById('accountSelector');
      if (!select) return;
      select.value = '__add_account__';
      select.dispatchEvent(new Event('change', { bubbles:true }));
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function bindSelect() {
    const select = document.getElementById('accountSelector');
    if (!select || select === boundSelect) return;
    boundSelect = select;
    select.addEventListener('change', () => {
      lastSignature = '';
      setTimeout(render, 50);
    });
  }

  function tick() {
    bindSelect();
    render();
  }

  function boot() {
    injectStyles();
    tick();
    setInterval(tick, 500);
    window.addEventListener('resize', () => {
      const root = document.getElementById(ROOT_ID);
      if (!root) return;
      const accounts = getAccounts();
      walletTransform(root, activeIndex(accounts), 0, false);
    });
  }

  if (document.readyState === 'complete') setTimeout(boot, 80);
  else window.addEventListener('load', () => setTimeout(boot, 80), {once:true});
})();
