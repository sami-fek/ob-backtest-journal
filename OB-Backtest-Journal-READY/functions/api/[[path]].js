// Cloudflare Pages Function: every /api/* request → the Express API (sign-in, journal storage,
// screenshots, AI, MT5 link) at API_ORIGIN, e.g. https://ob-backtest-journal.onrender.com.
// The browser only ever talks to the Pages site, so the session cookie stays first-party.
// API_ORIGIN is a plain environment variable of the Pages project, not a secret.
// dist/_routes.json limits this function to /api/*; the rest of the site is static.
export async function onRequest({ request, env }) {
  const origin = String(env.API_ORIGIN || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+$/.test(origin)) {
    return new Response(JSON.stringify({ error: 'API_ORIGIN is not set for this Pages project (see DEPLOY.md).' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
  const init = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;
  const res = await fetch(origin + url.pathname + url.search, init);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}
