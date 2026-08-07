import { of } from 'rxjs';
import { PublicUploadGateGuard, PublicUploadGateInterceptor } from './public-upload-gate';

const context = (request: any) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as any;

describe('PublicUploadGateGuard', () => {
  it('rejects an invalid token before allocating an upload slot', async () => {
    const tokens = { resolve: jest.fn(async () => { throw new Error('LINK_UNAVAILABLE'); }), digest: jest.fn() };
    const request = { headers: { authorization: 'Bearer invalid' }, ip: '127.0.0.1' };
    const guard = new PublicUploadGateGuard(tokens as any);

    await expect(guard.canActivate(context(request))).rejects.toThrow('LINK_UNAVAILABLE');
    expect(tokens.resolve).toHaveBeenCalledWith('invalid');
    expect(tokens.digest).not.toHaveBeenCalled();
    expect(request).not.toHaveProperty('releasePublicUploadGate');
  });

  it('limits concurrent requests per token and IP and releases after the interceptor completes', async () => {
    const tokens = { resolve: jest.fn(async () => ({ caseId: 'case-1' })), digest: jest.fn(() => 'digest') };
    const guard = new PublicUploadGateGuard(tokens as any, () => 1_000);
    const first: any = { headers: { authorization: 'Bearer token' }, ip: '127.0.0.1' };
    const second: any = { headers: { authorization: 'Bearer token' }, ip: '127.0.0.1' };
    const third: any = { headers: { authorization: 'Bearer token' }, ip: '127.0.0.1' };
    await expect(guard.canActivate(context(first))).resolves.toBe(true);
    await expect(guard.canActivate(context(second))).resolves.toBe(true);
    await expect(guard.canActivate(context(third))).rejects.toMatchObject({ status: 429 });

    new PublicUploadGateInterceptor().intercept(context(first), { handle: () => of('ok') } as any).subscribe();
    await expect(guard.canActivate(context(third))).resolves.toBe(true);
  });
});
