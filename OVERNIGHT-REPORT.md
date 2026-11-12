# Overnight Report — 2026-11-12

All tasks (0–6) ran to the end. Every commit is pushed to `origin/main`, and no push was rejected. A backup tag was pushed before any change: `backup-before-overnight-fixes` (= `d3bf2e4`).

> **Render probably auto-deploys from `main`.** If so, these changes are already live. Please check the live site (see "What you must do").

## Setup and how things were tested

- Safety check: the branch was `main` and in sync with `origin/main`. The tree was dirty only because of the uncommitted limit-3 change, which became Task 0 (per your new rule).
- **Node:** this PC has Node v24, and `better-sqlite3` 11.10 cannot load on it. I used a temporary **Node 20.20.2** from `npx -p node@20` (in the npm cache; no project files changed) for `npm install`, the tests and the local server. `npm test` under your Node 24 still passes: the new SQLite-based tests skip themselves there.
- **Local server only:** run with `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` set to empty (also blocks any `.env`), so storage = `sqlite` (verified via `/api/health` every run). All AI keys were empty. No paid or external AI service was called.
- **Behavior tests:**
  - `curl` against the local server.
  - jsdom loading the real served page. Only local scripts load; the CDNs (Tailwind, Chart.js, Google GIS) are stubbed.
  - Three new `node --test` files (see below).
- **Cleanup:** all test users (`*@test.local`) and their data were deleted. The local `data/` folder the tests created (it did not exist before) was removed. `node_modules/` remains (gitignored).
- **Final `npm test` (Node 20): 7/7 pass** (5 MT5 + auth + AI proxy).

**NOT TESTED, applies to every task:** a real browser, so visual layout/CSS was not checked by eye; real Google sign-in; real Groq calls; the Supabase code path.

---

## Task 0 — Daily trade limit fallbacks = 3 · DONE
- **Commit:** `a044545`
- **Changed:** `public/index.html` (`maxDailyTrades` fallbacks `|| 2` → `|| 3`; `window.maxDailyTrades` / `window.hardStopLosses` set after settings load and in `updateSettings()`) and the `public/discipline-engine.js` comment.
- **Tests:**
  - Server: limit 3 by default; trades 1–3 → 201, 4th → 429; Backtest exempt; saved setting 2 → limit 2.
  - Page: `window.maxDailyTrades` follows the saved setting and edits; an empty field falls back to 3. 5/5.

## Task 1 — Login and sign-up · DONE
- **Commit:** `9db5c6c`
- **Root cause:** for accounts created via Google, `password_hash` is null and `bcrypt.compare(pw, null)` throws ("Illegal arguments"). Every email login for such an account became the generic 500 "Login failed".
- **Changed:**
  - `server.js`:
    - Google-only account → 401 `PASSWORD_NOT_SET` ("This account uses Google sign-in…").
    - Malformed login body → 400.
    - Database errors on register/login/Google return readable messages: `AUTH_DB_SCHEMA` when a users table/column such as `google_sub` is missing, `AUTH_DB_ERROR` otherwise.
    - Optional `DATA_DIR` for the SQLite folder (default unchanged), used by the tests.
  - `public/auth-modal.js` and `public/auth.html`:
    - **One** Google button, forced to English (`locale: 'en'` + `gsi/client?hl=en`).
    - A **"New here? Create an account"** mode posting to `/api/auth/register`, requiring at least 8 characters (checked in the browser and on the server).
    - A clear note when `GOOGLE_CLIENT_ID` is not configured.
  - **Extra bug found and fixed** (`app-entry.js`): the gateway never injected the Google client ID on `auth.html`, because its `includes('name="google-client-id"')` check matched auth.html's own script text. Google sign-in therefore never appeared on the standalone sign-in page. It now checks for the real `<meta` tag.
  - `render.yaml`: `GOOGLE_CLIENT_ID` added (`sync: false`).
  - New test: `test/auth.test.js`.
- **Tests:**
  - `test/auth.test.js`: register, `/me`, short password, invalid email, duplicate email (case-insensitive) → 409, logout, login, wrong password, unknown user, malformed body, null-password account → 401 `PASSWORD_NOT_SET`, Google without a client ID → 503. Pass.
  - jsdom modal 12/12: one button, create-account flow, client-side 8-character check, duplicate/wrong-password messages.
  - jsdom with GIS stubbed: one English button on both pages.
- **Limitations:**
  - Real Google sign-in NOT TESTED.
  - Session cookie design unchanged, as instructed. It is still the raw user ID (known issue 2).
  - Pre-existing and not changed: registering while already signed in calls `migrateSessionData(oldCookie, newUser)`, which may copy or move the signed-in user's data to the new account. Please review.

## Task 2 — Rename to "MY Journal" · DONE
- **Commit:** `b0205cc`
- **Changed:** auth modal and `auth.html` (title, heading, logo "OB" → "MY"); server and gateway startup log text; `[OB Journal]` console prefixes; the titles of README, DEPLOY-NOW.txt and UI_RESTORATION_LOCK.md; the package.json `description`. The main app was already called "MY Journal".
- **Not renamed:** "Model OB", the repo and Render service name, URLs, files and folders, storage keys, CSS ids, code identifiers, PROJECT-STATE.md.
- **Tests:** leftover search (only identifiers, URLs and the service name remain); page titles checked in jsdom; `npm test` pass.

## Task 3 — Trade drawer layout · DONE
- **Commit:** `0648978`
- **Changed (`public/index.html`, `public/ui-rules.js`):**
  - "Save Changes" and "Delete Trade" are small, on one row, text only, same colors.
  - Notes: the Edit button and view/edit toggle are removed. Notes is a normal always-editable textarea that grows with its content.
  - The AI Coach button moves left of the drawer while it is open. On screens ≤ 920px, where the drawer is full width, it is hidden while the drawer is open.
  - "Analyze with AI" button unchanged.
- **Tests:** jsdom 15/15 (structure, classes, no icons, textarea editable/auto-grow, body class and CSS rule for the AI Coach button, note saved).
- **Limitations:** the visual result was NOT checked in a real browser.

## Task 4 — Save behavior · DONE
- **Commit:** `e2fa921`
- **Changed:**
  - **Add trade** now opens an **unsaved draft** in the drawer. Nothing is stored until **Save**.
    - An early daily-limit check runs at Add (`GET /api/trades/daily-count`).
    - The authoritative server check runs at Save (`POST /api/trades` → 429 blocks the save).
    - The drawer's Delete button reads **"Discard"** for an unsaved trade.
  - In the drawer, checklist clicks, notes and screenshot add/remove stay in memory until Save. **Closing without Save discards them.**
  - **Final save rule:** Save is disabled, and does nothing, until (a) at least 50% of the strategy's checklist items are checked ✓, rounded up (Model OB 6/12, Model A 4/7; ✗ marks don't count), and (b) the note is not empty or whitespace. A short message says what is missing.
    - The existing gate scripts (`ui-save-gate-fix.js`, `ui-rules.js`) were in fact force-enabling Save with **no rules at all**. There was no old checklist-length or screenshot rule left to keep, so the final rule set is just these two. They now delegate to the new gate.
  - Found and removed: a **second `analyzeTradeWithAI`** in index.html that overrode the AI-panel version. It wrote the AI reply into Notes and **saved the trade immediately**, which was an autosave. Analyze with AI now shows its result in the AI Analysis box and never saves.
  - Post-hard-stop flag: `discipline-engine.js` flags the draft. `normalizeTrade` keeps `disciplineViolation`, which was dropped on every reload before.
  - `UI_RESTORATION_LOCK.md` item 10 updated to the new rule.
- **Tests:** jsdom 24/24:
  - Add stores nothing; account id set; gate messages; 5/12 → disabled; ✗ not counted; 6/12 + note → enabled; whitespace note → disabled.
  - Screenshot held in memory; Save stores everything; the server daily count includes the saved trade.
  - Close discards edits; discarded new trade not stored.
  - AI goes to the panel and does not touch notes.
  - Limit reached → blocked at Add; another trade logged meanwhile → **429 at Save, not stored**.
- **Limitation:** old trades with no note, or fewer than 50% checked, cannot be re-saved until they meet the rule. That follows from the rule you set.

## Task 5 — Strategies and checklists · DONE (2 commits)
- **Commit `47d2a91`, discipline engine fix** (found while checking "discipline still works"):
  - **The 2-loss hard stop never triggered.** `discipline-engine.js` and `analytics-advanced.js` read `window.trades`, but `trades` is a top-level `let`, which is not a window property. The engine always saw 0 trades. Fixed by exposing a read-only `window.trades`.
  - "Log as Violation" opened a second hidden modal instead of logging, because the engine's wrapper sits in the chain twice. Fixed with a pass-through guard.
- **Commit `e7a6503`, strategies:**
  - "+ Add strategy", "Edit checklist" and "Remove strategy" sit next to the Strategy Model dropdown. The editor lets you name the strategy and add, edit, delete and reorder checklist items. Names must be unique (case-insensitive) and cannot contain `< > " ' \``.
  - **Storage:** key `ob-strategies` in the same server key-value store and local fallback as trades and settings. No DB schema change.
  - **Defaults:** seeded once from the **unchanged** `CHECKLISTS` defaults for Model OB and Model A. The `CHECKLISTS` constant is untouched.
  - **Remove:** a strategy with trades, or a built-in, is **archived**: hidden from the dropdown, its trades kept with their strategy name. One without trades is deleted. Adding an archived name again offers to restore it.
  - **Snapshot:** each saved trade stores `checklistItems`. Rendering and the 50% rule use the snapshot, so later edits never change old trades. Editing a checklist first freezes the old list onto saved trades that have no snapshot yet.
  - `normalizeStrategy` keeps known (custom or archived) names instead of merging them into Model OB / Model A. The "Net R by Strategy" chart lists each strategy separately.
  - **Also fixed:** read-only `window.activeMode`. The engine and advanced analytics always fell back to `'Demo'`, so the hard stop and daily count ignored the selected mode, and Analytics always showed Demo trades.
- **Tests:**
  - jsdom 30/30: seeding equals the defaults; validation; reorder/delete; custom-strategy trade with a 2/3 gate; snapshot stored; edits don't touch old trades; legacy trade frozen; archive vs delete. The comparison table, checked on the Analytics tab, shows the custom strategy in its own row.
  - After reload 5/5.
  - Mode tests 4/4: Real ignores Demo losses; Backtest has no hard stop.
  - Hard stop 9/9: 2 losses → modal → violation flag saved and kept after reload.
- **Limitations:**
  - The Settings JSON export (`exportDataJSON`) still exports trades only, not strategies.
  - Two tabs saving at once can still overwrite each other (known issue 5). This applies to strategies too.

## Task 6 — AI diagnosis · DONE
- **Commit:** `e8447c8`
- **Confirmed:** `POST /api/ai` requires a session. While login was broken, the AI coach returned 401 for anyone without a valid session. It now says "Please sign in to use the AI coach."
- **Models:** checked against Groq's public docs (models, vision, deprecations and reasoning pages), fetched 2026-11-12.
  - `openai/gpt-oss-20b` (text): valid, production.
  - **`qwen/qwen3.6-27b`, used for every request with screenshots, was shut down by Groq on 2026-09-14.** Replaced with `qwen/qwen3.8-27b`, which is a **preview** model (Groq may change it) and allows max 3 images. Images are now capped at 3.
  - There is no default-model setting in Settings; the models are hard-coded in `index.html` and `ai-coach.js`.
- **Anthropic:** removed from `PROVIDER_CONFIG`. It used a non-existent endpoint, was never offered in the UI, and couldn't be tested.
- **Errors:**
  - Missing key → 503 "…GROQ_API_KEY is not set. Add it in … Render → Environment".
  - Key rejected by Groq → 502 `AI_KEY_REJECTED`.
  - Other provider errors pass the provider's message through (e.g. "model decommissioned") and are logged on the server with status and model.
  - `/api/health` → `ai.coach: "ready (GROQ_API_KEY set)"` or `"disabled: GROQ_API_KEY is not set"`.
  - Optional `GROQ_API_URL` env override; leave it unset on Render.
- **Tests:**
  - `test/ai.test.js` against a **local mock Groq**: health; 401; GPT-OSS params; qwen params; anthropic → 400; missing key → 503; decommissioned-model message; invalid key → 502. Pass.
  - jsdom 5/5: the panel shows the missing-key message; text trades use gpt-oss-20b; screenshot trades use qwen3.8-27b with 3 images.
- **Likely reasons the AI failed, most likely first:**
  1. You were not signed in (login was broken) → 401 on every AI call.
  2. Any trade or chat with screenshots used `qwen/qwen3.6-27b`, shut down by Groq on 2026-09-14 → error on every image request.
  3. `GROQ_API_KEY` is missing, mistyped or revoked on Render → 503 / 401.
  4. The "Analyze with AI" result went into Notes (the duplicate function), not the AI Analysis box, so it looked like nothing happened, and errors only showed as an `alert`.
  5. Groq free-tier rate or token limits (429), or large screenshot payloads.
- **What to check on Render:**
  - Environment: `GROQ_API_KEY` is set (don't paste it anywhere else).
  - Open `https://ob-backtest-journal.onrender.com/api/health` → `ai.coach` should say "ready".
  - Logs: lines starting `AI upstream groq returned …` show the exact Groq error.

---

## What you must do
1. **Supabase SQL** (only if the `users` table predates `google_sub`; safe to run either way):
   ```sql
   ALTER TABLE public.users ADD COLUMN IF NOT EXISTS google_sub text unique;
   ```
   Also check that `public.users` exists. If not, run the users part of `OB-Backtest-Journal-READY/schema.sql`.
2. **Render → Environment:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY` and `GOOGLE_CLIENT_ID` are set. In Google Cloud, the OAuth client's authorized JavaScript origins must include the Render URL.
3. **Check the live site after deploy:**
   - Email sign-up and sign-in work.
   - Google shows one English button.
   - The drawer layout looks right.
   - Save stays disabled until 50% + a note.
   - Analyze with AI answers in the AI Analysis box.
   - Settings: "Max Daily Executions Limit" = 3 (your saved value wins over defaults).
4. **MT5 EA is empty:** `mt5/OB_Journal_Bridge.mq5` has been 0 bytes since commit `e988fbb` (the auth commit); before that it was 15,125 bytes (`49d1ce7`). I did not touch it. To recover it: `git show 49d1ce7:OB-Backtest-Journal-READY/mt5/OB_Journal_Bridge.mq5 > OB_Journal_Bridge.mq5`
5. **Locally, use Node 20** (e.g. nvm-windows) to run the app or the full tests on this PC.

## Other findings (not fixed)
- The hard stop counts all-time consecutive losses in the selected mode/account. It resets after any non-loss trade and does not reset per day. This is existing engine logic, unchanged.
- `window.riskPercent` / `window.initialCapital` are not exposed either. `account-widget-fix.js` and `mt5-r-assign.js` fall back to 1% / 100,000, which matches your current values.
- The feature scripts also load on `auth.html` and throw errors there ("trades is not defined"). This is pre-existing and harmless to sign-in.
- `bootstrap.js` is unchanged (known issue 4).

## Commits in order, and how to revert
Revert newest first, because later commits build on earlier ones:

| # | Commit | Task | Revert |
|---|---|---|---|
| 0 | `a044545` | Daily limit fallbacks = 3 | `git revert a044545` |
| 1 | `9db5c6c` | Login / sign-up | `git revert 9db5c6c` |
| 2 | `b0205cc` | Rename to MY Journal | `git revert b0205cc` |
| 3 | `0648978` | Drawer layout | `git revert 0648978` |
| 4 | `e2fa921` | Save behavior / 50% gate | `git revert e2fa921` |
| 5a | `47d2a91` | Hard-stop engine fix | `git revert 47d2a91` |
| 5b | `e7a6503` | Strategies + snapshot + activeMode | `git revert e7a6503` |
| 6 | `e8447c8` | AI fixes | `git revert e8447c8` |
| — | (this report) | Report | `git revert <report commit>` |

Everything at once: `git revert --no-edit e8447c8 e7a6503 47d2a91 e2fa921 0648978 b0205cc 9db5c6c a044545`. Alternatively, go back to the tag `backup-before-overnight-fixes`.
