/**
 * mobile.js — small behaviours for phones and tablets (Mobile round).
 * Layout lives in mobile.css; this file only does what CSS cannot.
 *
 * 1. Pill nav: keep the active tab scrolled into view inside the
 *    horizontally scrolling nav (without scrolling the page).
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
      t = setTimeout(() => centerActivePill(true), 30);
    }).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    centerActivePill(false);
    window.addEventListener('resize', () => centerActivePill(false), { passive: true });
  }

  function init() {
    watchNav();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.obMobile = { phone, centerActivePill };
})();
