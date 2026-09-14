(() => {
  const TABS = ['home', 'trading', 'journal', 'analytics', 'accounts', 'settings'];
  const STYLE_ID = 'ob-navigation-fix-style';
  const STATE_KEY = 'ob_ui_state_v1';

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

  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }

  function validTab(tab) { return TABS.includes(String(tab || '').toLowerCase()); }

  function tabFromLocation() {
    const raw = window.location.hash.replace(/^#/, '').trim().toLowerCase();
    return validTab(raw) ? raw : null;
  }

  function tabFromState() {
    const tab = readState().tab;
    return validTab(tab) ? String(tab).toLowerCase() : null;
  }

  function saveTab(tab) {
    if (!validTab(tab)) return;
    const state = readState();
    state.tab = String(tab).toLowerCase();
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
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
      if (!validTab(tab)) tab = 'home';
      const result = original.call(window, tab);
      saveTab(tab);
      animatePage(tab);
      return result;
    };

    const patched = function(tab, options = {}) {
      if (!validTab(tab)) tab = 'home';
      const internal = options && options.__obInternal === true;
      if (!internal) {
        saveTab(tab);
        if (window.location.hash !== `#${tab}`) {
          window.history.pushState({ obTab: tab }, '', `#${tab}`);
        }
      }
      return apply(tab);
    };
    patched.__obNavigationPatched = true;
    window.switchTab = patched;

    const initial = tabFromLocation() || tabFromState() || 'home';
    window.history.replaceState({ obTab: initial }, '', `#${initial}`);
    setTimeout(() => apply(initial), 0);

    const syncFromLocation = () => {
      const tab = tabFromLocation() || tabFromState();
      if (tab) apply(tab);
    };
    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);

    document.addEventListener('click', event => {
      const button = event.target.closest?.('[id^="navBtn-"]');
      if (button) saveTab(button.id.slice('navBtn-'.length));
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
