/**
 * shots.js — screenshots as files (BUILD-PLAN-2 Part 4 Step 1), browser side.
 * A trade's screenshots are references like "/api/shots/<id>.png" (served to the
 * signed-in owner only). Older trades may still hold data URLs; the server moves
 * those to file storage on the next read or save.
 *
 *   obShots.store(dataUrl)      → upload; resolves to the reference (or the data URL if offline)
 *   obShots.toDataUrl(src)      → data URL for a reference (for the AI and for backups)
 *   obShots.asDataUrls(list)    → the same for a list (failed ones are skipped)
 *   obShots.embedForExport(ts)  → copy of trades with images embedded (self-contained backup)
 *   obShots.uploadEmbedded(ts)  → uploads embedded images of imported trades, in place
 */
(function (root) {
  'use strict';
  const PREFIX = '/api/shots/';
  const isRef = s => typeof s === 'string' && s.startsWith(PREFIX);
  const isData = s => typeof s === 'string' && s.startsWith('data:image/');
  const cache = new Map();

  // One-time notice when the server cannot store screenshot files (embedded fallback).
  // Shown once per browser; the flag is cleared when an upload works again, so a
  // later outage is announced again.
  const NOTICE_KEY = 'ob-shots-fallback-noticed';
  function fallbackNotice() {
    try { if (localStorage.getItem(NOTICE_KEY)) return; localStorage.setItem(NOTICE_KEY, String(Date.now())); } catch (_) {}
    if (typeof document === 'undefined' || !document.body) return;
    const el = document.createElement('div');
    el.id = 'ob-shots-notice';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:300;max-width:min(520px,calc(100vw - 32px));display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:12px;font:500 13px/1.45 Inter,system-ui,sans-serif;background:var(--ds-surface-solid,#fff);color:var(--ds-text,#101729);border:1px solid var(--ds-line-strong,rgba(16,23,41,.13));box-shadow:0 20px 50px -20px rgba(0,0,0,.35)';
    el.innerHTML = '<span aria-hidden="true" style="width:8px;height:8px;border-radius:99px;margin-top:6px;flex:none;background:var(--ds-warn,#d97706)"></span><span>Screenshots are being stored inside your trades — storage is not configured.</span><button type="button" aria-label="Close" style="margin-left:auto;min-width:32px;min-height:32px;border:0;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer">×</button>';
    el.querySelector('button').addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 15000);
  }
  function storageWorked() { try { localStorage.removeItem(NOTICE_KEY); } catch (_) {} }

  async function store(dataUrl) {
    if (!isData(dataUrl)) return dataUrl;
    try {
      const r = await fetch('/api/shots', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        if (body && body.code === 'SHOT_STORAGE_UNAVAILABLE') fallbackNotice();
        return dataUrl;
      }
      const body = await r.json();
      if (body && isRef(body.ref)) { storageWorked(); cache.set(body.ref, dataUrl); return body.ref; }
    } catch (_) {}
    return dataUrl; // kept embedded; the server moves it on the next save
  }

  function blobToDataUrl(blob) {
    return new Promise(resolve => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => resolve(null); fr.readAsDataURL(blob); });
  }
  async function toDataUrl(src) {
    if (isData(src)) return src;
    if (!isRef(src)) return null;
    if (cache.has(src)) return cache.get(src);
    try {
      const r = await fetch(src, { credentials: 'same-origin' });
      if (!r.ok) return null;
      const url = await blobToDataUrl(await r.blob());
      if (url) cache.set(src, url);
      return url;
    } catch (_) { return null; }
  }
  async function asDataUrls(list) {
    const out = await Promise.all((Array.isArray(list) ? list : []).map(toDataUrl));
    return out.filter(isData);
  }
  async function embedForExport(trades) {
    const out = [];
    for (const t of Array.isArray(trades) ? trades : []) {
      if (!t || !Array.isArray(t.screenshots) || !t.screenshots.some(isRef)) { out.push(t); continue; }
      const shots = [];
      for (const s of t.screenshots) shots.push(isRef(s) ? (await toDataUrl(s)) || s : s);
      out.push({ ...t, screenshots: shots });
    }
    return out;
  }
  async function uploadEmbedded(trades) {
    let failed = 0;
    for (const t of Array.isArray(trades) ? trades : []) {
      if (!t || !Array.isArray(t.screenshots)) continue;
      for (let i = 0; i < t.screenshots.length; i++) {
        if (!isData(t.screenshots[i])) continue;
        const ref = await store(t.screenshots[i]);
        if (isRef(ref)) t.screenshots[i] = ref; else failed++;
      }
    }
    return { failed };
  }
  /** After a save the server may answer with the slimmed record: adopt its references. */
  function adoptRefs(trades, savedJson) {
    let saved; try { saved = JSON.parse(savedJson); } catch (_) { return; }
    if (!Array.isArray(saved) || !Array.isArray(trades)) return;
    const byId = new Map(saved.filter(t => t && t.id != null).map(t => [String(t.id), t]));
    for (const t of trades) {
      const s = t && byId.get(String(t.id));
      if (!s || !Array.isArray(t.screenshots) || !Array.isArray(s.screenshots) || s.screenshots.length !== t.screenshots.length) continue;
      t.screenshots = t.screenshots.map((x, i) => (isData(x) && isRef(s.screenshots[i]) ? s.screenshots[i] : x));
    }
  }

  root.obShots = { PREFIX, isRef, isData, store, toDataUrl, asDataUrls, embedForExport, uploadEmbedded, adoptRefs, fallbackNotice };
})(typeof window !== 'undefined' ? window : globalThis);
