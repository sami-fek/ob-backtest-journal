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

`render.yaml` is included as a reference/config file.

## Local use
Node 20+:
`npm install` then `npm start`.
If Supabase variables are absent, the app uses local SQLite as a fallback.
