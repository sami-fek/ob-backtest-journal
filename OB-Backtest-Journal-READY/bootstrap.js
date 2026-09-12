import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'server.js');
const featurePath = path.join(__dirname, 'public', 'phase1-foundation.js');
const runtimePath = path.join(__dirname, '.server-runtime.mjs');
const serverSource = fs.readFileSync(serverPath, 'utf8');
const featureSource = fs.readFileSync(featurePath, 'utf8');
const staticMarker = "app.use(express.static(path.join(__dirname, 'public')));";

if (!serverSource.includes(staticMarker)) {
  throw new Error('Could not locate the server static-file marker. Phase 1 bootstrap was not applied.');
}

const route = `
// Phase 1 runtime injection: keep the existing source HTML untouched while loading the
// incremental foundation module inside the existing inline script scope.
app.get('/', (req, res, next) => {
  try {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    const feature = fs.readFileSync(path.join(__dirname, 'public', 'phase1-foundation.js'), 'utf8');
    const closingScript = '</script>';
    const at = html.lastIndexOf(closingScript);
    if (at < 0) return res.sendFile(htmlPath);
    html = html.slice(0, at) + '\\n' + feature + '\\n' + html.slice(at);
    res.type('html').send(html);
  } catch (err) {
    console.error('Phase 1 HTML injection failed:', err);
    next(err);
  }
});

`;

const runtimeSource = serverSource.replace(staticMarker, route + staticMarker);
fs.writeFileSync(runtimePath, runtimeSource, 'utf8');
await import(pathToFileURL(runtimePath).href + `?phase1=${Date.now()}`);
