import { Injectable, LoggerService } from '@nestjs/common';

const sensitiveKey = /^(authorization|cookie|set-cookie|token|accessToken|refreshToken|password|secret|stack|path|fileId|userId|actorUserId)$/i;
const allowedKey = new Set(['level','message','context','timestamp','requestId','action','status','statusCode','durationMs','method','route','ok','name','code','result','count','targetType','targetId','detail','nested']);

function redactText(value: string) {
  return value
    .replace(/\b(authorization|cookie|set-cookie)\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s]+/gi, '[CONNECTION_REDACTED]')
    .replace(/\b[A-Za-z]:\\[^\s]+/g, '[PATH_REDACTED]')
    .replace(/(^|\s)\/(?:[^/\s]+\/)+[^\s]*/g, '$1[PATH_REDACTED]')
    .replace(/\b\d{14}(\d{3}[\dXx])\b/g, '**************$1');
}

export function redactForLog(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) return { name: value.name, message: '[REDACTED]', stack: '[REDACTED]' };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `[BINARY_OMITTED:${value.byteLength}]`;
  if (Array.isArray(value)) return value.map((item) => redactForLog(item, seen));
  if (typeof value === 'string') return redactText(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (sensitiveKey.test(key)) return [[key, '[REDACTED]']];
    if (key === 'data' || key === 'body' || key === 'file' || key === 'buffer') return [[key, '[OMITTED]']];
    if (!allowedKey.has(key)) return [];
    return [[key, redactForLog(item, seen)]];
  }));
}

export function toSafeErrorResponse(error: unknown, requestId: string) {
  const candidate = error as { status?: number; getStatus?: () => number; message?: unknown };
  const statusCode = candidate?.getStatus?.() ?? candidate?.status ?? 500;
  const rawMessage = typeof candidate?.message === 'string' ? candidate.message : 'Request failed';
  const publicMessage = statusCode >= 500 ? 'Internal server error' : /(authorization|cookie|password|token|stack|private[\\/]|(?:file|user|actor)Id)/i.test(rawMessage) ? 'Request failed' : rawMessage;
  return { statusCode, message: publicMessage, requestId };
}

@Injectable()
export class SafeLogger implements LoggerService {
  private write(level: string, message: unknown, context?: unknown) {
    const event = JSON.stringify(redactForLog({ level, message, context, timestamp: new Date().toISOString() }));
    if (level === 'error') process.stderr.write(`${event}\n`); else process.stdout.write(`${event}\n`);
  }
  log(message: unknown, context?: string) { this.write('info', message, context); }
  error(message: unknown, trace?: string, context?: string) { this.write('error', { message, trace }, context); }
  warn(message: unknown, context?: string) { this.write('warn', message, context); }
  debug(message: unknown, context?: string) { this.write('debug', message, context); }
  verbose(message: unknown, context?: string) { this.write('verbose', message, context); }
}
