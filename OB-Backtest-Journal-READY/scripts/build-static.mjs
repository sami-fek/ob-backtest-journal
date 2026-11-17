// Static build of the frontend for Cloudflare Pages (Part 4): public/ → dist/.
//
// On Render, the gateway (app-entry.js) adds two things to every HTML page as it serves
// it. A static host cannot, so this build adds them to the files once:
//   * <script src="/backend-sync.js"> before </body> (server sync, sign-in check, MT5 UI)
//   * <meta name="google-client-id"> when GOOGLE_CLIENT_ID is set for the build
//     (a public OAuth client id, not a secret)
// It also writes dist/_routes.json so only /api/* runs the Pages Function
// (functions/api/[[path]].js, the proxy to the API); every other file is served statically.
//
// The build fails if anything that looks like a secret ends up in dist/.
//   node scripts/build-static.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET_ENV = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL', 'DB_URL', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'CRON_SECRET', 'FC_API_KEY'];
// A Supabase key is a JWT; service-role keys and DB URLs must never reach the browser.
const SECRET_PATTERNS = [
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a JWT (Supabase key)'],
  [/postgres(?:ql)?:\/\/[^\s'"]+:[^\s'"@]+@/, 'a Postgres URL with a password'],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, 'a Supabase secret key'],
];

export function injectHtml(html, googleClientId) {
  let out = html;
  if (!out.includes('src="/backend-sync.js"')) {
    out = out.replace(/<\/body>\s*<\/html>\s*$/i, '  <script src="/backend-sync.js"></script>\n</body>\n</html>\n');
  }
  if (googleClientId && !/<meta\s+name="google-client-id"/i.test(out)) {
    out = out.replace('<meta charset="UTF-8"', `<meta name="google-client-id" content="${String(googleClientId).replace(/["<>&]/g, '')}">\n  <meta charset="UTF-8"`);
  }
  return out;
}

/** Problems found in a built file's text: [description]. */
export function findSecrets(text, env = process.env) {
  const found = [];
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) found.push(what);
  for (const name of SECRET_ENV) { const v = env[name]; if (v && v.length >= 8 && text.includes(v)) found.push(`the value of ${name}`); }
  return found;
}

export function build(outDir = path.join(ROOT, 'dist'), env = process.env) {
  const src = path.join(ROOT, 'public');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(src, outDir, { recursive: true });
  const problems = [];
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const file of walk(outDir)) {
    if (/\.html?$/i.test(file)) fs.writeFileSync(file, injectHtml(fs.readFileSync(file, 'utf8'), env.GOOGLE_CLIENT_ID));
    if (/\.(html?|js|css|json|txt|md|svg)$/i.test(file)) {
      for (const p of findSecrets(fs.readFileSync(file, 'utf8'), env)) problems.push(`${path.relative(outDir, file)}: ${p}`);
    }
  }
  fs.writeFileSync(path.join(outDir, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }, null, 2) + '\n');
  if (problems.length) {
    fs.rmSync(outDir, { recursive: true, force: true });
    throw new Error('Refusing to publish: possible secrets in the static build:\n  ' + problems.join('\n  '));
  }
  return outDir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = build(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(`Static build written to ${path.relative(process.cwd(), out) || out}`);
}
