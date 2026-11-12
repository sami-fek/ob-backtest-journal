import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Run public/theme.js in a tiny fake browser and test its pieces.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'theme.js'), 'utf8');

function boot({ stored = null, osDark = false } = {}) {
  const attrs = {};
  const store = new Map(stored ? [['my-journal-theme', stored]] : []);
  const events = [];
  const root = {
    setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: k => attrs[k], hasAttribute: () => false,
    style: {}, nodeType: 1, firstElementChild: null, querySelectorAll: () => []
  };
  const win = {
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    matchMedia: () => ({ matches: osDark, addEventListener() {} }),
    addEventListener() {},
    dispatchEvent: e => events.push(e),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  };
  const sandbox = {
    window: win, localStorage: win.localStorage, CustomEvent: win.CustomEvent,
    document: { documentElement: root, readyState: 'complete', querySelector: () => null, addEventListener() {} },
    MutationObserver: class { observe() {} },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    setTimeout
  };
  vm.runInNewContext(code, sandbox);
  return { win, attrs, store, events };
}

test('theme: default follows the OS, setTheme persists and applies', () => {
  let t = boot({ osDark: true });
  assert.equal(t.win.getTheme(), 'system');
  assert.equal(t.attrs['data-theme'], 'dark');
  t = boot({ osDark: false });
  assert.equal(t.attrs['data-theme'], 'light');

  t.win.setTheme('dark');
  assert.equal(t.store.get('my-journal-theme'), 'dark');
  assert.equal(t.attrs['data-theme'], 'dark');
  assert.equal(t.win.getResolvedTheme(), 'dark');
  assert.equal(t.events.at(-1).type, 'ob-theme-change');

  t.win.setTheme('light');
  assert.equal(t.attrs['data-theme'], 'light');
  t.win.setTheme('bogus');
  assert.equal(t.store.get('my-journal-theme'), 'system');

  t = boot({ stored: 'dark', osDark: false });
  assert.equal(t.attrs['data-theme'], 'dark', 'stored choice wins over the OS');
});

test('theme: recolor layer is property-aware and idempotent', () => {
  const { win } = boot();
  const tx = win.obThemeTransformCss;
  // white background → variable, white text stays white
  assert.equal(tx('.a{background:#fff;color:#fff}'), '.a{background:var(--tc-bg-white, #fff);color:#fff}');
  // dark text → variable; light border → variable
  assert.equal(tx('color:#0f172a;border:1px solid #e2e8f0'), 'color:var(--tc-fg-1, #0f172a);border:1px solid var(--tc-bd, #e2e8f0)');
  // el.style serialisation (rgb) is handled too
  assert.equal(tx('background-color: rgb(255, 255, 255);'), 'background-color: var(--tc-bg-white, rgb(255, 255, 255));');
  // low-alpha white highlight on coloured cards is left alone
  assert.equal(tx('background:rgba(255,255,255,.12)'), 'background:rgba(255,255,255,.12)');
  // unknown / brand colours untouched
  assert.equal(tx('background:#2563eb;color:#16a34a'), 'background:#2563eb;color:#16a34a');
  // idempotent
  const once = tx('.b{background:#f8fafc;border-color:#cbd5e1}');
  assert.equal(tx(once), once);
  // Tailwind's own generated CSS is never touched
  const tw = '.bg-white{--tw-bg-opacity:1;background-color:#fff}';
  assert.equal(tx(tw), tw);
});
