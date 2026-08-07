import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FONT_ASSET_SHA256, FONT_FACE_CSS, createPdfRendererFingerprint, resolvePdfAsset } from './font-asset.js';

describe('bundled PDF font', () => {
  it('pins and embeds the repository-owned Noto Sans CJK SC asset', () => {
    expect(FONT_ASSET_SHA256).toBe('2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b');
    expect(FONT_FACE_CSS).toContain('@font-face');
    expect(FONT_FACE_CSS).toContain('data:font/otf;base64,');
    const license = readFileSync(resolvePdfAsset('LICENSE-NOTO.txt'), 'utf8');
    expect(license).toContain('SIL Open Font License');
  });
  it('derives a fingerprint from font, actual Chrome major, page geometry and PDF options', () => {
    expect(createPdfRendererFingerprint('140')).toMatch(/^auth-pdf-v3:[a-f0-9]{64}$/);
    expect(createPdfRendererFingerprint('140')).not.toBe(createPdfRendererFingerprint('141'));
  });
});
