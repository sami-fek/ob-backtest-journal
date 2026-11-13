/**
 * theme.js — light / dark / system theme for MY Journal.
 *
 * - Choice stored in localStorage 'my-journal-theme' ("light" | "dark" | "system").
 *   Default "system" follows the OS. A tiny inline script in <head> sets
 *   html[data-theme] before first paint; this file keeps it in sync.
 * - window.setTheme(mode), window.getTheme() → mode, window.getResolvedTheme() → "light" | "dark".
 *   Fires window event 'ob-theme-change' with { mode, theme }.
 * - Recolor layer for the patch scripts: their <style> blocks and inline
 *   style="" attributes use hard-coded light colours. Each known light colour
 *   inside background / color / border declarations is rewritten to
 *   var(--tc-…, <original>). Light theme leaves those variables undefined, so
 *   the original colour is used (no change); theme.css defines them for dark.
 *   Property-aware: white TEXT stays white, only white BACKGROUNDS darken.
 * - Chart.js plugin: axis ticks, grid lines, legend and tooltip colours follow
 *   the theme (--chart-* variables in theme.css).
 */
(() => {
  'use strict';
  const KEY = 'my-journal-theme';
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function readMode() {
    try { const m = localStorage.getItem(KEY); return m === 'light' || m === 'dark' || m === 'system' ? m : 'system'; }
    catch (_) { return 'system'; }
  }
  function resolve(mode) { return mode === 'dark' || (mode === 'system' && media && media.matches) ? 'dark' : 'light'; }

  function apply(mode) {
    const theme = resolve(mode);
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-theme-mode', mode);
    root.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#ffffff');
    refreshCharts();
    window.dispatchEvent(new CustomEvent('ob-theme-change', { detail: { mode, theme } }));
  }

  window.getTheme = () => readMode();
  window.getResolvedTheme = () => resolve(readMode());
  window.setTheme = mode => {
    if (!['light', 'dark', 'system'].includes(mode)) mode = 'system';
    try { localStorage.setItem(KEY, mode); } catch (_) {}
    apply(mode);
  };
  if (media) {
    const onOs = () => { if (readMode() === 'system') apply('system'); };
    media.addEventListener ? media.addEventListener('change', onOs) : media.addListener(onOs);
  }
  // Another tab changed the theme.
  window.addEventListener('storage', e => { if (e.key === KEY) apply(readMode()); });

  // ── Recolor layer ──────────────────────────────────────────────────────────
  const hex = h => { h = h.toLowerCase(); if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; return h; };
  const MAPS = {
    bg: {
      '#ffffff': 'bg-white', '#fafafa': 'bg-50', '#f8fafc': 'bg-50', '#f9fafb': 'bg-50', '#f4f7fb': 'page',
      '#f1f5f9': 'bg-100', '#f4f4f5': 'bg-100', '#f3f4f6': 'bg-100', '#e2e8f0': 'bg-200', '#e5e7eb': 'bg-200',
      '#eff6ff': 'bg-blue', '#dbeafe': 'bg-blue', '#eef2ff': 'bg-indigo', '#e0e7ff': 'bg-indigo',
      '#f0fdf4': 'bg-green', '#ecfdf5': 'bg-green', '#dcfce7': 'bg-green', '#d1fae5': 'bg-green',
      '#fef2f2': 'bg-red', '#fee2e2': 'bg-red', '#fff1f2': 'bg-red', '#ffe4e6': 'bg-red',
      '#fffbeb': 'bg-amber', '#fef3c7': 'bg-amber'
    },
    fg: {
      '#0f172a': 'fg-1', '#1e293b': 'fg-1', '#101729': 'fg-1', '#111827': 'fg-1', '#020617': 'fg-1',
      '#334155': 'fg-2', '#374151': 'fg-2', '#475569': 'fg-3', '#4b5563': 'fg-3',
      '#64748b': 'fg-4', '#6b7280': 'fg-4', '#94a3b8': 'fg-5', '#9ca3af': 'fg-5', '#cbd5e1': 'fg-6'
    },
    bd: {
      '#e2e8f0': 'bd', '#e5e7eb': 'bd', '#e7e7e9': 'bd', '#dadce0': 'bd', '#ffffff': 'bd',
      '#f1f5f9': 'bd-subtle', '#f4f4f5': 'bd-subtle', '#f8fafc': 'bd-subtle',
      '#cbd5e1': 'bd-strong', '#d1d5db': 'bd-strong',
      '#bfdbfe': 'bd-blue', '#c7d2fe': 'bd-blue', '#93c5fd': 'bd-blue', '#dbeafe': 'bd-blue',
      '#bbf7d0': 'bd-green', '#a7f3d0': 'bd-green', '#fecaca': 'bd-red', '#fca5a5': 'bd-red', '#fde68a': 'bd-amber'
    }
  };
  // rgb(...) forms (what el.style serialises to) → hex
  function rgbToHex(s) {
    const m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
    if (!m) return null;
    let a = m[4] == null ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return { hex: '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join(''), a };
  }
  function mapToken(token, kind) {
    let key, alpha = 1;
    if (token[0] === '#') { if (token.length !== 4 && token.length !== 7) return null; key = hex(token); }
    else { const r = rgbToHex(token); if (!r) return null; key = r.hex; alpha = r.a; }
    // Translucent white is used both as a frosted card background (high alpha)
    // and as a highlight on coloured cards (low alpha): only remap the former.
    if (kind === 'bg' && key === '#ffffff' && alpha < 0.5) return null;
    if (kind !== 'bg' && alpha < 0.5) return null;
    const name = MAPS[kind][key];
    return name ? `var(--tc-${name}, ${token})` : null;
  }
  const DECL = /(^|[;{\s"'])(background-color|background|color|border-color|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline-color|outline)(\s*:\s*)([^;{}"']*)/gi;
  const TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
  function transform(css) {
    if (!css || css.indexOf('--tw-') !== -1) return css; // leave Tailwind's own CSS alone
    return css.replace(DECL, (all, pre, prop, sep, value) => {
      if (value.indexOf('var(--tc-') !== -1) return all;
      const p = prop.toLowerCase();
      const kind = p.startsWith('background') ? 'bg' : p === 'color' ? 'fg' : 'bd';
      let changed = false;
      const out = value.replace(TOKEN, t => { const v = mapToken(t, kind); if (v) { changed = true; return v; } return t; });
      return changed ? pre + prop + sep + out : all;
    });
  }
  window.obThemeTransformCss = transform; // used by tests / other scripts

  // transform() is idempotent (already-mapped declarations are skipped), so
  // rewriting only when the text changes cannot loop.
  function fixStyleEl(el) {
    const txt = el.textContent;
    const next = transform(txt);
    if (next !== txt) el.textContent = next;
  }
  function fixInline(el) {
    const s = el.getAttribute && el.getAttribute('style');
    if (!s) return;
    const next = transform(s);
    if (next !== s) el.setAttribute('style', next);
  }
  function fixTree(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'STYLE') { fixStyleEl(node); return; }
    if (node.hasAttribute('style')) fixInline(node);
    if (node.firstElementChild) {
      node.querySelectorAll('style').forEach(fixStyleEl);
      node.querySelectorAll('[style]').forEach(fixInline);
    }
  }
  const observer = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'attributes') { fixInline(m.target); continue; }
      if (m.target && m.target.tagName === 'STYLE') { fixStyleEl(m.target); continue; }
      m.addedNodes.forEach(n => {
        if (n.nodeType === 1) fixTree(n);
        else if (n.nodeType === 3 && n.parentNode && n.parentNode.tagName === 'STYLE') fixStyleEl(n.parentNode);
      });
    }
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
  const fixAll = () => fixTree(root);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fixAll, { once: true });
  fixAll();

  // ── Chart.js ───────────────────────────────────────────────────────────────
  function cssVar(name, fallback) {
    const v = getComputedStyle(root).getPropertyValue(name).trim();
    return v || fallback;
  }
  function chartPalette() {
    return {
      text: cssVar('--chart-text', '#94a3b8'), grid: cssVar('--chart-grid', '#f1f5f9'),
      tipBg: cssVar('--chart-tooltip-bg', 'rgba(15,23,42,.92)'), tipText: cssVar('--chart-tooltip-text', '#ffffff'),
      tipBorder: cssVar('--chart-tooltip-border', 'transparent')
    };
  }
  // Design system (BUILD-PLAN-2): softer green/red, thinner bars, gradient fill
  // under filled lines. Datasets are plain objects (not option proxies), so they
  // can be edited; the original colour is kept so a theme switch re-maps it and
  // a colour the app assigns later is picked up as the new original.
  function parseColor(c) {
    if (typeof c !== 'string') return null;
    let m = c.trim().match(/^#([0-9a-f]{3,8})$/i);
    if (m) {
      let h = m[1];
      if (h.length <= 4) h = h.split('').map(x => x + x).join('');
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a };
    }
    m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
    if (m) { let a = m[4] == null ? 1 : parseFloat(m[4]); if (String(m[4]).endsWith('%')) a /= 100; return { r: +m[1], g: +m[2], b: +m[3], a }; }
    return null;
  }
  // Hue family of a saturated colour → index into the categorical tokens
  // (--ds-chart-1 blue, -2 violet, -3 amber, -4 teal, -5 rose); greys stay as they are.
  function catIndex(p) {
    const r = p.r / 255, g = p.g / 255, b = p.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return -1;
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (s < 0.35) return -1;
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    if (h >= 190 && h < 232) return 0;
    if (h >= 232 && h < 295) return 1;
    if (h >= 20 && h < 65) return 2;
    if (h >= 150 && h < 190) return 3;
    if (h >= 295 && h < 345) return 4;
    return -1;
  }
  function softColor(c, pal) {
    const p = parseColor(c);
    if (!p) return c;
    // red = loss colour; amber/orange (green well above half of red) is a category, not a loss
    const kind = (p.g > p.r + 40 && p.g > p.b + 10) ? 'pos' : (p.r > p.g + 60 && p.r > p.b + 40 && p.g < p.r * 0.55) ? 'neg' : null;
    if (!kind) {
      const i = catIndex(p);
      const t = i >= 0 && pal.cat ? parseColor(pal.cat[i]) : null;
      if (!t) return c;
      return `rgba(${t.r},${t.g},${t.b},${+Math.min(p.a, 1).toFixed(3)})`;
    }
    const t = parseColor(kind === 'pos' ? pal.pos : pal.neg);
    if (!t) return c;
    const a = Math.min(p.a, 1) * (p.a >= 0.5 ? t.a : 1);
    return `rgba(${t.r},${t.g},${t.b},${+a.toFixed(3)})`;
  }
  function mapVal(v, pal) { return Array.isArray(v) ? v.map(x => softColor(x, pal)) : softColor(v, pal); }
  function styleDatasets(chart, pal) {
    const type = chart.config && chart.config.type;
    ((chart.data && chart.data.datasets) || []).forEach(ds => {
      if (!ds || ds.obNoStyle) return;
      ['backgroundColor', 'borderColor', 'hoverBackgroundColor', 'pointBackgroundColor'].forEach(k => {
        const cur = ds[k];
        if (cur == null || typeof cur === 'function') return;
        const store = ds.__obColors || (ds.__obColors = {});
        if (!(k in store) || store[k].mapped !== cur) store[k] = { orig: cur };
        const next = mapVal(store[k].orig, pal);
        store[k].mapped = next;
        ds[k] = next;
      });
      const dsType = ds.type || type;
      if (dsType === 'bar') {
        if (ds.maxBarThickness == null || ds.maxBarThickness > 18) ds.maxBarThickness = 18;
        if (ds.borderRadius == null) ds.borderRadius = 3;
      }
      if (dsType === 'line' && ds.fill && !ds.__obGradient) {
        const base = parseColor(typeof ds.borderColor === 'string' ? ds.borderColor : pal.line) || parseColor(pal.line);
        if (base) {
          ds.__obGradient = true;
          ds.backgroundColor = (ctx) => {
            const area = ctx.chart.chartArea;
            if (!area) return `rgba(${base.r},${base.g},${base.b},0.12)`;
            const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            g.addColorStop(0, `rgba(${base.r},${base.g},${base.b},0.22)`);
            g.addColorStop(1, `rgba(${base.r},${base.g},${base.b},0)`);
            return g;
          };
        }
      }
    });
  }

  const chartPlugin = {
    id: 'obTheme',
    // Chart.js option objects are resolver proxies: only set leaf values on
    // objects that already exist (re-assigning containers can recurse forever).
    beforeUpdate(chart) {
      try { styleDatasets(chart, { pos: cssVar('--ds-chart-pos', 'rgba(34,160,92,.78)'), neg: cssVar('--ds-chart-neg', 'rgba(226,92,92,.78)'), line: cssVar('--ds-chart-line', '#5d7fc4'), cat: [1, 2, 3, 4, 5].map(i => cssVar('--ds-chart-' + i, '')) }); } catch (_) {}
      try {
        const c = chartPalette();
        const o = chart.options;
        if (!o) return;
        const scales = o.scales || {};
        Object.keys(scales).forEach(k => {
          const s = scales[k];
          if (!s) return;
          if (s.ticks) s.ticks.color = c.text;
          if (s.grid && s.grid.display !== false) s.grid.color = c.grid;
          if (s.border) s.border.color = c.grid;
          if (s.pointLabels) s.pointLabels.color = c.text;
          if (s.title) s.title.color = c.text;
        });
        const p = o.plugins;
        if (p && p.legend && p.legend.labels) p.legend.labels.color = c.text;
        if (p && p.tooltip) {
          const tt = p.tooltip;
          tt.backgroundColor = c.tipBg; tt.titleColor = c.tipText; tt.bodyColor = c.tipText;
          tt.borderColor = c.tipBorder; tt.borderWidth = c.tipBorder === 'transparent' ? 0 : 1;
          tt.padding = 10; tt.cornerRadius = 8; tt.boxPadding = 4;
        }
      } catch (_) { /* never break a chart render because of theming */ }
    }
  };
  let chartReady = false;
  function registerChart() {
    if (chartReady || !window.Chart || typeof window.Chart.register !== 'function') return;
    window.Chart.register(chartPlugin);
    try {
      const d = window.Chart.defaults;
      d.font.family = "'Inter', system-ui, sans-serif";
      d.elements.line.borderWidth = 2;
      d.elements.point.radius = 0; d.elements.point.hoverRadius = 4;
      d.plugins.legend.labels.boxWidth = 8; d.plugins.legend.labels.boxHeight = 8; d.plugins.legend.labels.usePointStyle = true;
    } catch (_) {}
    chartReady = true;
  }
  function refreshCharts() {
    registerChart();
    const C = window.Chart;
    if (!C || !C.instances) return;
    Object.values(C.instances).forEach(ch => { try { ch.update('none'); } catch (_) {} });
  }
  registerChart();
  window.addEventListener('load', registerChart);

  apply(readMode());
})();
