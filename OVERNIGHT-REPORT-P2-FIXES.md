# Plan 2 · Fix round after the audit

All 7 steps are done and pushed to `main`.

**Read first: two MT5 problems.**
- **MT5 linking fails on the server, and I did not fix it.** It has been broken since 2026-09-29. The fix is a backend change that this round excludes. Details and a proposed fix are in "Found during this round".
- **The token step in the MT5 dialog was also broken. That one is fixed.**

## Commits
| Commit | Step |
|---|---|
| `91c2594` | 1 · Device timezone saved once when none is saved |
| `9395996` | 2 · Currency symbol and date format in the leftovers |
| `3aa904f` | 3 · Dialogs on the design system, no saturated blue on buttons, MT5 token step fixed |
| `04af921` | 4 · One softened chart palette (tokens) for every series |
| `0bfd722` | 5 · Period and filter label on every Analytics card; the widgets now really follow the filters |
| `508ac51` | 6 · Settings restructured |
| (this commit) | 7 · Final sweep fix (Journal "Inspect" tap size), `qa/` sweep and checks in the repo, this report |

## Step 1 · Timezone default (audit #26)
- **Change:** after sign-in, if no valid timezone is saved, the app saves the device's timezone once, without asking (`ensureTimezoneSaved` in `index.html`).
  - It acts only on a definite server answer (200 or 404). A failed request or a signed-out visitor writes nothing.
  - A saved timezone is never overwritten. The other settings stay intact; for a brand-new user the defaults are written too.
- **Tested:** `qa/check-timezone.mjs`, 10/10 in Chrome with emulated device timezones.
  - **UTC+14 (Pacific/Kiritimati):** the zone is saved. The server's daily-limit day was **14/11** while UTC was 13/11, and it matched the browser.
  - **UTC−11 (Pacific/Pago_Pago):** the zone is saved and the days match.
  - **A saved Europe/Berlin** is unchanged after a visit from UTC+14.
  - **Signed-out homepage:** loads, nothing written.

## Step 2 · Currency and date format leftovers (audit #25)
Fixed:
- **Settings:** "Starting account capital (€)".
- **Add / edit account dialogs:** the balance suffix is the saved symbol, not a fixed "USD". It's set as text, never as HTML.
- **Daily-limit modal:** the date.
- **Hard-stop banner:** "2-loss rule hit on …".
- **Trading toolbar chip:** its text and its tooltip.
- **Found by the new text check:**
  - Dashboard activity squares (tooltips like "2026-11-10: no trades");
  - the drawer subtitle when a trade is started from a calendar day.
- **Found by reading the code:** the Behavior trend tooltip ("Week of …"). It's drawn on a canvas, so the DOM check can't see it.

**New automated text check** (`qa/qcheck.mjs`, part of the sweep):
- **Setup:** currency €, date format DD/MM/YYYY.
- **Scans** the visible text, `title` tooltips and placeholders of every page and overlay.
- **Fails on** `$`, a standalone `USD`, or an ISO date `YYYY-MM-DD`.
- **Allowed, and only these:**
  - instrument names (EURUSD, XAUUSD, BTCUSD, USDJPY …);
  - the currency choices in Account center › Preferences (`#asSym`);
  - MT5 bridge tokens and the EA URL shown for copying.

**Result:** clean on all 490 sweep screens (Step 7).

## Step 3 · Leftover blue and old dialogs (audit #1, #5)
- **New shared dialog component** in `design.css`: `.ds-overlay`, `.ds-dialog`, `.ds-field`, `.ds-input`, `.ds-close`, `.ds-note`.
  - **New tokens:** a toned danger red (`--ds-danger-*`, `.ds-btn-danger`): `#c94040` light, `#e36060` dark.
- **On the design system now:**
  - **Daily-limit modal:** "Open Settings" is the monochrome primary button.
  - **Hard-stop modal:** "Go back" is secondary; "Log as violation" uses the toned danger red.
  - **Add / edit account dialogs:** they keep z-index 90, so the validation toast (z 100) still shows above them.
  - **MT5:** the link form, token step, guide, history modal, status panel and open-positions styles, the "+ Add account first" button and the badge.
  - **R-assign panel:** tokens, monochrome "Calculate R".
  - **Journal "Inspect":** a secondary button, no blue hover.
  - **Desktop calendar "+":** monochrome.
  - **Strategy and other dropdown buttons:** neutral hover, not solid blue.
  - **Others:** the wallet dot, the selected feeling chip in the drawer (monochrome outline), the Analytics expectancy colour, and the avatar palette (softened colours, same index per email, so each user's colour family stays the same).
- **New automated colour check** (part of the sweep):
  - **Fails if** a visible button, link or tab uses `#2563eb`, `#3b82f6`, `#1d4ed8` or `#6366f1` as background, border or gradient.
  - **Hover:** with `--hover` the check also runs while each button is hovered (desktop).
  - **Allowed:** only the active tab in the header nav. Focus rings and link *text* colour are not checked, since they are the intended accent.
- **Tested:**
  - `qa/check-dialogs.mjs`: 36/36 in both themes, with these checks:
    - the dialogs open on the design system, with the expected button colours;
    - Add account still creates an account and Edit still saves;
    - the toast is above the dialog;
    - "Open Settings" goes to Settings;
    - hard stop: "Go back" cancels and "Log as violation" continues;
    - the MT5 token is shown after linking (server answer mocked; see below).
  - **Hover pass:** clean at 1440 in both themes on all screens; at 1440 and 1920 on the pages changed later.

## Step 4 · Chart colours (audit #6)
- **One softened palette as tokens** in `design.css`, both themes:
  - `--ds-chart-pos` and `--ds-chart-neg` (as before);
  - `--ds-chart-1` blue, `-2` violet, `-3` amber, `-4` teal, `-5` rose;
  - `--ds-chart-line` = `--ds-chart-1`.
- **Applied by the theme plugin** (`theme.js`) to every Chart.js series:
  - green and red map to pos and neg;
  - every other saturated colour maps to the categorical token of its hue family;
  - greys stay as they are.
  - So the Analytics strategy, timeframe, regime and R-progression charts, the Dashboard equity line, and any chart added later all use it.
- **Corrected:** amber was being drawn as the loss red (the regime doughnut's "Reversal"). It's now the amber token.
- **Check:** the sweep also fails if any visible chart series still uses an old saturated colour. Clean everywhere.

## Step 5 · Analytics period labels (audit #7)
- **Every Analytics card** (Performance and Behavior) shows a `ds-period` label built from the filter bar:
  - **Dates:** "all time" when there's no date filter, otherwise "14/10/2026 – 13/11/2026", "since …" or "until …", in the saved date format.
  - **Then every active filter:** pair, session, day, timeframe, regime. Example: `14/10/2026 – 13/11/2026 · EURUSD · London`.
  - It updates on every filter change, and cards that other scripts redraw get it back (`analytics-page.js` `stampScope`).
- **A bug this exposed, now fixed (it predates this round):**
  - **The problem:** the Overview tiles (profit factor, expectancy, max drawdown, W/L ratio), the insight card and the strategy, timeframe and regime charts **ignored the filters and the active account, and mixed every mode** (Live, Funded, Demo and Backtest together).
  - **The cause:** `analytics-advanced.js` tried to filter by swapping `window.trades`, which is a read-only getter, so it did nothing.
  - **The fix:** they now read the filtered Analytics list. A label saying "EURUSD · London" over unfiltered numbers would have been false.
- **Tested:**
  - `qa/check-analytics-scope.mjs` 4/4: all 18 Performance cards and 5 Behavior cards labelled, "all time" without filters, the exact text with filters.
  - `qa/check-analytics-filters.mjs` 2/2:
    - **No filter:** the tiles, insight and charts use the 40 Live · Real 01 trades, not all 48 across modes.
    - **With EURUSD:** they use the 10 matching trades.
  - **The earlier Analytics check** still passes, 8/8.

## Step 6 · Settings structure (audit #4, #12)
- **Layout:**
  - **Heading:** "Rules, account and data".
  - **Sections** with their titles outside the cards, on the 12-column grid and the full-width app frame.
  - **Order:** Trading rules (2 cards) → Account defaults (3 cards) → Backup and data, with MT5 bridge alongside on desktop.
  - **Phones** get the same order, stacked one per row: rules first, then account, data, MT5.
- **Kept:**
  - every input id and `onchange="updateSettings()"`;
  - Export backup, Export CSV, Import and Clear all trades;
  - the MT5 status hook (the `mt5BridgeStatus` structure that `mt5-integration-ui.js` updates).
- **Tested:** `qa/check-settings.mjs` 12/12.
  - every setting present at 1440 and 390;
  - titles outside cards and no card inside a card;
  - the € symbol;
  - the phone order;
  - full width on desktop;
  - **values saved:** changing all five values saves them and keeps the other settings;
  - **values enforced:** the discipline engine uses the new limits, and the **server daily limit follows** (5);
  - the handlers exist.
- **Layout audit:** clean at 1440, 768 and 390 in both themes.

## Step 7 · Full sweep (layout + text + colour)
- **Coverage:** 7 widths (360, 390, 412, 430, 768, 1440, 1920), light and dark, with touch media under 1024 px (`hover:none`, `any-hover:none`, `pointer:coarse`, `any-pointer:coarse`, plus `isMobile`/`hasTouch`).
- **Screens:** 35 per width and theme, **490 in total**. That's every app page and overlay, plus the signed-out homepage, sign-in modal and `/auth.html`.
- **Checks:**
  - **Text:** no `$`, `USD` or ISO dates.
  - **Colour:** no old blues on buttons, links or chart series.
  - **Layout:** no sideways scroll, nothing sticking out, taps ≥ 44 px and fields ≥ 16 px on touch, nothing covered.
- **Results:**
  - **Text: clean on all 490 screens.**
  - **Colour: clean on all 490 screens.** Separate hover passes are clean too.
  - **Layout:**
    - **One real problem, fixed:** the Journal "Inspect" button was 28 px tall on touch (360–768, 17 screens). My compact desktop size overrode the touch size. Rechecked at all touch widths in both themes: 44 px, 12/12 clean.
    - **Account center:** its sticky title bar passes over the "Edit Profile" button while scrolling at 1440 and 1920 (24 screens: 6 sections × 2 themes × 2 widths). Intended and known from Part 4.
- **Per page** (all 7 widths and both themes unless noted):

| Page / overlay | Result |
|---|---|
| Dashboard: Live, Funded, Backtest; filter popover | clean |
| Trading: Live, Funded; at daily limit; at hard stop | clean |
| Journal (incl. at hard stop) | clean after the Inspect fix (rechecked 12/12) |
| Analytics Performance, Behavior | clean |
| Settings | clean |
| Account center (6 sections) | clean at 360–768; sticky-bar note at 1440 and 1920 (intended) |
| New trade sheet, trade drawer, MT5 R-assign drawer, calendar day panel | clean |
| Dropdown, account menu, AI Coach, strategy dialog | clean |
| MT5 link dialog, add account, edit account | clean |
| Daily-limit modal, hard-stop modal | clean |
| Homepage (signed out), sign-in modal, `/auth.html` | clean |

- **JavaScript errors:** none during any sweep.
- **Earlier checks, rerun on the final build:**
  - homepage and sign-in 30/30
  - screenshots and save rule 13/13
  - preferences and timezone 12/12
  - storage fallback notice 9/9
  - Dashboard 13/13
  - Trading 17/17
  - Analytics 8/8
- **Unit tests (Node 20):** 54/54.

## Found during this round
1. **MT5 linking fails on the server. Not fixed, as asked; needs your OK.**
   - **What happens:** `POST /api/mt5/link` returns 500 `MT5_LINK_FAILED` for every signed-in user.
   - **Why:** the MT5 routes in `app-entry.js` keep the bridge-token index under a pseudo-session `__mt5_bridge_tokens_v2`. They reach storage through the inner `server.js` `/api/storage` routes, and since multi-user sign-in (`e988fbb`, 2026-09-29) those accept only real users, so the write gets 401.
   - **Effect:** bridge **sync** reads the same index, so it can't work either.
   - **Why tests missed it:** the MT5 unit tests use in-memory storage, so they pass.
   - **Proposed fix (backend, small):** give the gateway a trusted path to the token index. Either an internal-only storage route on `127.0.0.1` guarded by a per-boot random secret passed to the child process, or have `server.js` own the token index. No `render.yaml` or secret change is needed.
2. **MT5 token step, fixed.** After a successful link, the dialog looked for a box class that no longer existed (since 2026-09-29). It threw, so the token was never shown. The box now has a stable class.
   - **Tested** with the server answer **mocked**, because of item 1.
3. **Analytics widgets ignored the filters and mixed modes, fixed** (Step 5).
4. **Shared browser, not fixed (out of scope).** If two users sign in one after the other on the same browser, the second can inherit the first user's "active account" id from `localStorage`.
   - **Effect:** the toolbar then shows "Real 01" but the discipline engine filters by an account that doesn't exist, so it reads "Rules OK" even at a hard stop.
   - **Severity:** rare (shared computers), but it should be fixed: clear those keys on logout, or ignore an id not in the user's accounts.
5. **My own slip, caught before any commit.**
   - **What happened:** a marker-based edit for the daily-limit modal matched an earlier modal and deleted about 200 lines of `index.html` in the working copy.
   - **How it was caught and fixed:** the dialog test failed ("showDailyLimitBlock is not defined"). I restored the file from the last commit and reapplied the edit, anchored inside the function. The pushed version is correct, and every check passes on it.
6. **One unit-test run showed 53/54 while two browser sweeps were running, and my command pushed the Step 3 commit anyway.**
   - **Why it pushed:** the chain checked the output filter, not the test exit code.
   - **What I found:** five later runs gave 54/54. I couldn't reproduce the failure or tell which test it was; it looks timing-sensitive under heavy load.
   - **Since then:** every commit is gated on the test command's exit code.

## In the repo now: `qa/`
- **What's there:** the sweep (`qsweep.mjs`), the checks (`qcheck.mjs`), the harness (`seed.mjs`, `h2.mjs`) and the focused checks above, with a README.
- **Isolation:** it lives outside `OB-Backtest-Journal-READY/`, so it's not part of the deploy, and it has its own `package.json` (puppeteer-core).
- **Configuration:** the server address and Chrome path come from `QA_BASE` and `CHROME_PATH`. It contains no secrets or personal data.

## Still open
- **Hidden legacy blocks:** the old Trading blocks and the Journal equity card still render out of sight. Not in this round, as asked.
- **Homepage speed on slow phones:** about 7.5 s. Not in this round.
- **Header wording:** "Institutional Execution & Analytics Platform" and "Pro OS". Not in this round.
- **MT5 link and sync server bug** (item 1 above). Needs a backend change.
- **Shared-browser active account** (item 4 above).
- **Account center sticky title bar** on desktop: intended.
- **Canvas text:** chart axis labels such as "10-14" (month-day, from the Analytics drawdown chart) are drawn on the canvas, so the text check can't see them. They aren't full dates, but they don't follow the date format.
- **Untested:** real phones, Safari, Firefox, the live site, real Supabase Storage, real Google sign-in, real AI Coach replies, and a real MT5 EA.
