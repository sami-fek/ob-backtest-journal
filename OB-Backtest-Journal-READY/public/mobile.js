/**
 * mobile.js — small behaviours for phones and tablets (Mobile round).
 * Layout lives in mobile.css; this file only does what CSS cannot.
 *
 * 1. Pill nav: keep the active tab scrolled into view inside the
 *    horizontally scrolling nav (without scrolling the page).
 * 2. Trading Activity heatmaps: when a page opens, start them on the newest
 *    weeks (they may have been drawn while the page was hidden).
 * 3. On-screen keyboard: track the visual viewport (--vvh / --vvt and
 *    body.ob-kb-open) and keep the focused field in view, so the trade drawer's
 *    sticky bar and the keyboard never hide what you are typing.
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
  function watchNav() {
    const nav = document.querySelector('header nav.ob-pill-nav');
    if (!nav) return;
    let t = 0;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => { centerActivePill(true); scrollHeatmapsToNewest(); }, 30);
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

  function init() {
    watchNav();
    trackKeyboard();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.obMobile = { phone, centerActivePill };
})();
