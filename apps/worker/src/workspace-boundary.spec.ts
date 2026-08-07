import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('worker workspace package boundaries', () => {
  it('imports shared audit code through the contracts package entrypoint', () => {
    const repositorySource = readFileSync(join(__dirname, 'pdf/pdf-job.repository.ts'), 'utf8');

    expect(repositorySource).toContain("from '@auth/contracts'");
    expect(repositorySource).not.toContain('packages/contracts/src');
  });

  it('declares the contracts package as a runtime dependency', () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    expect(manifest.dependencies?.['@auth/contracts']).toBe('workspace:*');
  });
});
