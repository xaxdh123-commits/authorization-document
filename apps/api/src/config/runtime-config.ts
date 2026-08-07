export type RuntimeConfig = {
  corsAllowedOrigins: string[];
  port: number;
};

export function loadRuntimeConfig(env: Record<string, string | undefined> = process.env): RuntimeConfig {
  if (env.NODE_ENV === 'production' && !env.CORS_ALLOWED_ORIGINS?.trim()) throw new Error('CORS_ALLOWED_ORIGINS is required in production');
  const corsAllowedOrigins = (env.CORS_ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173,http://127.0.0.1:5174')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (corsAllowedOrigins.length === 0 || corsAllowedOrigins.includes('*')) {
    throw new Error('CORS_ALLOWED_ORIGINS must be an explicit comma-separated allowlist');
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  return { corsAllowedOrigins, port };
}

export function buildCorsOptions(config: RuntimeConfig) {
  return { origin: config.corsAllowedOrigins, credentials: true } as const;
}
