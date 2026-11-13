// Shared: register a throwaway user with ~40 realistic trades; open pages in Chrome.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export const BASE = process.env.QA_BASE || 'http://127.0.0.1:3456'; // the app started locally with PORT=3456
export const OUT = fileURLToPath(new URL('./out/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
export const wait = ms => new Promise(r => setTimeout(r, ms));

export async function api(cookie, method, url, body) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = r.headers.get('set-cookie');
  return { status: r.status, cookie: set ? set.split(';')[0] : cookie, body: await r.json().catch(() => null) };
}

function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
export function makeTrades(n = 40) {
  const R = rnd(42);
  const pairs = ['XAUUSD', 'EURUSD', 'GBPUSD', 'NAS100'];
  const tagsets = [['Patient', 'Followed Plan'], ['FOMO'], ['Revenge', 'Overtrade'], ['Swing'], [], ['Scalp', 'FOMO'], ['Followed Plan']];
  const feelings = ['confident', 'neutral', 'worried', 'excited', 'scared'];
  const out = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - Math.floor(i * 1.6));
    if (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 2);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const x = R();
    const result = x < 0.5 ? 'Win' : x < 0.9 ? 'Loss' : 'BE';
    const r = result === 'Win' ? +(1 + R() * 2).toFixed(1) : result === 'Loss' ? -1 : 0;
    const chk = Array.from({ length: 7 }, () => (R() < 0.7 ? 'pass' : 'fail'));
    out.push({ id: 'tr-' + i, mode: 'Real', accountId: 'real-1', date, pair: pairs[i % 4], timeframe: ['15M', '1H', '4H'][i % 3], regime: ['Trending', 'Ranging', 'Reversal'][i % 3], session: ['London', 'NY', 'Asia'][i % 3], direction: i % 2 ? 'SHORT' : 'LONG', result, rMultiple: r, strategy: i % 3 ? 'Model OB' : 'Model A', notes: '<p>note</p>', checklist: chk, screenshots: [], tags: tagsets[i % tagsets.length], feeling: feelings[i % 5] });
  }
  return out;
}

export async function newUser({ trades = makeTrades(), accounts } = {}) {
  const r = await api('', 'POST', '/api/auth/register', { email: `qa${Date.now()}${Math.floor(Math.random() * 1e4)}@test.local`, password: 'password123' });
  const cookie = r.cookie;
  if (trades) await api(cookie, 'PUT', '/api/storage/ob-trades', { value: JSON.stringify(trades) });
  await api(cookie, 'PUT', '/api/storage/my_journal_accounts_v1', { value: JSON.stringify(accounts || {
    Demo: [{ id: 'demo-1', name: 'Demo 01', balance: 100000, startingBalance: 100000 }],
    Real: [{ id: 'real-1', name: 'Real 01', balance: 100000, startingBalance: 100000, cashMovements: [{ id: 'c1', type: 'deposit', date: '2026-10-20', amount: 2000 }] }],
    Funded: [{ id: 'funded-1', name: 'Funded 01', balance: 100000, startingBalance: 100000 }]
  }) });
  return cookie;
}

export async function launch() {
  return puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
}

export async function openPage(browser, cookie, { theme = 'light', width = 1440, hash = 'trading', mode = 'Real', errors = [] } = {}) {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(`${theme}/${width}: ${e.stack || e.message}`));
  page.on('dialog', d => d.accept());
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await page.setCookie({ name: 'ob_session', value: decodeURIComponent(cookie.split('=')[1]), url: BASE });
  await page.evaluateOnNewDocument((t, h, m) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('my-journal-theme', t); localStorage.setItem('ob_ui_state_v1', JSON.stringify({ tab: h, mode: m })); sessionStorage.setItem('seeded', '1'); } } catch (_) {} }, theme, hash, mode);
  await page.goto(BASE + '/#' + hash, { waitUntil: 'networkidle0' });
  await wait(1500);
  return page;
}
