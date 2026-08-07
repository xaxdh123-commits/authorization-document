import { spawnSync } from 'node:child_process';

export function notRun(reason) {
  console.log('GATE_STATUS=NOT_RUN');
  console.log(reason);
  process.exit(0);
}

export function hasSafeE2EBase() {
  try { return Boolean(process.env.E2E_H5_URL?.trim() && process.env.E2E_API_URL?.trim() && new URL(process.env.TEST_DATABASE_URL ?? '').pathname.replace(/^\//, '').endsWith('_test')); } catch { return false; }
}

export function runPlaywright(args) {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(executable, ['exec', 'playwright', 'test', ...args], { cwd: import.meta.dirname, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' });
  process.exit(result.status ?? 1);
}
