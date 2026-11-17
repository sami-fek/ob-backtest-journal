# Migrations

Run these in the Supabase SQL Editor yourself. The app never runs them.

## 001_relational.sql: the tables

Creates `accounts`, `trades`, `trade_attachments`, `news_events`, `equity_snapshots`, `account_runs` and `journal_migrated_users`, plus the save functions.
- **Row level security:** on for every new table, with no policies, so only the server can read or write them.
- **kv:** not touched.
- **Safe to run twice.**
- **Guard:** if a table with one of these names already exists from something else, it stops with an error.

## 003_rule_overrides.sql: BLOWN overrides (Part 3)

Run after 001. Creates `rule_overrides`: one row each time you type BLOWN to log a manual trade on a blown account, with its time and the trade it let through.
- **Until it has run:** an override is refused with a message saying so, because nothing is let through without its record. Runs ("Start new run") use `account_runs` from 001 and work without it.
- **Safe to run twice.** The undo is at the top of the file.

## Copy your journal: scripts/migrate-kv.mjs

Copies one user's trades and accounts from kv into the tables. kv is not changed, and nothing is deleted.
- **Re-runs:** it never updates or deletes, so you can run it again.
- **Ordering:** the user is switched to the tables last, after every row is in.

From `OB-Backtest-Journal-READY/`:

```
node scripts/migrate-kv.mjs                    # report only: read it first
node scripts/migrate-kv.mjs --target sql       # writes migrations/data/002_<user>.sql
```

### Two ways to run the copy
- **SQL file:** run `migrations/data/002_<user>.sql` in the SQL Editor.
  - It refuses to run if your kv data changed after the export it was built from. In that case, export again and regenerate it.
  - It holds your journal data, so it's ignored by git and must never be committed.
- **Direct:** `--target supabase`, with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set in your shell.
  - It also reads your live kv rows, so nothing logged after the export is missed.

To add a trade the report lists as "NOT MIGRATED", run it again with `--include-trade <id>`.

## How the app switches

- **Switch:** for each user, the server reads the tables only once `journal_migrated_users` has a row for them. Until then it uses kv exactly as before.
- **New users:** a new user with no kv data starts on the tables.
- **Copy kept:** every save on the tables also writes the old kv document as a copy.
- **Fallback:** setting `DATA_STORE=kv` on the server goes back to kv for everyone without losing anything.
- **Status:** `/api/health` shows `dataStore`.

## Undo

- **Before any app save on the tables:** set `DATA_STORE=kv`, and kv is exactly as it was. The drop statements are at the top of `001_relational.sql`.
- **After using the app on the tables:** kv still holds the latest copy, so `DATA_STORE=kv` is enough.
