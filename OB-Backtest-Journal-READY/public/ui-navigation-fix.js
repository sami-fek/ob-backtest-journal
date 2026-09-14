(() => {
  const TABS = ['home', 'trading', 'journal', 'analytics', 'accounts', 'settings'];
  const STYLE_ID = 'ob-navigation-fix-style';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes obPageIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
      .ob-page-transition{animation:obPageIn .24s cubic-bezier(.16,1,.3,1)}
      @media(prefers-reduced-motion:reduce){.ob-page-transition{animation:none!important}}
    `;
    document.head.appendChild(style);
  }

  function tabFromLocation() {
    const raw = window.location.hash.replace(/^#/, '').trim().toLowerCase();
    return TABS.includes(raw) ? raw : null;
  }

  function animatePage(tab) {
    const page = document.getElementById(`page${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    if (!page) return;
    page.classList.remove('ob-page-transition');
    void page.offsetWidth;
    page.classList.add('ob-page-transition');
    clearTimeout(page.__obTransitionTimer);
    page.__obTransitionTimer = setTimeout(() => page.classList.remove('ob-page-transition'), 300);
  }

  function boot() {
    injectStyles();
    const original = window.switchTab;
    if (typeof original !== 'function' || original.__obNavigationPatched) return;

    const apply = tab => {
      if (!TABS.includes(tab)) tab = 'home';
      const result = original.call(window, tab);
      animatePage(tab);
      return result;
    };

    const patched = function(tab, options = {}) {
      if (!TABS.includes(tab)) tab = 'home';
      const internal = options && options.__obInternal === true;
      if (!internal) {
        const current = tabFromLocation();
        if (current !== tab) window.history.pushState({ obTab: tab }, '', `#${tab}`);
      }
      return apply(tab);
    };
    patched.__obNavigationPatched = true;
    window.switchTab = patched;

    const initial = tabFromLocation();
    if (initial) {
      setTimeout(() => apply(initial), 0);
    } else {
      window.history.replaceState({ obTab: 'home' }, '', '#home');
    }

    const syncFromLocation = () => {
      const tab = tabFromLocation();
      if (tab) apply(tab);
    };
    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
