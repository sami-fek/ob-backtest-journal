# QA sweep and checks

Browser checks for MY Journal. Not part of the deployed app (Render builds `OB-Backtest-Journal-READY/` only).

## Setup
1. Start the app locally on port 3456: in `OB-Backtest-Journal-READY/`, run `PORT=3456 npm start` (SQLite, no secrets needed).
2. In this folder: `npm install` (puppeteer-core only; it uses the installed Chrome).
3. Optional environment variables:
   - `QA_BASE`: app address (default `http://127.0.0.1:3456`);
   - `CHROME_PATH`: Chrome executable (default: the standard Windows path).

Every run registers throwaway `@test.local` users on the local server.

## The sweep
`node qsweep.mjs <name> [widths] [themes] [--layout] [--hover] [--shots]`

For example, the full sweep: `node qsweep.mjs final 360,390,412,430,768,1440,1920 light,dark --layout`

- **Screens:** every app page and overlay:
  - Dashboard: Live, Funded and Backtest, plus the filter popover;
  - Trading: Live and Funded, plus the states at the daily limit and at the hard stop;
  - Journal and Analytics (Performance and Behavior);
  - all 6 Account center sections and Settings;
  - new trade sheet, trade drawer (including MT5 R-assign), calendar day panel, dropdown, account menu, AI Coach and strategy dialog;
  - MT5 link dialog, add and edit account dialogs, daily-limit and hard-stop modals;
  - the signed-out homepage, the sign-in modal and `/auth.html`.
- **Settings:** the users have currency **€** and date format **DD/MM/YYYY**. Widths under 1024 px emulate touch (`hover:none`, `pointer:coarse`, `isMobile`, `hasTouch`).
- **Checks** (`qcheck.mjs`):
  - **Text:** visible text, tooltips (`title`) and placeholders must not contain `$`, a standalone `USD` or an ISO date `YYYY-MM-DD`.
    - **Allowed:** instrument names (EURUSD, XAUUSD, USDJPY …), the currency list in Account center › Preferences, and MT5 tokens and URLs shown for copying.
  - **Colour:** visible buttons, links and tabs must not use `#2563eb`, `#3b82f6`, `#1d4ed8` or `#6366f1` as background, border or gradient. With `--hover` this is also checked while each button is hovered (desktop only).
    - **Allowed:** the active tab in the header nav. Focus rings and link text colour are not checked.
  - **Charts:** no visible Chart.js series may use the old saturated colours.
  - **Layout** (with `--layout`): no sideways page scroll, nothing sticking out, taps ≥ 44 px and fields ≥ 16 px on touch, nothing covered by fixed elements.
- **Output:** distinct issues with the screens they appear on, then a per-page summary.

## Focused checks
- `check-timezone.mjs`: the device timezone is saved once, and the server's daily-limit day matches the browser's.
- `check-dialogs.mjs`: daily limit, hard stop, add and edit account, MT5 link and guide (the link response is mocked; see the fixes report).
- `check-analytics-scope.mjs` and `check-analytics-filters.mjs`: period and filter labels, and the widgets following the filters.
- `check-settings.mjs`: every setting kept, saved and enforced, plus the phone order.
