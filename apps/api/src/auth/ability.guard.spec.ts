import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ABILITIES } from '@auth/contracts';
import { AbilityGuard } from './ability.guard';
import { AbilityService } from './ability.service';

describe('AbilityService', () => {
  const mappings: Record<string, any> = {
    admin: { roleKey: 'admin', capabilities: ['*:*:*'], dataScope: 'ALL', enabled: true },
    customer_service: { roleKey: 'customer_service', capabilities: ['CASE_READ', 'CASE_CREATE'], dataScope: 'SELF', enabled: true },
    reviewer: { roleKey: 'reviewer', capabilities: ['CASE_READ', 'FILE_READ', 'REVIEW_ITEM', 'REVIEW_CONFIRM'], dataScope: 'DEPT', enabled: true },
  };
  const repository = { find: jest.fn((key: string) => Promise.resolve(mappings[key] ?? null)) };
  const service = new AbilityService(repository as any);

  it('grants admin every local ability and ALL scope', async () => {
    await expect(service.resolve(['admin'])).resolves.toEqual({ abilities: [...ABILITIES], dataScope: 'ALL', matchedRoles: ['admin'] });
  });
  it('grants customer service SELF and reviewer DEPT abilities', async () => {
    await expect(service.resolve(['customer_service'])).resolves.toMatchObject({ abilities: ['CASE_READ', 'CASE_CREATE'], dataScope: 'SELF' });
    await expect(service.resolve(['reviewer'])).resolves.toMatchObject({ dataScope: 'DEPT' });
  });
  it('uses the union and most permissive scope for multiple roles', async () => {
    await expect(service.resolve(['customer_service', 'reviewer'])).resolves.toEqual({
      abilities: ['CASE_READ', 'CASE_CREATE', 'FILE_READ', 'REVIEW_ITEM', 'REVIEW_CONFIRM'], dataScope: 'DEPT', matchedRoles: ['customer_service', 'reviewer'],
    });
  });
  it('denies unknown and disabled roles', async () => {
    await expect(service.resolve(['unknown'])).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AbilityGuard', () => {
  function context(request: any): ExecutionContext {
    return { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => function route() {}, getClass: () => class Controller {} } as any;
  }
  it('attaches identity, abilities and data scope to the request', async () => {
    const auth = { authenticate: jest.fn().mockResolvedValue({ user: { userId: '1', name: '用户', departmentId: 'd', roles: ['reviewer'] }, tokenDigest: 'digest', upstreamAvailable: true }) };
    const abilities = { resolve: jest.fn().mockResolvedValue({ abilities: ['CASE_READ'], dataScope: 'DEPT', matchedRoles: ['reviewer'] }) };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue('CASE_READ') } as unknown as Reflector;
    const request: any = { method: 'GET', headers: { authorization: 'Bearer token' } };
    await expect(new AbilityGuard(auth as any, abilities as any, reflector).canActivate(context(request))).resolves.toBe(true);
    expect(request.auth).toMatchObject({ user: { userId: '1' }, abilities: ['CASE_READ'], dataScope: 'DEPT' });
    expect(auth.authenticate).toHaveBeenCalledWith('Bearer token', { write: false });
  });
  it('marks non-safe methods as writes and returns 403 for a missing ability', async () => {
    const auth = { authenticate: jest.fn().mockResolvedValue({ user: { userId: '1', roles: ['customer_service'] } }) };
    const abilities = { resolve: jest.fn().mockResolvedValue({ abilities: ['CASE_READ'], dataScope: 'SELF', matchedRoles: ['customer_service'] }) };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue('SENSITIVE_FILE_READ') } as unknown as Reflector;
    const request: any = { method: 'POST', headers: { authorization: 'token' } };
    await expect(new AbilityGuard(auth as any, abilities as any, reflector).canActivate(context(request))).rejects.toBeInstanceOf(ForbiddenException);
    expect(auth.authenticate).toHaveBeenCalledWith('token', { write: true });
  });
  it('returns 401 when authorization is missing', async () => {
    const guard = new AbilityGuard({} as any, {} as any, { getAllAndOverride: jest.fn() } as any);
    await expect(guard.canActivate(context({ method: 'GET', headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
