# OB Trading System — Project State

## Purpose

This repository is evolving from an OB backtest journal into a complete trading operating system for backtesting, demo trading, real/funded trading, journaling, discipline tracking, analytics, MT5 trade tracking, and AI coaching.

## Source of truth

- Repository: `sami-fek/ob-backtest-journal`
- Branch: `main`
- Deployment: Render
- Database/storage: Supabase
- Backend: Node.js + Express
- Frontend: HTML/CSS/JavaScript
- AI: Groq API
- Current live app: `https://ob-backtest-journal.onrender.com/`

The actual repository code is the source of truth for the current implementation. This file is the source of truth for project goals, decisions, constraints, and current direction. Always inspect the repo before changing anything.

## Build mode

The project is being built incrementally and autonomously. Do not pause after every section waiting for a “continue” message. Finish the next safe section, commit meaningful changes, and continue until an actual implementation conflict or necessary product decision is reached. Preserve working functionality and existing data.

## AI handoff rules

1. Do not restart the project.
2. Do not replace working functionality unnecessarily.
3. Inspect the current repository and latest commits before editing.
4. Make incremental, focused changes.
5. Preserve existing journal data and working features.
6. Never request or expose API keys, passwords, MT5 credentials, or other secrets.
7. Keep secrets server-side in environment variables.
8. Commit meaningful changes to GitHub.
9. After changes, give the user exact tests to perform.
10. Do not invent missing requirements. Ask when an important decision genuinely cannot be resolved from the project state.

## Current implementation status

Phase 1 Foundation: implemented. Includes navigation, accounts, strategies, Backtest/Demo/Real/Funded context, central trade normalization, and context-aware trade entry.

Phase 2 Discipline Engine: implemented. Includes configurable 2-loss hard stop, daily trade limit, post-stop detection, clean/violating outcomes, discipline trend/breakdown, dashboard health indicators, and centered glass warning modal.

Phase 3 Analytics: substantially implemented. Includes shared analytics filter context across account, strategy, mode, pair, session, day, timeframe, market regime, direction and date range; performance KPIs; pair/session/day/timeframe/regime/direction breakdowns; R progression; strategy/account comparisons; small-sample warnings; and risk-quality metrics.

Phase 4 Backup foundation: started. Settings now exposes user-owned JSON export/import covering trades, accounts, strategies, context and analytics filters. Supabase remains the primary persistent store where supported.

## User preferences

- Direct, practical answers.
- Critical thinking rather than automatic agreement or excessive risk-avoidance.
- Concise roadmaps and implementation steps.
- Do not assume the user has not considered something merely because it was omitted.
- Preserve existing decisions unless there is a clear reason to revisit them.

## Trading strategies

### Model A

Existing model centered on higher-timeframe bias, liquidity, sweep, BOS, pullback/entry, defined invalidation/SL, and target liquidity with minimum 1:2 RR. Do not overwrite the existing Model A implementation.

### Model OB

Current core sequence:

Bias → liquidity → sweep → aggressive displacement → clear FVG → displacement breaks relevant structure → mark the last opposing candle before displacement → OB + FVG becomes POI → wait for retracement → entry according to the model → SL at/beyond invalidation → TP at next liquidity/structural target.

Non-negotiables:

- Aggressive displacement, not slow grind.
- Clear FVG created by displacement.
- Displacement breaks the most recent relevant high/low (BOS confirmed).
- Valid OB is the last opposing candle immediately before displacement.
- Define invalidation before entry.
- Retracement into OB/FVG POI.
- Entry on retracement with no candle confirmation by design.
- SL at/beyond invalidation.
- TP at next liquidity/structural target.

Current direction: major FX pairs are primary for OB; XAU and BTC are watchlist instruments.

## Current trading-rule defaults

These should eventually be editable in Settings:

- Risk target: approximately 1% per trade.
- Maximum 2 trades per day.
- Minimum 1:2 RR.
- 1:3 or 1:4 for stronger/A+ setups.
- A+ setups preferred.
- Stop after 2 consecutive losses.
- Avoid overtrading and over-risking.
- Target 90%+ rule adherence.
- Mainly London session, sometimes New York.

## Target product structure

HOME
- Dashboard
- Current performance
- Current losing streak
- Discipline %
- Alerts
- Recent trades

TRADING
- Demo
- Real
- Funded
- Open trades
- Closed trades
- Manual trade entry
- Future MT5 tracking

JOURNAL
- All trades
- Trade details
- Screenshots
- Checklist
- Notes
- Violations

BACKTEST
- Manual backtesting
- Model A
- Model OB
- Future models

ANALYTICS
- Performance
- Discipline
- Strategy comparison
- Pair
- Session
- Day of week
- Timeframe
- Regime
- Direction
- Combined filters
- Risk/drawdown quality

ACCOUNTS
- Demo accounts
- Real accounts
- Funded accounts
- Account performance

STRATEGIES
- Model A
- Model OB
- Future strategy configuration

SETTINGS
- Trading rules
- Loss limits
- Sessions
- MT5 connection
- Backup/export
- AI settings

## Account model

Trades must belong to an account/context. Support at minimum Backtest, Demo, Real and Funded. Users should be able to switch accounts and keep statistics separated. Avoid accidentally mixing account types in analytics unless explicitly requested.

## Strategy tagging

Every trade should have a strategy. Initial strategies: Model A and Model OB. Future strategies should be easy to add. Compare strategies using actual data: win rate, net R, expectancy, average win/loss, profit factor, max losing streak, discipline rate, etc.

## Discipline engine

High priority. The current hard-stop rule is 2 consecutive losses.

Desired behavior:

LOSS #1 → streak 1
LOSS #2 → streak 2 → HARD STOP
Any later trade after the hard stop → RULE VIOLATION / POST-STOP TRADE

Track current losing streak, hard-stop status, post-hard-stop trades, R gained/lost after hard stop, daily trade-limit violations, risk-limit violations, checklist/rule violations, clean trade rate, and discipline trend.

Do not equate profitability with discipline. A clean losing trade can be good execution; a rule-breaking winning trade is still a violation.

## Analytics

The shared analytics context is now the intended source for future analytics modules. Combined filtering should support examples such as Model OB + London + GBP + M15. Flag small sample sizes rather than presenting them as strong evidence.

## Backup

Current backup foundation exports and restores the client-side journal state as JSON. Future work should add stronger storage-aware backup handling, CSV export where useful, backup timestamps/reminders, validation/version migration, and explicit Supabase synchronization semantics. Never silently overwrite existing data during restore.

## MT5 architecture

Do not assume the website can directly read an MT5 desktop terminal.

Target architecture:

MT5 Terminal → MT5 Expert Advisor / Bridge → Backend API → Supabase → Website

Initial integration should be read-only tracking, not trade execution.

Potential captured fields: account, symbol, direction, open/close time, entry/exit, SL/TP, lot, P/L, ticket, duration, R result, risk, risk %, session, day, strategy assignment.

## Next build order

1. Finish Phase 3 analytics polish and validation.
2. Finish Phase 4 backup/data ownership: CSV, validation/versioning, backup metadata/reminders, storage-aware behavior.
3. Build MT5 read-only tracking architecture and backend ingestion contract.
4. Connect MT5 trades to accounts and strategy/checklist/context.
5. Advanced AI analytics using the centralized evidence/analytics layer.

Do not redesign the whole UI. Evolve the existing glass UI incrementally.
