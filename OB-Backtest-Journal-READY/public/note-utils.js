/**
 * note-utils.js — safe rich-text notes and tag/feeling helpers (pure, no DOM).
 * Loaded by index.html as window.obNotes; unit-tested in test/note-utils.test.js.
 *
 * Notes are stored as a small, sanitised HTML subset:
 *   b strong i em u p div br ul ol li a(href = http/https/mailto only)
 * Everything else is dropped (script/style blocks including their content,
 * all attributes except a safe href). Old plain-text notes are shown as text.
 */
(function (root) {
  'use strict';
  const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 'p', 'div', 'br', 'ul', 'ol', 'li', 'a']);
  const VOID = new Set(['br']);

  const escapeText = s => String(s).replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function safeHref(raw) {
    const v = String(raw || '').trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
    return /^(https?:|mailto:)/i.test(v) ? v : null;
  }

  function sanitizeNoteHtml(input) {
    let html = String(input == null ? '' : input);
    // drop dangerous blocks together with their content
    html = html.replace(/<(script|style|iframe|object|embed|template|noscript|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '');
    html = html.replace(/<!--[\s\S]*?-->/g, '');
    const out = [];
    const open = [];
    const TAG = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>/g; // like browsers: no space after "<"
    let last = 0, m;
    while ((m = TAG.exec(html))) {
      out.push(escapeText(html.slice(last, m.index)));
      last = TAG.lastIndex;
      const closing = !!m[1];
      const name = m[2].toLowerCase();
      if (!ALLOWED.has(name)) continue;
      if (closing) {
        const i = open.lastIndexOf(name);
        if (i === -1) continue;
        while (open.length > i) out.push('</' + open.pop() + '>');
        continue;
      }
      if (VOID.has(name)) { out.push('<br>'); continue; }
      if (name === 'a') {
        const hm = m[3].match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
        const href = hm ? safeHref(hm[2] ?? hm[3] ?? hm[4]) : null;
        out.push(href ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">` : '<a>');
      } else {
        out.push('<' + name + '>');
      }
      open.push(name);
    }
    out.push(escapeText(html.slice(last)));
    while (open.length) out.push('</' + open.pop() + '>');
    return out.join('');
  }

  const decode = s => String(s)
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&amp;/gi, '&');

  /** Plain text of a note (HTML or old plain text) — used for the save rule, search and AI. */
  function notePlainText(note) {
    const s = String(note == null ? '' : note);
    if (!/<[a-z!/]/i.test(s)) return s.trim();
    return decode(s
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li)\s*>/gi, '\n')
      .replace(/<[^>]*>/g, ''))
      .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** HTML to show in the editor: sanitised HTML, or old plain text escaped with line breaks. */
  function noteToHtml(note) {
    const s = String(note == null ? '' : note);
    if (/<[a-z!/]/i.test(s)) return sanitizeNoteHtml(s);
    return escapeText(s).replace(/&(?!(?:amp|lt|gt);)/g, '&amp;').replace(/\r?\n/g, '<br>');
  }

  // ── Tags & feelings ──────────────────────────────────────────────────────
  const DEFAULT_TAGS = [
    { name: 'Swing', sentiment: 'neutral' }, { name: 'FOMO', sentiment: 'negative' },
    { name: 'Scalp', sentiment: 'neutral' }, { name: 'Breakout', sentiment: 'neutral' },
    { name: 'Revenge', sentiment: 'negative' }, { name: 'Overtrade', sentiment: 'negative' },
    { name: 'Patient', sentiment: 'positive' }, { name: 'Followed Plan', sentiment: 'positive' }
  ];
  const DEFAULT_FEELINGS = [
    { id: 'scared', emoji: '😨', label: 'Scared' },
    { id: 'worried', emoji: '😟', label: 'Worried' },
    { id: 'neutral', emoji: '😐', label: 'Neutral' },
    { id: 'confident', emoji: '🙂', label: 'Confident' },
    { id: 'excited', emoji: '🤩', label: 'Excited' }
  ];
  const SENTIMENTS = ['positive', 'neutral', 'negative'];

  function cleanTag(name) {
    return String(name == null ? '' : name).replace(/[<>"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  }
  /** Merge a stored tag library with the defaults (defaults first, no duplicates, valid sentiment). */
  function normalizeTagLibrary(list) {
    const out = [];
    const add = t => {
      const name = cleanTag(t && t.name);
      if (!name || out.some(o => o.name.toLowerCase() === name.toLowerCase())) return;
      out.push({ name, sentiment: SENTIMENTS.includes(t.sentiment) ? t.sentiment : 'neutral' });
    };
    (Array.isArray(list) ? list : []).forEach(add);
    DEFAULT_TAGS.forEach(add);
    return out;
  }
  function normalizeFeelings(list) {
    const out = [];
    const add = f => {
      const label = cleanTag(f && f.label);
      const emoji = String((f && f.emoji) || '').trim().slice(0, 8);
      const id = String((f && f.id) || label).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 30);
      if (!label || !emoji || !id || out.some(o => o.id === id)) return;
      out.push({ id, emoji, label });
    };
    DEFAULT_FEELINGS.forEach(add);
    (Array.isArray(list) ? list : []).forEach(add);
    return out;
  }
  /** Add a tag to a list (case-insensitive de-dupe). Returns a new array. */
  function addTag(tags, name) {
    const t = cleanTag(name);
    const list = Array.isArray(tags) ? tags.slice() : [];
    if (!t || list.some(x => String(x).toLowerCase() === t.toLowerCase())) return list;
    list.push(t);
    return list;
  }

  // Screenshots are stored inside the trades record (one storage value, server
  // limit 12 MB), so big phone photos are shrunk before saving. Small images
  // (typical chart screenshots) are kept exactly as they are.
  const SHOT_KEEP_BYTES = 1.2 * 1024 * 1024;
  const SHOT_MAX_EDGE = 2048;
  /** Decide whether an image of `bytes` and `w`×`h` pixels is shrunk, and to what size. */
  function shotResizePlan(bytes, w, h) {
    const W = Number(w) || 0, H = Number(h) || 0;
    const longEdge = Math.max(W, H);
    if (!(W > 0 && H > 0)) return { resize: false };
    if (Number(bytes) <= SHOT_KEEP_BYTES && longEdge <= SHOT_MAX_EDGE * 1.25) return { resize: false };
    const scale = Math.min(1, SHOT_MAX_EDGE / longEdge);
    return { resize: true, width: Math.max(1, Math.round(W * scale)), height: Math.max(1, Math.round(H * scale)) };
  }

  root.obNotes = {
    sanitizeNoteHtml, notePlainText, noteToHtml, safeHref,
    DEFAULT_TAGS, DEFAULT_FEELINGS, SENTIMENTS, cleanTag, normalizeTagLibrary, normalizeFeelings, addTag,
    shotResizePlan, SHOT_KEEP_BYTES, SHOT_MAX_EDGE,
    MAX_SCREENSHOTS: 3
  };
})(typeof window !== 'undefined' ? window : globalThis);
