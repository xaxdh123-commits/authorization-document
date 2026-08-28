import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { AbilityService } from './ability.service';
import { AuthService } from './auth.service';

const roleNames: Record<string, string> = {
  admin: '超级管理员',
  common: '普通用户',
  service: '客服',
  customer_service: '客服',
  reviewer: '审核员',
  market: '分销管理',
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly abilityService: AbilityService) {}

  @Get('getInfo')
  async getInfo(@Headers('authorization') authorization?: string) {
    if (!authorization) throw new UnauthorizedException('未提供登录凭证');
    const { user } = await this.authService.authenticate(authorization, { write: false });
    const authorizationResult = await this.abilityService.resolve(user.roles);
    return {
      code: 200,
      msg: '操作成功',
      permissions: authorizationResult.abilities,
      roles: user.roles,
      user: {
        userId: user.userId,
        nickName: user.name,
        deptId: user.departmentId,
        deptName: user.departmentName,
        roles: user.roles.map((roleKey) => ({ roleKey, roleName: roleNames[roleKey] ?? roleKey })),
      },
    };
  }
}
