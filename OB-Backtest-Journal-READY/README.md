# OB Backtest Journal — ready to deploy

The existing journal UI, Model OB system, AI Coach UI, notes, screenshots and trade behavior are preserved. Only deployment/storage/security plumbing was changed.

## One-time setup

### A. Supabase
1. Create a free Supabase project.
2. Open **SQL Editor**.
3. Paste the contents of `schema.sql` and click **Run**.
4. Copy your **Project URL** and **service_role key** from Supabase project settings. Keep the service_role key secret.

### B. GitHub
Create a **private** repository and upload the contents of this folder. Do not upload `.env` or API keys.

### C. Render
1. Create a Render account and connect GitHub.
2. Create **New -> Web Service** and select the repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add these environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GROQ_API_KEY`
6. Deploy.

The `npm start` command launches `app-entry.js`. That gateway registers the MT5 routes and proxies the existing journal application to its internal server. Do not change it back to `node server.js`, or the MT5 routes will not be registered.

`render.yaml` is included as a reference/config file.

## Local use

Node 20+:
`npm install` then `npm start`.
If Supabase variables are absent, the app uses local SQLite as a fallback.

## MT5 read-only integration

The integration is intentionally read-only:

`MT5 Terminal -> OB_Journal_Bridge.mq5 -> /api/mt5/sync -> Supabase-backed storage -> website`

The backend never receives an MT5 password and the EA contains no trade execution calls. It reads account information and open positions, then sends a JSON snapshot. Repeated snapshots replace the latest state; positions are deduplicated by ticket. Closed trades sent later through the sync payload are stored once per ticket and can be read from `GET /api/mt5/history?accountId=...`.

### API endpoints

- `POST /api/mt5/link` — validates the selected journal account and mode, creates a hashed-token link, and returns the one-time bridge token to the existing UI.
- `POST /api/mt5/sync` — authenticates the bridge token and accepts read-only account/position data.
- `GET /api/mt5/state?accountId=...` — returns the linked account and current state for the existing polling UI.
- `GET /api/mt5/history?accountId=...` — returns deduplicated closed trades received from the EA.
- `POST /api/mt5/unlink` — revokes the token and removes the link state.

### Connecting the EA

1. In the website, select the Demo, Real, or Funded mode and the intended journal account.
2. Choose **Add / Link -> Link MT5 account**.
3. Enter the MT5 login/account number and exact broker server name.
4. Copy the returned bridge token.
5. Open `mt5/OB_Journal_Bridge.mq5` in MetaEditor, compile it, and attach it to any chart in the matching MT5 terminal.
6. Set `InpBridgeToken` to the copied token. The endpoint defaults to `https://ob-backtest-journal.onrender.com/api/mt5/sync`.
7. In MT5, open **Tools -> Options -> Expert Advisors**, enable **Allow WebRequest for listed URL**, and add `https://ob-backtest-journal.onrender.com`.
8. Confirm the EA log reports a successful read-only sync. HTTP 401 means the token is invalid or revoked; WebRequest error 4060 usually means the domain was not allowlisted.

The UI files remain the existing frontend contract and were not redesigned.
