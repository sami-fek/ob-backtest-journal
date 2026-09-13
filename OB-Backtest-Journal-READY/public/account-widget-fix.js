(() => {
  const STYLE_ID = 'account-carousel-style';
  const CAROUSEL_ID = 'account-card-carousel';
  let lastSignature = '';
  let boundSelect = null;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${CAROUSEL_ID} { position:relative; width:100%; overflow:hidden; touch-action:pan-y; }
      #${CAROUSEL_ID} .account-carousel-viewport { overflow:hidden; width:100%; border-radius:18px; }
      #${CAROUSEL_ID} .account-carousel-track { display:flex; gap:12px; will-change:transform; transition:transform .42s cubic-bezier(.22,.8,.24,1); padding:0 6px 4px; }
      #${CAROUSEL_ID} .account-carousel-card { flex:0 0 calc(100% - 24px); min-width:0; border-radius:18px; padding:14px 15px 13px; color:#fff; background:linear-gradient(135deg,#29478f 0%,#1c3375 52%,#111f45 100%); border:1px solid rgba(255,255,255,.18); box-shadow:0 12px 28px rgba(15,23,42,.28), inset 0 1px 0 rgba(255,255,255,.13); position:relative; overflow:hidden; }
      #${CAROUSEL_ID} .account-carousel-card::after { content:""; position:absolute; width:150px; height:150px; right:-65px; top:-85px; border-radius:999px; background:rgba(255,255,255,.10); pointer-events:none; }
      #${CAROUSEL_ID} .account-carousel-card::before { content:""; position:absolute; left:-20%; right:-20%; top:42%; height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent); pointer-events:none; }
      #${CAROUSEL_ID} .account-carousel-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; position:relative; z-index:1; }
      #${CAROUSEL_ID} .account-carousel-name { font-size:12px; font-weight:800; letter-spacing:.02em; }
      #${CAROUSEL_ID} .account-carousel-type { font-size:9px; text-transform:uppercase; letter-spacing:.12em; color:rgba(191,219,254,.82); font-weight:800; margin-bottom:2px; }
      #${CAROUSEL_ID} .account-add-btn { appearance:none; border:0; background:transparent; color:rgba(255,255,255,.78); padding:2px 5px; border-radius:7px; font-size:10px; font-weight:800; cursor:pointer; transition:background .18s ease,color .18s ease,opacity .18s ease; position:relative; z-index:3; }
      #${CAROUSEL_ID} .account-add-btn:hover { background:rgba(255,255,255,.13); color:#fff; opacity:1; }
      #${CAROUSEL_ID} .account-carousel-balance-label { margin-top:14px; font-size:9px; color:rgba(191,219,254,.80); font-weight:700; text-transform:uppercase; position:relative; z-index:1; }
      #${CAROUSEL_ID} .account-carousel-balance { margin-top:2px; font-family:'JetBrains Mono',monospace; font-size:27px; line-height:1.05; font-weight:900; letter-spacing:-.045em; position:relative; z-index:1; white-space:nowrap; }
      #${CAROUSEL_ID} .account-carousel-footer { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:9px; padding-top:8px; border-top:1px solid rgba(147,197,253,.22); font-size:9px; color:rgba(191,219,254,.88); position:relative; z-index:1; }
      #${CAROUSEL_ID} .account-carousel-return { color:#34d399; font-weight:900; }
      #${CAROUSEL_ID} .account-carousel-nav { display:flex; align-items:center; justify-content:center; gap:9px; margin-top:7px; }
      #${CAROUSEL_ID} .account-arrow { width:23px; height:23px; border:1px solid rgba(148,163,184,.30); background:rgba(15,23,42,.04); color:#64748b; border-radius:999px; display:grid; place-items:center; cursor:pointer; transition:all .18s ease; }
      #${CAROUSEL_ID} .account-arrow:hover { background:rgba(37,99,235,.08); color:#2563eb; border-color:rgba(37,99,235,.28); transform:scale(1.04); }
      #${CAROUSEL_ID} .account-dots { display:flex; align-items:center; justify-content:center; gap:4px; }
      #${CAROUSEL_ID} .account-dot { width:5px; height:5px; border-radius:999px; background:#cbd5e1; transition:all .22s ease; }
      #${CAROUSEL_ID} .account-dot.active { width:15px; background:#2563eb; }
      #${CAROUSEL_ID} .account-swipe-hint { text-align:center; margin-top:2px; font-size:8px; color:#94a3b8; letter-spacing:.04em; }
      @media (min-width:640px) { #${CAROUSEL_ID} .account-carousel-card { flex-basis:calc(100% - 32px); } }
    `;
    document.head.appendChild(style);
  }

  function getCardData() {
    const select = document.getElementById('accountSelector');
    if (!select) return [];
    return [...select.options]
      .filter(o => o.value && o.value !== '__add_account__')
      .map(o => {
        const raw = o.textContent.trim();
        const parts = raw.split(' — ');
        return { id:o.value, name:parts[0] || 'Account', balance:parts.slice(1).join(' — ') || '$0.00' };
      });
  }

  function getActiveIndex(cards) {
    const select = document.getElementById('accountSelector');
    if (!select || !cards.length) return 0;
    const found = cards.findIndex(c => c.id === select.value);
    return found >= 0 ? found : 0;
  }

  function selectAccount(index) {
    const select = document.getElementById('accountSelector');
    const cards = getCardData();
    if (!select || !cards.length) return;
    const next = (index + cards.length) % cards.length;
    select.value = cards[next].id;
    select.dispatchEvent(new Event('change', { bubbles:true }));
    setTimeout(renderCarousel, 70);
  }

  function renderCarousel() {
    const select = document.getElementById('accountSelector');
    const panel = document.getElementById('accountBalanceDisplay')?.closest('.bg-gradient-to-br');
    const wrap = document.getElementById('accountSelectorWrap');
    if (!select || !panel || !wrap || typeof activeMode === 'undefined' || activeMode === 'Backtest') return;

    injectStyles();
    wrap.style.display = 'none';

    const cards = getCardData();
    if (!cards.length) return;
    const active = getActiveIndex(cards);
    const signature = `${activeMode}|${select.value}|${cards.map(c => `${c.id}:${c.name}:${c.balance}`).join('|')}|${document.getElementById('accountReturnBadge')?.textContent || ''}`;
    if (signature === lastSignature) return;
    lastSignature = signature;

    let root = document.getElementById(CAROUSEL_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = CAROUSEL_ID;
      panel.insertBefore(root, panel.firstChild);
    }

    root.innerHTML = `
      <div class="account-carousel-viewport">
        <div class="account-carousel-track" id="accountCarouselTrack">
          ${cards.map((a, i) => `
            <div class="account-carousel-card" data-index="${i}" aria-hidden="${i !== active}">
              <div class="account-carousel-top">
                <div>
                  <div class="account-carousel-type">${escapeHtml(activeMode)} account</div>
                  <div class="account-carousel-name">${escapeHtml(a.name)}</div>
                </div>
                ${i === active ? '<button type="button" class="account-add-btn" id="accountAddBtn">＋ Add account</button>' : ''}
              </div>
              <div class="account-carousel-balance-label">Available balance</div>
              <div class="account-carousel-balance">${escapeHtml(a.balance)}</div>
              <div class="account-carousel-footer">
                <span>Portfolio balance</span>
                <span class="account-carousel-return">${i === active ? (document.getElementById('accountReturnBadge')?.textContent || '+0.00%') : ''}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>
      ${cards.length > 1 ? `
        <div class="account-carousel-nav">
          <button type="button" class="account-arrow" id="accountPrev" aria-label="Previous account"><i class="fa-solid fa-chevron-left text-[8px]"></i></button>
          <div class="account-dots">${cards.map((_,i)=>`<span class="account-dot ${i===active?'active':''}"></span>`).join('')}</div>
          <button type="button" class="account-arrow" id="accountNext" aria-label="Next account"><i class="fa-solid fa-chevron-right text-[8px]"></i></button>
        </div>
        <div class="account-swipe-hint">Swipe left or right to switch account</div>` : `
        <div class="account-carousel-nav"><div class="account-dots"><span class="account-dot active"></span></div></div>`}
    `;

    const track = root.querySelector('#accountCarouselTrack');
    const firstCard = track?.children[0];
    if (track && firstCard) {
      const cardWidth = firstCard.getBoundingClientRect().width;
      track.style.transform = `translate3d(-${active * (cardWidth + 12)}px,0,0)`;
    }

    root.querySelector('#accountPrev')?.addEventListener('click', () => selectAccount(active - 1));
    root.querySelector('#accountNext')?.addEventListener('click', () => selectAccount(active + 1));
    root.querySelector('#accountAddBtn')?.addEventListener('click', () => {
      select.value = '__add_account__';
      select.dispatchEvent(new Event('change', { bubbles:true }));
    });

    setupSwipe(root);
  }

  function setupSwipe(root) {
    if (root.__swipeReady) return;
    root.__swipeReady = true;
    let startX = 0, startY = 0, dragging = false;
    const begin = e => {
      const point = e.touches?.[0] || e;
      startX = point.clientX; startY = point.clientY; dragging = true;
    };
    const finish = e => {
      if (!dragging) return;
      const point = e.changedTouches?.[0] || e;
      const dx = point.clientX - startX;
      const dy = point.clientY - startY;
      dragging = false;
      if (Math.abs(dx) < 35 || Math.abs(dx) <= Math.abs(dy)) return;
      const cards = getCardData();
      selectAccount(getActiveIndex(cards) + (dx < 0 ? 1 : -1));
    };
    root.addEventListener('touchstart', begin, {passive:true});
    root.addEventListener('touchend', finish, {passive:true});
    root.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') begin(e); });
    root.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') finish(e); });
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
      setTimeout(renderCarousel, 40);
    });
  }

  function tick() {
    bindSelect();
    renderCarousel();
  }

  function boot() {
    injectStyles();
    tick();
    setInterval(tick, 500);
  }

  if (document.readyState === 'complete') setTimeout(boot, 80);
  else window.addEventListener('load', () => setTimeout(boot, 80), {once:true});
})();
