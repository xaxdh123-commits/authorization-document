import { spawnSync } from 'node:child_process';
import process from 'node:process';

const action = process.argv[2];
if (!['reset', 'test'].includes(action)) {
  console.error('Usage: node scripts/test-db.mjs <reset|test>');
  process.exit(2);
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  console.error('TEST_DATABASE_URL is required. Integration database commands were not run.');
  process.exit(2);
}

let databaseName;
try {
  const parsed = new URL(testDatabaseUrl);
  databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
} catch {
  console.error('TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  process.exit(2);
}

if (!/(?:_test|-test)$/i.test(databaseName)) {
  console.error('Refusing to use a database whose name does not end with _test or -test.');
  process.exit(2);
}

const childEnv = { ...process.env, TEST_DATABASE_URL: testDatabaseUrl, DATABASE_URL: testDatabaseUrl };

function run(args) {
  const pnpmCli = process.env.npm_execpath;
  const command = pnpmCli ? process.execPath : (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
  const commandArgs = pnpmCli ? [pnpmCli, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: new URL('..', import.meta.url),
    env: childEnv,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    console.error(`Unable to start ${args[0]}.`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (action === 'reset') {
  run(['exec', 'prisma', 'migrate', 'reset', '--force', '--skip-seed', '--schema', 'prisma/schema.prisma']);
  run(['--filter', '@auth/api', 'run', 'prisma:seed']);
} else {
  run(['--filter', '@auth/api', 'exec', 'jest', '--config', 'test/jest-integration.json', '--runInBand']);
}
