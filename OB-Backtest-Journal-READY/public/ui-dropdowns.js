/**
 * ui-dropdowns.js
 * Modern rounded dropdowns for the LOG A TRADE form.
 *
 * The original <select> elements stay in the DOM (hidden) with their ids and
 * values; they remain the source of truth. The custom control:
 *  - sets select.value and dispatches a normal 'change' event when you pick,
 *  - updates its label when code changes select.value / selectedIndex,
 *    rebuilds its options (MutationObserver) or the form is reset.
 * So existing code (handleTradeSubmit, renderStrategyOptions, …) is unchanged.
 *
 * API:
 *   window.obDropdown.enhance(select, { actions: [{ label, onSelect, danger }] })
 *   window.obDropdown.refresh(selectOrId)
 *   window.obDropdown.setActions(selectOrId, actions)
 */
(() => {
  'use strict';
  const FORM_SELECT_IDS = ['formPair', 'formTimeframe', 'formRegime', 'formSession', 'formStrategy'];
  const STYLE_ID = 'ob-dropdown-style';
  const instances = new Map(); // select -> instance
  let openInstance = null;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      .ob-dd-native { display: none !important; }
      .ob-dd { position: relative; width: 100%; }
      .ob-dd-btn {
        width: 100%; height: 32px; padding: 0 10px 0 12px;
        display: flex; align-items: center; justify-content: space-between; gap: 6px;
        border-radius: 12px; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8;
        font: 700 12px/1 Inter, system-ui, sans-serif; cursor: pointer; text-align: left;
        transition: background-color .15s, color .15s, border-color .15s, box-shadow .15s;
      }
      .ob-dd-btn .ob-dd-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
      .ob-dd-btn svg { flex-shrink: 0; transition: transform .15s; }
      .ob-dd-btn:hover, .ob-dd-btn:focus-visible, .ob-dd-btn[aria-expanded="true"] {
        background: #3b82f6; border-color: #3b82f6; color: #fff;
        box-shadow: 0 4px 12px rgba(37,99,235,.25); outline: none;
      }
      .ob-dd-btn[aria-expanded="true"] svg { transform: rotate(180deg); }
      .ob-dd-panel {
        position: fixed; z-index: 300; min-width: 160px; max-height: 280px; overflow-y: auto;
        background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 6px;
        box-shadow: 0 16px 40px rgba(15,23,42,.16), 0 2px 6px rgba(15,23,42,.06);
        font: 600 12px/1.2 Inter, system-ui, sans-serif; color: #334155;
        animation: ob-dd-in .12s ease-out;
      }
      @keyframes ob-dd-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
      .ob-dd-panel.ob-dd-up { animation-name: ob-dd-in-up; }
      @keyframes ob-dd-in-up { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
      .ob-dd-opt {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 8px 10px; border-radius: 9px; cursor: pointer; white-space: nowrap;
      }
      .ob-dd-opt.ob-dd-active { background: #eff6ff; color: #1d4ed8; }
      .ob-dd-opt[aria-selected="true"] { color: #1d4ed8; font-weight: 700; }
      .ob-dd-opt .ob-dd-check { color: #2563eb; visibility: hidden; }
      .ob-dd-opt[aria-selected="true"] .ob-dd-check { visibility: visible; }
      .ob-dd-sep { height: 1px; background: #f1f5f9; margin: 6px 4px; }
      .ob-dd-action { color: #475569; }
      .ob-dd-action.ob-dd-active { background: #eff6ff; color: #1d4ed8; } /* light: blue hover; dark: gray (theme.css) */
      .ob-dd-action.ob-dd-danger.ob-dd-active { background: #fef2f2; color: #dc2626; }
    `;
    document.head.appendChild(s);
  }

  const CHEVRON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  const CHECK = '<svg class="ob-dd-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const nativeIndex = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

  function toSelect(x) { return typeof x === 'string' ? document.getElementById(x) : x; }
  function setNativeValue(select, v) { nativeValue.set.call(select, v); }

  // Keep labels in sync when any code sets select.value / selectedIndex.
  // Patched once on the prototype (works for every select, including
  // implementations that ignore per-instance accessors); only enhanced
  // selects are refreshed, all others behave exactly as before.
  if (!HTMLSelectElement.prototype.__obDropdownPatched) {
    Object.defineProperty(HTMLSelectElement.prototype, 'value', {
      ...nativeValue,
      set(v) { nativeValue.set.call(this, v); if (instances.has(this)) refresh(this); }
    });
    Object.defineProperty(HTMLSelectElement.prototype, 'selectedIndex', {
      ...nativeIndex,
      set(v) { nativeIndex.set.call(this, v); if (instances.has(this)) refresh(this); }
    });
    Object.defineProperty(HTMLSelectElement.prototype, '__obDropdownPatched', { value: true });
  }

  function enhance(select, opts = {}) {
    select = toSelect(select);
    if (!select || instances.has(select)) return instances.get(select) || null;
    injectStyles();

    const wrap = document.createElement('div');
    wrap.className = 'ob-dd';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ob-dd-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.dataset.for = select.id;
    btn.innerHTML = `<span class="ob-dd-label"></span>${CHEVRON}`;
    const label = select.id && document.querySelector(`label[for="${select.id}"]`);
    if (label) btn.setAttribute('aria-labelledby', label.id || (label.id = select.id + '-label'));
    else {
      const prev = select.previousElementSibling;
      if (prev && prev.tagName === 'LABEL') btn.setAttribute('aria-label', prev.textContent.trim());
    }
    wrap.appendChild(btn);
    select.insertAdjacentElement('afterend', wrap);
    select.classList.add('ob-dd-native');
    select.tabIndex = -1;

    const inst = { select, wrap, btn, panel: null, active: -1, actions: opts.actions || [] };
    instances.set(select, inst);

    // Label sync: prototype setters (above), change events, option rebuilds, form reset.
    select.addEventListener('change', () => refresh(select));
    new MutationObserver(() => { refresh(select); if (inst.panel) renderPanel(inst); })
      .observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected', 'label'] });
    select.form?.addEventListener('reset', () => setTimeout(() => refresh(select), 0));

    btn.addEventListener('click', () => (openInstance === inst ? close(inst, false) : open(inst)));
    btn.addEventListener('keydown', e => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(inst); }
    });

    refresh(select);
    return inst;
  }

  function refresh(select) {
    const inst = instances.get(toSelect(select));
    if (!inst) return;
    const opt = inst.select.options[nativeIndex.get.call(inst.select)];
    inst.btn.querySelector('.ob-dd-label').textContent = opt ? opt.textContent : '—';
  }

  function items(inst) {
    const opts = [...inst.select.options].filter(o => !o.disabled && !o.hidden)
      .map(o => ({ type: 'option', value: o.value, text: o.textContent }));
    const acts = (inst.actions || []).map(a => ({ type: 'action', ...a }));
    return { opts, acts, all: [...opts, ...acts] };
  }

  function renderPanel(inst) {
    const { opts, acts } = items(inst);
    const current = nativeValue.get.call(inst.select);
    const panel = inst.panel;
    panel.innerHTML = '';
    let idx = 0;
    opts.forEach(o => {
      const row = document.createElement('div');
      row.className = 'ob-dd-opt';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(o.value === current));
      row.dataset.idx = idx++;
      row.innerHTML = `<span></span>${CHECK}`;
      row.firstChild.textContent = o.text;
      panel.appendChild(row);
    });
    if (acts.length) {
      const sep = document.createElement('div');
      sep.className = 'ob-dd-sep';
      sep.setAttribute('role', 'separator');
      panel.appendChild(sep);
      acts.forEach(a => {
        const row = document.createElement('div');
        row.className = 'ob-dd-opt ob-dd-action' + (a.danger ? ' ob-dd-danger' : '');
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', 'false');
        row.dataset.idx = idx++;
        row.dataset.action = a.id || a.label;
        row.textContent = a.label;
        panel.appendChild(row);
      });
    }
    setActive(inst, inst.active);
  }

  function setActive(inst, i) {
    const rows = [...inst.panel.querySelectorAll('[data-idx]')];
    if (!rows.length) return;
    inst.active = Math.max(0, Math.min(rows.length - 1, i));
    rows.forEach((r, k) => r.classList.toggle('ob-dd-active', k === inst.active));
    if (typeof rows[inst.active].scrollIntoView === 'function') rows[inst.active].scrollIntoView({ block: 'nearest' });
  }

  // Place under the button; flip upward when there is not enough room below.
  function position(inst) {
    const r = inst.btn.getBoundingClientRect();
    const p = inst.panel;
    p.style.minWidth = Math.max(160, r.width) + 'px';
    p.style.maxHeight = '280px';
    const ph = Math.min(p.scrollHeight, 280);
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const up = below < ph + 6 && above > below;
    const room = Math.max(120, (up ? above : below) - 6);
    p.style.maxHeight = Math.min(280, room) + 'px';
    p.classList.toggle('ob-dd-up', up);
    const h = Math.min(ph, room);
    p.style.top = (up ? r.top - 6 - h : r.bottom + 6) + 'px';
    const left = Math.min(r.left, window.innerWidth - p.offsetWidth - 8);
    p.style.left = Math.max(8, left) + 'px';
  }

  function open(inst) {
    if (openInstance && openInstance !== inst) close(openInstance, false);
    const panel = document.createElement('div');
    panel.className = 'ob-dd-panel';
    panel.setAttribute('role', 'listbox');
    panel.id = 'ob-dd-panel-' + (inst.select.id || 'x');
    inst.btn.setAttribute('aria-controls', panel.id);
    inst.panel = panel;
    const { opts } = items(inst);
    inst.active = Math.max(0, opts.findIndex(o => o.value === nativeValue.get.call(inst.select)));
    renderPanel(inst);
    document.body.appendChild(panel);
    position(inst);
    setActive(inst, inst.active);
    inst.btn.setAttribute('aria-expanded', 'true');
    openInstance = inst;
    panel.addEventListener('mousemove', e => {
      const row = e.target.closest('[data-idx]');
      if (row && Number(row.dataset.idx) !== inst.active) setActive(inst, Number(row.dataset.idx));
    });
    panel.addEventListener('mousedown', e => e.preventDefault()); // keep focus on the button
    panel.addEventListener('click', e => {
      const row = e.target.closest('[data-idx]');
      if (row) choose(inst, Number(row.dataset.idx));
    });
  }

  function close(inst, focusBtn) {
    if (!inst || !inst.panel) return;
    inst.panel.remove();
    inst.panel = null;
    inst.btn.setAttribute('aria-expanded', 'false');
    inst.btn.removeAttribute('aria-controls');
    if (openInstance === inst) openInstance = null;
    if (focusBtn) inst.btn.focus();
  }

  function choose(inst, i) {
    const { opts, all } = items(inst);
    const item = all[i];
    if (!item) return;
    close(inst, true);
    if (item.type === 'action') {
      try { item.onSelect && item.onSelect(); } catch (err) { console.error('[MY Journal] dropdown action failed:', err); }
      return;
    }
    if (nativeValue.get.call(inst.select) !== item.value) {
      setNativeValue(inst.select, item.value);
      refresh(inst.select);
      inst.select.dispatchEvent(new Event('input', { bubbles: true }));
      inst.select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    void opts;
  }

  // Keyboard inside an open list (focus stays on the button).
  document.addEventListener('keydown', e => {
    const inst = openInstance;
    if (!inst) return;
    const count = items(inst).all.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(inst, (inst.active + 1) % count); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(inst, (inst.active - 1 + count) % count); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(inst, 0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(inst, count - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(inst, inst.active); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(inst, true); }
    else if (e.key === 'Tab') close(inst, false);
  }, true);
  document.addEventListener('mousedown', e => {
    const inst = openInstance;
    if (inst && !inst.panel.contains(e.target) && !inst.btn.contains(e.target)) close(inst, false);
  }, true);
  window.addEventListener('resize', () => openInstance && close(openInstance, false));
  window.addEventListener('scroll', e => {
    const inst = openInstance;
    if (inst && !(e.target instanceof Node && inst.panel.contains(e.target))) position(inst);
  }, true);

  function setActions(select, actions) {
    const inst = instances.get(toSelect(select));
    if (!inst) return;
    inst.actions = actions || [];
    if (inst.panel) renderPanel(inst);
  }

  window.obDropdown = { enhance, refresh, setActions, close: () => openInstance && close(openInstance, false) };

  function boot() {
    FORM_SELECT_IDS.forEach(id => enhance(id));
    if (typeof window.onObDropdownsReady === 'function') window.onObDropdownsReady();
    window.dispatchEvent(new Event('ob-dropdowns-ready'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
