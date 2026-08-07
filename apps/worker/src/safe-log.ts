const sensitive = /^(authorization|cookie|token|password|secret|stack|path|fileId|userId)$/i;
export function redactWorkerLog(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: '[REDACTED]', stack: '[REDACTED]' };
  if (Array.isArray(value)) return value.map(redactWorkerLog);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive.test(key) ? '[REDACTED]' : redactWorkerLog(item)]));
}
export function workerLog(level: 'error' | 'info', event: string, detail?: unknown) {
  const line = JSON.stringify(redactWorkerLog({ level, event, detail, timestamp: new Date().toISOString() }));
  (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
}
