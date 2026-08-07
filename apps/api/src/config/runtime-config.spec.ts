import { buildCorsOptions, loadRuntimeConfig } from './runtime-config';

describe('runtime config', () => {
  it('rejects wildcard origins when credentials are enabled', () => {
    expect(() => loadRuntimeConfig({ CORS_ALLOWED_ORIGINS: '*', NODE_ENV: 'production' })).toThrow('CORS_ALLOWED_ORIGINS');
  });

  it('fails fast instead of using localhost defaults in production', () => {
    expect(() => loadRuntimeConfig({ NODE_ENV: 'production' })).toThrow('CORS_ALLOWED_ORIGINS');
  });

  it('builds an exact-origin credentialed CORS policy', () => {
    const options = buildCorsOptions(loadRuntimeConfig({ CORS_ALLOWED_ORIGINS: 'https://a.example.com, https://b.example.com' }));
    expect(options.credentials).toBe(true);
    expect(options.origin).toEqual(['https://a.example.com', 'https://b.example.com']);
  });
});
