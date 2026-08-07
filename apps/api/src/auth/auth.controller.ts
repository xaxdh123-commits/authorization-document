import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('getInfo')
  async getInfo(@Headers('authorization') authorization?: string) {
    if (!authorization) throw new UnauthorizedException('未提供登录凭证');
    const { user } = await this.authService.authenticate(authorization, { write: false });
    return {
      code: 200,
      msg: '操作成功',
      roles: user.roles,
      user: {
        userId: user.userId,
        nickName: user.name,
        deptId: user.departmentId,
        deptName: user.departmentName,
        roles: user.roles.map((roleKey) => ({ roleKey })),
      },
    };
  }
}
