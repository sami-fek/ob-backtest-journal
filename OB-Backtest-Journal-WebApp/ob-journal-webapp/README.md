# OB Backtest Journal — real web app

This keeps the existing journal UI and AI Coach UI as the starting point. The important backend changes are:

- Server-side persistent SQLite storage instead of relying only on browser localStorage.
- A server-side AI proxy so the production AI API key does not have to be exposed in browser JavaScript.
- Existing localStorage remains as a fallback if the app is opened without the backend.
- Existing journal/checklist/notes/screenshots/chat behavior is preserved.

## Run locally

1. Install Node.js 20+.
2. In this folder run `npm install`.
3. Copy `.env.example` to `.env`.
4. Put your Groq key in `GROQ_API_KEY`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

The database is created automatically at `data/journal.db`.

## Deployment

Deploy this as a Node/Express app on a host that supports a persistent disk/volume (for example Render, Railway, Fly.io, or a VPS). Add `GROQ_API_KEY` as a server environment variable. Do not commit `.env` or `data/journal.db` to Git.

For cross-device accounts/login, an authentication layer can be added later without replacing the journal UI.
