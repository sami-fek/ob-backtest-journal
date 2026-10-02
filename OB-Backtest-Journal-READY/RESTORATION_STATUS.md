# Restoration Status — 2026-09-13

## Current canonical restored state

The restored UI is a protected project state. The canonical Git history contains the Next-Gen UI plus the restored feature layer and MT5/backend work.

Current main restoration commits include:

- `d9c337f` — MT5/backend integration merged while preserving Next-Gen UI
- `ab21815` — AI Coach restored into Next-Gen UI
- `ce22319` — strategy-aware journal save gate
- `0041c9a` — client-side navigation and refresh-state support
- `f9a2d9a` — gateway feature-layer wiring
- `8bc3d38` — deterministic UI feature-loader sequencing
- `c29c68b` — permanent UI restoration lock
- `060701d` — Trading P&L heatmap restored/enhanced without creating a duplicate card
- `ebb8515` — final Trading/Journal layout guard
- `3136ca6` — permanent layout restoration guard loaded by the feature layer

## Final layout contract

### Trading
- P&L Calendar Heatmap
- Account Balance / Account Carousel
- MT5 open positions/state when linked
- No Cumulative Equity card
- No Discipline card

### Journal
- Cumulative Equity Growth
- Discipline & Rules Status
- Detailed Journal
- No duplicate P&L heatmap
- No account widget

### Analytics
- Analytics KPIs/charts remain
- The duplicate full-page P&L heatmap is hidden; Trading is the canonical P&L calendar location.

## Refresh/navigation contract

- Navigation is client-side.
- Switching tabs does not intentionally reload the browser.
- The active tab is stored in the URL hash.
- Refreshing a tab preserves that tab.
- Browser back/forward restores the corresponding tab.
- Existing Next-Gen HTML remains the UI source of truth.

## Anti-regression rule

Do not remove `backend-sync.js` loading, `ui-layout-restore.js`, `journal-heatmap.js`, `account-widget-fix.js`, `ai-coach.js`, or the other restored feature scripts as a cleanup/refactor.

If the gateway or frontend architecture changes, the equivalent permanent feature-loading contract must remain.

Before future UI work, read:
- `UI_RESTORATION_LOCK.md`
- this file
- the relevant historical commits

Never ask the user to restate the complete restoration requirements.
