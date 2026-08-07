import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { notRun } from './safe-playwright-runner.mjs';
import { spawnSync } from 'node:child_process';

const evidence = resolve(import.meta.dirname, '../../docs/acceptance/evidence/browser-matrix.json');
if (!existsSync(evidence)) notRun('Signed manual browser evidence is absent');
const value = JSON.parse(readFileSync(evidence, 'utf8'));
if (!Array.isArray(value) && value?.status === 'NOT_RUN') notRun(value.reason ?? 'Signed manual browser evidence is absent');
const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(executable, ['exec','vitest','run','manual-matrix.validator.spec.ts'], { cwd: import.meta.dirname, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
