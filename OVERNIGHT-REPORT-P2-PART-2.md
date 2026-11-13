# Plan 2 · Part 2 report: the design rolled out to every page

All 4 steps are done and pushed to `main`. You asked me to run Parts 2 and 3 back to back, so there was no stop between them; Part 3 has its own report (OVERNIGHT-REPORT-P2-PART-3.md).

## Commits
| Commit | Step |
|---|---|
| `5e94b41` | 1 · Analytics: sections, new calculations, fluid frame on every app page |
| `1660456` | 2 · Journal: "Review" section, Not reviewed yet queue, equity chart removed |
| `708ebb8` | **Fix** (see "Two bugs I shipped and fixed") |
| `d0c465b` | 3 · Account center, Settings, drawer, calendar panel, dialogs, dropdowns, account menu, AI Coach, sign-in modal |
| `dee6f02` | 3 · Sign-in page (auth.html) |
| `2a7ebbf` | **Fix** (see "Two bugs I shipped and fixed") |
| `a992401` | 4 · Stale Dashboard rules removed from mobile.css, "Live" label on Journal / Analytics. This went into the same commit as Part 3 Steps 1–6; the sweep results are below. |

## Two bugs I shipped and fixed
Both were live for a short time. Both are fixed, and a check now guards each one.
1. **Journal and Analytics showed under other pages** (pushed in `5e94b41` and `1660456`, fixed in `708ebb8` about 20 minutes later). My `display: flex !important` layout rule beat the app's `.hidden` class, so the Journal content also appeared below Trading, Account center and the other pages. Fixed by applying the layout only to the visible page. **Guard:** `onepage.mjs` switches through every tab at 1440 and 390 and checks that exactly one page is visible.
2. **The Analytics Behavior tab still showed the Performance charts** (pushed in `5e94b41`, found while taking the homepage screenshots, fixed in `2a7ebbf`). One of my rules beat the existing "hide on Behavior" rule. **Guard:** `afunc.mjs` opens Behavior and checks that no Performance block is visible.

## Step 1 · Analytics: "Why am I winning or losing?"
- **Kept:** the filters, all charts (strategy, timeframe, regime, session, day of week, R progression), Strategy Comparison, the insight text, and the Behavior tab. They're the same scripts, now restyled.
- **New structure.** Section titles sit above the cards: Overview → Over time → Where the R comes from → Discipline → Strategies.
  - The filters and the mode/account selectors are plain toolbar rows, not boxes.
  - The insight text is a quiet note instead of a dark blue box.
  - Profit Drivers and Performance Breakdown (moved here in Part 1) now have the new look, under Strategies.
- **New calculations** in `public/analytics-insights.js`, a pure module with **5 new unit tests** in `test/analytics-insights.test.js`. They work in R, so they also work for Backtest, and follow the filters and the selected account.
  - **Rules followed vs broken:** win rate, average R and trade count for checklist ≥ 50% vs < 50%. It uses each trade's saved checklist snapshot, the same basis as the 50% save rule, and states the difference per trade. Trades without a checklist are counted and left out.
  - **After losses:** the next trade after 1, 2 and 3 losses in a row, in time order rather than list order. *Decision:* "after 2" means at least the 2 trades before it were losses, so it includes runs of 3 and more.
  - **R-multiple distribution:** 0.5R bands from ≤ −2.5R to ≥ +4.5R, green / red / grey by sign.
  - **Drawdown:** a chart of distance below the best cumulative R so far, plus max depth, the longest drawdown in trades and calendar days, and where you are now ("At peak" or depth plus trades in).
  - **Sample size:** under 30 trades in the current view, a warning shows ("not yet reliable, N more to go"), and each new card gets a "small sample · N" pill. The warning also shows on the Behavior tab. The After-losses rows mark rows under 30 with ⚠.
- **Fluid frame:** Journal, Analytics, Account center and Settings now use the full-width app frame, as Dashboard and Trading did in Part 1.

## Step 2 · Journal: "Review"
- **Not reviewed yet queue.** It lists trades with **no checklist ticks or no note** (a note with only empty formatting counts as no note), for the selected mode and account, newest first.
  - Each row shows what's missing as pills, and **Review** opens the trade drawer.
  - It shows 5 rows with **Show all N**. When nothing is missing it says so.
  - It sits beside **Discipline & Rules Status**, which is kept with all its rows.
- **Removed:** the Cumulative Equity Growth chart, which was a duplicate. R progression and drawdown are in Analytics, $ equity on the Dashboard.
  - Its card stays in the DOM, hidden, because three older layout scripts look it up by its canvas.
  - The `$ Equity` toggle went with it. Its saved preference is ignored but not deleted.
- **Restyled:** the filters (unboxed) and the trade table (quiet header, neutral strategy colour). All filters and the row-click-to-drawer behaviour are unchanged.
- `UI_RESTORATION_LOCK.md` item 5 is updated to the new Journal contract.

## Step 3 · Overlays and the remaining pages
- **No saturated blue buttons anywhere:** every `bg-blue-600` button is now the monochrome main button. That covers Export backup, MT5 dialogs and the account dialogs. Every green `bg-emerald-600` action uses the softened log-trade green.
- **Trade drawer + calendar "+" panel** (same panel):
  - quiet checklist rows (tint only, no coloured outlines);
  - green **Save**, quiet **Delete**;
  - **Analyze with AI** is a secondary button instead of a blue gradient.
  - The save rule and its live checklist are unchanged.
- **Dialogs** (strategy editor and delete, daily-limit block, hard-stop dialog, MT5 link, history and integration): one surface, one radius and soft shadow, design-system inputs.
- **Dropdowns and bottom sheets, account menu:** neutral highlights; blue only for the check mark and focus.
- **AI Coach:**
  - The button now sits **in the header at every width**: a "✨ AI Coach" pill on desktop, a round icon on phones and tablets. This fixes the Part 1 open issue where the floating button covered card edges. It's a one-line change in `mobile.js`: the docking rule now applies at all widths.
  - The chat panel uses the new surfaces, a monochrome send button and your own messages in the main-button colour.
- **Account center:** the new surfaces, neutral selected item with a blue marker, larger light title, monochrome **Save Changes**.
- **Settings:** an aligned 960 px form (readable width), mono section labels, secondary buttons; **Clear All Trades** is an outlined red button.
- **Sign-in modal and `/auth.html`:** monochrome logo mark and Sign in button, design-system fields. `auth.html` now loads `design.css`, so it gets the same background and grid, plus a small `auth-page.css`.

## Step 4 · Mobile structure everywhere + full sweep
- **Removed** the stale `#dbRoot` rules for the old Dashboard table, toolbar, stats and segments from `mobile.css` (Part 1 open item 10). Kept the two that still apply: the calendar month buttons and the filter popover position.
- **"Live" everywhere:** Journal and Analytics mode buttons and the "Viewing" pill now say **Live** for the Real mode, matching Dashboard and Trading (Part 1 open item 6). Stored data still says `Real`.
- **Phone structure per page:**
  - **Analytics:** filters two per row with dates on their own row; cards full width; the drawdown and R distribution charts get their own rows. Tables scroll inside their card, never the page.
  - **Journal:** the queue comes first, then Discipline status, then filters (two per row) and the trade table. Each queue row stacks pair/R and pills/Review.
  - **Account center and Settings:** single column, 44 px controls, 16 px fields. The Account center title bar is no longer sticky on phones, so it can't cover fields.
- **Full sweep results** are in the Testing section below.

## Testing
- `node --check` on every changed JS file.
- **Unit tests (Node 20): 42/42 pass**, up from 37. The 5 new ones cover the Analytics calculations.
- **Page sweep:** Dashboard, Trading, Journal, Analytics, Account center and Settings, at **360 / 390 / 412 / 430 / 768 / 1440 / 1920**, light and dark, with touch media emulated under 1024 px. That's **84 screens**.
  - Checks on each screen: no sideways scroll; nothing sticking out; taps ≥ 44 px; fields ≥ 16 px; nothing covered while scrolling.
  - **Result:** clean except 4 desktop notes on the Account center. Its sticky title bar (with Save Changes) passes over the profile card while you scroll. That bar is sticky on purpose, so this is expected.
- **Overlay sweep:** drawer, drawer bottom, calendar panel, dropdown, account menu, AI Coach panel, strategy dialog, signed-out modal and `/auth.html`, at all 7 widths in both themes. **Result:** Account center and Settings are clean at every width, except the same 4 desktop sticky-bar notes as in the page sweep. I looked at the overlay screenshots at 360/390/412/768/1440: the drawer, calendar panel, bottom-sheet dropdown, account menu and AI Coach panel all fit the screen, with nothing cut off and 44 px controls.
- **Functional scripts:**
  - **Analytics `afunc` 8/8:**
    - new sections shown;
    - the rules card matches the module;
    - the sample warning appears when filtered under 30;
    - Behavior hides every Performance block, and they come back afterwards.
  - **Journal queue:**
    - 9 incomplete trades → "9 to review", 5 rows, then "Show all" gives 9;
    - Review opens the drawer;
    - the equity chart is not visible.
  - **One page per tab** (`onepage`): OK at 1440 and 390.
  - **Part 1 scripts re-run:** Dashboard **13/13**, Trading **17/17**. The hard stop still blocks Add trade, and the server still enforces the daily limit.
- **Not tested:** real phones, Safari and Firefox, Supabase, the live site.

## Still imperfect
1. **Account center title bar on desktop:** it stays sticky and passes over content while scrolling, as before. It's flagged by the audit, but intended.
2. **Chart colours inside older charts:** the strategy and timeframe bar charts and the regime doughnut keep their own blue, indigo and amber series colours. Only the green/red series were remapped. They read fine but aren't in the neutral palette yet.
3. **Hidden legacy blocks:** the old Trading blocks and the Journal equity card still render out of sight for older scripts. Removing them means touching those scripts (Part 4 candidate).
4. **AI Coach panel text:** it still says "Context: Real". That string comes from `ai-coach.js` and wasn't changed, to keep the AI Coach untouched.
5. **"Review Rule Inspector" button** on the Journal's Discipline card still links to the Journal itself, as before.
6. **Preferences (currency and date format)** in the older widgets are still Part 4.
