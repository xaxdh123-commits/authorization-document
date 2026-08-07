import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('returns only the normalized local identity', async () => {
    const auth = { authenticate: jest.fn().mockResolvedValue({
      user: { userId: '1', name: '若依', departmentId: '100', departmentName: '系统部门', roles: ['admin'] },
      tokenDigest: 'digest', upstreamAvailable: true,
    }) } as any;
    const controller = new AuthController(auth);
    await expect(controller.getInfo('Bearer secret')).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      roles: ['admin'],
      user: { userId: '1', nickName: '若依', deptId: '100', deptName: '系统部门', roles: [{ roleKey: 'admin' }] },
    });
    expect(JSON.stringify(await controller.getInfo('Bearer secret'))).not.toContain('password');
  });

  it('rejects a missing token', async () => {
    const controller = new AuthController({ authenticate: jest.fn() } as any);
    await expect(controller.getInfo()).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
