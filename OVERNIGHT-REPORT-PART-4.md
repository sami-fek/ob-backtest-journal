# Part 4 report: analytics dark mode, psychology status, dashboard, final QA

Part 4 is done, and with it the whole 4-part build. Every step is pushed to `main`.

## How it was tested
- `node --check` on every changed JS file.
- Test suite on Node 20: **34/34 pass**. New: `test/psychology.test.js` (6 tests) and `test/dashboard-stats.test.js` (3 tests).
- Headless **Chrome** against the local app (SQLite, throwaway users with 40 seeded trades):
  - Screenshots of every page and overlay in **light and dark at 1440px and 390px**. I looked at each one.
  - Scripted checks:

    | Script | Result |
    |---|---|
    | Dashboard | 12/12 |
    | Psychology | 5/5 |
    | Account center (Part 3 run, repeated) | 42/42 |
    | Add trade / Settings smoke test | pass |
    | Daily limit, server 429 and hard stop | pass |
- **Not tested:** the Supabase path, real Google sign-in, real phones and Safari/Firefox, and the live site.

## Commits
| Commit | Step |
|---|---|
| `0405861` | Step 1: analytics dark mode (verified; insight banner) |
| `82d3658` | Step 2: Behavior sub-tab with Psychology Status |
| `4e0d549` | Step 3: Dashboard page |
| (this commit) | Step 4: QA fixes, theme inventory, report, status |

---

## Step 1: Analytics dark mode · DONE · `0405861`
- Every analytics view was screenshotted in both themes at both widths: filter bar, mode/account selectors, KPI tiles, all six charts, the strategy comparison table and the AI Coach panel.
  - It was already readable in dark: the Part 1 theme layer remaps the analytics script's injected colours, and the Chart.js theme plugin colours axes, grid, legends and tooltips.
- **One change:** the "System Discipline & Model Edge Insights" banner turned into a flat grey card in dark. It now has a purple gradient (`#26145f`, the promo colour from your reference) with readable text.
- **What looked like a bug but wasn't:** in my first dark screenshots the strategy, timeframe and regime charts looked empty. That was Chart.js animating while the full-page screenshot resized the window. Element screenshots show them drawn correctly; the QA script now turns animation off.
- **Note:** the "Full Monthly Performance Heatmap" card on Analytics has been hidden by `ui-layout-restore.js` / `journal-heatmap.js` since before this build (the calendar lives on Trading, and now the Dashboard). I left it as it was rather than bring back a duplicate calendar; tell me if you want it back.

## Step 2: Psychology Status · DONE · `82d3658`
- **Files:** new `public/psychology.js` (the calculations, no DOM), `public/psychology-ui.js`, `test/psychology.test.js`. Changed: `public/analytics-advanced.js` (exposes its filtered trade list and fires an event when it refreshes) and `public/index.html` (settings bridge now also returns the tag library and feelings).
- **Where:** Analytics had no sub-tabs, so it now has a pill bar: **Performance** (everything that was there, unchanged) and **Behavior** (new). The filter bar and the mode/account selectors stay visible on Behavior and apply to it.
- **Cards:**
  - **Followed:** % of trades with no Negative tag.
  - **Deviated:** % of trades with at least one Negative tag.
  - **Discipline:** average checklist completion (✓ items / items), over trades that have a checklist.
  - **FOMO:** % of trades tagged FOMO.
- **Tables:**
  - **By tag** (sentiment dot, trades, win rate, avg R, total R) and **By how it felt** (same columns).
  - **Mistake leaderboard:** Negative tags ranked by **R lost**, meaning the sum of the losing R of trades with that tag (explained under the table).
  - **Followed % per week:** trend chart, weeks start Monday.
- **Range pills:** 7D / 30D / 90D / All, on top of the analytics filters and the selected account.
- **Empty states:** no trades in range; no tags yet (with a hint on where to add them); no feelings logged.
- **Data:** only fields already on trades are used (tags, feeling, checklist, result, R, date). Tag sentiment comes from your tag library in settings: FOMO, Revenge and Overtrade are Negative by default, and your own Negative tags count too.
- **Tests:** the cards, case-insensitive tag merge, sentiment, the leaderboard order, feeling labels, the weekly trend, the date range and empty input.

## Step 3: Dashboard · DONE · `4e0d549`
- **Files:** new `public/dashboard.js`, `public/dashboard.css`, `public/dashboard-stats.js`, `test/dashboard-stats.test.js`.
  - `public/journal-heatmap.js` now exposes the calendar and activity builders as `window.obCalendarKit`. Its styles are keyed by class instead of id, so the Dashboard shows the *same* calendar and heatmap. The Trading page looks the same (checked).
  - Routing: `index.html`, `ui-stability-fix.js`, `ui-navigation-fix.js`, `auth-check.js`, `auth-modal.js`, `auth.html`.
- **Navigation:**
  - **Dashboard** is the first nav tab and the default when you're signed in.
  - Signing in (modal or `/auth.html`) lands on the Dashboard.
  - Signed-out visitors see the marketing **Home** behind the sign-in modal (tested in a clean browser). Home is still in the nav.
- **Sections, top to bottom:**
  1. Greeting (first name from your profile, else your email name) with the date. Top right: **Today's P&L, Trades, Wins**.
  2. Toolbar:
     - a **Live / Demo / Funded / Backtest** toggle (Live = the Real mode) that switches the app's mode;
     - an account picker;
     - a date range (7/30/90 days, this month, YTD, all);
     - a **Filter** popover (pair, strategy, side, result) with an active-filter count.
  3. Stat cards: **Net P&L**, **Win Rate** (with a wins / breakeven / losses gauge), **Profit Factor**, **Account Equity**, **Risk : Reward** (average win R ÷ average loss R).
  4. **Net P&L & Account Equity** chart: daily P&L bars plus the equity line, which includes deposits and withdrawals.
  5. **Performance Breakdown:** biggest win, biggest loss, average win, average loss, max drawdown, average R.
  6. **Calendar**, with month navigation and the day "+".
  7. **Profit Drivers:** best and worst strategy, with a bar per strategy.
  8. **Trading Activity** heatmap with the summary row: Net P&L, gross profit, gross loss, most traded pair, best trade, worst trade.
  9. **Recent Trades:** 8 per page, with side, pair, date, strategy, result, R and P&L. Clicking a row opens the trade.
- No performance clock and no new inputs.
- **Numbers agree with the rest of the app (tested):**
  - $ per trade uses the existing calculation (R × account starting balance × risk %, via `obCalendarKit.pnlFor`). Net P&L for all time equals the sum of R × $1,000 for the test account.
  - Calendar day values are identical to the Trading page calendar.
  - **Account Equity** uses the shared balance (`obBalance`). It equals the wallet card ($140,200.00 vs $140,200.00).
- **Decisions:**
  - Account Equity and Today's numbers ignore the range and filter: they are "now" values.
  - The calendar and activity heatmap apply the filter but have their own time windows (a month, 26 weeks).
  - Everything else follows the range and the filter.
- **Empty state:** an account without trades shows zeros, "—" where a number would be meaningless, and a "No trades yet · Log a trade" card (tested on Funded).
- The currency symbol and date format from Account Settings are used here (the Part 3 preferences).

## Step 4: Final QA · DONE (this commit)
- **Walked in light and dark at 1440 and 390:**
  - Pages: Dashboard, Home, Trading, Journal, Analytics (both sub-tabs), Account center (all 6 sections), Settings.
  - Overlays: trade drawer, calendar "+" panel, LOG A TRADE dropdown, account menu, AI Coach panel, sign-in modal, `/auth.html`.
- `THEME-INVENTORY.md` now has a final status per item. Nothing is "Pending".
- **Fixed:**
  - **Hard-stop banner wording:** once your loss rule had been hit, the banner title showed the *current* streak, e.g. "HARD STOP — 0 consecutive loss". It now shows the streak while it's active ("2 consecutive losses"), otherwise "2-loss rule hit on <date>". Only the text changed, not the rule (re-tested: the hard-stop modal still appears on Add trade).
  - **Settings:** the MT5 "NOT CONNECTED" badge was clipped at 390px.
  - **Dashboard on phones:** the activity heatmap opens scrolled to the newest weeks, and the calendar's week column is no longer clipped.
- **Re-confirmed working:**
  - Login, sign-up, wrong password and Google-only accounts (test suite).
  - Save rules (test suite + Add trade smoke test: the drawer opens and nothing is stored before Save).
  - Daily limit: blocked in the UI and the server returns 429.
  - Hard stop.
  - AI coach (test suite).
  - Storage, Settings save, and the account center flows.

## Still imperfect / not done
- **Console errors on the sign-in page:** `ui-rules.js` and `mt5-integration-ui.js` are injected on every page, so on `/auth.html` they log harmless console errors. These existed before this build; I left them alone.
- **Preferences:** the currency symbol and date format apply in the Account center, Dashboard and Behavior tab. The older widgets (wallet card, Trading calendar, Trading KPIs, Analytics) still show `$` and ISO dates. The timezone preference is stored but not used.
- **"Get started" button:** the header still shows it for signed-in users (unchanged from before).
- **Floating AI Coach button:** at 390px it can sit on top of content at the bottom right of a screen until you scroll.
- **Not exercised:** the Supabase paths.
