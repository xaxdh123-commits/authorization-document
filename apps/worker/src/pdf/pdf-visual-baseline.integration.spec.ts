import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ChromiumPdfRenderer, FONT_ASSET_SHA256, PuppeteerPdfEngine } from '@auth/template-engine';
import { describe, expect, it } from 'vitest';
import { twentyMaterialFixture, verifyPdfVisualBaseline, type VisualManifest } from './pdf-visual-baseline.js';

const manifestPath = path.resolve('test/pdf-visual-baseline.manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as VisualManifest;

function chromiumMajor(executable: string) {
  const version = execFileSync(executable, ['--version'], { encoding: 'utf8' });
  const match = version.match(/(\d+)\./);
  if (!match) throw new Error('PDF_VISUAL_CHROME_VERSION_UNKNOWN');
  return match[1];
}

async function rasterize(pdf: Buffer, dpi: 144) {
  const root = path.resolve('tmp/pdfs');
  await mkdir(root, { recursive: true });
  const temp = await mkdtemp(path.join(root, 'visual-baseline-'));
  try {
    const pdfPath = path.join(temp, 'actual.pdf');
    const prefix = path.join(temp, 'page');
    await writeFile(pdfPath, pdf);
    const wrapper = execFileSync('where.exe', ['pdftoppm'], { encoding: 'utf8' }).split(/\r?\n/)[0];
    const executable = path.join(path.resolve(path.dirname(wrapper), '../../native/poppler/Library/bin'), 'pdftoppm.exe');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, ['-r', String(dpi), '-png', pdfPath, prefix], { shell: false, stdio: 'ignore' });
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`PDF_VISUAL_RASTERIZER_EXIT_${code}`)));
      child.once('error', reject);
    });
    const pages = (await readdir(temp)).filter((name) => /^page-\d+\.png$/.test(name)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
    return await Promise.all(pages.map((name) => readFile(path.join(temp, name))));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

describe.skipIf(manifest.status !== 'READY')('approved PDF visual baseline', () => {
  it('renders the 20-material fixture and compares every real raster page', async () => {
    const executable = process.env.CHROMIUM_EXECUTABLE_PATH;
    if (!executable) throw new Error('RELEASE_BLOCKED CHROMIUM_EXECUTABLE_PATH is required for an approved visual baseline');
    const rows = twentyMaterialFixture.materials.map((material) => [
      { children: [{ type: 'text' as const, text: material.name }] },
      { children: [{ type: 'text' as const, text: String(material.quantity) }] },
      { children: [{ type: 'text' as const, text: material.specification }] },
    ]);
    const page = (slice: typeof rows) => ({ type: 'table' as const, rows: slice });
    const ast = { type: 'page' as const, children: [
      { type: 'heading' as const, level: 1 as const, children: [{ type: 'text' as const, text: '委托生产物料授权书' }] },
      page(rows.slice(0, 7)), { type: 'pageBreak' as const }, page(rows.slice(7, 14)),
      { type: 'pageBreak' as const }, page(rows.slice(14)),
      { type: 'paragraph' as const, children: [{ type: 'text' as const, text: twentyMaterialFixture.longText }] },
      { type: 'signatureSlot' as const, slotId: 'party-a', signer: 'PARTY_A' as const, required: true, ...twentyMaterialFixture.signatureBounds },
    ] };
    const renderer = new ChromiumPdfRenderer(new PuppeteerPdfEngine({ executablePath: executable, timeoutMs: 30_000 }));
    const pdf = await renderer.render({ templateVersionId: 'visual-baseline-v1', ast, snapshot: {}, draftVersion: 1, contentDigest: createHash('sha256').update(JSON.stringify(ast)).digest('hex') });
    const environment = { chromeMajor: chromiumMajor(executable), fontSha256: FONT_ASSET_SHA256, platform: process.platform };
    const result = await verifyPdfVisualBaseline(pdf, manifest, environment, rasterize, (name) => readFile(path.resolve('test/pdf-visual-baselines', name)));
    expect(result.pages).toHaveLength(manifest.pages!.length);
    await writeFile(path.resolve('test/pdf-visual-result.json'), JSON.stringify({ status: 'PASS', generatedAt: new Date().toISOString(), environment, pages: result.pages }, null, 2));
  }, 60_000);
});
