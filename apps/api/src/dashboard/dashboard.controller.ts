import { Controller, Get, UseGuards } from '@nestjs/common';
import { CaseStatus } from '@prisma/client';
import { AbilityGuard } from '../auth/ability.guard';
import { RequireAbility } from '../auth/require-ability.decorator';
import { PrismaService } from '../database/prisma.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}
  @UseGuards(AbilityGuard) @RequireAbility('CASE_READ') @Get()
  async summary() {
    const [groups, recent] = await Promise.all([
      this.prisma.db.businessCase.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.db.businessCase.findMany({ take: 5, orderBy: { updatedAt: 'desc' } }),
    ]);
    const statuses: Record<string, number> = {};
    Object.values(CaseStatus).forEach((status) => { statuses[status] = 0; });
    groups.forEach((group) => { statuses[group.status] = group._count._all; });
    return { statuses, recent: recent.map((item) => ({ id: item.id, title: item.customerName, status: item.status, owner: item.ownerUserId, updatedAt: item.updatedAt })), overdue: [] };
  }
}
