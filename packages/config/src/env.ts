export type AppEnv = {
  databaseUrl: string;
  authGetInfoUrl: string;
  authTokenHeader: string;
  authTimeoutMs: number;
  authCacheTtlSeconds: number;
  storageRoot: string;
  h5PublicBase: string;
  corsAllowedOrigins: string[];
  chromiumExecutablePath: string;
  fileRoot: string;
  publicH5Url: string;
  linkDeadlinePolicy: 'CASE_DEADLINE';
  logLevel: 'error' | 'warn' | 'info' | 'debug';
};

const required = (input: NodeJS.ProcessEnv, key: string): string => {
  const value = input[key]?.trim(); if (!value) throw new Error(`Missing ${key}`); return value;
};

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv {
  const databaseUrl = required(input, 'DATABASE_URL');
  const authGetInfoUrl = required(input, 'AUTH_GET_INFO_URL');
  const authTokenHeader = required(input, 'AUTH_TOKEN_HEADER');
  const storageRoot = required(input, 'STORAGE_ROOT');
  const h5PublicBase = required(input, 'H5_PUBLIC_BASE');
  const corsAllowedOrigins = required(input, 'CORS_ALLOWED_ORIGINS').split(',').map((value) => value.trim()).filter(Boolean);
  if (corsAllowedOrigins.length === 0 || corsAllowedOrigins.includes('*')) throw new Error('CORS_ALLOWED_ORIGINS must be an explicit allowlist');
  const chromiumExecutablePath = required(input, 'CHROMIUM_EXECUTABLE_PATH');
  const ttl = Number(input.AUTH_CACHE_TTL_SECONDS ?? 60);
  if (!Number.isInteger(ttl) || ttl < 0 || ttl > 60) throw new Error('AUTH_CACHE_TTL_SECONDS must be <= 60');
  const authTimeoutMs = Number(input.AUTH_TIMEOUT_MS ?? 3000);
  if (!Number.isInteger(authTimeoutMs) || authTimeoutMs < 100 || authTimeoutMs > 30_000) throw new Error('AUTH_TIMEOUT_MS must be between 100 and 30000');
  const policy = input.LINK_DEADLINE_POLICY ?? 'CASE_DEADLINE'; if (policy !== 'CASE_DEADLINE') throw new Error('LINK_DEADLINE_POLICY');
  const log = (input.LOG_LEVEL ?? 'info') as AppEnv['logLevel']; if (!['error', 'warn', 'info', 'debug'].includes(log)) throw new Error('LOG_LEVEL');
  return { databaseUrl, authGetInfoUrl, authTokenHeader, authTimeoutMs, authCacheTtlSeconds: ttl, storageRoot, h5PublicBase, corsAllowedOrigins, chromiumExecutablePath, fileRoot: storageRoot, publicH5Url: h5PublicBase, linkDeadlinePolicy: 'CASE_DEADLINE', logLevel: log };
}
