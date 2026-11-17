// Copies the app's shared rule and mapping code into the Edge Functions folder, so the
// functions run exactly the code the app and server.js run:
//
//   public/time-prefs.js    → supabase/functions/_shared/vendor/time-prefs.js
//   public/rule-presets.js  → supabase/functions/_shared/vendor/rule-presets.js
//   relational-core.js      → supabase/functions/_shared/vendor/relational-core.js
//   mt5-core.js             → supabase/functions/_shared/vendor/mt5-core.js
//
// Supabase deploys only supabase/functions, so the files are copied, not imported from
// outside it. test/edge-vendor.test.js fails when a copy is out of date.
//
//   node scripts/sync-edge-shared.mjs          write the copies
//   node scripts/sync-edge-shared.mjs --check  exit 1 when a copy differs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VENDOR_DIR = path.join(ROOT, 'supabase', 'functions', '_shared', 'vendor');
const SOURCES = [
  ['public/time-prefs.js', 'time-prefs.js'],
  ['public/rule-presets.js', 'rule-presets.js'],
  ['relational-core.js', 'relational-core.js', s => s.replace("import './public/rule-presets.js';", "import './rule-presets.js';")],
  ['mt5-core.js', 'mt5-core.js'],
];

/** [{ file, content }] the vendor folder must hold. */
export function expectedVendor() {
  return SOURCES.map(([src, dest, rewrite]) => {
    const body = fs.readFileSync(path.join(ROOT, src), 'utf8').replace(/\r\n/g, '\n');
    return { file: dest, content: `// GENERATED from ${src} by scripts/sync-edge-shared.mjs. Do not edit here.\n${rewrite ? rewrite(body) : body}` };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  for (const { file, content } of expectedVendor()) {
    const target = path.join(VENDOR_DIR, file);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current === content) continue;
    stale++;
    if (check) console.log(`out of date: ${file}`);
    else { fs.writeFileSync(target, content); console.log(`wrote ${path.relative(ROOT, target)}`); }
  }
  if (check && stale) process.exit(1);
  if (!stale) console.log('Edge vendor files are up to date.');
}
