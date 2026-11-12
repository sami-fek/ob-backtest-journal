/**
 * save-rule.js — the trade save rule (pure function, no DOM).
 *
 * A trade can be saved only when ALL of these are true:
 *   1. at least 50% of the strategy checklist items are checked (✓; ✗ does not count)
 *   2. the note is not empty
 *   3. at least one screenshot is attached
 *
 * Exception for old data: an existing trade that was stored WITHOUT a
 * screenshot may still be saved as long as the rule fields (checklist, note,
 * screenshots) are unchanged — so other edits (e.g. MT5 session/timeframe)
 * are never locked out. Changing the checklist or note applies the full rule.
 *
 * Loaded by index.html as window.obSaveRule; tests evaluate this file in a
 * sandbox (see test/save-rule.test.js).
 */
(function (root) {
  'use strict';
  const MIN_CHECKLIST_RATIO = 0.5;

  function notePlain(note) {
    if (root.obNotes && typeof root.obNotes.notePlainText === 'function') return root.obNotes.notePlainText(note);
    return String(note == null ? '' : note).replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
  }

  function sameList(a, b) {
    a = Array.isArray(a) ? a : []; b = Array.isArray(b) ? b : [];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) if ((a[i] || 'notset') !== (b[i] || 'notset')) return false;
    return true;
  }

  /**
   * @param {object} p
   * @param {number} p.totalItems     number of checklist items for the trade
   * @param {string[]} p.checklist    statuses ('pass' | 'fail' | 'notset')
   * @param {string} p.notes
   * @param {any[]} p.screenshots
   * @param {object|null} p.stored    the stored trade being edited (null for a new trade)
   */
  function evaluate(p) {
    const total = Math.max(0, Number(p.totalItems) || 0);
    const checklist = Array.isArray(p.checklist) ? p.checklist : [];
    const passed = checklist.filter(s => s === 'pass').length;
    const need = Math.ceil(total * MIN_CHECKLIST_RATIO);
    const shots = Array.isArray(p.screenshots) ? p.screenshots.length : 0;
    // Notes may be rich text (HTML): an empty editor such as <p><br></p> is not a note.
    const noteOk = !!notePlain(p.notes);

    const items = [
      { key: 'checklist', ok: total === 0 || passed >= need, label: `Checklist 50%: ${passed}/${total}` },
      { key: 'note', ok: noteOk, label: noteOk ? 'Note added' : 'Note missing' },
      { key: 'screenshot', ok: shots >= 1, label: shots >= 1 ? 'Screenshot attached' : 'Screenshot missing' }
    ];
    const missing = [];
    if (!items[0].ok) missing.push(`Check at least ${need} of ${total} checklist items (${passed} checked).`);
    if (!items[1].ok) missing.push('Write a note.');
    if (!items[2].ok) missing.push('Attach at least one screenshot.');
    let ok = items.every(i => i.ok);

    // Old trade stored without a screenshot: allow saving while the rule
    // fields are untouched (not locked out of old data).
    const stored = p.stored || null;
    const legacyNoScreenshot = !!stored && !(Array.isArray(stored.screenshots) && stored.screenshots.length);
    const ruleFieldsUnchanged = !!stored
      && sameList(checklist, stored.checklist)
      && String(p.notes || '') === String(stored.notes || '')
      && shots === 0;
    const legacyExempt = !ok && legacyNoScreenshot && ruleFieldsUnchanged;
    if (legacyExempt) ok = true;

    return {
      ok, legacyExempt, passed, total, need, items,
      missing: ok ? [] : missing,
      missingKeys: ok ? [] : items.filter(i => !i.ok).map(i => i.key)
    };
  }

  const api = { evaluate, MIN_CHECKLIST_RATIO };
  root.obSaveRule = api;
})(typeof window !== 'undefined' ? window : globalThis);
