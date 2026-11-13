/**
 * mobile.js — small behaviours for phones and tablets (Mobile round).
 * Layout lives in mobile.css; this file only does what CSS cannot.
 *
 * 1. Pill nav (and the Account center section tabs): keep the active tab
 *    scrolled into view inside the sideways-scrolling row (not the page).
 * 2. Trading Activity heatmaps: when a page opens, start them on the newest
 *    weeks (they may have been drawn while the page was hidden).
 * 3. On-screen keyboard: track the visual viewport (--vvh / --vvt and
 *    body.ob-kb-open) and keep the focused field in view, so the trade drawer's
 *    sticky bar and the keyboard never hide what you are typing.
 * 4. Collapsible sections ([data-ob-collapse] with a .ob-collapse-toggle):
 *    collapsed by default on phones, always open on wider screens.
 * 5. AI Coach button: on phones and tablets it is docked in the header (next to
 *    the avatar) as an icon button, so it never floats over page content.
 *    Desktop keeps the floating button. Same element, same click handler.
 */
(() => {
  'use strict';
  if (window.__obMobileJs) return;
  window.__obMobileJs = true;

  const phone = () => window.matchMedia('(max-width: 767px)').matches;

  // ── 1. Pill nav ────────────────────────────────────────────────────────────
  function centerActivePill(smooth) {
    const nav = document.querySelector('header nav.ob-pill-nav');
    if (!nav || nav.scrollWidth <= nav.clientWidth + 1) return;
    const active = nav.querySelector('.nav-pill-active');
    if (!active) return;
    const left = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
  }
  // Account center section tabs (#acNavList) scroll sideways on phones too.
  function centerActiveAcTab() {
    const list = document.getElementById('acNavList');
    if (!list || list.scrollWidth <= list.clientWidth + 1) return;
    const active = list.querySelector('[aria-selected="true"]');
    if (!active) return;
    list.scrollTo({ left: Math.max(0, active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2), behavior: 'auto' });
  }
  function watchAcTabs() {
    const list = document.getElementById('acNavList');
    if (!list) return;
    let t = 0;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(centerActiveAcTab, 30); })
      .observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected'] });
  }
  function watchNav() {
    const nav = document.querySelector('header nav.ob-pill-nav');
    if (!nav) return;
    let t = 0;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => { centerActivePill(true); scrollHeatmapsToNewest(); centerActiveAcTab(); }, 30);
    }).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    centerActivePill(false);
    window.addEventListener('resize', () => centerActivePill(false), { passive: true });
  }

  // ── 2. Activity heatmaps ──────────────────────────────────────────────────
  function scrollHeatmapsToNewest() {
    document.querySelectorAll('.ob-act-scroll').forEach(sc => {
      if (sc.offsetParent && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = sc.scrollWidth;
    });
  }

  // ── 3. On-screen keyboard ─────────────────────────────────────────────────
  const isTextField = el => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && !/^(checkbox|radio|range|color|file|button|submit|reset|hidden)$/i.test(el.type)) ||
    el.tagName === 'SELECT');
  function trackKeyboard() {
    const vv = window.visualViewport;
    const root = document.documentElement;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!vv) return;
      root.style.setProperty('--vvh', vv.height + 'px');
      root.style.setProperty('--vvt', vv.offsetTop + 'px');
      // A keyboard is open when the visible area is much shorter than the window
      // and a text field has focus (pinch-zoom also shrinks it, without focus).
      const kb = window.innerHeight - vv.height > 120 && isTextField(document.activeElement);
      document.body.classList.toggle('ob-kb-open', kb && phone());
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    if (vv) { vv.addEventListener('resize', schedule); vv.addEventListener('scroll', schedule); }
    document.addEventListener('focusin', e => {
      if (!isTextField(e.target) || !window.matchMedia('(hover: none)').matches) return;
      schedule();
      // After the keyboard has animated in, centre the field in what is visible.
      setTimeout(() => {
        const el = document.activeElement;
        if (el !== e.target) return;
        const r = el.getBoundingClientRect();
        const visibleBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
        const bar = el.closest('#tradeDrawer') ? (document.querySelector('#tradeDrawer .sticky.bottom-0')?.offsetHeight || 0) : 0;
        if (r.top < 60 || r.bottom > visibleBottom - bar - 8) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 320);
    });
    document.addEventListener('focusout', () => setTimeout(schedule, 50));
    update();
  }

  // ── 4. Collapsible sections ───────────────────────────────────────────────
  function wireCollapsibles() {
    document.querySelectorAll('[data-ob-collapse]').forEach(card => {
      const btn = card.querySelector('.ob-collapse-toggle');
      if (!btn || btn.__obWired) return;
      btn.__obWired = true;
      const set = open => { card.classList.toggle('ob-collapsed', !open); btn.setAttribute('aria-expanded', String(open)); };
      set(!phone());
      // The whole header row toggles (bigger target than the chevron alone).
      const head = btn.parentElement;
      head.classList.add('ob-collapse-head');
      head.addEventListener('click', () => { if (phone()) set(card.classList.contains('ob-collapsed')); });
      window.matchMedia('(max-width: 767px)').addEventListener('change', e => set(!e.matches));
    });
  }

  // ── 5. AI Coach button ────────────────────────────────────────────────────
  const DOCK_MQ = window.matchMedia('(max-width: 1023px)');
  function dockCoach() {
    const fab = document.getElementById('ob-ai-fab');
    if (!fab) return;
    if (!fab.getAttribute('aria-label')) fab.setAttribute('aria-label', 'Open AI Coach');
    const slot = document.querySelector('header > div > div:last-child');
    if (DOCK_MQ.matches && slot) {
      if (fab.parentElement !== slot) slot.insertBefore(fab, slot.firstChild);
      fab.classList.add('ob-fab-docked');
    } else if (fab.parentElement !== document.body) {
      document.body.appendChild(fab);
      fab.classList.remove('ob-fab-docked');
    } else {
      fab.classList.remove('ob-fab-docked');
    }
  }
  function watchCoach() {
    dockCoach();
    // ai-coach.js creates the button after load; dock it as soon as it appears.
    const mo = new MutationObserver(() => { if (document.getElementById('ob-ai-fab')) dockCoach(); });
    mo.observe(document.body, { childList: true });
    DOCK_MQ.addEventListener('change', dockCoach);
  }

  function init() {
    watchNav();
    trackKeyboard();
    wireCollapsibles();
    watchCoach();
    watchAcTabs();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.obMobile = { phone, centerActivePill };
})();
