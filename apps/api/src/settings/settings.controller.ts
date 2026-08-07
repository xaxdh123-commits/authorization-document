import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AbilityGuard, type RequestAuthContext } from '../auth/ability.guard';
import { RequireAbility } from '../auth/require-ability.decorator';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(AbilityGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}
  @Get() @RequireAbility('ROLE_MAPPING_MANAGE') list() { return this.settings.list(); }
  @Get(':key') @RequireAbility('ROLE_MAPPING_MANAGE') get(@Param('key') key: string) { return this.settings.get(key); }
  @Put(':key') @RequireAbility('ROLE_MAPPING_MANAGE') update(@Param('key') key: string, @Body() body: { value?: unknown; masked?: unknown }, @Req() req: { auth: RequestAuthContext }) { return this.settings.update(key, body, req.auth.user.userId); }
}
