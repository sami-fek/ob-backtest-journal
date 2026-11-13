/**
 * account-center.js — the Account center (Part 3), opened from the avatar menu
 * through window.openAccountCenter(section). It lives on the existing
 * 'accounts' route (#pageAccounts), so switchTab('accounts') and #accounts keep
 * working and the old Accounts page content (#accountsGrid) is shown in the
 * Accounts section.
 *
 * Sections: Profile · Accounts · Account Settings · Security · Data · Danger Zone.
 *
 * Storage (no schema change): profile → kv key "ob-profile"; trading accounts →
 * the existing "my_journal_accounts_v1" (same shape, optional new fields);
 * preferences → the existing settings record "ob-os-settings" (via
 * window.obUpdateSettings, so the Settings page values are never duplicated).
 */
(() => {
  'use strict';
  const ACC_KEY = 'my_journal_accounts_v1';
  const PROFILE_KEY = 'ob-profile';
  const SECTION_KEY = 'ob-account-center-section';
  const TYPES = ['Real', 'Demo', 'Funded', 'Backtest'];
  const MODE_TYPES = ['Demo', 'Real', 'Funded']; // modes that always need one account
  const AVATAR_MAX = 150 * 1024;
  const SECTIONS = [
    { id: 'profile', name: 'Profile', desc: 'Photo, name and contact details', icon: 'fa-user' },
    { id: 'accounts', name: 'Accounts', desc: 'Real, Demo, Funded and Backtest', icon: 'fa-wallet' },
    { id: 'settings', name: 'Account Settings', desc: 'Balance, targets, cash and preferences', icon: 'fa-sliders' },
    { id: 'security', name: 'Security', desc: 'Password and sign-in methods', icon: 'fa-shield-halved' },
    { id: 'data', name: 'Data', desc: 'Export and import your trades', icon: 'fa-database' },
    { id: 'danger', name: 'Danger Zone', desc: 'Delete your account', icon: 'fa-triangle-exclamation', danger: true }
  ];
  const SAVE_SECTIONS = new Set(['profile', 'settings']);
  const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'ZAR', 'INR'];
  const SYMBOLS = ['$', '€', '£', '¥', '₹', 'A$', 'C$', 'CHF', 'R'];
  const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD MMM YYYY'];

  const B = () => window.obBalance;
  const state = { section: 'profile', me: null, profile: null, dirty: false, save: null, rendered: false, settingsAccId: null };

  // ── small helpers ─────────────────────────────────────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = v => String(v ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  const todayIso = () => B().todayIso();
  const allTrades = () => (Array.isArray(window.trades) ? window.trades : []);
  const settings = () => (typeof window.obGetSettings === 'function' ? window.obGetSettings() : {});
  const risk = () => Number(settings().riskPercent) || 1;

  function prefs() {
    const s = settings();
    return {
      timezone: s.timezone || (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
      currencySymbol: s.currencySymbol || '$',
      dateFormat: DATE_FORMATS.includes(s.dateFormat) ? s.dateFormat : 'YYYY-MM-DD'
    };
  }
  function money(n, signed) {
    const v = Number(n) || 0;
    const sym = prefs().currencySymbol;
    const body = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v < 0 ? '-' : signed && v > 0 ? '+' : '') + sym + body;
  }
  function fmtDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return esc(iso || '—');
    const [y, m, d] = iso.split('-');
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1];
    switch (prefs().dateFormat) {
      case 'DD/MM/YYYY': return `${d}/${m}/${y}`;
      case 'MM/DD/YYYY': return `${m}/${d}/${y}`;
      case 'DD MMM YYYY': return `${d} ${mon} ${y}`;
      default: return iso;
    }
  }
  // For Part 4 and other widgets.
  window.obPrefs = { get: prefs, formatMoney: money, formatDate: fmtDate };

  function toast(msg) {
    let t = document.getElementById('acToast');
    if (!t) { t = document.createElement('div'); t.id = 'acToast'; t.className = 'ac-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function storageGet(key) {
    if (typeof window.storageGet === 'function') return window.storageGet(key);
    const r = await fetch('/api/storage/' + encodeURIComponent(key), { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Storage read failed (' + r.status + ')');
    return (await r.json()).value;
  }
  async function storagePut(key, value) {
    const r = await fetch('/api/storage/' + encodeURIComponent(key), {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value })
    });
    if (!r.ok) throw new Error(r.status === 401 ? 'Your session has ended. Please sign in again.' : 'Saving failed (' + r.status + '). Please try again.');
    try { localStorage.setItem(key, value); } catch (_) {}
  }
  async function api(method, url, body) {
    const r = await fetch(url, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined
    });
    let data = null; try { data = await r.json(); } catch (_) {}
    return { ok: r.ok, status: r.status, data: data || {} };
  }
  async function loadMe(force) {
    if (state.me && !force) return state.me;
    const r = await api('GET', '/api/auth/me');
    state.me = r.ok ? r.data.user : null;
    return state.me;
  }

  // ── accounts storage (same key and shape as before) ───────────────────────
  function readAccountsRaw() {
    try { const d = JSON.parse(localStorage.getItem(ACC_KEY) || '{}'); return d && typeof d === 'object' ? d : {}; } catch (_) { return {}; }
  }
  function writeAccountsRaw(d) {
    const value = JSON.stringify(d);
    localStorage.setItem(ACC_KEY, value);
    // ui-rules.js re-reads, the wallet re-renders, account-edit-persistence-fix persists.
    window.dispatchEvent(new CustomEvent('wallet-accounts-updated'));
    if (typeof window.persistAccountState === 'function') void window.persistAccountState(value);
    else void storagePut(ACC_KEY, value).catch(() => {});
  }
  function listAccounts() {
    const d = readAccountsRaw();
    const out = [];
    TYPES.forEach(type => (Array.isArray(d[type]) ? d[type] : []).forEach(a => { if (a && typeof a === 'object') out.push(B().normalizeAccount(a, type)); }));
    return out;
  }
  function findAccount(id) { return listAccounts().find(a => a.id === id) || null; }
  // Same fallback as the rest of the app: stored choice, else the first (live) account.
  function activeIdFor(type) {
    if (type === 'Backtest') return null;
    let stored = null;
    try { stored = localStorage.getItem(`my_journal_active_account_${type}_v1`); } catch (_) {}
    const live = listAccounts().filter(a => a.type === type && a.status !== 'archived');
    return live.some(a => a.id === stored) ? stored : (live[0]?.id || null);
  }
  function tradesFor(a) {
    if (!a) return [];
    if (a.type === 'Backtest') return allTrades().filter(t => t.mode === 'Backtest');
    return allTrades().filter(t => t.mode === a.type && t.accountId === a.id);
  }
  function balanceOf(a) { return B().balance(a, tradesFor(a), risk()); }
  /** Update one account in place (keeps MT5 and other fields). */
  function patchAccount(id, patch) {
    const d = readAccountsRaw();
    for (const type of Object.keys(d)) {
      if (!Array.isArray(d[type])) continue;
      const i = d[type].findIndex(a => a && a.id === id);
      if (i >= 0) { d[type][i] = Object.assign({}, d[type][i], patch); writeAccountsRaw(d); return d[type][i]; }
    }
    return null;
  }
  function liveCount(type, exceptId) {
    return listAccounts().filter(a => a.type === type && a.status !== 'archived' && a.id !== exceptId).length;
  }
  function ensureActiveValid(type) {
    if (type === 'Backtest') return;
    const live = listAccounts().filter(a => a.type === type && a.status !== 'archived');
    const cur = activeIdFor(type);
    if (!live.some(a => a.id === cur) && live[0]) localStorage.setItem(`my_journal_active_account_${type}_v1`, live[0].id);
  }
  function refreshApp() {
    try { if (typeof window.switchMode === 'function') window.switchMode(window.activeMode); } catch (_) {}
  }

  // ── modal helper ──────────────────────────────────────────────────────────
  function modal(html, { sm } = {}) {
    document.getElementById('acModal')?.remove();
    const m = document.createElement('div');
    m.id = 'acModal';
    m.className = 'ac-modal';
    m.innerHTML = `<div class="ac-dialog ${sm ? 'sm' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(m);
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    m.addEventListener('mousedown', e => { if (e.target === m) close(); });
    m.querySelectorAll('[data-ac-close]').forEach(b => b.addEventListener('click', close));
    setTimeout(() => m.querySelector('input:not([type=radio]):not([disabled]), select:not([disabled]), button.ac-btn-primary, button.ac-btn-danger')?.focus(), 0);
    return { el: m, close };
  }
  const dialogHead = (title, sub) => `<div class="ac-dialog-head"><div><div class="ac-dialog-title">${esc(title)}</div>${sub ? `<p class="ac-hint" style="margin:3px 0 0">${sub}</p>` : ''}</div><button type="button" class="ac-x" data-ac-close aria-label="Close">×</button></div>`;

  // ── shell: sub-nav, header, Save button ───────────────────────────────────
  function renderNav() {
    const list = $('#acNavList');
    if (!list) return;
    list.innerHTML = SECTIONS.map(s => `
      <button type="button" class="ac-nav-item ${s.danger ? 'danger' : ''}" role="tab" id="acTab-${s.id}" data-section="${s.id}"
        aria-selected="${s.id === state.section}" tabindex="${s.id === state.section ? 0 : -1}" aria-controls="acBody">
        <span class="ac-nav-icon"><i class="fa-solid ${s.icon}"></i></span>
        <span class="ac-nav-text"><span class="ac-nav-name">${esc(s.name)}</span><span class="ac-nav-desc">${esc(s.desc)}</span></span>
      </button>`).join('');
    list.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  function bindNav() {
    const list = $('#acNavList');
    if (!list || list.__acBound) return;
    list.__acBound = true;
    list.addEventListener('click', e => { const b = e.target.closest('[data-section]'); if (b) show(b.dataset.section); });
    list.addEventListener('keydown', e => {
      const items = [...list.querySelectorAll('[data-section]')];
      const i = items.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (next) { e.preventDefault(); const b = items[(i + next + items.length) % items.length]; b.focus(); show(b.dataset.section); }
    });
    $('#acSaveBtn').addEventListener('click', async () => {
      if (!state.save || !state.dirty) return;
      const btn = $('#acSaveBtn');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const ok = await state.save();
        if (ok !== false) { setDirty(false); toast('Changes saved.'); }
        else btn.disabled = false;
      } catch (err) {
        toast(err.message || 'Saving failed.');
        btn.disabled = false;
      } finally { btn.textContent = 'Save Changes'; }
    });
  }
  function setDirty(on) {
    state.dirty = !!on;
    const btn = $('#acSaveBtn');
    if (btn) btn.disabled = !state.dirty;
  }
  function trackDirty(root) {
    root.querySelectorAll('[data-dirty]').forEach(el => {
      el.addEventListener('input', () => setDirty(true));
      el.addEventListener('change', () => setDirty(true));
    });
  }

  async function show(section, opts = {}) {
    if (!SECTIONS.some(s => s.id === section)) section = 'profile';
    if (state.dirty && section !== state.section && !opts.force) {
      if (!window.confirm('You have unsaved changes in this section. Discard them?')) { renderNav(); return; }
    }
    state.section = section;
    try { localStorage.setItem(SECTION_KEY, section); } catch (_) {}
    state.save = null;
    setDirty(false);
    renderNav();
    const meta = SECTIONS.find(s => s.id === section);
    $('#acTitle').textContent = meta.name;
    $('#acSub').textContent = meta.desc;
    $('#acSaveBtn').style.display = SAVE_SECTIONS.has(section) ? '' : 'none';
    const body = $('#acBody');
    // The per-mode summary card is moved into the Accounts section; park it
    // outside the body before the body is replaced so it is never destroyed.
    const wrap = $('#acAccountsGridWrap');
    if (wrap) { wrap.classList.add('hidden'); if (body.contains(wrap)) body.after(wrap); }
    body.innerHTML = '<div class="ac-card"><div class="ac-empty">Loading…</div></div>';
    try {
      if (section === 'profile') await renderProfile(body);
      else if (section === 'accounts') renderAccountsSection(body);
      else if (section === 'settings') renderSettings(body);
      else if (section === 'security') await renderSecurity(body);
      else if (section === 'data') renderData(body);
      else if (section === 'danger') await renderDanger(body);
    } catch (err) {
      console.error('[Account center]', err);
      body.innerHTML = `<div class="ac-card"><div class="ac-msg bad">This section could not be loaded: ${esc(err.message || err)}</div></div>`;
    }
    trackDirty(body);
    state.rendered = true;
    syncStickyTop();
  }

  // ── PROFILE ───────────────────────────────────────────────────────────────
  const safeAvatar = v => (typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= AVATAR_MAX * 1.4 ? v : '');
  async function loadProfile(force) {
    if (state.profile && !force) return state.profile;
    let p = {};
    try { const raw = await storageGet(PROFILE_KEY); p = raw ? JSON.parse(raw) : {}; } catch (_) { p = {}; }
    state.profile = (p && typeof p === 'object') ? p : {};
    return state.profile;
  }
  function displayName(p, email) {
    const full = [p.firstName, p.lastName].map(x => String(x || '').trim()).filter(Boolean).join(' ');
    return full || String(email || '').split('@')[0] || 'Trader';
  }
  function avatarColor(email) {
    const C = ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444'];
    let h = 0; for (const ch of String(email || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return C[h % C.length];
  }
  function applyHeaderAvatar(p, email) {
    const photo = safeAvatar(p.avatar);
    const name = displayName(p, email);
    let tries = 0;
    (function go() {
      if (typeof window.obSetAccountAvatar === 'function') window.obSetAccountAvatar(photo || null, name);
      else if (tries++ < 40) setTimeout(go, 250);
    })();
  }
  function makeAvatar(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Please choose an image file (JPG, PNG or WebP).'));
      if (file.size > 20 * 1024 * 1024) return reject(new Error('That image is too large (max 20 MB).'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 256;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256);
          const s = Math.min(img.naturalWidth, img.naturalHeight);
          ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
          let q = 0.9, out = c.toDataURL('image/jpeg', q);
          while (out.length > AVATAR_MAX && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
          URL.revokeObjectURL(url);
          if (out.length > AVATAR_MAX) return reject(new Error('The photo could not be made small enough. Try another image.'));
          resolve(out);
        } catch (err) { URL.revokeObjectURL(url); reject(err); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
      img.src = url;
    });
  }

  async function renderProfile(body) {
    const [me, p0] = await Promise.all([loadMe(), loadProfile()]);
    const p = { ...p0 };
    const email = me?.email || '';
    let avatar = safeAvatar(p.avatar);
    const avatarHtml = () => avatar ? `<img src="${esc(avatar)}" alt="Profile photo">` : esc((displayName(p, email).charAt(0) || '?'));
    body.innerHTML = `
      <div class="ac-card">
        <div class="ac-profile-top">
          <div class="ac-avatar" id="acAvatar" style="background:${avatarColor(email)}">${avatarHtml()}</div>
          <div class="ac-profile-who">
            <div class="ac-profile-name" id="acProfName">${esc(displayName(p, email))}</div>
            <div class="ac-profile-user" id="acProfUser">${p.username ? '@' + esc(p.username) : esc(email)}</div>
            <div class="ac-row" style="margin-top:10px">
              <label class="ac-btn ac-btn-sm" title="JPG, PNG or WebP. Resized to 256×256.">
                <i class="fa-solid fa-camera"></i> ${avatar ? 'Change photo' : 'Upload photo'}
                <input type="file" id="acAvatarInput" accept="image/*" class="hidden">
              </label>
              <button type="button" class="ac-btn ac-btn-sm ac-btn-ghost-danger" id="acAvatarRemove" ${avatar ? '' : 'hidden'}>Remove photo</button>
            </div>
            <div class="ac-err" id="acAvatarErr" hidden></div>
          </div>
          <button type="button" class="ac-btn" id="acEditProfile"><i class="fa-solid fa-pen"></i> Edit Profile</button>
        </div>
      </div>
      <div class="ac-card" id="acProfileForm">
        <div class="ac-card-title">Personal details</div>
        <p class="ac-hint">Your name is shown in the account menu.</p>
        <div class="ac-grid">
          <label class="ac-field"><span class="ac-label">First name</span><input class="ac-input" id="acFirst" maxlength="40" data-dirty autocomplete="given-name" value="${esc(p.firstName)}"></label>
          <label class="ac-field"><span class="ac-label">Last name</span><input class="ac-input" id="acLast" maxlength="40" data-dirty autocomplete="family-name" value="${esc(p.lastName)}"></label>
          <label class="ac-field full"><span class="ac-label">Email</span><input class="ac-input" value="${esc(email)}" readonly aria-readonly="true" title="Your sign-in email cannot be changed here."></label>
        </div>
      </div>
      <div class="ac-card">
        <div class="ac-card-title">Contact</div>
        <div class="ac-grid" style="margin-top:10px">
          <label class="ac-field"><span class="ac-label">Username</span><div class="ac-prefix"><span>@</span><input class="ac-input" id="acUser" maxlength="30" data-dirty autocomplete="username" value="${esc(p.username)}" placeholder="yourname"></div></label>
          <label class="ac-field"><span class="ac-label">Phone number</span><input class="ac-input" id="acPhone" maxlength="25" data-dirty inputmode="tel" autocomplete="tel" value="${esc(p.phone)}" placeholder="+1 555 123 4567"></label>
        </div>
        <div class="ac-err" id="acContactErr" hidden style="margin-top:8px"></div>
      </div>
      <div class="ac-card">
        <div class="ac-card-title">About you</div>
        <label class="ac-field" style="margin-top:10px"><span class="ac-label">A few words about your trading (optional)</span><textarea class="ac-textarea" id="acAbout" maxlength="1000" data-dirty placeholder="Markets you trade, your style, your goals…">${esc(p.about)}</textarea></label>
        <div class="ac-hint" id="acAboutCount" style="margin:6px 0 0;text-align:right">${String(p.about || '').length}/1000</div>
      </div>`;

    const avatarEl = $('#acAvatar', body);
    const err = $('#acAvatarErr', body);
    $('#acAbout', body).addEventListener('input', e => { $('#acAboutCount', body).textContent = `${e.target.value.length}/1000`; });
    $('#acEditProfile', body).addEventListener('click', () => { const f = $('#acFirst', body); f.scrollIntoView({ behavior: 'smooth', block: 'center' }); f.focus(); });
    $('#acAvatarInput', body).addEventListener('change', async e => {
      const file = e.target.files?.[0];
      e.target.value = '';
      err.hidden = true;
      if (!file) return;
      try {
        avatar = await makeAvatar(file);
        avatarEl.innerHTML = avatarHtml();
        $('#acAvatarRemove', body).hidden = false;
        setDirty(true);
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
    $('#acAvatarRemove', body).addEventListener('click', () => {
      avatar = '';
      avatarEl.innerHTML = avatarHtml();
      $('#acAvatarRemove', body).hidden = true;
      setDirty(true);
    });

    state.save = async () => {
      const next = {
        ...state.profile,
        firstName: $('#acFirst', body).value.trim(),
        lastName: $('#acLast', body).value.trim(),
        username: $('#acUser', body).value.trim().replace(/^@/, ''),
        phone: $('#acPhone', body).value.trim(),
        about: $('#acAbout', body).value.trim(),
        avatar: avatar || '',
        updatedAt: new Date().toISOString()
      };
      const cErr = $('#acContactErr', body);
      cErr.hidden = true;
      $('#acUser', body).classList.remove('invalid');
      $('#acPhone', body).classList.remove('invalid');
      if (next.username && !/^[A-Za-z0-9_.]{3,30}$/.test(next.username)) {
        cErr.textContent = 'Username: 3–30 characters, letters, numbers, "_" and "." only.'; cErr.hidden = false;
        $('#acUser', body).classList.add('invalid'); $('#acUser', body).focus();
        return false;
      }
      if (next.phone && !/^[0-9+()\-.\s]{5,25}$/.test(next.phone)) {
        cErr.textContent = 'Phone number: digits, spaces and + ( ) - only.'; cErr.hidden = false;
        $('#acPhone', body).classList.add('invalid'); $('#acPhone', body).focus();
        return false;
      }
      await storagePut(PROFILE_KEY, JSON.stringify(next));
      state.profile = next;
      $('#acProfName', body).textContent = displayName(next, email);
      $('#acProfUser', body).textContent = next.username ? '@' + next.username : email;
      applyHeaderAvatar(next, email);
      return true;
    };
  }

  // ── ACCOUNTS ──────────────────────────────────────────────────────────────
  function typeBadge(type) { return `<span class="ac-badge ${String(type).toLowerCase()}">${esc(type)}</span>`; }
  function renderAccountsSection(body) {
    const accounts = listAccounts();
    const order = t => TYPES.indexOf(t);
    accounts.sort((a, b) => order(a.type) - order(b.type) || (a.status === 'archived') - (b.status === 'archived'));
    const unassigned = allTrades().filter(t => t.mode !== 'Backtest' && !t.accountId);
    body.innerHTML = `
      <div class="ac-card">
        <div class="ac-row between" style="margin-bottom:10px">
          <div><div class="ac-card-title">Trading accounts</div><p class="ac-hint" style="margin:0">Real, Demo and Funded accounts each have their own trades and balance. "In use" is the account the Trading page logs into for that mode.</p></div>
          <button type="button" class="ac-btn ac-btn-primary" id="acAddAcc"><i class="fa-solid fa-plus"></i> Add account</button>
        </div>
        <div class="ac-acc-list">
          ${accounts.length ? accounts.map(a => {
            const b = balanceOf(a);
            const n = tradesFor(a).length;
            const inUse = a.type !== 'Backtest' && activeIdFor(a.type) === a.id && a.status !== 'archived';
            const meta = [a.broker, a.currency, `${n} trade${n === 1 ? '' : 's'}`, a.profitTarget ? 'target ' + money(a.profitTarget) : '', a.maxDrawdown ? 'max DD ' + money(a.maxDrawdown) : '', a.dailyLossLimit ? 'daily loss ' + money(a.dailyLossLimit) : ''].filter(Boolean).map(esc).join(' · ');
            return `<div class="ac-acc ${a.status === 'archived' ? 'archived' : ''} ${inUse ? 'active-acc' : ''}" data-id="${esc(a.id)}">
              <div class="min-w-0">
                <div class="ac-acc-name">${esc(a.name)} ${typeBadge(a.type)} <span class="ac-badge status-${a.status}">${a.status === 'archived' ? 'Archived' : 'Active'}</span>${inUse ? '<span class="ac-badge inuse">In use</span>' : ''}</div>
                <div class="ac-acc-meta">${meta}</div>
              </div>
              <div>
                <div class="ac-acc-bal">${money(b.balance)}</div>
                <div class="ac-acc-ret ${b.pct >= 0 ? 'ac-pos' : 'ac-neg'}">${b.pct >= 0 ? '+' : ''}${b.pct.toFixed(2)}%${b.cash ? ` · cash ${money(b.cash, true)}` : ''}</div>
              </div>
              <div class="ac-acc-actions">
                ${a.type !== 'Backtest' && a.status !== 'archived' && !inUse ? `<button type="button" class="ac-btn ac-btn-sm" data-act="use">Use for ${esc(a.type)}</button>` : ''}
                <button type="button" class="ac-btn ac-btn-sm" data-act="edit"><i class="fa-solid fa-pen"></i> Edit</button>
                <button type="button" class="ac-btn ac-btn-sm" data-act="rename">Rename</button>
                <button type="button" class="ac-btn ac-btn-sm" data-act="${a.status === 'archived' ? 'restore' : 'archive'}">${a.status === 'archived' ? 'Restore' : 'Archive'}</button>
                <button type="button" class="ac-btn ac-btn-sm" data-act="cash">Account settings</button>
                <button type="button" class="ac-btn ac-btn-sm ac-btn-ghost-danger" data-act="delete"><i class="fa-solid fa-trash"></i> Delete</button>
              </div>
            </div>`;
          }).join('') : '<div class="ac-empty">No accounts yet.</div>'}
        </div>
      </div>
      ${unassigned.length ? `<div class="ac-card" id="acUnassigned">
        <div class="ac-card-title"><i class="fa-solid fa-circle-exclamation" style="color:var(--amber)"></i> Unassigned trades</div>
        <p class="ac-hint">${unassigned.length} trade${unassigned.length === 1 ? ' is' : 's are'} not linked to any account (kept when an account was deleted). They are not counted in any account balance. Move them to an account of the same mode:</p>
        <div class="ac-acc-list">${MODE_TYPES.map(mode => {
          const n = unassigned.filter(t => t.mode === mode).length;
          if (!n) return '';
          const opts = accounts.filter(a => a.type === mode);
          return `<div class="ac-row" data-mode="${mode}">${typeBadge(mode)} <b style="font-size:12.5px">${n} trade${n === 1 ? '' : 's'}</b>
            <select class="ac-select" style="width:auto;min-width:160px" aria-label="Move ${mode} trades to account">${opts.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select>
            <button type="button" class="ac-btn ac-btn-sm" data-move="${mode}" ${opts.length ? '' : 'disabled'}>Move</button></div>`;
        }).join('')}</div>
      </div>` : ''}`;

    // The old Accounts page summary, kept below the list.
    const wrap = $('#acAccountsGridWrap');
    if (wrap) { body.appendChild(wrap); wrap.classList.remove('hidden'); }
    try { if (typeof window.renderAccounts === 'function') window.renderAccounts(); } catch (_) {}

    $('#acAddAcc', body).addEventListener('click', () => openAccountEditor(null));
    body.querySelectorAll('.ac-acc[data-id]').forEach(row => {
      row.addEventListener('click', e => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const a = findAccount(row.dataset.id);
        if (!a) return;
        const act = btn.dataset.act;
        if (act === 'edit') openAccountEditor(a);
        else if (act === 'rename') openRename(a);
        else if (act === 'archive') setArchived(a, true);
        else if (act === 'restore') setArchived(a, false);
        else if (act === 'delete') openDelete(a);
        else if (act === 'use') { localStorage.setItem(`my_journal_active_account_${a.type}_v1`, a.id); window.dispatchEvent(new CustomEvent('wallet-accounts-updated')); refreshApp(); toast(`${a.name} is now used for ${a.type}.`); rerender(); }
        else if (act === 'cash') { state.settingsAccId = a.id; show('settings'); }
      });
    });
    body.querySelectorAll('[data-move]').forEach(btn => btn.addEventListener('click', async () => {
      const mode = btn.dataset.move;
      const target = btn.parentElement.querySelector('select').value;
      if (!target) return;
      await window.obReplaceTrades(list => list.map(t => (t.mode === mode && !t.accountId) ? (({ accountUnassigned, ...rest }) => ({ ...rest, accountId: target }))(t) : t));
      toast('Trades moved.');
      rerender();
    }));
  }
  function rerender() { if (!$('#pageAccounts')?.classList.contains('hidden')) show(state.section, { force: true }); }

  function setArchived(a, archived) {
    if (archived && MODE_TYPES.includes(a.type) && liveCount(a.type, a.id) === 0) {
      toast(`Each mode needs one active account. Add or restore another ${a.type} account first.`);
      return;
    }
    patchAccount(a.id, { status: archived ? 'archived' : 'active' });
    ensureActiveValid(a.type);
    refreshApp();
    toast(archived ? `${a.name} archived. Its trades are kept.` : `${a.name} restored.`);
    rerender();
  }

  function numOrNull(v) {
    const s = String(v ?? '').replace(/,/g, '').trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function openAccountEditor(a) {
    const isNew = !a;
    const cur = a || B().normalizeAccount({ name: '', startingBalance: 100000 }, 'Demo');
    const currencyOpts = [...new Set([...CURRENCIES, cur.currency])].map(c => `<option ${c === cur.currency ? 'selected' : ''}>${esc(c)}</option>`).join('');
    const field = (id, label, value, extra = '') => `<label class="ac-field"><span class="ac-label">${label}</span><input class="ac-input mono" id="${id}" inputmode="decimal" value="${value == null ? '' : esc(value)}" ${extra}></label>`;
    const m = modal(`${dialogHead(isNew ? 'Add account' : 'Edit account', isNew ? 'Create a trading account.' : 'The type cannot be changed after creation, because the account\'s trades belong to that mode.')}
      <div class="ac-dialog-body">
        <div class="ac-grid">
          <label class="ac-field full"><span class="ac-label">Account name *</span><input class="ac-input" id="aeName" maxlength="60" value="${esc(cur.name)}" placeholder="e.g. FTMO 100k"></label>
          <label class="ac-field"><span class="ac-label">Type</span><select class="ac-select" id="aeType" ${isNew ? '' : 'disabled'}>${TYPES.map(t => `<option ${t === cur.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="ac-field"><span class="ac-label">Broker or prop firm</span><input class="ac-input" id="aeBroker" maxlength="80" value="${esc(cur.broker)}" placeholder="optional"></label>
          <label class="ac-field"><span class="ac-label">Currency</span><select class="ac-select" id="aeCurrency">${currencyOpts}</select></label>
          ${field('aeStart', 'Starting balance *', cur.startingBalance)}
          ${field('aeTarget', 'Profit target', cur.profitTarget, 'placeholder="optional"')}
          ${field('aeDD', 'Max drawdown', cur.maxDrawdown, 'placeholder="optional"')}
          ${field('aeDaily', 'Daily loss limit', cur.dailyLossLimit, 'placeholder="optional"')}
          <label class="ac-field"><span class="ac-label">Status</span><select class="ac-select" id="aeStatus"><option value="active" ${cur.status !== 'archived' ? 'selected' : ''}>Active</option><option value="archived" ${cur.status === 'archived' ? 'selected' : ''}>Archived</option></select></label>
        </div>
        ${isNew ? '<p class="ac-hint" id="aeBacktestHint" style="margin:0" hidden>Backtest trades are not split by account, so a Backtest account shows all Backtest trades.</p>' : ''}
        <div class="ac-err" id="aeErr" hidden></div>
      </div>
      <div class="ac-dialog-foot"><button type="button" class="ac-btn" data-ac-close>Cancel</button><button type="button" class="ac-btn ac-btn-primary" id="aeSave">${isNew ? 'Add account' : 'Save changes'}</button></div>`);
    const el = m.el;
    const typeSel = $('#aeType', el);
    const hint = $('#aeBacktestHint', el);
    if (hint) typeSel.addEventListener('change', () => { hint.hidden = typeSel.value !== 'Backtest'; });
    $('#aeSave', el).addEventListener('click', () => {
      const err = $('#aeErr', el);
      const fail = msg => { err.textContent = msg; err.hidden = false; };
      const name = $('#aeName', el).value.trim();
      const start = numOrNull($('#aeStart', el).value);
      const target = numOrNull($('#aeTarget', el).value);
      const dd = numOrNull($('#aeDD', el).value);
      const daily = numOrNull($('#aeDaily', el).value);
      const status = $('#aeStatus', el).value;
      const type = isNew ? typeSel.value : cur.type;
      if (!name) return fail('Enter an account name.');
      if (/[<>]/.test(name)) return fail('The name cannot contain < or >.');
      if (!(start > 0)) return fail('Enter a starting balance greater than 0.');
      for (const [v, label] of [[target, 'Profit target'], [dd, 'Max drawdown'], [daily, 'Daily loss limit']]) {
        if (Number.isNaN(v) || (v != null && v < 0)) return fail(`${label} must be a positive number (or empty).`);
      }
      if (status === 'archived' && MODE_TYPES.includes(type) && liveCount(type, cur.id) === 0) {
        return fail(`Each mode needs one active account, so this ${type} account cannot be archived.`);
      }
      const fields = { name, broker: $('#aeBroker', el).value.trim(), currency: $('#aeCurrency', el).value, startingBalance: start, balance: start, profitTarget: target, maxDrawdown: dd, dailyLossLimit: daily, status };
      if (isNew) {
        const d = readAccountsRaw();
        const acc = B().normalizeAccount({ ...fields, id: `${type.toLowerCase()}-${Date.now()}` }, type);
        if (!Array.isArray(d[type])) d[type] = [];
        d[type].push(acc);
        writeAccountsRaw(d);
        // First account of a mode becomes the one in use.
        if (type !== 'Backtest' && !activeIdFor(type)) localStorage.setItem(`my_journal_active_account_${type}_v1`, acc.id);
        toast('Account added.');
      } else {
        if (cur.balanceType === 'current' && start !== cur.startingBalance) fields.balanceType = 'starting';
        patchAccount(cur.id, fields);
        ensureActiveValid(type);
        toast('Account updated.');
      }
      m.close();
      refreshApp();
      rerender();
    });
  }

  function openRename(a) {
    const m = modal(`${dialogHead('Rename account')}
      <div class="ac-dialog-body"><label class="ac-field"><span class="ac-label">Account name</span><input class="ac-input" id="arName" maxlength="60" value="${esc(a.name)}"></label><div class="ac-err" id="arErr" hidden></div></div>
      <div class="ac-dialog-foot"><button type="button" class="ac-btn" data-ac-close>Cancel</button><button type="button" class="ac-btn ac-btn-primary" id="arSave">Rename</button></div>`, { sm: true });
    const input = $('#arName', m.el);
    const save = () => {
      const name = input.value.trim();
      const err = $('#arErr', m.el);
      if (!name || /[<>]/.test(name)) { err.textContent = name ? 'The name cannot contain < or >.' : 'Enter a name.'; err.hidden = false; return; }
      patchAccount(a.id, { name });
      m.close(); refreshApp(); toast('Account renamed.'); rerender();
    };
    $('#arSave', m.el).addEventListener('click', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    setTimeout(() => input.select(), 0);
  }

  function openDelete(a) {
    if (MODE_TYPES.includes(a.type) && liveCount(a.type, a.id) === 0) {
      modal(`${dialogHead('Cannot delete this account')}<div class="ac-dialog-body"><p class="ac-hint" style="margin:0">${esc(a.name)} is the only active ${esc(a.type)} account. The ${esc(a.type)} mode always needs one, so add (or restore) another ${esc(a.type)} account first.</p></div><div class="ac-dialog-foot"><button type="button" class="ac-btn ac-btn-primary" data-ac-close>OK</button></div>`, { sm: true });
      return;
    }
    const linked = a.type === 'Backtest' ? [] : tradesFor(a);
    const n = linked.length;
    const step1 = () => {
      if (!n) return step2('none');
      const m = modal(`${dialogHead(`Delete ${a.name}?`, `This account has <b>${n}</b> trade${n === 1 ? '' : 's'}. What should happen to ${n === 1 ? 'it' : 'them'}?`)}
        <div class="ac-dialog-body">
          <label class="ac-choice"><input type="radio" name="acDelMode" value="keep" checked><div><b>Keep the trades, unassigned</b><span>They stay in your journal and exports, but no longer count in any account balance. You can move them to another account later.</span></div></label>
          <label class="ac-choice"><input type="radio" name="acDelMode" value="delete"><div><b>Delete the trades too</b><span>The ${n} trade${n === 1 ? '' : 's'} (with notes and screenshots) are removed permanently.</span></div></label>
        </div>
        <div class="ac-dialog-foot"><button type="button" class="ac-btn" data-ac-close>Cancel</button><button type="button" class="ac-btn ac-btn-primary" id="adNext">Continue</button></div>`, { sm: true });
      $('#adNext', m.el).addEventListener('click', () => { const v = m.el.querySelector('input[name=acDelMode]:checked').value; m.close(); step2(v); });
    };
    const step2 = choice => {
      const what = choice === 'delete' ? `Its ${n} trade${n === 1 ? '' : 's'} will be <b>permanently deleted</b>.`
        : choice === 'keep' ? `Its ${n} trade${n === 1 ? '' : 's'} will be kept as unassigned.`
        : a.type === 'Backtest' ? 'Backtest trades are not linked to an account and stay as they are.' : 'It has no trades.';
      const m = modal(`${dialogHead(`Delete ${a.name}?`)}
        <div class="ac-dialog-body"><div class="ac-warn">The account <b>${esc(a.name)}</b> (${esc(a.type)}) will be removed. ${what} This cannot be undone.</div></div>
        <div class="ac-dialog-foot"><button type="button" class="ac-btn" data-ac-close>Cancel</button><button type="button" class="ac-btn ac-btn-danger" id="adConfirm"><i class="fa-solid fa-trash"></i> Delete account</button></div>`, { sm: true });
      $('#adConfirm', m.el).addEventListener('click', async () => {
        const btn = $('#adConfirm', m.el);
        btn.disabled = true;
        try {
          const ids = new Set(linked.map(t => t.id));
          if (choice === 'delete') await window.obReplaceTrades(list => list.filter(t => !ids.has(t.id)));
          else if (choice === 'keep') await window.obReplaceTrades(list => list.map(t => ids.has(t.id) ? { ...t, accountId: null, accountUnassigned: true } : t));
          const d = readAccountsRaw();
          if (Array.isArray(d[a.type])) d[a.type] = d[a.type].filter(x => x && x.id !== a.id);
          writeAccountsRaw(d);
          ensureActiveValid(a.type);
          m.close();
          refreshApp();
          toast(`${a.name} deleted.`);
          rerender();
        } catch (err) { btn.disabled = false; toast(err.message || 'Delete failed.'); }
      });
    };
    step1();
  }

  // ── ACCOUNT SETTINGS ──────────────────────────────────────────────────────
  function weekRange() {
    const d = new Date(); const day = (d.getDay() + 6) % 7; // Monday = 0
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return [iso(mon), iso(sun)];
  }
  function monthRange() { const t = todayIso(); return [t.slice(0, 8) + '01', t.slice(0, 8) + '31']; }
  function progressHtml(label, pnl, target) {
    if (!(target > 0)) return `<div class="ac-hint" style="margin:6px 0 0">${label}: ${money(pnl, true)} · no target set</div>`;
    const pct = Math.max(0, Math.min(100, (pnl / target) * 100));
    return `<div style="margin-top:10px"><div class="ac-prog ${pnl < 0 ? 'neg' : ''}"><i style="width:${pnl < 0 ? 100 : pct}%"></i></div>
      <div class="ac-prog-row"><span>${label}: <b class="${pnl >= 0 ? 'ac-pos' : 'ac-neg'}">${money(pnl, true)}</b> of ${money(target)}</span><span>${pnl < 0 ? 'below 0' : pct.toFixed(0) + '%'}</span></div></div>`;
  }

  function renderSettings(body) {
    const accounts = listAccounts();
    if (!accounts.length) { body.innerHTML = '<div class="ac-card"><div class="ac-empty">Add an account first.</div></div>'; return; }
    const mode = window.activeMode;
    let acc = findAccount(state.settingsAccId) || findAccount(activeIdFor(mode)) || accounts.find(a => a.status !== 'archived') || accounts[0];
    state.settingsAccId = acc.id;
    const b = balanceOf(acc);
    const p = prefs();
    const s = settings();
    const tzList = (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Dubai', 'Australia/Sydney', 'Africa/Johannesburg']);
    const tzs = [...new Set([p.timezone, ...tzList])];
    const [w0, w1] = weekRange(); const [m0, m1] = monthRange();
    const wk = B().periodPnl(acc, tradesFor(acc), risk(), w0, w1);
    const mo = B().periodPnl(acc, tradesFor(acc), risk(), m0, m1);
    const moves = [...acc.cashMovements].sort((x, y) => y.date.localeCompare(x.date));
    let balanceType = acc.balanceType;
    let moveType = 'deposit';

    body.innerHTML = `
      <div class="ac-card">
        <div class="ac-row between">
          <label class="ac-field" style="min-width:220px;flex:1"><span class="ac-label">Account</span>
            <select class="ac-select" id="asAcc">${accounts.map(a => `<option value="${esc(a.id)}" ${a.id === acc.id ? 'selected' : ''}>${esc(a.name)} · ${esc(a.type)}${a.status === 'archived' ? ' (archived)' : ''}</option>`).join('')}</select></label>
          <div style="text-align:right"><div class="ac-label">Current balance</div><div class="ac-acc-bal" id="asBalNow">${money(b.balance)}</div></div>
        </div>
        <p class="ac-hint" style="margin:8px 0 0">Start ${money(b.base)} · trades ${money(b.tradePnl, true)} · cash movements ${money(b.cash, true)}. Each trade counts R × starting balance × risk % (${risk()}%).</p>
      </div>

      <div class="ac-card">
        <div class="ac-card-title">Balance</div>
        <p class="ac-hint">Enter the starting balance, or today's current balance and the starting balance is worked out from your trades and cash movements.</p>
        <div class="ac-grid">
          <div class="ac-field"><span class="ac-label" id="asBtLabel">Balance type</span>
            <div class="ac-seg" role="radiogroup" aria-labelledby="asBtLabel" id="asBalType">
              <button type="button" role="radio" data-bt="starting" aria-checked="${balanceType !== 'current'}">Starting</button>
              <button type="button" role="radio" data-bt="current" aria-checked="${balanceType === 'current'}">Current</button>
            </div></div>
          <label class="ac-field"><span class="ac-label" id="asAmtLabel">${balanceType === 'current' ? 'Current balance' : 'Starting balance'}</span>
            <div class="ac-prefix"><span>${esc(p.currencySymbol)}</span><input class="ac-input mono" id="asAmount" inputmode="decimal" data-dirty value="${(balanceType === 'current' ? b.balance : b.base).toFixed(2)}"></div></label>
        </div>
        <div class="ac-err" id="asBalErr" hidden style="margin-top:8px"></div>
      </div>

      <div class="ac-card">
        <div class="ac-card-title">Profit targets</div>
        <div class="ac-grid" style="margin-top:10px">
          <label class="ac-field"><span class="ac-label">Weekly target</span><div class="ac-prefix"><span>${esc(p.currencySymbol)}</span><input class="ac-input mono" id="asWeekly" inputmode="decimal" data-dirty value="${acc.weeklyTarget ?? ''}" placeholder="optional"></div>${progressHtml('This week', wk, acc.weeklyTarget)}</label>
          <label class="ac-field"><span class="ac-label">Monthly target</span><div class="ac-prefix"><span>${esc(p.currencySymbol)}</span><input class="ac-input mono" id="asMonthly" inputmode="decimal" data-dirty value="${acc.monthlyTarget ?? ''}" placeholder="optional"></div>${progressHtml('This month', mo, acc.monthlyTarget)}</label>
        </div>
      </div>

      <div class="ac-card">
        <div class="ac-card-title">Cash movements</div>
        <p class="ac-hint">Deposits and withdrawals change the balance and the $ equity curve from their date on. They are not counted as trading return. Added and removed right away.</p>
        <div class="ac-grid three" style="align-items:end">
          <div class="ac-field"><span class="ac-label" id="asMvLabel">Type</span><div class="ac-seg" role="radiogroup" aria-labelledby="asMvLabel" id="asMvType">
            <button type="button" role="radio" data-mv="deposit" aria-checked="true">Deposit</button><button type="button" role="radio" data-mv="withdraw" aria-checked="false">Withdraw</button></div></div>
          <label class="ac-field"><span class="ac-label">Date</span><input class="ac-input" type="date" id="asMvDate" value="${todayIso()}" max="2100-12-31"></label>
          <label class="ac-field"><span class="ac-label">Amount</span><div class="ac-prefix"><span>${esc(p.currencySymbol)}</span><input class="ac-input mono" id="asMvAmount" inputmode="decimal" placeholder="0.00"></div></label>
          <label class="ac-field full"><span class="ac-label">Note</span><input class="ac-input" id="asMvNote" maxlength="200" placeholder="optional, e.g. payout"></label>
        </div>
        <div class="ac-row between" style="margin-top:10px"><div class="ac-err" id="asMvErr" hidden></div><span></span><button type="button" class="ac-btn ac-btn-primary" id="asMvAdd"><i class="fa-solid fa-plus"></i> Add movement</button></div>
        <div class="ac-table-wrap" style="margin-top:12px">
          ${moves.length ? `<table class="ac-table"><thead><tr><th>Date</th><th>Type</th><th class="num">Amount</th><th>Note</th><th></th></tr></thead><tbody>
            ${moves.map(m => `<tr><td>${fmtDate(m.date)}${m.date > todayIso() ? ' <span class="ac-badge status-archived">upcoming</span>' : ''}</td><td>${m.type === 'withdraw' ? 'Withdraw' : 'Deposit'}</td>
              <td class="num ${m.type === 'withdraw' ? 'ac-neg' : 'ac-pos'}">${m.type === 'withdraw' ? '-' : '+'}${money(m.amount)}</td><td>${esc(m.note) || '<span style="color:var(--muted)">—</span>'}</td>
              <td class="num"><button type="button" class="ac-btn ac-btn-sm ac-btn-ghost-danger" data-del-mv="${esc(m.id)}" aria-label="Remove movement">Remove</button></td></tr>`).join('')}
          </tbody></table>` : '<div class="ac-empty">No deposits or withdrawals yet.</div>'}
        </div>
      </div>

      <div class="ac-card">
        <div class="ac-card-title">Preferences</div>
        <p class="ac-hint">Apply to all accounts. Daily trade limit, hard stop and starting capital for Backtest are on the <button type="button" class="ac-link" id="asGoSettings">Settings page</button>.</p>
        <div class="ac-grid three">
          <label class="ac-field"><span class="ac-label">Timezone</span><select class="ac-select" id="asTz" data-dirty>${tzs.map(z => `<option ${z === p.timezone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
          <label class="ac-field"><span class="ac-label">Currency symbol</span><select class="ac-select" id="asSym" data-dirty>${[...new Set([p.currencySymbol, ...SYMBOLS])].map(c => `<option ${c === p.currencySymbol ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          <label class="ac-field"><span class="ac-label">Date format</span><select class="ac-select" id="asDf" data-dirty>${DATE_FORMATS.map(f => `<option ${f === p.dateFormat ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
          <label class="ac-field"><span class="ac-label">Default risk per trade (%)</span><input class="ac-input mono" id="asRisk" inputmode="decimal" data-dirty value="${esc(s.riskPercent ?? 1)}"></label>
          <label class="ac-field"><span class="ac-label">Default R:R</span><input class="ac-input mono" id="asRR" inputmode="decimal" data-dirty value="${esc(s.defaultRR ?? 2)}"></label>
        </div>
        <p class="ac-hint" style="margin:10px 0 0">Risk % and R:R are the same values as on the Settings page (one setting, shown in both places).</p>
        <div class="ac-err" id="asPrefErr" hidden style="margin-top:8px"></div>
      </div>`;

    $('#asAcc', body).addEventListener('change', e => {
      if (state.dirty && !window.confirm('Discard unsaved changes for this account?')) { e.target.value = acc.id; return; }
      state.settingsAccId = e.target.value; show('settings', { force: true });
    });
    $('#asGoSettings', body).addEventListener('click', () => window.switchTab && window.switchTab('settings'));
    const seg = (root, attr, onPick) => root.addEventListener('click', e => {
      const btn = e.target.closest(`[${attr}]`); if (!btn) return;
      root.querySelectorAll(`[${attr}]`).forEach(x => x.setAttribute('aria-checked', String(x === btn)));
      onPick(btn.getAttribute(attr));
    });
    seg($('#asBalType', body), 'data-bt', v => {
      if (v === balanceType) return;
      balanceType = v;
      $('#asAmtLabel', body).textContent = v === 'current' ? 'Current balance' : 'Starting balance';
      const fresh = balanceOf(findAccount(acc.id) || acc);
      $('#asAmount', body).value = (v === 'current' ? fresh.balance : fresh.base).toFixed(2);
      setDirty(true);
    });
    seg($('#asMvType', body), 'data-mv', v => { moveType = v; });

    $('#asMvAdd', body).addEventListener('click', () => {
      const err = $('#asMvErr', body);
      err.hidden = true;
      const amount = numOrNull($('#asMvAmount', body).value);
      const date = $('#asMvDate', body).value;
      if (!(amount > 0)) { err.textContent = 'Enter an amount greater than 0.'; err.hidden = false; return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { err.textContent = 'Choose a date.'; err.hidden = false; return; }
      const mv = B().normalizeMovement({ type: moveType, date, amount, note: $('#asMvNote', body).value.trim() });
      const fresh = findAccount(acc.id);
      if (moveType === 'withdraw' && mv.date <= todayIso() && balanceOf(fresh).balance - mv.amount < 0 &&
          !window.confirm('This withdrawal takes the balance below zero. Add it anyway?')) return;
      patchAccount(acc.id, { cashMovements: [...fresh.cashMovements, mv] });
      refreshApp();
      toast(moveType === 'withdraw' ? 'Withdrawal added.' : 'Deposit added.');
      keepDirtyRerender();
    });
    body.querySelectorAll('[data-del-mv]').forEach(btn => btn.addEventListener('click', () => {
      const fresh = findAccount(acc.id);
      const mv = fresh.cashMovements.find(m => m.id === btn.dataset.delMv);
      if (!mv || !window.confirm(`Remove the ${mv.type === 'withdraw' ? 'withdrawal' : 'deposit'} of ${money(mv.amount)} on ${fmtDate(mv.date)}?`)) return;
      patchAccount(acc.id, { cashMovements: fresh.cashMovements.filter(m => m.id !== mv.id) });
      refreshApp();
      toast('Movement removed.');
      keepDirtyRerender();
    }));
    // Cash movements save right away; re-render without losing other unsaved edits is not
    // possible, so ask first when there are any.
    function keepDirtyRerender() { show('settings', { force: true }); }

    state.save = async () => {
      const fail = (id, msg, field) => { const e = $(id, body); e.textContent = msg; e.hidden = false; if (field) $(field, body).focus(); return false; };
      $('#asBalErr', body).hidden = true; $('#asPrefErr', body).hidden = true;
      const amount = numOrNull($('#asAmount', body).value);
      if (!(amount > 0)) return fail('#asBalErr', 'Enter a balance greater than 0.', '#asAmount');
      const weekly = numOrNull($('#asWeekly', body).value);
      const monthly = numOrNull($('#asMonthly', body).value);
      if (Number.isNaN(weekly) || (weekly != null && weekly < 0) || Number.isNaN(monthly) || (monthly != null && monthly < 0)) return fail('#asBalErr', 'Targets must be positive numbers (or empty).');
      const riskV = numOrNull($('#asRisk', body).value);
      const rrV = numOrNull($('#asRR', body).value);
      if (!(riskV > 0 && riskV <= 100)) return fail('#asPrefErr', 'Risk per trade must be between 0 and 100 %.', '#asRisk');
      if (!(rrV > 0 && rrV <= 100)) return fail('#asPrefErr', 'Default R:R must be greater than 0.', '#asRR');

      // Preferences first (risk % changes the balance maths below).
      await window.obUpdateSettings({ riskPercent: riskV, defaultRR: rrV, timezone: $('#asTz', body).value, currencySymbol: $('#asSym', body).value, dateFormat: $('#asDf', body).value });

      const fresh = findAccount(acc.id);
      let start = amount;
      const patch = { weeklyTarget: weekly, monthlyTarget: monthly, balanceType };
      if (balanceType === 'current') {
        start = B().startingFromCurrent(amount, fresh, tradesFor(fresh), risk());
        if (!(start > 0)) return fail('#asBalErr', 'That current balance does not work with this account\'s trades and cash movements (the starting balance would be 0 or less).', '#asAmount');
        patch.currentBalanceEntered = amount;
        patch.currentBalanceDate = todayIso();
      }
      patch.startingBalance = start;
      patch.balance = start;
      patchAccount(acc.id, patch);
      refreshApp();
      setTimeout(() => show('settings', { force: true }), 0);
      return true;
    };
  }

  // ── SECURITY ──────────────────────────────────────────────────────────────
  async function renderSecurity(body) {
    const me = await loadMe(true);
    if (!me) { body.innerHTML = '<div class="ac-card"><div class="ac-msg bad">Please sign in again.</div></div>'; return; }
    const hasPw = me.hasPassword !== false;
    const google = !!me.hasGoogle;
    body.innerHTML = `
      <div class="ac-card">
        <div class="ac-card-title">Sign-in methods</div>
        <p class="ac-hint">${esc(me.email)}</p>
        <div class="ac-row">
          ${google ? '<span class="ac-badge demo"><i class="fa-brands fa-google"></i> Signed in with Google</span>' : ''}
          <span class="ac-badge ${hasPw ? 'status-active' : 'status-archived'}"><i class="fa-solid fa-key"></i> ${hasPw ? 'Password set' : 'No password yet'}</span>
        </div>
        ${!hasPw ? '<p class="ac-hint" style="margin:10px 0 0">Your account uses Google sign-in and has no password. Set one below to also sign in with your email and password.</p>' : ''}
      </div>
      <div class="ac-card">
        <div class="ac-card-title">${hasPw ? 'Change password' : 'Set a password'}</div>
        <form id="secForm" autocomplete="on" style="margin-top:10px" novalidate>
          <input type="email" autocomplete="username" value="${esc(me.email)}" hidden readonly>
          <div class="ac-grid">
            ${hasPw ? '<label class="ac-field full"><span class="ac-label">Current password</span><input class="ac-input" type="password" id="secCur" autocomplete="current-password" maxlength="200"></label>' : ''}
            <label class="ac-field"><span class="ac-label">New password</span><input class="ac-input" type="password" id="secNew" autocomplete="new-password" minlength="8" maxlength="200"></label>
            <label class="ac-field"><span class="ac-label">Repeat new password</span><input class="ac-input" type="password" id="secNew2" autocomplete="new-password" minlength="8" maxlength="200"></label>
          </div>
          <p class="ac-hint" style="margin:8px 0 0">At least 8 characters.</p>
          <div id="secMsg" class="ac-msg" hidden style="margin-top:10px"></div>
          <div class="ac-row end" style="margin-top:12px"><button type="submit" class="ac-btn ac-btn-primary" id="secSubmit">${hasPw ? 'Change password' : 'Set password'}</button></div>
        </form>
      </div>`;
    const msg = $('#secMsg', body);
    const say = (text, ok) => { msg.textContent = text; msg.className = 'ac-msg ' + (ok ? 'ok' : 'bad'); msg.hidden = false; };
    $('#secForm', body).addEventListener('submit', async e => {
      e.preventDefault();
      const cur = hasPw ? $('#secCur', body).value : undefined;
      const n1 = $('#secNew', body).value;
      const n2 = $('#secNew2', body).value;
      if (hasPw && !cur) return say('Enter your current password.');
      if (n1.length < 8) return say('The new password must be at least 8 characters.');
      if (n1 !== n2) return say('The two new passwords do not match.');
      const btn = $('#secSubmit', body);
      btn.disabled = true;
      const r = await api('POST', '/api/auth/change-password', hasPw ? { currentPassword: cur, newPassword: n1 } : { newPassword: n1 });
      btn.disabled = false;
      if (r.ok) {
        $('#secForm', body).reset();
        say(r.data.passwordSet ? 'Password set. You can now also sign in with your email and password.' : 'Password changed.', true);
        if (r.data.passwordSet) setTimeout(() => show('security', { force: true }), 1600);
      } else say(r.data.error || 'The password could not be changed. Please try again.');
    });
  }

  // ── DATA ──────────────────────────────────────────────────────────────────
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function renderData(body) {
    const n = allTrades().length;
    const stamp = todayIso();
    body.innerHTML = `
      <div class="ac-card">
        <div class="ac-card-title">Export</div>
        <p class="ac-hint">All ${n} trade${n === 1 ? '' : 's'} across every mode and account. JSON is a full backup (notes and screenshots included) and can be imported again; CSV opens in Excel / Google Sheets.</p>
        <div class="ac-row"><button type="button" class="ac-btn" id="dxCsv" ${n ? '' : 'disabled'}><i class="fa-solid fa-file-csv"></i> Export CSV</button><button type="button" class="ac-btn" id="dxJson" ${n ? '' : 'disabled'}><i class="fa-solid fa-file-code"></i> Export JSON</button></div>
      </div>
      <div class="ac-card">
        <div class="ac-card-title">Import JSON</div>
        <p class="ac-hint">Adds trades from a JSON backup. Nothing is overwritten: trades whose id already exists are skipped. You see a summary before anything is added.</p>
        <label class="ac-btn" style="width:max-content"><i class="fa-solid fa-upload"></i> Choose JSON file<input type="file" id="dxFile" accept=".json,application/json" class="hidden"></label>
        <div id="dxPlan" style="margin-top:12px"></div>
      </div>`;
    $('#dxCsv', body)?.addEventListener('click', () => download(`MY_Journal_Trades_${stamp}.csv`, '﻿' + B().tradesToCSV(allTrades()), 'text/csv;charset=utf-8'));
    $('#dxJson', body)?.addEventListener('click', () => download(`MY_Journal_Backup_${stamp}.json`, JSON.stringify(allTrades(), null, 2), 'application/json'));
    $('#dxFile', body).addEventListener('change', e => {
      const file = e.target.files?.[0];
      e.target.value = '';
      const out = $('#dxPlan', body);
      if (!file) return;
      if (file.size > 60 * 1024 * 1024) { out.innerHTML = '<div class="ac-msg bad">That file is too large (max 60 MB).</div>'; return; }
      const reader = new FileReader();
      reader.onerror = () => { out.innerHTML = '<div class="ac-msg bad">The file could not be read.</div>'; };
      reader.onload = () => {
        let parsed;
        try { parsed = JSON.parse(reader.result); } catch (_) { out.innerHTML = '<div class="ac-msg bad">This is not valid JSON. Nothing was imported.</div>'; return; }
        const plan = B().planImport(parsed, allTrades(), window.obNormalizeTrade);
        if (!plan.ok) { out.innerHTML = `<div class="ac-msg bad">${esc(plan.error)} Nothing was imported.</div>`; return; }
        out.innerHTML = `<div class="ac-msg">
            <b>${esc(file.name)}</b>: ${plan.total} record${plan.total === 1 ? '' : 's'} found.<br>
            <span class="ac-pos">${plan.add} new trade${plan.add === 1 ? '' : 's'} will be added</span> · ${plan.duplicates} duplicate${plan.duplicates === 1 ? '' : 's'} skipped (same id) · ${plan.invalid} invalid skipped.
          </div>
          <div class="ac-row end" style="margin-top:10px"><button type="button" class="ac-btn" id="dxCancel">Cancel</button><button type="button" class="ac-btn ac-btn-primary" id="dxGo" ${plan.add ? '' : 'disabled'}>Import ${plan.add} trade${plan.add === 1 ? '' : 's'}</button></div>`;
        $('#dxCancel', out).addEventListener('click', () => { out.innerHTML = ''; });
        $('#dxGo', out).addEventListener('click', async () => {
          $('#dxGo', out).disabled = true;
          // Re-plan against the current list in case trades changed meanwhile.
          const fresh = B().planImport(parsed, allTrades(), window.obNormalizeTrade);
          await window.obReplaceTrades(list => [...fresh.toAdd, ...list]);
          out.innerHTML = `<div class="ac-msg ok">Imported ${fresh.add} trade${fresh.add === 1 ? '' : 's'}. You now have ${allTrades().length} trades.</div>`;
        });
      };
      reader.readAsText(file);
    });
  }

  // ── DANGER ZONE ───────────────────────────────────────────────────────────
  async function renderDanger(body) {
    const me = await loadMe(true);
    if (!me) { body.innerHTML = '<div class="ac-card"><div class="ac-msg bad">Please sign in again.</div></div>'; return; }
    const hasPw = me.hasPassword !== false;
    const n = allTrades().length;
    body.innerHTML = `
      <div class="ac-card danger">
        <div class="ac-card-title"><i class="fa-solid fa-triangle-exclamation"></i> Delete account</div>
        <div class="ac-warn" style="margin-top:10px">This permanently deletes <b>${esc(me.email)}</b> and everything stored for it:
          <ul><li>all ${n} trade${n === 1 ? '' : 's'}, notes and screenshots</li><li>trading accounts, cash movements, strategies and settings</li><li>your profile and any MT5 links</li></ul>
          It cannot be undone. Export your data first if you may want it later.</div>
        <div class="ac-row" style="margin-top:12px"><button type="button" class="ac-link" id="dzExport">Export my data first →</button></div>
        <form id="dzForm" style="margin-top:12px" novalidate>
          <input type="email" autocomplete="username" value="${esc(me.email)}" hidden readonly>
          <div class="ac-grid">
            ${hasPw ? '<label class="ac-field"><span class="ac-label">Your password</span><input class="ac-input" type="password" id="dzPw" autocomplete="current-password" maxlength="200"></label>' : ''}
            <label class="ac-field"><span class="ac-label">Type <b>DELETE</b> to confirm</span><input class="ac-input mono" id="dzConfirm" autocomplete="off" spellcheck="false" placeholder="DELETE"></label>
          </div>
          <div id="dzMsg" class="ac-msg bad" hidden style="margin-top:10px"></div>
          <div class="ac-row end" style="margin-top:12px"><button type="submit" class="ac-btn ac-btn-danger" id="dzGo" disabled><i class="fa-solid fa-trash"></i> Delete my account</button></div>
        </form>
      </div>`;
    const go = $('#dzGo', body);
    const check = () => { go.disabled = !($('#dzConfirm', body).value === 'DELETE' && (!hasPw || $('#dzPw', body).value)); };
    body.querySelectorAll('#dzConfirm, #dzPw').forEach(i => i.addEventListener('input', check));
    $('#dzExport', body).addEventListener('click', () => show('data'));
    $('#dzForm', body).addEventListener('submit', async e => {
      e.preventDefault();
      check();
      if (go.disabled) return;
      if (!window.confirm('Last check: permanently delete your account and all of its data?')) return;
      go.disabled = true;
      const r = await api('DELETE', '/api/auth/account', hasPw ? { confirm: 'DELETE', password: $('#dzPw', body).value } : { confirm: 'DELETE' });
      if (!r.ok) {
        const m = $('#dzMsg', body); m.textContent = r.data.error || 'The account could not be deleted. Please try again.'; m.hidden = false;
        go.disabled = false;
        return;
      }
      // Remove this browser's cached copies too, so nothing reappears.
      try {
        Object.keys(localStorage).forEach(k => { if (k !== 'my-journal-theme' && /^(my_journal_|ob[-_]|journal|mt5)/i.test(k)) localStorage.removeItem(k); });
      } catch (_) {}
      window.location.replace('/auth.html');
    });
  }

  // ── open / boot ───────────────────────────────────────────────────────────
  window.openAccountCenter = function (section) {
    const target = SECTIONS.some(s => s.id === section) ? section : 'profile';
    const page = $('#pageAccounts');
    const alreadyOpen = page && !page.classList.contains('hidden');
    state.pending = target;
    if (typeof window.switchTab === 'function') window.switchTab('accounts');
    if (alreadyOpen || state.rendered) show(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  function syncStickyTop() {
    const h = document.querySelector('header');
    const sticky = h && /sticky|fixed/.test(getComputedStyle(h).position);
    document.documentElement.style.setProperty('--ac-top', (sticky ? h.offsetHeight : 0) + 'px');
  }

  function boot() {
    const page = $('#pageAccounts');
    if (!page || !window.obBalance) return;
    syncStickyTop();
    window.addEventListener('resize', syncStickyTop);
    try { const s = localStorage.getItem(SECTION_KEY); if (SECTIONS.some(x => x.id === s)) state.section = s; } catch (_) {}
    bindNav();
    renderNav();
    // Render whenever the page becomes visible (menu, #accounts, restored tab).
    const onVisible = () => {
      if (page.classList.contains('hidden')) return;
      const target = state.pending || state.section;
      state.pending = null;
      if (!state.rendered || target !== state.section) show(target);
      else if (!state.dirty) show(target, { force: true });
    };
    new MutationObserver(onVisible).observe(page, { attributes: true, attributeFilter: ['class'] });
    onVisible();
    // Header avatar / name from the stored profile.
    Promise.all([loadMe(), loadProfile()]).then(([me, p]) => { if (me) applyHeaderAvatar(p, me.email); }).catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
