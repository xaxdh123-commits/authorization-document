import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AbilityGuard, type RequestAuthContext } from '../auth/ability.guard';
import { RequireAbility } from '../auth/require-ability.decorator';
import { RolesService, type RoleMappingUpdate } from './roles.service';

@Controller('roles')
@UseGuards(AbilityGuard)
@RequireAbility('ROLE_MAPPING_MANAGE')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('mappings')
  list() {
    return this.roles.list();
  }

  @Put('mappings/:roleKey')
  update(@Param('roleKey') roleKey: string, @Body() input: RoleMappingUpdate, @Req() request: { auth: RequestAuthContext }) {
    return this.roles.update(roleKey, input, request.auth.user.userId);
  }
}
