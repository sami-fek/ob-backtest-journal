// Text + colour checks for the sweep (fix round).
// TEXT  (run with currency € and date format DD/MM/YYYY): visible text and visible tooltips (title)
//        must not contain "$", a standalone "USD", or an ISO date YYYY-MM-DD.
// COLOUR: visible buttons / links / tabs must not use the old saturated blues
//        (#2563eb, #3b82f6, #1d4ed8, #6366f1) as background, border or gradient,
//        including on hover (desktop) — outside the allowed accent list below.

// Text that is genuinely not money or a date (kept short and explicit):
export const TEXT_ALLOWED = [
  { why: 'instrument names (EURUSD, XAUUSD, BTCUSD, USDJPY …)', re: /\b[A-Z0-9]{3,6}USD[A-Z]?\b|\bUSD[A-Z]{3}\b/g },
  { why: 'currency choices in Account center › Preferences (a list of symbols to choose from)', sel: '#asSym' },
  { why: 'MT5 bridge token / EA endpoint shown for copying', sel: '[data-copy], code, pre, .ob-token' },
];
// Blue that is an intended accent (not a button colour):
export const COLOUR_ALLOWED = [
  { why: 'active tab in the header nav (accent)', sel: 'header nav .ob-pill-nav [aria-current="page"], header nav [aria-selected="true"], header nav .active, header nav .ob-nav-active' },
  { why: 'focus ring (outline, not checked) and link text colour (text colour is not checked)' },
];

export function QSCAN(args) {
  const { TEXT_SEL_ALLOWED, COLOUR_SEL_ALLOWED, scopeSel } = args;
  const BLUES = ['rgb(37, 99, 235)', 'rgb(59, 130, 246)', 'rgb(29, 78, 216)', 'rgb(99, 102, 241)'];
  const vis = el => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false; }
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  };
  const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const roots = scopeSel ? [...document.querySelectorAll(scopeSel)].filter(vis) : [document.body];
  const text = [], colour = [];
  const pairRe = /\b[A-Z0-9]{3,6}USD[A-Z]?\b|\bUSD[A-Z]{3}\b/g;
  const bad = t => { const u = t.replace(pairRe, ''); const r = []; if (/\$/.test(u)) r.push('$'); if (/\bUSD\b/.test(u)) r.push('USD'); if (/\b\d{4}-\d{2}-\d{2}\b/.test(u)) r.push('ISO date'); return r; };
  for (const R of roots) {
    const w = document.createTreeWalker(R, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      const p = n.parentElement; const t = n.textContent;
      if (!t.trim() || !p || p.closest('script,style,noscript,template') || (TEXT_SEL_ALLOWED && p.closest(TEXT_SEL_ALLOWED))) continue;
      const hits = bad(t); if (hits.length && vis(p)) text.push(`${hits.join('+')} in ${name(p)}: "${t.trim().replace(/\s+/g, ' ').slice(0, 70)}"`);
    }
    for (const el of R.querySelectorAll('[title], input[placeholder], textarea[placeholder]')) {
      if (TEXT_SEL_ALLOWED && el.closest(TEXT_SEL_ALLOWED)) continue;
      for (const attr of ['title', 'placeholder']) { const v = el.getAttribute(attr); if (!v) continue; const hits = bad(v); if (hits.length && vis(el)) text.push(`${hits.join('+')} in ${attr} of ${name(el)}: "${v.slice(0, 70)}"`); }
    }
    for (const el of R.querySelectorAll('button, a, [role=button], [role=tab], label[for], label.cursor-pointer, [onclick], .ds-btn, input[type=submit]')) {
      if (!vis(el) || (COLOUR_SEL_ALLOWED && el.matches(COLOUR_SEL_ALLOWED))) continue;
      const s = getComputedStyle(el); const found = [];
      if (BLUES.includes(s.backgroundColor)) found.push('background ' + s.backgroundColor);
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(s['border' + side + 'Width']) > 0 && BLUES.includes(s['border' + side + 'Color'])) { found.push('border ' + s['border' + side + 'Color']); break; }
      if (BLUES.some(b => s.backgroundImage.includes(b))) found.push('gradient');
      if (found.length) colour.push(`${name(el)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 26)}": ${found.join(', ')}`);
    }
  }
  // CHARTS: every visible Chart.js series must use the softened palette, not the old saturated colours
  const OLD = { '37,99,235':'#2563eb', '59,130,246':'#3b82f6', '29,78,216':'#1d4ed8', '99,102,241':'#6366f1', '16,185,129':'#10b981', '245,158,11':'#f59e0b', '139,92,246':'#8b5cf6', '20,184,166':'#14b8a6', '236,72,153':'#ec4899', '34,197,94':'#22c55e', '22,163,74':'#16a34a', '239,68,68':'#ef4444', '220,38,38':'#dc2626', '96,165,250':'#60a5fa' };
  const rgbKey = c => { if (typeof c !== 'string') return null; let m = c.match(/^#([0-9a-f]{6})/i); if (m) { const h = m[1]; return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(','); } m = c.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?/); if (!m) return null; if (m[4] !== undefined && +m[4] < 0.3) return null; return [m[1], m[2], m[3]].join(','); };
  if (window.Chart && Chart.instances) for (const ch of Object.values(Chart.instances)) {
    if (!ch.canvas || !vis(ch.canvas)) continue;
    for (const ds of ch.data.datasets || []) for (const k of ['backgroundColor', 'borderColor', 'pointBackgroundColor', 'hoverBackgroundColor']) {
      for (const c of [].concat(ds[k] || [])) { const key = rgbKey(c); if (key && OLD[key]) colour.push('CHART ' + (ch.canvas.id || '?') + ' ' + k + ' ' + OLD[key]); }
    }
  }
  return { text: [...new Set(text)], colour: [...new Set(colour)] };
}

const textSel = TEXT_ALLOWED.filter(a => a.sel).map(a => a.sel).join(', ');
const colourSel = COLOUR_ALLOWED.filter(a => a.sel).map(a => a.sel).join(', ');

export async function qcheck(page, { scope = null, hover = false } = {}) {
  const r = await page.evaluate(QSCAN, { TEXT_SEL_ALLOWED: textSel, COLOUR_SEL_ALLOWED: colourSel, scopeSel: scope });
  if (hover) r.colour.push(...await hoverPass(page, scope));
  return r;
}

// Desktop only: hover every visible button / link in scope and check its colours while hovered.
async function hoverPass(page, scope) {
  const out = [];
  const count = await page.evaluate((scopeSel, allowed) => {
    const vis = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const roots = scopeSel ? [...document.querySelectorAll(scopeSel)] : [document.body];
    let i = 0; document.querySelectorAll('[data-qhov]').forEach(e => e.removeAttribute('data-qhov'));
    for (const R of roots) for (const el of R.querySelectorAll('button, a[href], [role=button], [role=tab], .ob-jh-cell')) { if (vis(el) && !(allowed && el.matches(allowed))) el.setAttribute('data-qhov', String(i++)); if (i >= 160) break; }
    return i;
  }, scope, colourSel);
  for (let i = 0; i < count; i++) {
    const pt = await page.evaluate(i => { const el = document.querySelector(`[data-qhov="${i}"]`); if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i);
    if (!pt) continue;
    await page.mouse.move(pt.x, pt.y); await new Promise(r => setTimeout(r, 170));
    const hit = await page.evaluate((i, allowed) => {
      const BLUES = ['rgb(37, 99, 235)', 'rgb(59, 130, 246)', 'rgb(29, 78, 216)', 'rgb(99, 102, 241)'];
      const host = document.querySelector(`[data-qhov="${i}"]`); if (!host) return null;
      const els = [host, ...host.querySelectorAll('button, a, [role=button]')];
      for (const el of els) {
        if (allowed && el.matches(allowed)) continue;
        const s = getComputedStyle(el); if (Number(s.opacity) === 0 || s.visibility === 'hidden' || s.display === 'none') continue;
        const f = [];
        if (BLUES.includes(s.backgroundColor)) f.push('background ' + s.backgroundColor);
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(s['border' + side + 'Width']) > 0 && BLUES.includes(s['border' + side + 'Color'])) { f.push('border ' + s['border' + side + 'Color']); break; }
        if (BLUES.some(b => s.backgroundImage.includes(b))) f.push('gradient');
        if (f.length) return `HOVER ${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).trim().split(/\s+/).slice(0, 2).join('.')} "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 24)}": ${f.join(', ')}`;
      }
      return null;
    }, i, colourSel);
    if (hit) out.push(hit);
  }
  await page.mouse.move(1, 1);
  return [...new Set(out)];
}
