import { Controller, Get, Headers } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  @Get('getInfo')
  async getInfo(@Headers('authorization') authorization?: string) {
    const upstream = process.env.AUTH_GET_INFO_URL;
    if (upstream) {
      const response = await fetch(upstream, { headers: authorization ? { authorization } : undefined });
      if (!response.ok) throw new Error(`upstream auth failed (${response.status})`);
      return response.json();
    }

    return {
      code: 200,
      msg: '操作成功',
      permissions: ['*:*:*'],
      roles: ['admin'],
      user: { userId: 1, userName: 'demo', nickName: '本地演示账号', roles: [{ roleKey: 'admin' }] },
    };
  }
}
