import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AbilityGuard } from '../auth/ability.guard';
import { RequireAbility } from '../auth/require-ability.decorator';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(AbilityGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get() @RequireAbility('AUDIT_READ_ALL')
  list(@Query('targetType') targetType?: string, @Query('targetId') targetId?: string, @Query('actorUserId') actorUserId?: string, @Query('action') action?: string, @Query('createdFrom') createdFrom?: string, @Query('createdTo') createdTo?: string, @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.audit.list({ targetType, targetId, actorUserId, action, createdFrom, createdTo, page: Number(page), pageSize: Number(pageSize) });
  }
}
