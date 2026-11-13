# Theme inventory (light / dark)

How items were checked: headless Chrome screenshots of the local app (SQLite, test data), dark theme at 1440px, plus 390px for the main pages and the account menu. Light was checked on the pages and widgets that changed. "Recolor layer" means the colours come from the patch script and are remapped automatically by `theme.js`.

**Final QA (Part 4, 2026-11-13):** every page below plus the drawer, the calendar "+" panel, a dropdown, the account menu, the sign-in modal and /auth.html were screenshotted again in **light and dark at 1440px and 390px** (36 screenshots) and looked at. Statuses below are the final ones.

Status legend:
- **OK**: looked at in that theme, readable, no white boxes.
- **OK (layer)**: covered by the theme layer but not individually screenshotted.
- **Pending Part N**: belongs to a later part of BUILD-PLAN.md.

| Area | Item | Light | Dark | Notes |
|---|---|---|---|---|
| Global | Header (logo, pill nav, Get started, avatar) | OK | OK | Pill nav, Part 1 step 2 |
| Global | Account menu (Profile, Accounts, Settings, Appearance, Log out) | OK | OK | 1440 + 390 |
| Global | Footer | OK | OK | |
| Global | Scrollbars, inputs, native selects, date picker | OK | OK | `color-scheme: dark` + input overrides |
| Global | Toast (`showAccountToast`) | OK (layer) | OK (layer) | Fades out before a screenshot; uses remapped `bg-white/90` |
| Global | Native `confirm()` dialogs | n/a | n/a | Drawn by the browser; follows `color-scheme` |
| Home / landing | Hero, live console card, feature cards | OK | OK | |
| Trading | MT5 integration bar | OK | OK | |
| Trading | Mode switch (Backtest / Demo / Real / Funded) | OK | OK | Dark: active mode is a white pill, as the reference asks |
| Trading | LOG A TRADE form + dropdowns | OK | OK | Dark: raised surface, gray hover per reference |
| Trading | Strategy dropdown actions | OK | OK | |
| Trading | KPI tiles | OK | OK | |
| Trading | P&L calendar (Part 2B redesign, day "+") | OK | OK | 1440 + 390, both themes |
| Trading | Trading Activity heatmap (new, Part 2B) | OK | OK | 1440 + 390, both themes |
| Trading | Account balance widget + carousel | OK | OK | Green card unchanged on purpose; light: Base Capital text fixed (Part 2) |
| Trading | Execution log table | OK | OK | |
| Trading | Discipline banners (hard stop / daily limit) | OK | OK | Explicit dark rules |
| Trading | Discipline streak pills | OK | OK | |
| Trade drawer | Checklist, screenshots, notes, AI panel, live save list, buttons | OK | OK | |
| Trade drawer | Notes & Media (rich notes, chart screens 0/3) | OK | OK | Part 2B |
| Trade drawer | Tags & Psychology (tags, feelings, + Add forms) | OK | OK | Part 2B |
| Trade drawer | Calendar mode: Trade Details + Save that appears when complete | OK | OK | Part 2B |
| Modals | Strategy editor (add / edit checklist) | OK (layer) | OK | |
| Modals | Delete-strategy picker | OK (layer) | OK | |
| Modals | Daily-limit block | OK (layer) | OK | White border remapped |
| Modals | Hard-stop warning | OK (layer) | OK | |
| Modals | Add or link account | OK (layer) | OK | |
| Modals | Account edit (3-dot menu) | OK (layer) | OK (layer) | Same styles as the Add account modal |
| MT5 | Link MT5 modal | OK (layer) | OK | |
| MT5 | Integration guide modal | OK (layer) | OK | |
| MT5 | History modal, open-positions table, R-assign panel | OK (layer) | OK (layer) | Need a linked MT5 account to show; recolor layer + Tailwind remap |
| AI | AI Coach floating button + chat panel | OK | OK | |
| Journal | Mode / account selector, filters | OK | OK | |
| Journal | Cumulative equity chart | OK | OK | Chart.js ticks, grid and tooltip themed. Part 3: Net R / $ Equity toggle, both themes, 1440 + 390 |
| Journal | Discipline & Rules Status panel | OK | OK | |
| Journal | Detailed trade journal table | OK | OK | |
| Accounts | Accounts page (mode cards) | OK | OK | Part 3: now the "Performance by mode" card inside Account center → Accounts |
| Settings | Settings page (capital, risk, limits, MT5 bridge, backup) | OK | OK | Reached via the account menu |
| Auth | Sign-in modal | OK | OK | Google button: outline (light) / filled_black (dark) |
| Auth | /auth.html | OK | OK | Dark: no light gradient |
| Analytics | Sub-tab bar (Performance / Behavior) | OK | OK | 1440 + 390 |
| Analytics | Filter bar, mode + account selectors | OK | OK | 1440 + 390 |
| Analytics | KPI tiles (profit factor, expectancy, max DD, W/L ratio) | OK | OK | 1440 + 390 |
| Analytics | Charts: strategy, timeframe, regime, R progression, session, day of week | OK | OK | Axes, grid, legend and tooltips via the theme Chart.js plugin |
| Analytics | System Discipline & Model Edge Insights banner | OK | OK | Dark: purple gradient (#26145f) |
| Analytics | Strategy Comparison table | OK | OK (layer) | Scrolls sideways at 390 |
| Analytics | Behavior: Psychology Status (cards, trend chart, tag / feeling tables, mistake leaderboard, empty states) | OK | OK | 1440 + 390 |
| Analytics | AI Coach panel | OK | OK | 1440 + 390 |
| Analytics | Full Monthly Performance Heatmap card | hidden | hidden | Hidden by `ui-layout-restore.js` / `journal-heatmap.js` since before this build (the calendar lives on Trading and Dashboard); not changed |
| Dashboard | Greeting, today strip, mode / account / range / filter toolbar | OK | OK | 1440 + 390 |
| Dashboard | Stat cards incl. win-rate gauge | OK | OK | 1440 + 390 |
| Dashboard | Net P&L & Account Equity chart | OK | OK | 1440 + 390 |
| Dashboard | Performance Breakdown, Profit Drivers | OK | OK | 1440 + 390 |
| Dashboard | Calendar, Trading Activity + summary | OK | OK | Same markup and styles as the Trading page |
| Dashboard | Recent Trades table + pager | OK | OK | 1440 + 390 |
| Dashboard | Empty state (account without trades) | OK | OK | |
| Account center | Shell: sub-nav card, title, Save Changes | OK | OK | 1440 + 390 (sub-nav becomes a horizontal tab row) |
| Account center | Profile (avatar, details, contact, about) | OK | OK | 1440 + 390 |
| Account center | Accounts (list, badges, actions, unassigned trades) | OK | OK | 1440 + 390 |
| Account center | Add / edit / rename / delete account dialogs | OK | OK (layer) | Uses the same variables as the section cards |
| Account center | Account Settings (balance, targets, cash movements, preferences) | OK | OK | 1440 + 390 |
| Account center | Security (incl. Google-only "set a password") | OK | OK | 1440 + 390 |
| Account center | Data (export, import summary) | OK | OK | 1440 + 390 |
| Account center | Danger Zone | OK | OK | 1440 + 390 |
