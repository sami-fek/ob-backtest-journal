/**
 * time-prefs.js — the saved timezone, currency symbol and date format
 * (BUILD-PLAN-2 Part 4 Steps 2–3).
 *
 *  obTimeCore (pure; also used by server.js and mt5-backend.js):
 *    isoInTz(date, tz)            calendar day 'YYYY-MM-DD' of an instant in a timezone
 *    todayIso(tz, now)            today's calendar day in a timezone
 *    validTz(tz)                  true for an IANA zone the runtime knows
 *    formatMoney(v, sym, opts)    "+$1,234.50" / "-€85.00" / compact "+£2.4k"
 *    formatDate(iso, fmt)         YYYY-MM-DD | DD/MM/YYYY | MM/DD/YYYY | DD MMM YYYY
 *
 *  obTime (browser; reads the settings saved in Account center › Preferences):
 *    tz(), today(), dayOf(instant), money(v, opts), date(iso), sym()
 *
 * Without a saved timezone the device timezone is used (same as before).
 * Tests: test/time-prefs.test.js.
 */
(function (root) {
  'use strict';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD MMM YYYY'];
  const fmtCache = new Map();
  const pad = n => String(n).padStart(2, '0');
  const localIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function validTz(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (_) { return false; }
  }
  function partsFormatter(tz) {
    if (!fmtCache.has(tz)) fmtCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }));
    return fmtCache.get(tz);
  }
  /** Calendar day of an instant (Date | ms | ISO string) in `tz`; device timezone when tz is empty/invalid. */
  function isoInTz(date, tz) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    if (!validTz(tz)) return localIso(d);
    const p = {};
    for (const x of partsFormatter(tz).formatToParts(d)) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}`;
  }
  function todayIso(tz, now) { return isoInTz(now == null ? new Date() : now, tz); }

  function formatMoney(v, sym, opts) {
    const o = opts || {};
    const n = Number(v) || 0;
    const s = sym == null ? '$' : String(sym);
    const sign = n < 0 ? '-' : (o.signed !== false && n > 0 ? '+' : '');
    const a = Math.abs(n);
    if (o.compact) {
      const t = a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(Math.round(a));
      return sign + s + t;
    }
    const dec = o.decimals == null ? 2 : o.decimals;
    return sign + s + a.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function formatDate(iso, fmt) {
    const v = String(iso || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (!m) return v;
    const [, y, mo, d] = m;
    switch (fmt) {
      case 'DD/MM/YYYY': return `${d}/${mo}/${y}`;
      case 'MM/DD/YYYY': return `${mo}/${d}/${y}`;
      case 'DD MMM YYYY': return `${d} ${MONTHS[Number(mo) - 1]} ${y}`;
      default: return `${y}-${mo}-${d}`;
    }
  }

  root.obTimeCore = { FORMATS, validTz, isoInTz, todayIso, formatMoney, formatDate };

  if (typeof window === 'undefined') return;
  const settings = () => { try { return (typeof window.obGetSettings === 'function' && window.obGetSettings()) || {}; } catch (_) { return {}; } };
  const tz = () => { const t = settings().timezone; return validTz(t) ? t : (Intl.DateTimeFormat().resolvedOptions().timeZone || ''); };
  const sym = () => settings().currencySymbol || '$';
  const dateFmt = () => (FORMATS.includes(settings().dateFormat) ? settings().dateFormat : 'YYYY-MM-DD');
  window.obTime = {
    tz,
    sym,
    today: () => todayIso(tz()),
    dayOf: instant => isoInTz(instant, tz()),
    money: (v, opts) => formatMoney(v, sym(), opts),
    date: iso => formatDate(iso, dateFmt())
  };
})(typeof window !== 'undefined' ? window : globalThis);
