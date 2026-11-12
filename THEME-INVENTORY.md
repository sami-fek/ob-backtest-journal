# Theme inventory (light / dark)

How items were checked: headless Chrome screenshots of the local app (SQLite, test data), dark theme at 1440px, plus 390px for the main pages and the account menu. Light was checked on the pages and widgets that changed. "Recolor layer" means the colours come from the patch script and are remapped automatically by `theme.js`.

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
| Journal | Cumulative equity chart | OK | OK | Chart.js ticks, grid and tooltip themed |
| Journal | Discipline & Rules Status panel | OK | OK | |
| Journal | Detailed trade journal table | OK | OK | |
| Accounts | Accounts page (mode cards) | OK | OK | Reached via the account menu |
| Settings | Settings page (capital, risk, limits, MT5 bridge, backup) | OK | OK | Reached via the account menu |
| Auth | Sign-in modal | OK | OK | Google button: outline (light) / filled_black (dark) |
| Auth | /auth.html | OK | OK | Dark: no light gradient |
| Analytics | All analytics views (KPIs, charts, filter bar, strategy compare, breakdowns, AI insights) | as before | Pending Part 4 | Not part of Part 1 |
| Dashboard | (new page) | | Pending Part 4 | |
| Account center | (new) | | Pending Part 3 | |
