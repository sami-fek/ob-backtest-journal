# OB Backtest Journal — UI Restoration Lock

**Purpose:** permanent source-of-truth for the UI we built together. This file must be treated as a protected project contract by future coding agents.

## Non-negotiable rule
The Next-Gen Trading Operating System UI and its restored feature layer must **not disappear, be replaced by a simplified UI, or be disconnected again**.

Git history is the source of truth. Do not reconstruct the UI from memory and do not replace `public/index.html` with a new design.

## Canonical UI
- `public/index.html` — Next-Gen UI source of truth.
- Existing UI feature scripts in `public/` must be reused rather than rewritten unless a bug requires a targeted fix.
- The MT5 backend/gateway/EA/tests must be preserved.

## Required restored features
1. AI Coach: floating button, right-side panel, multi-turn chat, image upload, selected-trade context, `/api/ai`.
2. Accounts: Demo / Real / Funded separation, multiple accounts, carousel, arrow-only navigation, active account switching, Add Account, 3-dot rename, account-specific balance/P&L/analytics.
3. MT5: Link MT5, account-specific state, open positions, balance/equity, read-only bridge architecture.
4. Trading P&L heatmap: calendar, previous/next month, This Month, daily P&L, no-trade days, weekly totals, monthly totals, mode/account filtering.
5. Journal: Cumulative Equity Growth + Discipline & Rules Status side-by-side.
6. Trading: P&L Heatmap + Account Widget side-by-side.
7. No duplicate P&L heatmap on Journal or Analytics.
8. Client-side navigation: no full reload when changing tabs; refresh preserves active page; browser back/forward works.
9. Smooth but lightweight page/account transitions.
10. Journal save gate must enforce the correct strategy checklist length, screenshot requirement, and note requirement.

## Persistence / anti-regression rules
- `app-entry.js` injects `backend-sync.js` into HTML responses so the feature layer is always loaded through the deployed gateway.
- `backend-sync.js` is the canonical feature-loader and persistence bridge.
- Do not remove the feature-loader injection merely to make the page simpler.
- If a future refactor changes the gateway, it must preserve equivalent automatic feature loading.
- Before any UI refactor, compare against this file and the relevant historical commits.
- After UI changes, run tests, inspect the final diff, commit, push `main`, and verify the live deployment.

## Important historical restoration commits
- `0d1d986` — preserved the working Next-Gen UI.
- `d9c337f` — merged MT5/backend work while preserving the Next-Gen UI.
- `ab21815` — restored AI Coach wiring.
- `ce22319` — restored strategy-specific save gate.
- `0041c9a` — restored client-side navigation/page transitions.
- `f9a2d9a` — restored gateway feature-layer wiring.
- `8bc3d38` — fixed feature-loader sequencing.

## Agent instruction
When asked to modify the UI, **do not ask the user to restate this specification**. Read this file and the relevant implementation/history, then make targeted changes while preserving the complete system.
