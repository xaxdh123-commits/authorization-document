import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

const payload = {
  code: 200,
  permissions: ['*:*:*'],
  user: { userId: 1, nickName: '若依', password: 'never-copy', deptId: 100, dept: { deptName: '系统部门' }, roles: [{ roleKey: 'admin' }] },
};

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: jest.fn().mockResolvedValue(body) } as any;
}

describe('AuthService', () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.UPSTREAM_GETINFO_URL;
  const originalCacheTtl = process.env.AUTH_CACHE_TTL_SECONDS;
  let repository: { upsertUpstreamUser: jest.Mock };

  beforeEach(() => {
    process.env.UPSTREAM_GETINFO_URL = 'https://auth.example.test/getInfo';
    repository = { upsertUpstreamUser: jest.fn().mockResolvedValue(undefined) };
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTREAM_GETINFO_URL; else process.env.UPSTREAM_GETINFO_URL = originalUrl;
    if (originalCacheTtl === undefined) delete process.env.AUTH_CACHE_TTL_SECONDS; else process.env.AUTH_CACHE_TTL_SECONDS = originalCacheTtl;
    jest.useRealTimers();
  });

  it('normalizes a valid RuoYi getInfo response and never stores sensitive fields', async () => {
    global.fetch = jest.fn().mockResolvedValue(response(payload));
    const service = new AuthService(repository as any);
    const result = await service.authenticate('Bearer raw-token', { write: false });
    expect(result.user).toEqual({ userId: '1', name: '若依', departmentId: '100', departmentName: '系统部门', roles: ['admin'] });
    expect(repository.upsertUpstreamUser).toHaveBeenCalledWith(result.user);
    expect(JSON.stringify(repository.upsertUpstreamUser.mock.calls)).not.toContain('raw-token');
    expect(JSON.stringify(result)).not.toContain('never-copy');
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization).toBe('Bearer raw-token');
  });

  it.each([
    [{ code: 200, user: { roles: [{ roleKey: 'admin' }] } }, 'missing user id'],
    [{ code: 200, user: { userId: 1, roles: [{ roleName: 'admin' }] } }, 'missing valid role keys'],
    [{ code: 500, user: payload.user }, 'invalid business code'],
  ])('rejects malformed upstream identity: %s (%s)', async (body, _reason) => {
    global.fetch = jest.fn().mockResolvedValue(response(body));
    await expect(new AuthService(repository as any).authenticate('token', { write: false })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([401, 403])('maps upstream %i to local 401', async (status) => {
    global.fetch = jest.fn().mockResolvedValue(response({}, status));
    await expect(new AuthService(repository as any).authenticate('token', { write: false })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([500, 502])('maps upstream %i to local 503', async (status) => {
    global.fetch = jest.fn().mockResolvedValue(response({}, status));
    await expect(new AuthService(repository as any).authenticate('token', { write: false })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('uses a strict three-second abort timeout', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url, init: any) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))) as any;
    const promise = new AuthService(repository as any).authenticate('token', { write: false });
    const rejection = expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await jest.advanceTimersByTimeAsync(3000);
    await rejection;
  });

  it('caches reads for 60 seconds by SHA-256 digest, never raw token', async () => {
    global.fetch = jest.fn().mockResolvedValue(response(payload));
    const service = new AuthService(repository as any);
    const first = await service.authenticate('Bearer raw-token', { write: false });
    const second = await service.authenticate('Bearer raw-token', { write: false });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(second.tokenDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(second.tokenDigest).not.toContain('raw-token');
    expect(first.user).toEqual(second.user);
  });

  it('allows a valid cached read but always revalidates and rejects writes during an outage', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response(payload)).mockRejectedValueOnce(new Error('network'));
    const service = new AuthService(repository as any);
    await service.authenticate('token', { write: false });
    await expect(service.authenticate('token', { write: false })).resolves.toMatchObject({ upstreamAvailable: true });
    await expect(service.authenticate('token', { write: true })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['HTTP 401', response({}, 401)],
    ['invalid business code', response({ code: 500, user: payload.user })],
  ])('invalidates a cached token after %s', async (_label, invalidResponse) => {
    global.fetch = jest.fn().mockResolvedValueOnce(response(payload)).mockResolvedValueOnce(invalidResponse).mockRejectedValueOnce(new Error('offline'));
    const service = new AuthService(repository as any);
    await service.authenticate('token', { write: false });
    await expect(service.authenticate('token', { write: true })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.authenticate('token', { write: false })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('caps configured cache lifetime at 60 seconds', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    process.env.AUTH_CACHE_TTL_SECONDS = '3600';
    global.fetch = jest.fn().mockResolvedValue(response(payload));
    const service = new AuthService(repository as any);
    await service.authenticate('token', { write: false });
    jest.setSystemTime(new Date('2026-01-01T00:01:00.001Z'));
    await service.authenticate('token', { write: false });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    delete process.env.AUTH_CACHE_TTL_SECONDS;
  });
});
