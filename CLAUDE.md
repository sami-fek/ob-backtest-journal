# Project rules for Claude Code

## Git
- Never run `git push`. Commit only. Sami pushes himself after reviewing.
- Show the full diff before committing.
- Never commit if any test fails.
- Never run `git checkout .`, `git reset --hard`, `git clean`, or `git restore` on files you
  did not create in this session.

## Before changing anything
- Read the existing code first. Change only what the task asks for.
- `public/index.html` is about 200 KB and was once destroyed by an automated edit. Never rewrite it
  whole. Use targeted replacements only, and show the before and after of each one.
- `public/` already contains several overlapping `*-fix.js` patch files. Do not add another
  one. Fix the cause in the file that owns the behaviour.

## Tests
- Run `npm test` before every commit.
- The unit tests live in `test/*.test.js` (run them on Node 20). The browser checks live in
  `qa/` at the repo root. A passing suite does not mean the app works. When you add a feature,
  add a test for it in the same commit.

## Data and secrets
- Production storage is Supabase Postgres (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
  `better-sqlite3` and `data/journal.db` are local development only.
- Never run a destructive SQL statement against Supabase. Write the migration to a `.sql`
  file, show it, and stop for Sami to run it himself.
- A migration that moves existing data must copy, not move, until Sami confirms the new path
  works. It must be reversible.
- Keep every secret server-side: Supabase keys, EA keys, API keys. Never in `public/` or any
  file served to the browser.

## Risk logic
- This app enforces drawdown and daily-loss limits that Sami trades real money against. A
  false "safe" is the worst possible bug in this codebase.
- When a limit cannot be computed (no live equity, stale news data), show the unknown state
  explicitly. Never default to a pass.

## Working style
- Stop and ask after each part. Do not start the next part on your own.
