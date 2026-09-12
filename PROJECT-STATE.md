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

The actual repository code is the source of truth for the current implementation. This file is the source of truth for project goals, decisions, constraints, and current direction. Always inspect the current code before changing it.

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

## User preferences

- Direct, practical answers.
- Critical thinking rather than automatic agreement or excessive risk-avoidance.
- Concise roadmaps and implementation steps.
- Do not assume the user has not considered something merely because it was omitted.
- Preserve existing decisions unless there is a clear reason to revisit them.

## Current working application

The project began as a manual OB backtest journal. Existing work includes manual trade logging, trade details, checklist/rule tracking, notes, screenshots, statistics, AI trade analysis, AI overall analysis, Supabase persistence, Render deployment, and Groq integration. Inspect the repo to determine the exact current state before modifying anything.

## AI Coach requirements

The AI analyzes journal evidence, not guesses. A losing trade is not automatically a bad trade, and a winning trade is not automatically a good trade. Distinguish strategy quality, execution, market conditions, discipline, psychology when supported by evidence, and outcome/variance.

Preferred response style:

Main finding

Short direct conclusion.

What matters

• Finding
• Finding
• Finding

Conclusion

Clear judgment.

Next step

Concrete action/test.

Avoid asterisks, `<think>` blocks, exposed reasoning, giant tables, formal report style, and unnecessary filler. Prefer plain text and `•` bullets. Keep most answers under roughly 350 words unless more detail is necessary.

The AI must handle Groq input limits. Do not blindly send the entire raw journal. Prefer local statistical summaries plus relevant trade details/notes. Preserve useful evidence while compressing/truncating intelligently.

## Trading strategies

### Model A

Existing model centered on higher-timeframe bias, liquidity, sweep, BOS, pullback/entry, defined invalidation/SL, and target liquidity with minimum 1:2 RR. Do not overwrite the existing Model A implementation; inspect the current project for its exact checklist.

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

The system must support multiple strategies and future models rather than being hardcoded to OB.

## Current trading-rule defaults

These should eventually be editable in Settings rather than permanently hardcoded:

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

Trades must belong to an account/context. Support at minimum:

- Backtest
- Demo
- Real
- Funded

Users should be able to switch accounts and keep statistics separated. Avoid accidentally mixing account types in analytics unless explicitly requested.

## Strategy tagging

Every trade should have a strategy. Initial strategies:

- Model A
- Model OB

Future strategies should be easy to add. Compare strategies using actual data: win rate, net R, expectancy, average win/loss, profit factor, max losing streak, discipline rate, etc.

## Discipline engine

High priority.

The current hard-stop rule is 2 consecutive losses.

Desired behavior:

LOSS #1 → streak 1
LOSS #2 → streak 2 → HARD STOP
Any later trade after the hard stop → RULE VIOLATION / POST-STOP TRADE

The threshold must be configurable.

Track:

- Current losing streak
- Hard-stop status
- Post-hard-stop trades
- R gained/lost after hard stop
- Daily trade-limit violations
- Risk-limit violations
- Checklist/rule violations
- Clean trade rate

Do not equate profitability with discipline. A clean losing trade can be good execution; a rule-breaking winning trade is still a violation.

## Discipline trend

Add a chart for percentage of clean trades by week/month. This should be separate from equity/net R. A useful dashboard may show current period discipline, previous period discipline, rolling average, and trend.

## Analytics

Eventually support filters and breakdowns by:

- Account
- Strategy
- Symbol/pair
- Session
- Day of week
- Timeframe
- Market regime
- Direction
- Date range

Combined filtering is important, e.g. Model OB + London + GBP + M15. Flag small sample sizes rather than presenting them as strong evidence.

## MT5 architecture

Do not assume the website can directly read an MT5 desktop terminal.

Target architecture:

MT5 Terminal → MT5 Expert Advisor / Bridge → Backend API → Supabase → Website

Initial integration should be read-only tracking, not trade execution.

Potential captured fields:

- Account
- Symbol
- Direction
- Open/close time
- Entry/exit price
- SL/TP
- Lot size
- Profit/loss
- Ticket/trade ID
- Duration
- R result

MT5 cannot inherently know whether a trade was Model A or Model OB. Strategy assignment may initially be manual or use explicit tagging.

## Backup/export

Provide:

- JSON export
- CSV export where useful
- Import backup
- Last backup timestamp
- Backup reminder

Supabase should be primary persistent storage where appropriate, while user-owned exports remain available.

## Data model direction

Conceptual structure:

User
├── Accounts
├── Strategies
├── Trades
├── Screenshots
├── Notes
├── Checklists
├── Rule violations
└── Discipline events

Trade fields will eventually include concepts such as:

id, account_id, strategy_id, source, symbol, direction, entry_time, exit_time, entry_price, exit_price, stop_loss, take_profit, lot_size, risk_amount, risk_percent, r_result, profit_loss, status, session, day_of_week, timeframe, market_regime, created_at, updated_at.

Do not blindly migrate or replace the existing schema. Inspect current data and create safe incremental migrations.

## MT5 source values

Possible trade source values:

- manual
- backtest
- mt5_import
- future integration

## Development phases

### Phase 1 — Foundation

Build the multi-account/multi-strategy foundation while preserving current manual journal/backtest behavior.

Minimum target:
- Home/dashboard foundation
- Accounts
- Strategies
- Backtest/demo/real/funded distinction
- Central trade data model
- Manual trade entry
- Existing journal preserved

Success condition: user can create/select an account and log a trade under Model A or Model OB.

### Phase 2 — Discipline Engine

- Consecutive loss tracker
- Configurable loss threshold
- Hard-stop alerts
- Post-hard-stop detection
- Daily trade-limit detection
- Clean/violation classification
- Discipline percentage
- Discipline trend

### Phase 3 — Analytics

- Performance
- Strategy comparison
- Pair
- Session
- Day
- Timeframe
- Regime
- Direction
- Combined filters
- Discipline trends

### Phase 4 — Backup

- JSON export
- CSV export
- Import
- Backup timestamp/reminder

### Phase 5 — MT5 Tracking

MT5 EA/Bridge → API → Supabase → Website.
Start with tracking only.

### Phase 6 — Advanced AI

AI should eventually analyze the complete structured trading history, discipline, strategies, accounts, sessions, violations, notes, and screenshots when available.

Use local aggregation/compression before sending data to Groq.

## Current next task

PHASE 1 — FOUNDATION.

Before coding:

1. Inspect the current repository.
2. Inspect current trade storage/schema.
3. Inspect current UI/navigation.
4. Inspect current Supabase usage.
5. Identify what already exists for Model A/Model OB.
6. Determine the minimum safe changes needed for Accounts + Strategies + trading mode/context.
7. Preserve existing data and functionality.
8. Then implement incrementally.

Do not immediately rewrite the entire application.

## Git workflow

For each meaningful change:

1. Inspect relevant files.
2. Make a focused change.
3. Test or reason through affected behavior.
4. Commit with a clear message.
5. Tell the user exactly what changed.
6. Give exact tests to run.

One AI should edit the repository at a time. GitHub is the shared source of truth when switching between ChatGPT/Codex, Cursor, Replit, Gemini, Claude, or other tools.

## UI direction

The target is a serious trader's terminal/journal: clean, fast, information-dense, easy to scan, and not a generic AI dashboard.

Useful inspiration categories:

- TradingView: chart/market-oriented information layout.
- Prop-firm dashboards: account/equity/risk presentation.
- Professional trading journals: trade analytics and review workflows.
- Modern SaaS dashboards: navigation, filters, cards, responsive behavior.

Do not copy another product. Reuse good interaction patterns while keeping the site's own identity. Preserve the existing UI unless a change is necessary.

## Handoff command

When another AI takes over, tell it:

"Read PROJECT-STATE.md first. Inspect the current GitHub repository and latest commits. Do not restart or redesign the project. Preserve working functionality and existing data. Continue from CURRENT NEXT TASK. Make incremental changes, commit meaningful changes to GitHub, and tell me exactly what to test."
