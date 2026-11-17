# Deploying MY Journal

This sets up the hosting described in DECISIONS.md: the frontend on **Cloudflare Pages**, and the database plus three **Supabase Edge Functions**. Everything here is free-tier. Nothing in it costs money, and no step deletes data.

You need: the GitHub repo `sami-fek/ob-backtest-journal`, the Supabase project below, a Cloudflare account, and a free account at an HTTP cron service (cron-job.org is used below). The app lives in the subfolder `OB-Backtest-Journal-READY/`; every path below is relative to it unless it starts with the repo root.

## 1. What runs where

| Piece | Where | What it does |
|---|---|---|
| Frontend (`public/`) | Cloudflare Pages, static | The pages, scripts and images. Built by `npm run build:static` into `dist/`. |
| `/api/*` | Cloudflare Pages Function `functions/api/[[path]].js` → Render | Sign-in, journal storage, screenshots, AI coach, MT5 link: still the Express server on Render. The function forwards each `/api` request to it, so the browser only ever talks to the Pages site. |
| Database and screenshot files | Supabase (Postgres, Storage) | Unchanged. |
| `mt5-ingest` | Supabase Edge Function | Receives closed trades and equity from the MT5 EA (MYJournalLogger). |
| `fetch-news` | Supabase Edge Function | Fetches the ForexFactory weekly calendar into `news_events`. |
| `risk-check` | Supabase Edge Function | Recomputes every account's drawdown and daily-loss state on the server. |
| Schedule | An external HTTP cron | Calls `fetch-news` 4 times a day plus Sunday 00:30 UTC. This also keeps the Supabase project awake. |

**Render stays.** Sign-in and storage have not moved to Supabase, so the Render service must keep running. DECISIONS.md says to keep it until the switch-over is confirmed; with this setup it is also what `/api` reaches.

## 2. Fixed values

| Name | Value |
|---|---|
| Supabase project ref | `ynloihdiiahlegpkzhae` (from DB-AUDIT.md) |
| Supabase project URL | `https://ynloihdiiahlegpkzhae.supabase.co` |
| Edge Function URLs | `https://ynloihdiiahlegpkzhae.supabase.co/functions/v1/<name>`, name = `fetch-news`, `mt5-ingest` or `risk-check` |
| URL the MT5 EA must be allowed to call | `https://ynloihdiiahlegpkzhae.supabase.co` (MT5 › Tools › Options › Expert Advisors › Allow WebRequest for listed URL). The EA posts to `/functions/v1/mt5-ingest` on it. |
| Render API | `https://ob-backtest-journal.onrender.com` |
| News feed | `https://nfs.faireconomy.media/ff_calendar_thisweek.json` (in the code; nothing to set) |

## 3. Secret and variable names

Values are never written in this repo. Generate `CRON_SECRET` yourself: a random string of at least 32 characters (for example, run `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).

**Supabase › Edge Functions › Secrets** (Dashboard › Edge Functions › Secrets, or `npx supabase secrets set NAME=value`). Supabase stores these encrypted and gives them to the functions as environment variables. The functions do not read Database › Vault; nothing has to go there.

| Name | Needed by | Required |
|---|---|---|
| `CRON_SECRET` | `fetch-news`, `risk-check` (checked against the `x-cron-secret` header) | Yes. Without it both functions refuse every call (HTTP 500 "CRON_SECRET is not set"). |
| `DB_URL` | all three | No. Only if the functions cannot reach the database with the built-in `SUPABASE_DB_URL` (see Troubleshooting); then set it to the **Transaction pooler** connection string from Dashboard › Connect. |
| `FC_API_KEY` | not used yet | No. Reserved for the FinanceCalendar fallback (news-sources.md), which is not built. |

Supabase provides these to every Edge Function itself; do not set them: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.

**Cloudflare Pages › Settings › Variables and secrets** (Production):

| Name | Value | Secret? |
|---|---|---|
| `API_ORIGIN` | `https://ob-backtest-journal.onrender.com` (no trailing slash) | No |
| `GOOGLE_CLIENT_ID` | the same value Render has | No (a public OAuth client id). Only if Google sign-in is used. |
| `NODE_VERSION` | `20` | No |

**Render** keeps the variables it already has (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `GOOGLE_CLIENT_ID`). Nothing new.

**EA keys** are made in the app (Part 6), one per MT5 account, and pasted into the EA's inputs. Only their SHA-256 hash is stored (table `ea_keys`).

## 4. Cloudflare Pages build settings

| Setting | Value |
|---|---|
| Framework preset | None |
| Production branch | `main` |
| Root directory (advanced) | `OB-Backtest-Journal-READY` |
| Build command | `npm run build:static` |
| Build output directory | `dist` |

- The build copies `public/` to `dist/`, adds the two tags the Render gateway used to add to each page (`/backend-sync.js`, and the Google client id when set), and writes `dist/_routes.json` so only `/api/*` runs the Pages Function.
- **The build fails on purpose** if anything in `dist/` looks like a secret: a JWT, a Postgres URL with a password, or the value of a secret variable.
- The Pages Function is found automatically in `OB-Backtest-Journal-READY/functions/`, because that folder is inside the root directory.
- **Workers quota:** each `/api` request counts against the Workers Free quota of 100,000 requests a day. One person using the journal uses a small fraction of that. Static files do not count.

## 5. Supabase Edge Function settings

- **Deploy from a computer with the repo,** using the Supabase CLI through npx. The functions share files in `supabase/functions/_shared/`, which the dashboard's in-browser editor cannot upload.
  - From `OB-Backtest-Journal-READY/`, run `npx supabase login` once (it opens a browser to sign in).
  - Then run `npx supabase link --project-ref ynloihdiiahlegpkzhae`.
  - Then run `npx supabase functions deploy fetch-news mt5-ingest risk-check`.
- **`verify_jwt` is off** for all three (`supabase/config.toml`). The EA and the cron cannot send a Supabase JWT, so each function checks its own header instead (`x-ea-key` or `x-cron-secret`) and refuses everything else.
  - If a deploy ever ignores `config.toml`, add `--no-verify-jwt` to the deploy command.
- **Before deploying:** run `npm run sync:edge`, then `npm test`. The functions run copies of the app's rule and mapping code (`_shared/vendor/`), and a test fails when a copy is out of date.

## 6. The news schedule: an external HTTP cron, not pg_cron

**Why external.**
- Supabase Free pauses a project after 7 days of inactivity.
- pg_cron runs inside the database, so it pauses with it and cannot wake its own project.
- An outside caller does both jobs: it fetches the news, and its request is the activity that keeps the project awake.

**The call.**

| Setting | Value |
|---|---|
| URL | `https://ynloihdiiahlegpkzhae.supabase.co/functions/v1/fetch-news` |
| Method | `POST` (`GET` also works) |
| Auth header name | `x-cron-secret` (value: the `CRON_SECRET` set in Supabase) |
| Schedule, UTC | `0 0,6,12,18 * * *` (00:00, 06:00, 12:00, 18:00 daily), plus `30 0 * * 0` (Sunday 00:30, the new week's file) |
| Timeout | 30 seconds |

**It is safe to call more often than scheduled.** An external cron may retry, or two schedules may overlap.
- The function calls the feed at most once every 25 minutes. Any other call answers with the stored state, and still counts as activity.
- The window is 25 minutes, not an hour, so the Sunday 00:30 run is not skipped after the 00:00 run.
- The feed allows 2 downloads per 5 minutes and updates hourly, so this never comes close.

**Answers:**

| Status | Body | Meaning |
|---|---|---|
| 200 | `"skipped": false`, `"kept": N` | Fetched and stored. |
| 200 | `"skipped": true` | Called again inside 25 minutes. Nothing fetched. |
| 502 | `"ok": false` | The feed failed: HTML instead of JSON (rate limited), an HTTP error or a timeout. The stored events are kept, and the error is written to the `function_errors` table. |
| 401 | | Wrong or missing `x-cron-secret`. |
| 500 | `CRON_SECRET_MISSING` | The secret is not set in Supabase. |

**Optional:** a second cron job, `POST https://ynloihdiiahlegpkzhae.supabase.co/functions/v1/risk-check` with the same header, once a day at 00:05 UTC. It re-checks every account server-side. `mt5-ingest` already does this whenever a trade arrives, so this is a safety net, not a requirement.

## 7. Step by step, in a browser

Do these in order. Each step says how to check it worked.

1. **Supabase › SQL Editor:** run these files from `OB-Backtest-Journal-READY/migrations/`, in this order: `003_rule_overrides.sql`, `004_edge_functions.sql`, `005_open_positions.sql`. Paste each whole file and click Run. (001 is already done.)
   - **Check:** `select version from schema_migrations order by 1;` lists `001_relational`, `003_rule_overrides`, `004_edge_functions` and `005_open_positions`.
   - Every file is safe to run twice. Each stops with a clear message if the one before it is missing.
2. **Supabase › Edge Functions › Secrets:** add `CRON_SECRET` with a value you generated (section 3). Keep the value in a password manager; you need it again in step 6.
3. **On the computer with the repo:** deploy the functions (section 5).
   - **Check:** Dashboard › Edge Functions lists `fetch-news`, `mt5-ingest` and `risk-check`.
4. **Test fetch-news once by hand.** From a terminal, run (replace `SECRET`):
   `curl -s -X POST -H "x-cron-secret: SECRET" https://ynloihdiiahlegpkzhae.supabase.co/functions/v1/fetch-news`
   - **Check:** the answer has `"ok":true` and a `kept` count.
   - **Check:** in Supabase, `select title, currency, event_time_utc from news_events order by event_time_utc;` shows this week's USD/GBP/EUR high-impact events.
   - `kept: 0` is possible in a quiet week. `news_fetches` then has a row with `status = 'ok'`.
5. **Cloudflare dashboard › Workers & Pages › Create › Pages › Connect to Git:** pick `sami-fek/ob-backtest-journal`, enter the build settings from section 4 and the variables from section 3, then click Save and Deploy.
   - **Check:** the build log ends with "Static build written to dist" and a successful deploy.
   - **Check:** open `https://<your-project>.pages.dev/api/health`. It answers with JSON from Render (`"ok":true`). The first call can take up to a minute while the free Render service wakes up.
6. **cron-job.org › Create cronjob:** use the URL and method from section 6. Under Advanced, add the header `x-cron-secret` with the `CRON_SECRET` value, set the schedule to 00:00, 06:00, 12:00 and 18:00 in the UTC timezone, and save. Create a second job with the same URL and header for Sunday 00:30 UTC.
   - **Check:** "Test run" shows HTTP 200 (or 502 if the feed is rate limiting, which is also fine for a test).
7. **Google sign-in, if used.** Google Cloud Console › APIs & Services › Credentials › the OAuth client: add `https://<your-project>.pages.dev` (and any custom domain) under Authorized JavaScript origins.
8. **Sign in on the Pages site.**
   - **Check:** the journal shows the same accounts and trades as on Render.
   - **Check:** Account center opens, and saving a trade works.
9. **Keep Render running.** Do not delete or suspend it: `/api` goes there.

## 8. Troubleshooting

- **Functions answer 500 and `function_errors` is empty, or the logs show a database connection error.**
  - The built-in `SUPABASE_DB_URL` may not be reachable from the function.
  - Add the secret `DB_URL` with the Transaction pooler string from Dashboard › Connect (port 6543), then redeploy.
- **`/api/*` on Pages answers 503 "API_ORIGIN is not set".** Add the variable in Pages › Settings, then redeploy.
- **Signed in on Render but not on Pages.** The sign-in cookie belongs to each site. Sign in once on the Pages address.
- **The news panel says "news data stale - do not trade".**
  - No fetch has succeeded for 12 hours.
  - Check the cron service's history, then `select * from news_fetches order by started_at desc limit 5;`.
- **The Supabase project was paused.**
  - Restore it from the dashboard.
  - Then run step 4 once by hand to confirm the functions work again.

## 9. Undo

- **Pages:** delete the Pages project. Render keeps serving the whole app at its own address, unchanged.
- **Edge Functions:** delete them in the dashboard. The EA then stops logging (Part 6), and nothing else changes.
- **Tables:** the drop statements for 003 and 004 are at the top of each file. They remove only what that file created.
