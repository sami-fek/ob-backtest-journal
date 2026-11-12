# Part 1 report: theme foundation, pill nav bar, account menu

Part 1 is done. Every step was pushed to `main` as its own commit, plus one hotfix (below).

## How it was tested
- `node --check` on every changed JS file.
- Test suite on Node 20: **12/12 pass**, including the new `test/theme.test.js`.
- jsdom regression scripts for save rules, strategies, discipline, hard stop and AI: all pass. Two known non-issues remain: the strategy-comparison check needs the Analytics tab open, and the "Google not configured" check needs a server started without a Google client ID.
- Headless **Chrome** against the local app (SQLite, test users, then deleted): screenshots in **dark and light** at **1440px and 390px** for every changed screen. I looked at each one before pushing.
- **Not tested:** real phones, Safari/Firefox, real Google sign-in, the live Render site.

## Commits
| Commit | What |
|---|---|
| `bcf3e86` | BUILD-PLAN.md |
| `82b6145` | Step 1: theme system |
| `384e4a5` | Step 2: pill nav bar |
| `8e7516c` | Step 3: account menu |
| `1e1f082` | **Hotfix** for Step 1 (see below) |
| `ef1161f` | Step 4: dark mode walk-through + THEME-INVENTORY.md |

## Hotfix you should know about (`1e1f082`)
For about an hour after `82b6145`, the first page render after load could abort. The theme's Chart.js plugin re-assigned Chart.js option objects, which caused a "Maximum call stack size exceeded". The KPI tiles, Execution Log and Accounts page then showed **0 trades** until something re-rendered (switching mode or tab fixed it). **No data was affected:** trades were loaded and stored normally. The fix sets only colour values and can't break a chart render. I caught it during the Step 4 walk-through.

---

## Step 1: Theme system · DONE · `82b6145` (+ `1e1f082`)
- **Files:** new `public/theme.css`, `public/theme.js`, `test/theme.test.js`; `public/index.html` and `public/auth.html` (head only).
- **Theme choice:**
  - `html[data-theme="light"|"dark"]`, stored in localStorage `my-journal-theme` (`light` | `dark` | `system`; default `system` follows the OS and reacts to OS changes and other tabs).
  - A tiny inline script in the `<head>` of both pages sets the theme **before first paint**, so there's no flash of the wrong theme.
  - `window.setTheme(mode)`, `window.getTheme()`, `window.getResolvedTheme()`, and an `ob-theme-change` event. The auth modal lives on the main page, so it gets the theme too.
- **Colours:** all from your colour reference, as CSS variables.
- **Tailwind layer:** dark-mode remaps for the Tailwind classes the app actually uses (found with grep: surfaces, text, borders, hover/focus, inputs, shadows), plus dark versions of the app's own classes (glass cards, header, checklist, calendar cells, scrollbars).
- **Patch scripts:** instead of editing many files, `theme.js` rewrites hard-coded light colours inside their `<style>` blocks and inline styles to `var(--tc-…, original)`.
  - In **light** that variable is undefined, so the original colour is used (zero change).
  - In **dark** it maps to the dark palette.
  - It's property-aware: white *text* stays white and only white *backgrounds* darken. It doesn't touch Tailwind's own CSS. Unit-tested.
- **Charts:** a Chart.js plugin themes axis ticks, gridlines, legends and tooltips. Verified in both themes.
- **Decision:** the light page background changed from the old `#f4f7fb` to the reference `#ffffff`. Cards keep their borders, so they still separate.

## Step 2: Pill nav bar · DONE · `384e4a5`
- **Files:** `public/index.html`, `public/theme.css`, `public/auth-check.js`.
- **Look:** a floating `rounded-full` pill with a soft border and shadow, centred; tabs are `rounded-full`. The active tab is a tinted pill: dark `#1b2538` with blue text, light `#eff6ff` with blue text. Subtle hover.
- **Removed:** the **Settings** and **Accounts** nav buttons. Their pages and `switchTab('settings'|'accounts')` still work; I changed `switchTab` so a page doesn't need a nav button. Accounts was added to the account menu in the same push, so it was never unreachable.
- **Phones:** the four tabs fit on one row (tighter padding) and never wrap. When signed in, the redundant "Get started" button is hidden below 480px so the logo and avatar share the top row. "Get started" only jumped to Trading, which the nav already has.

## Step 3: Account menu · DONE · `8e7516c`
- **File:** `public/auth-check.js`.
- **Avatar:** a round button with the first letter of the email on a coloured circle (colour derived from the email).
- **Menu card:**
  - header with the name (the email's local part until Part 3 adds profiles) and the email;
  - **Profile**, **Accounts**, **Settings**;
  - **Appearance**: a segmented Light / Dark / System control calling `setTheme`. The menu stays open so you see the change;
  - divider, then **Log out** (red on hover).
- **Behavior:** closes on outside click and Escape. Keyboard: arrow keys, Home/End, left/right inside Appearance. Works at 390px. No email in the header bar.
- **Stubs for Part 3:**
  - `window.openAccountCenter(section)`: for now Profile → Settings page, Accounts → Accounts page.
  - `window.obSetAccountAvatar(photoUrl, name)`: for the Part 3 profile photo.

## Step 4: Dark mode for Home, Trading, Journal, Accounts, Settings, MT5, modals, auth · DONE · `ef1161f`
- **Files:** `public/theme.css`, `public/theme.js`, `public/auth-modal.js`, `public/auth.html`, `public/discipline-engine.js`, new `THEME-INVENTORY.md`.
- **Walked through in dark:**
  - Home; Trading (MT5 bar, mode switch, LOG A TRADE + dropdowns, KPIs, calendar, balance widget, execution log, discipline banner); trade drawer; Journal (filters, equity chart, discipline panel, table); Accounts; Settings.
  - Modals: strategy editor, delete picker, daily-limit block, hard-stop warning, Add/link account, Link MT5, MT5 guide, AI Coach panel, sign-in modal, `/auth.html`.
  - Main pages also at 390px.
- **Fixed:**
  - calendar heatmap win/loss cells (bright in dark);
  - discipline banners and streak pills (dark text on dark);
  - LOG A TRADE dropdown labels (dark blue on black) → raised surface with gray hover, per your reference;
  - glassy modals' white outlines;
  - the sign-in page's light gradient in dark;
  - the Google button, which looked faded in dark: it now uses Google's own `filled_black` style in dark and `outline` in light, and re-renders on theme change.
- **Also fixed:**
  - a render race that could leave the Google button empty (it rendered twice at once);
  - the sign-in modal gave up waiting for Google's script after 5s; now 15s (slow mobile networks);
  - a typo in the hard-stop banner: "2 consecutive **lossses**" → "losses".
- **Inventory:** `THEME-INVENTORY.md` lists every page, section, modal and widget with a light/dark status. Analytics, Dashboard, Account center and the Part 2 panels are marked pending.
- **Not individually screenshotted** (covered by the theme layer): the MT5 history modal and open-positions table (they need a linked MT5 account), the account edit modal, and the toast (it fades before a screenshot).

## Notes for Part 2
- Part 2A steps 1–4 (login UI, dropdowns, strategy actions, drawer + screenshot rule) were already built in the previous round. Part 2 will add the theme-specific details: blue hover for dropdowns in light mode, the "+ Create new" label, and a light/dark check of the login page.
- Pre-existing and unchanged: on narrow phones the P&L calendar is cramped. Part 2B redesigns it.
