// Harness for BUILD-PLAN-2: touch emulation under 1024px + layout audit.
import { newUser, makeTrades, launch, wait, BASE, api } from './seed.mjs';
import fs from 'node:fs';
export { wait, BASE, api, launch, makeTrades };
export const WIDTHS = [360, 390, 412, 430, 768, 1440, 1920];
export const HEIGHT = w => (w < 500 ? 844 : w < 1024 ? 1024 : 900);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function richUser({ extraToday = 0 } = {}) {
  const trades = makeTrades(40);
  const today = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i * 2);
    trades.push({ id: 'f-' + i, mode: 'Funded', accountId: 'funded-1', date: iso(d), pair: 'NAS100', timeframe: '15M', regime: 'Trending', session: 'NY', direction: 'LONG', result: i % 3 === 1 ? 'Win' : 'Loss', rMultiple: i % 3 === 1 ? 2 : -1, strategy: 'Model OB', notes: '<p>n</p>', checklist: ['pass', 'pass'], screenshots: [], tags: [], feeling: 'neutral' });
  }
  for (let i = 0; i < extraToday; i++) trades.push({ id: 'today-' + i, mode: 'Real', accountId: 'real-1', date: iso(today), pair: 'EURUSD', timeframe: '15M', regime: 'Trending', session: 'London', direction: 'SHORT', result: 'Win', rMultiple: 1.5, strategy: 'Model A', notes: '<p>n</p>', checklist: ['pass'], screenshots: [], tags: [], feeling: 'neutral' });
  const accounts = {
    Demo: [{ id: 'demo-1', name: 'Demo 01', balance: 100000, startingBalance: 100000 }],
    Real: [{ id: 'real-1', name: 'Real 01', balance: 100000, startingBalance: 100000, weeklyTarget: 3000, monthlyTarget: 10000, cashMovements: [{ id: 'c1', type: 'deposit', date: '2026-10-20', amount: 2000 }] }],
    Funded: [{ id: 'funded-1', name: 'Funded 100k', balance: 100000, startingBalance: 100000, profitTarget: 10000, maxDrawdown: 10000, dailyLossLimit: 5000, weeklyTarget: 2500 }]
  };
  return newUser({ trades, accounts });
}
export async function plainUser() { return newUser(); }

export async function open(browser, cookie, { theme = 'light', width = 1440, tab = 'dashboard', mode = 'Real', errors = [], height } = {}) {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(`${tab}/${theme}/${width}: ${e.message}`));
  page.on('dialog', d => d.accept());
  const touch = width < 1024;
  await page.setViewport({ width, height: height || HEIGHT(width), deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
  const cdp = await page.createCDPSession();
  if (touch) {
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'any-hover', value: 'none' }, { name: 'pointer', value: 'coarse' }, { name: 'any-pointer', value: 'coarse' }] });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await page.setCookie({ name: 'ob_session', value: decodeURIComponent(cookie.split('=')[1]), url: BASE });
  await page.evaluateOnNewDocument((t, h, m) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('my-journal-theme', t); localStorage.setItem('ob_ui_state_v1', JSON.stringify({ tab: h, mode: m })); sessionStorage.setItem('seeded', '1'); } } catch (_) {} }, theme, tab, mode);
  await page.goto(BASE + '/#' + tab, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { if (window.Chart) Chart.defaults.animation = false; });
  await wait(1800);
  return page;
}

// Automated checks. Returns array of issue strings.
export async function audit(page, { touch } = {}) {
  return page.evaluate(async (touch) => {
    const issues = [];
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
    const visible = el => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const inScroller = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { const r = p.getBoundingClientRect(); if (r.right <= vw + 1 && r.left >= -1) return true; } } return false; };
    const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24) + '"';
    const all = [...document.querySelectorAll('header *, main section:not(.hidden) *')];
    for (const el of all) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) issues.push('sticks out: ' + name(el) + ` [${Math.round(r.left)}..${Math.round(r.right)}]`);
    }
    if (touch) {
      const taps = all.filter(el => el.matches('button, a[href], select, input:not([type=hidden]), [role=button], [role=radio], [role=tab], [onclick]') && visible(el));
      for (const el of taps) {
        if (el.closest('[aria-hidden="true"]') || el.matches('input[type=checkbox], input[type=radio]')) continue;
        const r = el.getBoundingClientRect();
        if ((r.width < 44 || r.height < 44) && !el.closest('[data-tap-ok]')) issues.push(`tap ${Math.round(r.width)}x${Math.round(r.height)}: ${name(el)}`);
      }
      for (const el of all.filter(e => e.matches('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea') && visible(e))) {
        const f = parseFloat(getComputedStyle(el).fontSize); if (f < 16) issues.push(`field font ${f}px: ${name(el)}`);
      }
    }
    const H = window.innerHeight; const total = document.documentElement.scrollHeight;
    const seen = new Set();
    for (let y = 0; y < total; y += Math.round(H * 0.7)) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80));
      const taps = [...document.querySelectorAll('main section:not(.hidden) button, main section:not(.hidden) a[href], main section:not(.hidden) select, main section:not(.hidden) input:not([type=hidden])')].filter(visible);
      for (const el of taps) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cy < 0 || cy > H || cx < 0 || cx > vw) continue;
        const hit = document.elementFromPoint(cx, cy);
        if (!hit || el.contains(hit) || hit.contains(el)) continue;
        let f = hit, fixed = null;
        for (; f && f !== document.body; f = f.parentElement) { const p = getComputedStyle(f).position; if (p === 'fixed' || p === 'sticky') { fixed = f; break; } }
        if (fixed && !fixed.contains(el) && fixed.tagName !== 'HEADER' && !fixed.closest('header')) { const k = name(el) + ' under ' + name(fixed); if (!seen.has(k)) { seen.add(k); issues.push('covered: ' + k); } }
      }
    }
    window.scrollTo(0, 0);
    return [...new Set(issues)];
  }, !!touch);
}

export async function shot(page, path) { await page.screenshot({ path, fullPage: true }); }
export function mk(dir) { fs.mkdirSync(dir, { recursive: true }); return dir; }
export const OUTDIR = new URL('./out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
