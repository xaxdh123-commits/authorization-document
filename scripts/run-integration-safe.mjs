import { spawnSync } from 'node:child_process';

const url = process.env.TEST_DATABASE_URL?.trim();
if (!url) {
  console.log('GATE_STATUS=NOT_RUN');
  console.log('Integration database is not configured; no database was touched');
  process.exit(0);
}
let name;
try { name = new URL(url).pathname.replace(/^\//, ''); } catch { console.error('TEST_DATABASE_URL must be a valid URL'); process.exit(2); }
if (!name.endsWith('_test')) { console.error('TEST_DATABASE_URL database name must end with _test'); process.exit(2); }
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
for (const args of [['--filter','@auth/api','test:integration'],['--filter','@auth/worker','test:integration']]) {
  const result = spawnSync(pnpm, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
