import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateManualMatrix } from './manual-matrix.validator';

describe('人工浏览器矩阵证据校验', () => {
  it('拒绝空白或伪造的 PASS 证据', () => {
    expect(() => validateManualMatrix([])).toThrow();
    expect(() => validateManualMatrix([{ platform: 'iOS Safari 最新主版本', result: 'PASS' }])).toThrow();
  });

  it('读取并校验实际签署的 browser-matrix.json', () => {
    const path = resolve(import.meta.dirname, '../../docs/acceptance/evidence/browser-matrix.json');
    expect(existsSync(path), `${path} is NOT_RUN until real signed evidence exists`).toBe(true);
    const evidence=JSON.parse(readFileSync(path, 'utf8'));
    if(!Array.isArray(evidence)&&evidence?.status==='NOT_RUN')throw new Error(`MANUAL_BROWSER_MATRIX_NOT_RUN: ${evidence.reason??'signed evidence missing'}`);
    validateManualMatrix(evidence);
  });
});
