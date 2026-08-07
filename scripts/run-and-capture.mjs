import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

export function classifyCapture(exitCode, output) {
  const normalized = output.replace(/\x1b\[[0-9;]*m/g, '');
  if (exitCode !== 0) return 'FAIL';
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.includes('GATE_STATUS=NOT_RUN')) return 'NOT_RUN';
  for (const line of lines) {
    if (!line.startsWith('{') || !line.endsWith('}')) continue;
    try { if (JSON.parse(line)?.status === 'NOT_RUN') return 'NOT_RUN'; } catch { /* not a structured status line */ }
  }
  return 'PASS';
}

export function runAndCapture({ name, command, args = [], evidencePath, env = process.env, metadata = {} }) {
  const result = spawnSync(command, args, { encoding: 'utf8', env, shell: process.platform === 'win32' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const record = { ...metadata, name, status: classifyCapture(result.status ?? 1, output), exitCode: result.status ?? 1, startedAt: new Date().toISOString(), command: [command, ...args], output };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(record, null, 2), 'utf8');
  process.stdout.write(`${record.status === 'PASS' ? 'GATE_PASS' : `GATE_${record.status}`} ${name}\n`);
  return record;
}
