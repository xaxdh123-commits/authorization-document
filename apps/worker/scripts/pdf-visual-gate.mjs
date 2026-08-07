import { readFile } from 'node:fs/promises';

const manifestUrl = new URL('../test/pdf-visual-baseline.manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));

if (manifest.status !== 'READY') {
  console.log('GATE_STATUS=NOT_RUN');
  console.log(`PDF visual baseline unavailable: ${manifest.reason ?? 'approved baseline unavailable'}`);
  process.exit(0);
}
if (manifest.dpi !== 144 || !manifest.chromeMajor || !manifest.fontSha256 || !Array.isArray(manifest.pages) || manifest.pages.length === 0) {
  throw new Error('RELEASE_BLOCKED invalid PDF visual baseline manifest');
}
const resultUrl = new URL('../test/pdf-visual-result.json', import.meta.url);
let result;
try { result = JSON.parse(await readFile(resultUrl, 'utf8')); } catch { throw new Error('RELEASE_BLOCKED PDF visual comparison evidence is missing'); }
if (result.status !== 'PASS' || !Array.isArray(result.pages) || result.pages.length !== manifest.pages.length) {
  throw new Error('RELEASE_BLOCKED PDF visual comparison did not pass every approved page');
}
if (Date.now() - Date.parse(result.generatedAt) > 5 * 60_000) throw new Error('RELEASE_BLOCKED PDF visual comparison evidence is stale');
console.log(`PDF_VISUAL_BASELINE_PASS pages=${manifest.pages.length} dpi=${manifest.dpi}`);
