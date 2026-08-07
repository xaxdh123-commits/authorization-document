import { ServiceUnavailableException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { HealthController } from './health.controller';

const makeDeps = () => ({
  queryDatabase: jest.fn().mockResolvedValue(undefined),
  accessPath: jest.fn().mockResolvedValue(undefined),
  statPath: jest.fn().mockResolvedValue({ mtimeMs: Date.now() }),
});
const env = { STORAGE_LOCAL_ROOT: 'storage', WORKER_HEARTBEAT_FILE: 'heartbeat.json', CHROMIUM_EXECUTABLE_PATH: 'chrome.exe', HEALTH_CACHE_TTL_MS: '5000', HEALTH_PROBE_TIMEOUT_MS: '20' };

describe('HealthController', () => {
  it('checks database, worker heartbeat, storage and Chromium', async () => {
    const controller = new HealthController(makeDeps() as any, env);
    await expect(controller.getHealth()).resolves.toEqual(expect.objectContaining({ status: 'ok', checks: { database: 'ok', worker: 'ok', storage: 'ok', chromium: 'ok' } }));
  });

  it('uses one singleflight probe and caches the sanitized result', async () => {
    const deps = makeDeps();
    const controller = new HealthController(deps as any, env);
    const [first, second] = await Promise.all([controller.getHealth(), controller.getHealth()]);
    const third = await controller.getHealth();
    expect(first.checkedAt).toBe(second.checkedAt);
    expect(third.checkedAt).toBe(first.checkedAt);
    expect(deps.queryDatabase).toHaveBeenCalledTimes(1);
    expect(deps.statPath).toHaveBeenCalledTimes(1);
    expect(deps.accessPath).toHaveBeenCalledTimes(2);
  });

  it('times out a stalled probe and returns only sanitized 503 checks', async () => {
    const deps = makeDeps();
    deps.queryDatabase.mockImplementation(() => new Promise(() => undefined));
    const controller = new HealthController(deps as any, { ...env, HEALTH_PROBE_TIMEOUT_MS: '10' });
    let error: ServiceUnavailableException | undefined;
    try { await controller.getHealth(); } catch (caught) { error = caught as ServiceUnavailableException; }
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error?.getStatus()).toBe(503);
    expect(error?.getResponse()).toEqual(expect.objectContaining({ status: 'degraded', checks: expect.objectContaining({ database: 'down' }) }));
    expect(JSON.stringify(error?.getResponse())).not.toContain('secret');
  });

  it('fails closed without leaking dependency errors', async () => {
    const deps = makeDeps(); deps.queryDatabase.mockRejectedValue(new Error('secret database path'));
    const controller = new HealthController(deps as any, env);
    await expect(controller.getHealth()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await controller.getHealth().catch((error: ServiceUnavailableException) => expect(JSON.stringify(error.getResponse())).not.toContain('secret database path'));
  });

  it('does not globally lock out 31 clients sharing one reverse proxy address', async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, HealthController)).toBeUndefined();
    const deps = makeDeps(); const controller = new HealthController(deps as any, env);
    const results = await Promise.all(Array.from({ length: 31 }, () => controller.getHealth()));
    expect(results).toHaveLength(31);
    expect(deps.queryDatabase).toHaveBeenCalledTimes(1);
  });
});
