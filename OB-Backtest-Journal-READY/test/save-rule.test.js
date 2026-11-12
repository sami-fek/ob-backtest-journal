import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Evaluate the browser file in a sandbox (no DOM needed).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'save-rule.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(code, sandbox);
// Results come from another realm; normalise so deepStrictEqual compares values.
const evaluate = p => JSON.parse(JSON.stringify(sandbox.window.obSaveRule.evaluate(p)));

const checks = (n, total) => Array.from({ length: total }, (_, i) => (i < n ? 'pass' : 'notset'));

test('save rule: new trade needs 50% checklist, a note AND a screenshot', () => {
  // Model OB: 12 items → 6 needed
  let r = evaluate({ totalItems: 12, checklist: checks(6, 12), notes: 'clean', screenshots: [], stored: null });
  assert.equal(r.ok, false, 'no screenshot → cannot save');
  assert.deepEqual(r.missingKeys, ['screenshot']);
  assert.match(r.missing.join(' '), /screenshot/i);

  r = evaluate({ totalItems: 12, checklist: checks(6, 12), notes: 'clean', screenshots: ['data:image/png;base64,AA'], stored: null });
  assert.equal(r.ok, true, 'screenshot + 50% + note → saves');

  r = evaluate({ totalItems: 12, checklist: checks(5, 12), notes: 'clean', screenshots: ['x'], stored: null });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingKeys, ['checklist']);

  r = evaluate({ totalItems: 12, checklist: checks(6, 12), notes: '   ', screenshots: ['x'], stored: null });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingKeys, ['note']);

  // rich-text notes: an empty editor is not a note, formatted text is
  assert.equal(evaluate({ totalItems: 12, checklist: checks(6, 12), notes: '<p><br></p>', screenshots: ['x'] }).ok, false);
  assert.equal(evaluate({ totalItems: 12, checklist: checks(6, 12), notes: '<div>&nbsp;</div>', screenshots: ['x'] }).ok, false);
  assert.equal(evaluate({ totalItems: 12, checklist: checks(6, 12), notes: '<b>Clean</b> entry', screenshots: ['x'] }).ok, true);

  // ✗ marks do not count
  const failed = checks(5, 12); failed[6] = 'fail';
  assert.equal(evaluate({ totalItems: 12, checklist: failed, notes: 'n', screenshots: ['x'], stored: null }).ok, false);

  // Model A: 7 items → 4 needed (rounded up)
  assert.equal(evaluate({ totalItems: 7, checklist: checks(3, 7), notes: 'n', screenshots: ['x'] }).ok, false);
  assert.equal(evaluate({ totalItems: 7, checklist: checks(4, 7), notes: 'n', screenshots: ['x'] }).ok, true);
});

test('save rule: live checklist labels', () => {
  const r = evaluate({ totalItems: 6, checklist: checks(3, 6), notes: 'n', screenshots: [] });
  assert.deepEqual(r.items.map(i => [i.key, i.ok, i.label]), [
    ['checklist', true, 'Checklist 50%: 3/6'],
    ['note', true, 'Note added'],
    ['screenshot', false, 'Screenshot missing']
  ]);
});

test('save rule: old trade without screenshot is not locked out', () => {
  const stored = { checklist: checks(2, 12), notes: 'old note', screenshots: [] };
  // Unchanged rule fields → allowed (e.g. only MT5 session/timeframe edited)
  let r = evaluate({ totalItems: 12, checklist: checks(2, 12), notes: 'old note', screenshots: [], stored });
  assert.equal(r.ok, true);
  assert.equal(r.legacyExempt, true);
  // Touching the checklist or the note → full rule (screenshot required)
  r = evaluate({ totalItems: 12, checklist: checks(6, 12), notes: 'old note', screenshots: [], stored });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingKeys, ['screenshot']);
  r = evaluate({ totalItems: 12, checklist: checks(2, 12), notes: 'edited', screenshots: [], stored });
  assert.equal(r.ok, false);
  // Old trade that HAS a screenshot gets no exemption
  r = evaluate({ totalItems: 12, checklist: checks(2, 12), notes: 'old note', screenshots: ['x'], stored: { ...stored, screenshots: ['x'] } });
  assert.equal(r.ok, false);
  assert.equal(r.legacyExempt, false);
});
