import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AbilityGuard, type RequestAuthContext } from '../auth/ability.guard';
import { RequireAbility } from '../auth/require-ability.decorator';
import { TemplatesService } from './templates.service';

@Controller('templates')
@UseGuards(AbilityGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}
  @Get() @RequireAbility('TEMPLATE_MANAGE') list() { return this.templates.list(); }
  @Get(':id') @RequireAbility('TEMPLATE_MANAGE') get(@Param('id') id: string) { return this.templates.get(id); }
  @Post() @RequireAbility('TEMPLATE_MANAGE') create(@Body() body: unknown, @Req() req: { auth: RequestAuthContext }) { return this.templates.create(body, req.auth.user.userId); }
  @Post(':id/copy') @RequireAbility('TEMPLATE_MANAGE') copy(@Param('id') id: string, @Body() body: unknown, @Req() req: { auth: RequestAuthContext }) { return this.templates.copy(id, body, req.auth.user.userId); }
  @Patch(':id/draft') @RequireAbility('TEMPLATE_MANAGE') saveDraft(@Param('id') id: string, @Body() body: unknown, @Req() req: { auth: RequestAuthContext }) { return this.templates.saveDraft(id, body, req.auth.user.userId); }
  @Post('versions/:id/publish') @RequireAbility('TEMPLATE_PUBLISH') publish(@Param('id') id: string, @Req() req: { auth: RequestAuthContext }) { return this.templates.publish(id, req.auth.user.userId); }
  @Post('versions/:id/disable') @RequireAbility('TEMPLATE_MANAGE') disable(@Param('id') id: string, @Req() req: { auth: RequestAuthContext }) { return this.templates.disable(id, req.auth.user.userId); }
  @Get(':id/history') @RequireAbility('TEMPLATE_MANAGE') history(@Param('id') id: string) { return this.templates.history(id); }
}
