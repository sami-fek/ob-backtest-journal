# Plan 2 · Part 4 report: data and settings fixes, final QA

All 5 steps are done and pushed to `main`, plus a round of fixes found during the final QA. With this, every part of BUILD-PLAN-2 is done.

## Commits
| Commit | Step |
|---|---|
| `3c1cbab` | 1 · Screenshots stored as files; trades keep references; migration, cleanup, export/import; tests |
| `f9baad4` | 2–3 · Currency symbol and date format in the older widgets; saved timezone for "today", calendar, limits, MT5 dates; tests |
| `595e559` | 4 · No app scripts (and no console errors) on `/auth.html` |
| `a56a0af` | QA fixes: MT5 routes 401 instead of 500; signed-out visitors skip the app scripts; AI Coach says "Live"; Journal button → review queue |
| `aff64f0` | Follow-up: orphaned screenshots deleted only after 30 days; `/api/health` reports the screenshot store; embedded-fallback warning + one-time notice; tests |
| `53a39fc` | Fix found by the final sweep: Journal "Review open trades" button 44 px on touch |
| `0096ae5` | Homepage header + hero fixes (signed out only) |
| (this commit) | 5 · Final QA results, README note, this report, before/after screenshots, status line |

## Step 1 · Screenshot storage
**Problem:** every screenshot was a data URL inside the single `ob-trades` record. With the 12 MB request limit, saving would break after a handful of trades with photos.

**Now:**
- **Each image is stored once as a file**, and the trade keeps only a reference like `/api/shots/<32 hex>.png`.
  - The id comes from the image's own SHA-256. The same image is one file, and uploads and migrations can safely repeat.
- **Two backends** (new `shots-store.js`):
  - **Supabase Storage on Render:** a private bucket called `trade-screenshots`, created on first use with the existing service-role key. `SUPABASE_SCREENSHOTS_BUCKET` can override the name.
  - **Local folder for the SQLite fallback:** `data/shots/<user id>/`.
  - No secret and no `render.yaml` change.
- **Routes (signed-in owner only):**
  - `POST /api/shots`: PNG, JPEG, WebP or GIF, max 8 MB. SVG is refused.
  - `GET /api/shots/:id`: cached privately for a year; ids are validated, so no path tricks; other users get 404.
  - `DELETE /api/shots/:id`.
- **Migration without data loss:**
  - When the trades record is **read** and still contains embedded images, each image is stored as a file first; only then is the slimmer record written back.
  - The same happens when a record with embedded images is **saved**: offline saves and imported backups.
  - Anything that fails stays embedded, and the original is returned unchanged.
- **Deletion** (changed in the follow-up below):
  - A file no trade references is **marked orphaned with a timestamp**: a removed screenshot, a deleted trade, Clear all trades, or an upload from a trade that was never saved.
  - It's deleted only if it's **still unreferenced 30 days later**. A file that a trade uses again is un-orphaned.
  - Deleting the account still deletes the user's whole folder or bucket prefix at once.
- **Browser** (new `shots.js`):
  - A screenshot added in the trade drawer is uploaded right away; the draft keeps the reference.
  - If the upload fails it stays embedded, and the server moves it on save.
  - The server's answer to a save carries the slim record, so images are never sent twice.
- **Kept working:**
  - **Save rule:** a reference counts as a screenshot.
  - **AI analysis:** both trade-drawer analysis and the AI Coach fetch stored images as data URLs before sending.
  - **JSON export:** Settings and Account center embed the images again, so the backup stands on its own.
  - **JSON import:** both importers upload embedded images first and keep references.
  - **MT5 sync** is unchanged.
- **Tests:**
  - `test/shots.test.js` has 5 tests:
    - upload and owner-only reading;
    - migration on read and on write, with bytes identical to the original;
    - deletion of removed and cleared files and the account folder, plus the 24 h grace period;
    - garbage collection;
    - the Supabase Storage backend against a mock storage server: bucket created on first use, upload, read, list, delete.
  - **Browser check `sfunc` 12/12:**
    - a legacy trade gets a reference and the drawer shows the image;
    - the save rule counts it;
    - a new upload becomes a reference and saves;
    - no embedded images remain in the record;
    - export embeds and import uploads;
    - the AI gets a data URL;
    - a removed screenshot's file is deleted.
- **Not tested against real Supabase Storage:** I don't use live secrets. The first real upload will create the bucket; if Storage is disabled on the project, uploads fall back to embedded images and nothing breaks.

## Step 2 · Preferences everywhere
- **New `public/time-prefs.js`:** one source for the saved **currency symbol**, **date format** and **timezone**, used by the browser and the server.
  - `obTimeCore` holds the pure functions.
  - `obTime` reads Account center › Preferences.
- **Now following your currency symbol:**
  - Journal trade table P&L;
  - Dashboard and Trading calendar cells, week totals and the compact phone amounts;
  - the older balance card, wallet card and MT5 balance overlay;
  - month net and the full-month heatmap;
  - the MT5 R-assign dialog;
  - the AI prompt's P/L.

  Dashboard, Trading, Analytics drivers and Account center already used it.
- **Now following your date format:**
  - Journal trade table;
  - the Not reviewed yet queue;
  - the trade drawer subtitle;
  - the MT5 R-assign subtitle.
- **Browser check `pfunc` 12/12** with €, DD/MM/YYYY and a UTC+14 timezone: no `$` left on the Journal table, Dashboard or Analytics drivers; dates in DD/MM/YYYY.

## Step 3 · Timezone
- **"Today" now uses the saved timezone, everywhere it matters:**
  - the Log-a-trade default date. This was UTC, so after midnight in UTC+ zones the form defaulted to *yesterday*.
  - the discipline engine's day (daily limit and hard stop), which was UTC;
  - the Dashboard (today's P&L, week and month, greeting date);
  - Trading's "today" and the calendar's today marker;
  - balances "as of today" and the Behavior date ranges.
- **Server:** the daily-limit check uses your timezone when a request has no date. That covers `GET /api/trades/daily-count` and `POST /api/trades`. Without a saved timezone it stays UTC, as before.
- **MT5:** imported trades get the close time's calendar day **in your timezone**, so a trade closed at 23:30 New York time is that day, not the next one in UTC. Without a saved timezone it stays UTC, as before.
- **Streaks** run in trade order, and trade dates are calendar days, so they follow automatically.
- **Tests:** `test/time-prefs.test.js` has 4 tests (midnight in New York and Tokyo, DST edges, fallbacks, money and date formats, MT5 dates). `test/timezone-server.test.js` checks that the server's "today" and the daily limit follow the saved zone (UTC+14 and UTC−11).

## Step 4 · Sign-in page console errors
- **Cause:** the gateway injects the app loader into every HTML page, so `/auth.html` loaded all 17 app feature scripts. `ui-rules.js` threw "trades is not defined", `mt5-integration-ui.js` threw on `switchMode`, and others made 401 calls.
- **Fix:** the loader (`backend-sync.js`) now does nothing on `/auth.html`. `ui-rules.js` and `mt5-integration-ui.js` also stop by themselves there, as a second guard. No behaviour change on the app page.
- **Checked:** `/auth.html` has **0 console errors or warnings** now (previously 4 errors and several 401s). Signing in from it lands on the Dashboard with all app scripts loaded.

## Extra fixes found during the final QA
1. **MT5 routes returned 500 for signed-out requests**; the homepage logged a 500 every few seconds. The five MT5 routes now return 401 `UNAUTHORIZED` without a session, with a new test.
2. **Signed-out homepage was loading the whole app**, including polling the daily limit and MT5 status.
   - The loader now asks once whether you're signed in. If not, it skips the 17 app feature scripts, the app data load and their polling. Signing in reloads the page, which then loads everything; if the check fails (offline) the app loads as before.
   - **Failed requests:** about 35 down to 6. The remaining "who am I?" and profile checks return 401, which is the correct answer for a visitor.
   - **Load on a slow connection:** about 9.1 s down to 7.5 s; first paint 8.5 s down to 5.9 s.
3. **AI Coach** now says "Live" for the Real mode, like the rest of the app.
4. **Journal › Discipline & Rules Status button** used to reopen the Journal. It's now "Review open trades" and jumps to the Not reviewed yet queue.

## Step 5 · Final QA
- **Unit and server tests (Node 20): 54/54 pass.** That's 11 new in Part 4 and its follow-up:
  - screenshots 6 (upload, migration, 30-day orphans, health and fallback, garbage collection, Supabase backend);
  - time and timezone 4;
  - server timezone 1;
  - plus the MT5 401 test.
- `node --check` on every changed JS file. Every inline script in `index.html` and `auth.html` compiles.
- **Final sweep on the final build:** 7 widths (360, 390, 412, 430, 768, 1440, 1920), light and dark, with `hover:none`, `any-hover:none`, `pointer:coarse` and `any-pointer:coarse` plus `isMobile`/`hasTouch` emulated under 1024 px.
  - **Checks on every screen:**
    - no sideways page scroll;
    - nothing sticking out of the viewport;
    - taps ≥ 44×44 px;
    - text fields ≥ 16 px;
    - nothing covered by fixed elements, sampled while scrolling.
  - **App pages, Live account:** Dashboard, Trading, Journal, Analytics, Account center and Settings, 84 screens. **All clean except the 4 known Account center notes** (1440 and 1920, both themes): its sticky title bar with Save Changes passes over the profile card while scrolling, which is intended.
    - The sweep also found one real problem, fixed in `53a39fc`: the Journal's "Review open trades" button was 38 px tall on touch (360–768, 10 screens). That button was renamed and rewired in my Part 4 QA fixes, and the touch-size rule didn't cover it. The Journal was re-run at all 7 widths in both themes after the fix: all clean.
  - **Dashboard and Trading on a Funded account** with prop limits: 28 screens, **all clean**.
  - **Overlays:** 154 screenshots of the trade drawer (top and bottom), calendar "+" panel, dropdown bottom sheet, account menu, AI Coach panel, strategy dialog, signed-out modal and `/auth.html`, plus Account center and Settings audits. **All clean except the same 4 Account center notes.**
  - **Signed-out homepage:** 14 screens, **all clean**; every visible screenshot loaded. Re-run after the header and hero fixes: still all clean.
  - **`/auth.html`:** no console errors or warnings.
  - **One page per tab:** OK at 1440 and 390.
  - **JavaScript errors** during all sweeps: none.
- **Functional scripts, all re-run on the final build:**
  - Dashboard 13/13
  - Trading 17/17 (the hard stop still blocks Add trade; the server still enforces the daily limit)
  - Analytics 8/8
  - homepage and sign-in flow 30/30 (now with two header buttons)
  - screenshots 13/13 (now checks the 30-day orphan mark)
  - storage fallback notice 9/9
  - homepage button hover and focus swap 42/42
  - preferences and timezone 12/12
  - one page per tab: OK
  - sign-in from `/auth.html`: OK
- **Not tested:** real phones, Safari and Firefox, real Supabase Storage, the live site.

## Follow-up (after the Part 4 report)
1. **Final sweep:** the placeholder is replaced with real results (Step 5 above). The earlier run was cut off when the usage limit was hit, so I re-ran everything on the final build.
2. **Safer screenshot deletion** (`shots-store.js` `collectGarbage`):
   - Unreferenced files are only **marked** `{ id: markedAt }`, never deleted straight away.
   - A marked file is deleted only when it has been unreferenced for **30 days**; one that becomes referenced again is un-orphaned. The trigger is the user's next trades save after that.
   - The marks live per user in a server-managed record (`ob-shots-orphans`). The app can read it but can't write or delete it (403).
   - Account deletion is unchanged: everything at once.
   - **Tests:** marking with a timestamp, un-orphan on reuse, kept at 29 days, deleted at 30, never-saved uploads, Clear all trades, a read-only marks record, account deletion, and the pure garbage-collection logic.
3. **Visible storage backend:**
   - **Health:** `/api/health` now includes `"screenshots": "supabase-storage" | "local" | "embedded-fallback"`. A startup probe sets it, and it changes whenever an upload or migration fails or works again. No secrets or URLs are included; a test checks this.
   - **Server warning:** when storage fails, the server logs once: `[shots] WARNING: screenshot storage (Supabase Storage | local folder) is unavailable: <reason>. Screenshots are being stored inside the trades record (embedded fallback) until it works again.` It logs a line again when storage recovers.
   - **App notice:** shown once when an upload, or a save with embedded images, falls back: *"Screenshots are being stored inside your trades — storage is not configured."* It's a small dismissable notice at the bottom that hides after 15 s. It's shown once per browser, and the flag resets when an upload works again, so a later outage is announced again.
   - **Checks:** the server test makes the local store fail and recover. A browser check covers the notice, one-time behaviour, health and log lines (9/9).

## Homepage header and hero fixes (signed out only)
1. **No empty band:** the hero now starts **56 px** below the header on desktop (was about 180 px, from centring the hero in a tall box), **32 px** on tablets and **24 px** on phones. Content is top-aligned.
   - **Measured** from the header's bottom to the badge: 56 px at 1920, 1440 and 1024; 32 px at 768; 24 px at 430, 390 and 360.
2. **Header buttons:** **Sign in** (filled, opens the modal on Sign in) and **Get started** (outline, opens it on Create account). Same height (40 px, or 44 px on touch), font and radius.
3. **Hover and focus swap** on every homepage pair: header Sign in / Get started, hero Get started / See how it works, and the closing Get started.
   - Filled → outline and outline → filled.
   - 150 ms transition of background, border and text; the 1 px border stays in both states, so there's no shift.
   - Keyboard `:focus-visible` does the same. Hover applies only on `hover: hover` devices, so there's no sticky hover on touch.
   - **Check:** 42/42, covering every button in both themes for hover, focus, no size change, 150 ms, and no change on touch.
4. **Phones:** logo, name and both buttons fit on **one row at 360 px**. The "Pro OS" badge and subtitle are hidden on phones (signed out only), the logo is 36 px, and buttons use compact padding.
   - **Button sizes on touch:** Sign in 67×44 and Get started 94×44 at 360 px.
5. **Unchanged:** the signed-in header and every other page. The new buttons and rules apply only under `html.ob-signed-out` or inside the homepage. The functional check confirms the signed-in header has no Sign in or Get started button.
6. **Before/after screenshots:** [`review/plan2-homepage-header/`](review/plan2-homepage-header/), named `homepage-<before|after>-<light|dark>-<width>.jpg`, at all 7 widths in both themes (28 images). Quick pairs: `homepage-before-light-1440.jpg` → `homepage-after-light-1440.jpg` and `homepage-before-light-360.jpg` → `homepage-after-light-360.jpg`.

## Still imperfect (everything I know of)
1. **Homepage speed on slow phones:** about 7.5 s on a simulated 1.6 Mbit/s connection. The remaining weight is the app shell that the homepage shares with the app: Tailwind loaded from its CDN (a runtime compiler), Chart.js and Font Awesome, about 1.5 MB in total. Making it really fast means a separate lightweight homepage file or a Tailwind build step. That's a bigger change, and I didn't make it.
2. **Two profile reads and the "who am I?" checks still return 401 for visitors.** That's the correct answer, but browsers log it in the console.
3. **Supabase Storage is untested with real credentials.** If the bucket can't be created (Storage disabled), screenshots stay embedded as before. Nothing is lost, but the 12 MB limit would still apply. You can now see which store is in use at `/api/health` (`screenshots`).
4. **Old local copies:** browsers that used the app before keep an old local copy of trades with embedded images (`my_journal_trades_v1`), used only when the server can't be reached. It shrinks on the next successful save.
5. **Older chart series colours:** the strategy and timeframe bars and the regime doughnut keep their own blue, indigo and amber. Only green and red were remapped to the new palette.
6. **Hidden legacy blocks:** the old Trading blocks and the Journal equity card still render out of sight for older scripts. Wasted work, invisible.
7. **Account center title bar on desktop:** it stays sticky and passes over the profile card while scrolling. It's flagged by the audit, but intended.
8. **Header wording:** "Institutional Execution & Analytics Platform" and "Pro OS" are unchanged. You may want new wording for the public homepage.
9. **Homepage screenshots are static:** after future design changes, retake them with the harness script `homeshots.mjs`.
