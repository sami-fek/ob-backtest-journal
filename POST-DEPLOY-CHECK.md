# Post-deploy check: real Supabase

Run this once DEPLOY.md is done. It is the first time several pieces run against your real Supabase project; the local tests used SQLite or an in-process Postgres for them. Each step names what it proves.

- **About 20 minutes.** You need the Pages site, the `CRON_SECRET` value, and MetaTrader 5 with a **demo** account.
- **Safe to run.** Every SQL statement here is a read-only `select`, run in Supabase › SQL Editor. Nothing here deletes data.
- **Use a demo account for steps 2 and 3,** so a test can never touch a funded account.
- **If a step fails, stop there** and send me what you saw. Each step has a "If it fails" line.

Replace `<PAGES>` with your Pages address (for example `https://my-journal.pages.dev`) and `<SECRET>` with `CRON_SECRET`.

## 0. Before you start

```sql
select version from schema_migrations order by 1;
```

- **Expected:** `001_relational`, `003_rule_overrides`, `004_edge_functions`, `005_open_positions`.
- **If it fails:** run the missing file(s) from `OB-Backtest-Journal-READY/migrations/`.

## 1. News fetch

**Proves:**
- `fetch-news` runs on Supabase, reaches the database, and stores events;
- the once-per-25-minutes guard works;
- the app reads news from Supabase.

1. From a terminal:

   ```text
   curl -s -X POST -H "x-cron-secret: <SECRET>" https://ynloihdiiahlegpkzhae.supabase.co/functions/v1/fetch-news
   ```

   **Expected:** `{"ok":true,"skipped":false,"seen":<n>,"kept":<k>,...,"lastSuccessAt":"<now>"}`. `kept` can be 0 in a quiet week.
2. Run the same command again within 25 minutes.
   - **Expected:** `"skipped":true`, and the same `lastSuccessAt`.
   - The feed was not called a second time.
3. In the SQL Editor:

   ```sql
   select status, events_seen, events_kept, error, started_at from news_fetches order by started_at desc limit 3;
   select title, currency, event_time_utc from news_events order by event_time_utc;
   ```

   **Expected:**
   - one `ok` row (only one, the skipped call adds none);
   - this week's USD/GBP/EUR high-impact events, with times in UTC.
4. Open `<PAGES>`, sign in, and go to the Dashboard.
   - **Expected:** "High-impact news" shows this week's events in Addis Ababa time, with no red "news data stale" banner.

**If it fails:**

| What you see | What it means |
|---|---|
| `401` | The header or secret is wrong. |
| `500` with `CRON_SECRET_MISSING` | The secret is not set on the function. |
| `500` with nothing in `function_errors` | The function cannot reach the database: see DEPLOY.md › Troubleshooting (`DB_URL`). |
| `502` | The feed refused the call. `select * from function_errors order by at desc limit 5;` shows why. |
| The red banner shows anyway | Send me what `<PAGES>/api/news` shows in the browser. |

## 2. Link MT5 (the EA key)

**Proves:**
- Link MT5 works through Pages and Render;
- the key is stored only as a hash in Supabase.

1. On `<PAGES>`, open the demo account, then **Link MT5**. Enter the demo login and server, then **Link account**.
   - **Expected:** an EA key starting `myj_`, and the address `https://ynloihdiiahlegpkzhae.supabase.co`.
   - **Not expected:** the orange "Direct logging is not available yet" note.
   - Copy the key now: it is shown once.
2. In the SQL Editor:

   ```sql
   select account_id, key_hint, length(key_hash) as hash_len, mt5_login, created_at, revoked_at from ea_keys order by created_at desc limit 3;
   ```

   **Expected:**
   - one active row for the demo account, `revoked_at` empty;
   - `hash_len` = 64;
   - `key_hint` = the key's last 4 characters.
   - The full key appears nowhere.

**If it fails:**

| What you see | What it means |
|---|---|
| "Direct logging is not available yet: …" | It says why: migration 004 missing, or your journal is not on the tables. |
| Error 409 or 503 | Same. |
| A red "Link failed" | Send me the message. |

## 3. One EA report

**Proves:**
- `mt5-ingest` checks the key;
- it writes equity and open positions;
- it never stores the same trade twice;
- the app reads the live data from Supabase.

1. **Connection test, writes nothing:** an empty report, which stores no equity and no trade. Replace `<KEY>`:

   ```text
   curl -s -X POST -H "x-ea-key: <KEY>" -H "Content-Type: application/json" -d "{}" https://ynloihdiiahlegpkzhae.supabase.co/functions/v1/mt5-ingest
   ```

   **Expected:** `{"ok":true,...,"accepted":0,"duplicates":0,"invalid":0,"equitySaved":false,...}`.
   **Do not send made-up equity this way.** It is checked against the account's rules and could record a false BLOWN.
2. **Wrong key:** run the same command with `x-ea-key: myj_wrong`.
   - **Expected:** `401` with `"code":"EA_KEY_INVALID"`.
3. **The real EA:** install it on the demo account (`OB-Backtest-Journal-READY/mt5/README.md`) and paste the key.
   - **Expected in the Experts tab within 30 seconds:**
     - `MYJournalLogger: started on account …`;
     - `MYJournalLogger: connected to MY Journal (…, server offset UTC+…)`.
4. In the SQL Editor:

   ```sql
   select equity, balance, server_offset_minutes, taken_at from equity_snapshots order by taken_at desc limit 3;
   select ticket, symbol, direction, profit, updated_at from mt5_positions;
   select last_used_at, last_server_offset_minutes from ea_keys where revoked_at is null;
   ```

   **Expected:**
   - new snapshots about 30 seconds apart, matching the terminal's equity;
   - your open demo positions (none is fine);
   - `last_used_at` within the last minute.
5. **On `<PAGES>`, Dashboard, demo account:**
   - "Open positions" says `live · HH:MM` and lists the same positions.
   - With a firm preset, the Daily loss card says "Measured on live equity", with the server offset next to the reset zone.
6. **One closed trade:** open and close a tiny demo position (0.01 lots). Then:

   ```sql
   select id, mt5_ticket, review_status, post_breach, close_time from trades where source = 'mt5' order by created_at desc limit 3;
   ```

   **Expected:**
   - one row for the ticket, `review_status` = `Not reviewed`;
   - in the app, the trade appears in the journal once, and the position leaves "Open positions".
7. **No duplicates:** remove the EA from the chart and attach it again. It re-sends the last 7 days.
   - **Expected:** the Experts tab answer shows `"duplicates":1` (or more) and `"accepted":0`.
   - The step 6 query still shows one row for that ticket.

**If it fails:**

| What you see | What it means |
|---|---|
| Experts: error `4014` | The address is not allowed in MT5 (README, step 1). |
| Experts: `401` | Wrong key. |
| Curl `500` | Run `select * from function_errors order by at desc limit 5;` and send me the result. |
| No snapshots although the EA says "sent" | Send me the Experts lines. |

## 4. Afterwards

- **Keep the demo setup running for a day.**
  - **Check:** the news panel is never red when the cron runs.
  - **Check:** `select count(*) from equity_snapshots where taken_at > now() - interval '1 hour';` is about 120 per running account.
- **To stop the demo:** remove the EA. Unlinking in the app stops its key from working.
- **Then send me the results:** step numbers and anything unexpected. The untested Supabase paths are then covered by real use.
