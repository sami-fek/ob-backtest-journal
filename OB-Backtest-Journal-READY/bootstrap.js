import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'server.js');
const runtimePath = path.join(__dirname, '.server-runtime.mjs');
const serverSource = fs.readFileSync(serverPath, 'utf8');
const staticMarker = "app.use(express.static(path.join(__dirname, 'public')));";

if (!serverSource.includes(staticMarker)) throw new Error('Could not locate the server static-file marker. Runtime bootstrap was not applied.');

const route = `
// Runtime feature injection: keep the existing source HTML untouched while loading incremental modules.
app.get('/', (req, res, next) => {
  try {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    const featurePaths = [
      path.join(__dirname, 'public', 'trade-model.js'),
      path.join(__dirname, 'public', 'phase1-foundation.js'),
      path.join(__dirname, 'public', 'discipline-engine.js'),
      path.join(__dirname, 'public', 'discipline-trend.js'),
      path.join(__dirname, 'public', 'discipline-breakdown.js'),
      path.join(__dirname, 'public', 'discipline-dashboard.js'),
      path.join(__dirname, 'public', 'analytics-foundation.js'),
      path.join(__dirname, 'public', 'analytics-engine.js'),
      path.join(__dirname, 'public', 'navigation-foundation.js'),
      path.join(__dirname, 'public', 'context-entry-ui.js')
    ];
    const feature = featurePaths.map(p => fs.readFileSync(p, 'utf8')).join('\\n');
    const closingScript = '</script>';
    const at = html.lastIndexOf(closingScript);
    if (at < 0) return res.sendFile(htmlPath);
    html = html.slice(0, at) + '\\n' + feature + '\\n' + html.slice(at);
    res.type('html').send(html);
  } catch (err) {
    console.error('Runtime HTML injection failed:', err);
    next(err);
  }
});

`;

const runtimeSource = serverSource.replace(staticMarker, route + staticMarker);
fs.writeFileSync(runtimePath, runtimeSource, 'utf8');
await import(pathToFileURL(runtimePath).href + `?runtime=${Date.now()}`);
