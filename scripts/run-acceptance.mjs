import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { runAndCapture } from './run-and-capture.mjs';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const evidence = 'docs/acceptance/evidence';
const generatedAt = new Date().toISOString();
const runId = randomUUID();
const head = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
const gitRef = dirty ? `WORKTREE:${head}` : head;
const metadata = { runId, generatedAt, gitRef };
const gates = [
  ['release-tools', pnpm, ['test:release-tools'], true],
  ['deploy-script-mocks', 'powershell', ['-NoProfile', '-File', 'deploy/deploy-scripts.test.ps1'], true],
  ['typecheck', pnpm, ['typecheck'], true],
  ['test', pnpm, ['test'], true],
  ['integration', pnpm, ['test:integration'], false],
  ['e2e', pnpm, ['test:e2e'], false],
  ['browser-matrix', pnpm, ['test:browser-matrix'], false],
  ['create-case-timing', pnpm, ['--filter', '@auth/e2e', 'test:timing'], false],
  ['build', pnpm, ['build'], true],
  ['dist-base', process.execPath, ['scripts/verify-dist-base.mjs'], true],
  ['prisma-validate', pnpm, ['prisma:validate'], true],
  ['prisma-generate', pnpm, ['prisma:generate'], true],
  ['format', pnpm, ['format:check'], true],
  ['lint', pnpm, ['lint'], true],
  ['pdf-visual', pnpm, ['--filter', '@auth/worker', 'test:visual'], false],
  ['manual-browser', pnpm, ['validate:manual-matrix'], false],
  ['deployment-smoke', 'powershell', ['-NoProfile', '-File', 'deploy/smoke.ps1', '-ValidateOnly', '-ApiUrl', 'https://authorization.example.com/api/health', '-AdminUrl', 'https://authorization.example.com/admin/', '-H5Url', 'https://authorization.example.com/p/'], false],
  ['recovery-drill', 'powershell', ['-NoProfile', '-File', 'deploy/recovery-drill.ps1', '-ValidateOnly', '-DrillDatabaseUrl', 'postgresql://drill:REDACTED@127.0.0.1:5432/authorization_recovery_drill', '-DrillFileRoot', 'C:\\authorization-recovery\\files', '-BackupRoot', 'C:\\authorization-recovery\\backups', '-AllowedRoot', 'C:\\authorization-recovery'], false],
];
const results = [];
for (const [name, command, args, localRequired] of gates) {
  const record = runAndCapture({ name, command, args, evidencePath: `${evidence}/${name}-command.json`, metadata });
  results.push({ ...record, output: undefined, localRequired });
}
const localCodePass = results.filter((item) => item.localRequired).every((item) => item.status === 'PASS');
const releaseBlocked = !localCodePass || results.some((item) => item.status !== 'PASS');
const summary = { ...metadata, localCodeStatus: localCodePass ? 'LOCAL_CODE_PASS' : 'LOCAL_CODE_FAIL', releaseStatus: releaseBlocked ? 'RELEASE_BLOCKED' : 'RELEASE_READY', results };
writeFileSync(`${evidence}/release-summary.json`, JSON.stringify(summary, null, 2), 'utf8');
writeFileSync(`${evidence}/full-gate.txt`, [`runId=${runId}`,`generatedAt=${generatedAt}`,`gitRef=${gitRef}`,`localCodeStatus=${summary.localCodeStatus}`,`releaseStatus=${summary.releaseStatus}`,...results.map(item=>`${item.name}=${item.status} exit=${item.exitCode}`),''].join('\n'),'utf8');
console.log(`${summary.localCodeStatus} ${summary.releaseStatus}`);
process.exitCode = releaseBlocked ? 2 : 0;
