import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AbilityGuard, type RequestAuthContext } from '../auth/ability.guard';
import { RequireAbility } from '../auth/require-ability.decorator';
import { RequirementsService } from './requirements.service';

@Controller('requirements')
@UseGuards(AbilityGuard)
export class RequirementsController {
  constructor(private readonly requirements: RequirementsService) {}
  @Get() @RequireAbility('REQUIREMENT_MANAGE') list() { return this.requirements.list(); }
  @Get(':id') @RequireAbility('REQUIREMENT_MANAGE') get(@Param('id') id: string) { return this.requirements.get(id); }
  @Post() @RequireAbility('REQUIREMENT_MANAGE') create(@Body() body: unknown, @Req() req: { auth: RequestAuthContext }) { return this.requirements.create(body, req.auth.user.userId); }
  @Patch(':id/draft') @RequireAbility('REQUIREMENT_MANAGE') saveDraft(@Param('id') id: string, @Body() body: unknown, @Req() req: { auth: RequestAuthContext }) { return this.requirements.saveDraft(id, body, req.auth.user.userId); }
  @Post('versions/:id/publish') @RequireAbility('REQUIREMENT_MANAGE') publish(@Param('id') id: string, @Req() req: { auth: RequestAuthContext }) { return this.requirements.publish(id, req.auth.user.userId); }
  @Post('versions/:id/disable') @RequireAbility('REQUIREMENT_MANAGE') disable(@Param('id') id: string, @Req() req: { auth: RequestAuthContext }) { return this.requirements.disable(id, req.auth.user.userId); }
  @Get(':id/history') @RequireAbility('REQUIREMENT_MANAGE') history(@Param('id') id: string) { return this.requirements.history(id); }
}
