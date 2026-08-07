import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AbilityGuard } from '../auth/ability.guard';
import type { RequestAuthContext } from '../auth/ability.guard';
import { RequireAbility } from '../auth/require-ability.decorator';
import { CaseService } from './case.service';

type AuthRequest = { auth: RequestAuthContext; ip?: string; headers: Record<string, string | string[] | undefined> };
const actor = (request: AuthRequest) => ({ userId: request.auth.user.userId, departmentId: request.auth.user.departmentId });

@Controller('cases')
@UseGuards(AbilityGuard)
export class CasesController {
  constructor(private readonly service: CaseService) {}

  @RequireAbility('CASE_CREATE') @Post() create(@Body() body: unknown, @Req() request: AuthRequest) { return this.service.create(body, actor(request)); }
  @RequireAbility('CASE_READ') @Get() list() { return this.service.list(); }
  @RequireAbility('CASE_READ') @Get(':id') detail(@Param('id') id: string) { return this.service.detail(id); }
  @RequireAbility('CASE_READ') @Get(':id/histories') answerHistory(@Param('id') id: string) { return this.service.answerReviewSigningHistory(id); }
  @RequireAbility('FILE_READ') @Get(':id/files/history') fileHistory(@Param('id') id: string) { return this.service.fileHistory(id); }
  @RequireAbility('SENSITIVE_FILE_READ') @Get(':id/files/sensitive-history') sensitiveFileHistory(@Param('id') id: string) { return this.service.sensitiveFileHistory(id); }
  @RequireAbility('CASE_EDIT_DRAFT') @Post(':id/submit') submit(@Param('id') id: string, @Body() body: any, @Req() request: AuthRequest) {
    const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + Number(body?.linkExpiresInDays ?? 7) * 86400000);
    if (Number.isNaN(expiresAt.getTime())) throw new BadRequestException('链接有效期无效');
    return this.service.submitDraft(id, actor(request), expiresAt);
  }
  @RequireAbility('CASE_MANAGE_LINK') @Post(':id/link/renew') renew(@Param('id') id: string, @Body() body: any, @Req() request: AuthRequest) { return this.service.renewLink(id, new Date(body.expiresAt), actor(request)); }
  @RequireAbility('CASE_MANAGE_LINK') @Post(':id/link/regenerate') regenerate(@Param('id') id: string, @Body() body: any, @Req() request: AuthRequest) { return this.service.regenerateLink(id, new Date(body.expiresAt), actor(request)); }
  @RequireAbility('CASE_MANAGE_LINK') @Post(':id/link/disable') disable(@Param('id') id: string, @Body() body: any, @Req() request: AuthRequest) { return this.service.disableLink(id, body.reason, actor(request)); }
  @RequireAbility('CASE_MANAGE_LINK') @Post(':id/close-access') closeAccess(@Param('id') id: string, @Req() request: AuthRequest) { return this.service.disableLink(id, '后台手动关闭访问', actor(request)); }
  @RequireAbility('CASE_CLOSE') @Post(':id/close') close(@Param('id') id: string, @Body() body: any, @Req() request: AuthRequest) { return this.service.close(id, body.reason, actor(request)); }
}

@Controller('public')
export class PublicCasesController {
  constructor(private readonly service: CaseService) {}
  @Get('case') view(@Headers('authorization') authorization?: string) { return this.service.publicView(this.token(authorization)); }
  @Put('draft') save(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) { return this.service.savePublicDraft(this.token(authorization), body); }
  @Post('draft/versions') newVersion(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) { return this.service.savePublicDraft(this.token(authorization), body, true); }
  @Post('signing/prepare') prepareSigning(@Headers('authorization') authorization: string | undefined, @Body() body: unknown, @Req() request: AuthRequest) {
    const userAgent = request.headers['user-agent'];
    return this.service.prepareOrdinarySigning(this.token(authorization), body, { ip: request.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent });
  }
  @Post('signing/preview') previewSigning(@Headers('authorization') authorization: string | undefined) { return this.service.createPresignPreview(this.token(authorization)); }
  @Post('submit') submit(@Headers('authorization') authorization: string | undefined, @Body() body: unknown, @Req() request: AuthRequest) {
    const userAgent = request.headers['user-agent'];
    return this.service.submitPublic(this.token(authorization), body, { ip: request.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent });
  }
  private token(value?: string) {
    const token = value?.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new BadRequestException('缺少访问令牌');
    return token;
  }
}
