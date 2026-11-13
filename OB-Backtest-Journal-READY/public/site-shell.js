/**
 * site-shell.js — signed-out vs signed-in shell + homepage behaviour (BUILD-PLAN-2 Part 3).
 *
 * Auth state comes from auth-check.js (window.obAuthState + 'ob-auth-state' event):
 *  - signed out: html.ob-signed-out → header shows only the logo and "Sign in";
 *    visitors stay on the homepage; opening any app page opens the sign-in modal
 *    (the modal never opens by itself on the homepage).
 *  - signed in: html.ob-signed-in → app nav without Home, no "Get started";
 *    the homepage is never shown (it redirects to the Dashboard); the logo opens the Dashboard.
 * Homepage: cycling hero word, pinned "Why" steps with a scroll observer, flow-map
 * reveal, drifting wall. All motion is off with prefers-reduced-motion.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const APP_TABS = ['dashboard', 'trading', 'journal', 'analytics', 'accounts', 'settings'];
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = () => window.obAuthState || (root.classList.contains('ob-signed-in') ? 'in' : root.classList.contains('ob-signed-out') ? 'out' : null);

  function openSignIn(mode) {
    if (typeof window.showAuthModal === 'function') window.showAuthModal('/', { mode: mode === 'register' ? 'register' : 'signin' });
  }
  window.obOpenSignIn = openSignIn;

  // ── switchTab guard ─────────────────────────────────────────────────────
  function guardSwitchTab() {
    const fn = window.switchTab;
    if (typeof fn !== 'function' || fn.__obShell) return;
    const w = function (tab, ...a) {
      const s = state();
      if (s === 'out' && APP_TABS.includes(tab)) { const r = fn.call(this, 'home', ...a); openSignIn('signin'); return r; }
      if (s === 'in' && tab === 'home') return fn.call(this, 'dashboard', ...a);
      return fn.call(this, tab, ...a);
    };
    w.__obShell = true;
    // keep markers other scripts set on their wrappers
    Object.keys(fn).forEach(k => { try { if (!(k in w)) w[k] = fn[k]; } catch (_) {} });
    window.switchTab = w;
  }

  function applyState(s) {
    root.classList.toggle('ob-signed-in', s === 'in');
    root.classList.toggle('ob-signed-out', s === 'out');
    guardSwitchTab();
    const home = document.getElementById('pageHome');
    if (s === 'in' && home && !home.classList.contains('hidden') && typeof window.switchTab === 'function') window.switchTab('dashboard');
    if (s === 'out') {
      const asked = String(window.__obInitialHash || '').replace(/^#/, '').toLowerCase();
      if (home && home.classList.contains('hidden') && typeof window.switchTab === 'function') window.switchTab('home');
      if (APP_TABS.includes(asked)) openSignIn('signin');
      initHome();
    }
  }
  window.addEventListener('ob-auth-state', e => applyState(e.detail));
  if (window.obAuthState) applyState(window.obAuthState);
  [300, 1200, 2500].forEach(ms => setTimeout(guardSwitchTab, ms));

  // ── header: logo + Sign in ──────────────────────────────────────────────
  document.addEventListener('click', e => {
    const logo = e.target.closest('.hm-logo');
    if (logo) {
      e.preventDefault();
      if (state() === 'in') window.switchTab && window.switchTab('dashboard');
      else { window.switchTab && window.switchTab('home'); window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); }
      return;
    }
    if (e.target.closest('#obSignInBtn')) { e.preventDefault(); openSignIn('signin'); return; }
    if (e.target.closest('[data-hm-signup]')) { e.preventDefault(); openSignIn('register'); return; }
    const sc = e.target.closest('[data-hm-scroll]');
    if (sc) {
      e.preventDefault();
      const el = document.getElementById(sc.dataset.hmScroll);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: reduced() ? 'auto' : 'smooth' });
    }
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('.hm-logo')) { e.preventDefault(); e.target.closest('.hm-logo').click(); }
  });

  // ── homepage ────────────────────────────────────────────────────────────
  let homeReady = false;
  function initHome() {
    if (homeReady) return;
    const page = document.getElementById('pageHome');
    if (!page) return;
    homeReady = true;
    root.classList.add('hm-js');

    // 1. hero word
    const word = page.querySelector('.hm-cycle-word');
    if (word && !reduced()) {
      const words = String(word.dataset.words || '').split('|').filter(Boolean);
      let i = 0;
      setInterval(() => {
        if (page.classList.contains('hidden') || document.hidden) return;
        word.classList.add('is-out');
        setTimeout(() => { i = (i + 1) % words.length; word.textContent = words[i]; word.classList.remove('is-out'); }, 350);
      }, 2600);
    }

    // 2. pinned "Why" steps: active step + progress line follow the scroll
    const track = page.querySelector('.hm-why-track');
    const steps = [...page.querySelectorAll('.hm-step')];
    const bar = page.querySelector('.hm-progress > i');
    const desktop = window.matchMedia('(min-width: 1024px)');
    function onScroll() {
      if (!track || page.classList.contains('hidden')) return;
      if (!desktop.matches) { steps.forEach(s => s.classList.add('is-active')); return; }
      const r = track.getBoundingClientRect();
      const span = Math.max(1, r.height - window.innerHeight);
      const p = Math.max(0, Math.min(1, -r.top / span));
      const idx = Math.min(steps.length - 1, Math.floor(p * steps.length));
      steps.forEach((s, k) => s.classList.toggle('is-active', k === idx));
      if (bar) bar.style.setProperty('--hm-p', `${Math.round(((idx + Math.min(1, (p * steps.length) - idx)) / steps.length) * 100)}%`);
    }
    let ticking = false;
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; onScroll(); }); } }, { passive: true });
    desktop.addEventListener('change', onScroll);
    onScroll();

    // 3. flow map: fade / slide in
    const nodes = [...page.querySelectorAll('.hm-node')];
    if (reduced() || !('IntersectionObserver' in window)) nodes.forEach(n => n.classList.add('is-in'));
    else {
      const io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -12% 0px' });
      nodes.forEach(n => io.observe(n));
    }

    // 4. wall: duplicate each row once so the drift loops seamlessly
    page.querySelectorAll('[data-hm-wall] .hm-row').forEach(row => {
      if (row.dataset.cloned) return;
      row.dataset.cloned = '1';
      [...row.children].forEach(c => { const d = c.cloneNode(true); d.setAttribute('aria-hidden', 'true'); row.appendChild(d); });
    });
  }
  window.obInitHome = initHome;
})();
