import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const EXPECTED_FONT_ASSET_SHA256 = '2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b';
export function resolvePdfAsset(name:string):string {const candidates=[path.resolve(process.cwd(),'packages/template-engine/assets',name),path.resolve(process.cwd(),'../../packages/template-engine/assets',name),path.resolve(process.cwd(),'assets',name)];const found=candidates.find(existsSync);if(!found)throw new Error(`PDF_ASSET_NOT_FOUND:${name}`);return found;}
const fontBytes = readFileSync(resolvePdfAsset('NotoSansCJKsc-Regular.otf'));
export const FONT_ASSET_SHA256 = createHash('sha256').update(fontBytes).digest('hex');
if (FONT_ASSET_SHA256 !== EXPECTED_FONT_ASSET_SHA256) throw new Error(`PDF_FONT_SHA256_MISMATCH:${EXPECTED_FONT_ASSET_SHA256}:${FONT_ASSET_SHA256}`);

export const FONT_FACE_CSS = `@font-face{font-family:"Authorization Noto Sans SC";font-style:normal;font-weight:400;font-display:block;src:url(data:font/otf;base64,${fontBytes.toString('base64')}) format("opentype")}`;
export const PDF_LAYOUT = { page: 'A4', width: '210mm', height: '297mm', margin: '18mm', contentHeight: '261mm' } as const;
export const PDF_ENGINE_OPTIONS = { format: 'A4', printBackground: true, preferCSSPageSize: true } as const;
export const PDF_RENDERER_FINGERPRINT_PLACEHOLDER = '__PDF_RENDERER_FINGERPRINT__';

export function createPdfRendererFingerprint(chromiumMajor: string): string {
  const canonical = JSON.stringify({ fontSha256: FONT_ASSET_SHA256, chromiumMajor, layout: PDF_LAYOUT, options: PDF_ENGINE_OPTIONS });
  return `auth-pdf-v3:${createHash('sha256').update(canonical).digest('hex')}`;
}
