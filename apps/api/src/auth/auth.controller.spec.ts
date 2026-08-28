import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('returns only the normalized local identity', async () => {
    const auth = { authenticate: jest.fn().mockResolvedValue({
      user: { userId: '1', name: '若依', departmentId: '100', departmentName: '系统部门', roles: ['admin'] },
      tokenDigest: 'digest', upstreamAvailable: true,
    }) } as any;
    const abilities = { resolve: jest.fn().mockResolvedValue({ abilities: ['CASE_READ', 'ROLE_MAPPING_MANAGE'], dataScope: 'ALL', matchedRoles: ['admin'] }) } as any;
    const controller = new AuthController(auth, abilities);
    const result = await controller.getInfo('Bearer secret');
    expect(result).toEqual({
      code: 200,
      msg: '操作成功',
      permissions: ['CASE_READ', 'ROLE_MAPPING_MANAGE'],
      roles: ['admin'],
      user: { userId: '1', nickName: '若依', deptId: '100', deptName: '系统部门', roles: [{ roleKey: 'admin', roleName: '超级管理员' }] },
    });
    expect(abilities.resolve).toHaveBeenCalledWith(['admin']);
    expect(JSON.stringify(result)).not.toContain('password');
  });

  it('rejects a missing token', async () => {
    const controller = new AuthController({ authenticate: jest.fn() } as any, { resolve: jest.fn() } as any);
    await expect(controller.getInfo()).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
