import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'note-utils.js'), 'utf8'), sandbox);
const N = sandbox.window.obNotes;
const plain = v => JSON.parse(JSON.stringify(v));

test('notes: sanitiser keeps formatting, removes anything dangerous', () => {
  assert.equal(N.sanitizeNoteHtml('<b>Bold</b> <i>it</i><ul><li>one</li></ul>'), '<b>Bold</b> <i>it</i><ul><li>one</li></ul>');
  assert.equal(N.sanitizeNoteHtml('<script>alert(1)</script>ok'), 'ok');
  assert.equal(N.sanitizeNoteHtml('<img src=x onerror=alert(1)>text'), 'text');
  assert.equal(N.sanitizeNoteHtml('<b onclick="x()">b</b>'), '<b>b</b>');
  assert.equal(N.sanitizeNoteHtml('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
  assert.equal(N.sanitizeNoteHtml('<a href="https://tradingview.com/x">chart</a>'),
    '<a href="https://tradingview.com/x" target="_blank" rel="noopener noreferrer">chart</a>');
  assert.equal(N.sanitizeNoteHtml('<b>unclosed'), '<b>unclosed</b>');
  assert.equal(N.sanitizeNoteHtml('a < b > c'), 'a &lt; b &gt; c');
  assert.equal(N.sanitizeNoteHtml('<iframe src="x"></iframe><style>*{}</style>x'), 'x');
  // never produces an executable tag, whatever the input
  const evil = '<svg/onload=alert(1)><div style="x" onmouseover=y>z</div><a href=" jav&#x09;ascript:1">q</a>';
  const out = N.sanitizeNoteHtml(evil);
  assert.doesNotMatch(out, /on\w+=|<svg|javascript:|style=/i);
});

test('notes: plain text for the save rule / search / AI; old notes still display', () => {
  assert.equal(N.notePlainText('<p><br></p>'), '');
  assert.equal(N.notePlainText('<div>&nbsp;</div>'), '');
  assert.equal(N.notePlainText('<b>Sweep</b> of Asia&nbsp;low<br>FVG'), 'Sweep of Asia low\nFVG');
  assert.equal(N.notePlainText('old plain note'), 'old plain note');
  assert.equal(N.noteToHtml('line 1\nline <2>'), 'line 1<br>line &lt;2&gt;');
  assert.equal(N.noteToHtml('<b>x</b>'), '<b>x</b>');
});

test('tags & feelings: defaults, sentiments, custom entries, de-dupe', () => {
  const lib = plain(N.normalizeTagLibrary([{ name: 'My Setup', sentiment: 'positive' }, { name: 'fomo', sentiment: 'neutral' }]));
  assert.equal(lib[0].name, 'My Setup');
  assert.equal(lib.find(t => t.name.toLowerCase() === 'fomo').sentiment, 'neutral', 'a stored choice wins over the default');
  assert.equal(lib.find(t => t.name === 'Revenge').sentiment, 'negative');
  assert.equal(lib.find(t => t.name === 'Followed Plan').sentiment, 'positive');
  assert.equal(lib.filter(t => t.name.toLowerCase() === 'fomo').length, 1);
  const f = plain(N.normalizeFeelings([{ emoji: '😤', label: 'Frustrated' }]));
  assert.deepEqual(f.map(x => x.id), ['scared', 'worried', 'neutral', 'confident', 'excited', 'frustrated']);
  assert.deepEqual(plain(N.addTag(['FOMO'], ' fomo ')), ['FOMO']);
  assert.deepEqual(plain(N.addTag(['FOMO'], '<Patient>')), ['FOMO', 'Patient'], 'angle brackets are stripped from tags');
  assert.equal(N.cleanTag('x'.repeat(50)).length, 30);
});

test('screenshots: big phone photos are shrunk to a 2048px long edge, small images kept', () => {
  // small chart screenshot: unchanged
  assert.deepEqual(plain(N.shotResizePlan(400 * 1024, 1920, 1080)), { resize: false });
  // 12 MP phone photo (4032×3024, 4 MB): shrunk, aspect ratio kept
  assert.deepEqual(plain(N.shotResizePlan(4 * 1024 * 1024, 4032, 3024)), { resize: true, width: 2048, height: 1536 });
  // portrait photo
  assert.deepEqual(plain(N.shotResizePlan(3 * 1024 * 1024, 3024, 4032)), { resize: true, width: 1536, height: 2048 });
  // heavy file that is already small in pixels: re-encoded at the same size
  assert.deepEqual(plain(N.shotResizePlan(5 * 1024 * 1024, 1600, 900)), { resize: true, width: 1600, height: 900 });
  // light file but huge pixel size (e.g. 5K monitor capture)
  assert.equal(N.shotResizePlan(900 * 1024, 5120, 2880).resize, true);
  // unknown dimensions: never resized
  assert.deepEqual(plain(N.shotResizePlan(9e6, 0, 0)), { resize: false });
});
