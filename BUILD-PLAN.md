Status: Part 1: in progress · Part 2: not started · Part 3: not started · Part 4: not started

> Note (2026-11-13): Part 2A steps 1-4 (login UI, dropdowns, strategy actions, drawer + screenshot save rule) were already built and pushed in the previous round (commits 117f659, ab1e812, eab4135, e35c2f5, 3ae6391; see OVERNIGHT-REPORT-2.md). In Part 2 they only need the theme/hover adjustments listed there (dark-mode gray hover, "+ Create new" label, light/dark checks).

You are working on the MY Journal app. Repo folder: the ob-backtest-journal folder in my Documents (app code in OB-Backtest-Journal-READY/, front end in OB-Backtest-Journal-READY/public/).

HOW THIS BUILD WORKS (read first)
The work is split into 4 PARTS. Do ONE part at a time. When a part is finished, push everything, write the report, print "PART N DONE - check the live site, then tell me: next" and STOP completely. Do NOT start the next part until I write "next". I check the live site between parts and may add fixes: do those first, then wait again.
FIRST ACTION of this session: run `git pull origin main`, then save this whole prompt into the repo as BUILD-PLAN.md (commit and push it) and add a "Status" line at the top (Part 1: in progress). Update that status line when each part finishes. If you are ever a new session with no memory, read BUILD-PLAN.md and ask me which part to continue.

RULES INSIDE A PART
- Within a part do NOT stop to ask me anything and do NOT wait for permission. Make the best decision, note it in the report, keep going.
- Work on the steps ONE AT A TIME. For each step: implement, test, commit, `git push origin main`, THEN start the next. If a step cannot be done, skip it, write why in the report, move on.
- Testing: run `node --check` on every JS file you changed, run the test suite with Node 20 (if the machine has Node 24 use `npx -y node@20 --test test/*.test.js`), start the app locally and load the changed screens. If Playwright or headless Chrome is available, take screenshots of every changed screen in BOTH themes (once the theme exists), at 1440px and 390px wide, and actually look at them before pushing.
- Do not break or weaken login, sessions, storage, the discipline engine or the save rules. Do not touch render.yaml or any secret. Backend (server.js) changes only where a step says so.
- Preserve every existing feature and section. Nothing may be dropped. UI_RESTORATION_LOCK.md still applies except where a step explicitly changes something.
- The live site auto-deploys from main on Render, so every push must leave the app working.
- At the end of each part write OVERNIGHT-REPORT-PART-N.md (per step: what changed, files, how tested, anything skipped or uncertain) and push it.

COLOR REFERENCE (taken from my reference screenshots; use as CSS variables, never hardcode in components)
Dark theme: page #0a0a0a, card/panel #0f0f0f, input/menu/raised #171717, border subtle #181818, border strong #262626, hover-gray #262626 (hover border #2e2e2e), text #fafafa, muted #7c8596, blue #3b82f6, profit green #22c55e (solid button green #16a34a), loss red #ef4444, amber #f59e0b, promo-banner purple #26145f, active-tab pill #1b2538, blue tint pill #294367. Primary buttons in dark mode are WHITE with dark text (like the "Save Trade" button in the reference).
Light theme: page #ffffff, sidebar #fafafa, border subtle #f4f4f5, border strong #e7e7e9, text #101729, muted #6b7280, blue #3b82f6 (hover tint #eff6ff, hover solid #3b82f6 with white text), profit #16a34a, loss #ef4444. Primary buttons in light mode are dark navy (#101729) with white text.

================ PART 1 OF 4: THEME FOUNDATION, PILL NAV BAR, ACCOUNT MENU ================

STEP 1 - Theme system (new public/theme.css and public/theme.js)
Build dark/light theming with CSS variables using the color reference. `html[data-theme="dark"|"light"]`. Persist the choice in localStorage key `my-journal-theme` ("light" | "dark" | "system"; default "system" = follow the OS). Apply it before first paint with a tiny inline script in the <head> of index.html and auth.html (no flash of wrong theme). Expose window.setTheme(mode) and window.getTheme(). Load the theme on auth.html and the auth modal too.
Most of the app uses Tailwind utility classes (bg-white, bg-slate-50, border-slate-200, text-slate-*, etc.) and many patch scripts in public/*.js set inline colors. Do NOT rewrite every component: add a theme layer that remaps the Tailwind utility classes the app actually uses (find them with grep) and the inline hex colors in the patch scripts (grep for #fff, #f8fafc, #e2e8f0, #64748b, rgb(, etc.) to variables or to `html[data-theme=dark]` overrides. Charts (canvas/SVG): axis text, gridlines, tooltips and legends must read correctly in both themes.

STEP 2 - Pill nav bar
Make the main navigation a floating, fully rounded pill (rounded-full container with soft border and shadow, centered), tabs inside as rounded-full buttons, the active tab a tinted pill (dark: #1b2538 with blue text; light: light-blue tint with blue text), subtle hover. Same look on mobile (scroll horizontally if needed, never wrap into 2 rows). REMOVE the "Settings" and "Accounts" buttons from the nav bar (they move into the account menu in Task 3; keep their pages and the switchTab('settings') / switchTab('accounts') routes working).

STEP 3 - Account menu (replaces the email + Sign out pill in public/auth-check.js)
Top-right: a round avatar button (first letter of the user's email on a colored circle). Click opens a rounded menu card: header with the user's name (or email local part) and email; items: Profile, Accounts, Settings, Appearance (a segmented Light / Dark / System control inside the menu that calls setTheme), a divider, Log out (red on hover). Close on outside click and Escape; keyboard accessible; works at 390px. Profile and Accounts are built in Part 3: for now Profile opens the existing Settings page and Accounts opens the existing Accounts page; add TODO-free stubs that Part 3 can replace (a single function openAccountCenter(section)). Nothing about the user's email stays in the header bar itself.

STEP 4 - Dark mode for these pages: Home/landing, Trading (log form, trades table, trade drawer, discipline panel), Journal, Accounts, Settings, MT5 widgets, all modals and toasts (auth modal, strategy editor, daily-limit block, confirm dialogs), auth.html.
Create THEME-INVENTORY.md listing every page, section, modal and widget with a status column; walk through each in both themes (screenshots if possible) and fix contrast problems (text unreadable, white boxes in dark, borders invisible). Analytics pages are NOT in this part (Part 4): list them in the inventory as "pending Part 4".

================ PART 2 OF 4: LOGIN UI, DROPDOWNS, SAVE RULES, TRADE ENTRY PANEL, CALENDAR ================
(Part 1 must be done first: it provides the theme variables.)

--- 2A: login, dropdowns, strategy actions, save rules ---

STEP 1 - Login page UI (public/auth-modal.js and public/auth.html)
Live problems: the title "MY Journal" and the subtitle are not centered with the logo (left-aligned, overlapping); the Google button is narrower than the divider lines and its label is off-center (it is a fixed-width Google iframe); spacing is uneven. Fix: center logo, title and subtitle as one block; make the Google button the full width of the form (render it with the container's real width, re-render when the modal opens/resizes); even spacing; clean hierarchy: logo, title, subtitle, Google button, "or" divider, "Sign in with email & password", "New here? Create an account", small footer. Works at 360px and desktop, in light and dark theme, in the modal and on /auth.html.

STEP 2 - Custom modern dropdown component (new public/ui-dropdowns.js, loaded like the other patch scripts)
Applies to the LOG A TRADE form selects: formPair, formTimeframe, formRegime, formSession, formStrategy. Keep each original <select> in the DOM, hidden, with the same id and value, kept in sync (dispatch a normal 'change' event; if code sets select.value, the button label must update: provide a refresh function and call it where the form resets/loads) so existing code keeps working.
Look: a rounded-xl button with the same height and weight as the "Add trade" button, small chevron, theme colors. Open list: a rounded floating card with rounded option rows, selected option shown with a check mark, scrollable when long, flips upward near the screen bottom, keyboard accessible (arrows, Enter, Escape), closes on outside click.
HOVER: in DARK mode the hover/focus row and button hover are gray (#262626 with #2e2e2e border); in LIGHT mode they are blue (hover tint #eff6ff with blue text, or solid #3b82f6 with white text for the button). This includes the action rows in the strategy dropdown.

STEP 3 - Strategy actions inside the strategy dropdown
Remove the three small links under the Strategy Model select. In the strategy dropdown list show the strategies, a divider, then action rows: "+ Create new", "Edit checklist", "Delete strategy". Create new opens the existing add-strategy editor (name + checklist items). Edit checklist edits the currently selected strategy. Delete strategy opens a small picker dialog listing ALL strategies (radio or button per strategy) so I choose WHICH one to delete, then a confirm step ("Delete <name>? Existing trades keep their saved checklist snapshot."), then deletes. The last remaining strategy cannot be deleted. The form's selected strategy must stay valid after a delete or edit. Same hover rules as Task 2.

STEP 4 - Trade drawer behavior and screenshot rule (public/index.html drawer code, updateDrawerSaveGate, public/ui-save-gate-fix.js)
The existing trade drawer (checklist, notes, screenshots) must stay open until I press X: outside clicks, re-renders and a Save click that fails must never close it. A Save click that does not meet the rules does not save and does not close it (scroll to and highlight the first missing requirement). Only a successful Save or X closes it. X on a new unsaved trade discards it.
Save rule for NEW trades: at least 50% of the strategy checklist checked AND a non-empty note AND at least ONE screenshot attached. Without all three, Save stays disabled and nothing is stored anywhere (no pending/draft trade, not in local storage, not on the server). Show a small live requirement list beside the Save button: "Checklist 50%: 3/6", "Note added", "Screenshot attached", each with a tick or cross. Existing old trades that have no screenshot can still be edited and saved when the edit does not touch the rule fields (so I am not locked out of old data); explain this in the report.
Update the existing tests that assume the old rule and add tests: no screenshot -> cannot save and nothing stored; screenshot + 50% + note -> saves.

--- 2B: trade entry panel, notes/screenshots/tags, calendar and heatmap ---

STEP 1 - Notes, screenshots, tags and feelings in the trade panel
In the trade drawer, restyle and extend the "Notes & Media" area to match my reference screenshots:
- A rounded notes box with a toolbar (Bold, Italic, bullet list, numbered list, link, Undo, Redo) and placeholder "Share your thoughts on this trade...". Store the note as safe HTML or markdown; the "non-empty note" save rule must still work (strip tags when checking). Sanitize anything rendered (no script injection).
- A row "ADD CHART SCREENS" with a round "+" button and a counter pill "0/3". Maximum 3 screenshots per trade, thumbnails with remove buttons, drag-and-drop and paste from clipboard also work. If a trade already has more than 3 old screenshots keep them (do not delete data), just block adding more.
- A "TAGS & PSYCHOLOGY" section (optional): a "TRADE TAGS" field where I type to add tags, shown as removable pills, with my previously used tags and suggestions (Swing, FOMO, Scalp, Breakout, Revenge, Overtrade, Patient, Followed Plan) as clickable chips; and a "HOW IT FELT" row of 5 emoji faces (scared, worried, neutral, confident, excited) where I pick one. I must be able to ADD MY OWN tags and my own feeling options (a "+ Add" on both, stored in settings so they persist and are reused; custom tags can be marked Positive / Neutral / Negative; defaults: FOMO, Revenge, Overtrade are Negative; Patient, Followed Plan are Positive).
- Save the data on the trade as `tags: string[]` and `feeling: string`. Old trades without these fields must still load.
- Keep the Part 2 save rule (50% checklist + note + at least one screenshot). Tags and feeling stay optional.

STEP 2 - Calendar day "+" opens ONE combined trade panel
In the calendar (journal-heatmap.js / calendar code): hovering a day shows a small round "+" button with a tooltip "Add Trade" (like the reference). Clicking it opens ONE side panel for a new trade dated that day, in this order top to bottom: (a) the trade log fields (pair, timeframe, regime, session, direction, result, R-multiple, strategy), (b) the strategy checklist, (c) notes, (d) screenshots, (e) tags and feeling. The SAVE button must NOT appear at all until everything required is complete: all log fields filled, checklist at least 50% checked, a non-empty note, and at least one screenshot. When complete the Save button appears (animate in). Cancel/X discards everything and stores nothing (not even a pending trade). Respect the daily trade limit and hard-stop checks exactly as the existing Add trade flow does. The existing LOG A TRADE form on the Trading page keeps working as it does after Part 2 (do not change its flow).

STEP 3 - Calendar and activity heatmap look (match the reference)
Calendar: each day cell is a rounded-xl card with a thin border. Days with trades show the net P&L and "N TRADES" (use the same dollar-from-R calculation the app already uses for the balance display so numbers agree); profit days get a green border with a soft green tint, loss days a red border with a soft red tint, empty days a plain subtle border, today a blue border. The right-hand "WEEK" column shows week totals in the same style. A floating rounded pill tab bar (Overview, Calendar, Profit Drivers, Activity, Recent Trade) like the reference if the app already has those sections; do not invent sections that do not exist.
Activity heatmap: rounded squares in a month-by-week grid, 5 levels for loss and profit like the reference legend (Loss ... Profit), month labels across the top.
Both must look right in light and dark themes.

================ PART 3 OF 4: ACCOUNT CENTER (PROFILE, ACCOUNTS, ACCOUNT SETTINGS, SECURITY) ================
(Parts 1-2 first. This part has the only backend changes of the whole build.)

Build an "Account center" opened from the avatar menu (replace the openAccountCenter(section) stub from Part 1). Layout like my reference: a left sub-navigation card (icon + title + one-line description + active blue marker) and a content area, with a "Save Changes" button. Sections:

1. PROFILE: big avatar + display name + @username, "Edit Profile" button. Personal details (first name, last name, email read-only), contact (username, phone number), About you (text area). Avatar upload: resize client-side to 256x256 JPEG, store as a small data URL (max ~150 KB). Store profile per user using the same storage layer the app already uses for settings (no database schema change, no SQL). The avatar in the header menu uses the photo when present.
2. ACCOUNTS (manage Real / Demo / Funded): list of my trading accounts with type badge, balance, status. Add / edit / rename / delete an account. Fields: name, type (Real, Demo, Funded, Backtest), broker or prop firm, currency, starting balance, profit target, max drawdown, daily loss limit, active/archived. Deleting an account asks what happens to its trades (keep them unassigned, or delete them) with a confirm step. Reuse and migrate the existing Accounts page data (renderAccounts, activeAccountIdFor, existing saved accounts and trades must keep working with no data loss); the existing Accounts page content is absorbed into this section.
3. ACCOUNT SETTINGS: starting balance and balance type (Starting / Current), profit targets (weekly, monthly), cash movements (Deposit / Withdraw with date, note, amount; they must affect the equity curve and the balance display on their date; update the balance calculation used by the app), plus: timezone, currency symbol, date format, default risk %, default R:R. Keep the existing Settings page as it is (daily limit, hard stop etc. already live there); do not duplicate those fields, link to it instead.
4. SECURITY: change password (see backend below). Show "Signed in with Google" when the account has no password and let it set one.
5. DATA: export all trades as CSV and JSON; import JSON (validate, never overwrite silently, show a summary of how many trades will be added, skip duplicates by id).
6. DANGER ZONE: delete account (see backend below), with a clear warning and a typed "DELETE" confirmation.

BACKEND (server.js), each with tests using test/local-server.js:
- POST /api/auth/change-password { currentPassword, newPassword }: requires a valid session; if the user has a password the current one must match; new password at least 8 characters; bcrypt-hash like register does; for Google-only users (no password_hash) allow setting a first password without currentPassword. Wrong current password -> 401 with a clear message. Never log passwords.
- DELETE /api/auth/account { confirm: "DELETE", password? }: requires session; if the user has a password it must be supplied and correct; deletes the user's stored data (kv rows for this user/session) and the user row, clears the cookie, returns ok. Tests must prove other users' data is untouched.
- Keep the existing error style (clear message + code) and the Supabase/SQLite dual paths working. Do not change schema.sql tables; no new SQL for me to run.

Light and dark theme must both look right. Mobile: the sub-nav becomes a horizontal scroll tab row.

================ PART 4 OF 4: ANALYTICS DARK MODE, PSYCHOLOGY STATUS, DASHBOARD, FINAL QA ================
(Parts 1-3 first.)

STEP 1 - Dark mode for ALL analytics pages
Every analytics page and sub-tab (Performance, Edge Analysis, Behavior, Progress, and any other analytics views or widgets that exist, including the AI insights panel) must work in dark and light mode using the theme variables: cards, stat tiles, charts (axes, grid, legends, tooltips, series colors that stay readable on #0a0a0a), tables, empty states, filters, range pills. Update THEME-INVENTORY.md; nothing may be dropped or hidden. Screenshot every analytics view in both themes if possible and fix contrast problems.

STEP 2 - Psychology Status in Analytics
Add a Psychology Status section (on the Behavior page if it exists, otherwise create the Behavior sub-tab) driven ONLY by data already logged on trades (tags, feeling, checklist results, result, R-multiple). Cards: Followed (% of trades with no Negative-type tag), Deviated (% with at least one Negative tag), Discipline (average checklist completion %), FOMO (% of trades tagged FOMO). Below: a table of every tag used with trade count, win rate, average R and total R; a table by "How it felt" with the same stats; a "Mistake leaderboard" ranking Negative tags by total R lost; a small trend chart of Followed % per week. Date range pills and the active-account filter that other analytics use must apply. Show helpful empty states when no tags exist yet. Numbers must be computed from the real trades list, with tests for the calculations.

STEP 3 - Dedicated Dashboard page (new first nav tab "Dashboard", default after sign-in; the existing marketing/landing Home stays for signed-out visitors)
Layout like my reference screenshots. ONLY use data fields that already exist (no new inputs). Sections: greeting with date; top-right Today's P&L, Trades, Wins; a Live/Demo toggle that maps to the existing modes (Real / Demo / Funded / Backtest) and the active account; date range pill (Last 30 days etc.) and a Filter; stat cards: Net P&L, Win Rate (with the small gauge showing wins/draws/losses), Profit Factor, Account Equity (from the app's existing balance calculation so it matches everywhere), Risk:Reward; chart "Net P&L & Account Equity" (daily P&L bars + equity line); "Performance Breakdown" list (biggest win, biggest loss, average win, average loss, max drawdown, average R); the calendar from Part 2; "Profit Drivers" (per strategy net result, best and worst strategy); Trading Activity heatmap with its summary row (Net P&L, Gross profit, Gross loss, Most traded pair, Best trade, Worst trade); Recent Trades table (paginated, side, pair, date, result, R). NO performance clock (trades have no time of day). Dollar values come from the same R-to-dollar calculation the app already uses; do not invent a second one. Empty states for a brand-new account (zeros, "No trades yet" hints). Light and dark.

STEP 4 - Final QA pass across the whole app
Walk every page, modal and widget in both themes at 1440px and 390px: Dashboard, Trading, Journal, Analytics (all sub-tabs), Accounts/Account center sections, Settings, MT5 widgets, login page and modal, trade drawer, combined calendar panel, dropdowns, account menu. Fix anything unreadable, cut off, overlapping or missing. Confirm that login, sign-up, save rules, daily limit, hard stop, AI coach and storage still work (run the full test suite). Complete THEME-INVENTORY.md with a final status per item and list anything still imperfect in the report.

Now begin PART 1 only. Stop when Part 1 is done.
