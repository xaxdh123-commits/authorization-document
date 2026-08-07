import { Injectable } from '@nestjs/common';
import { DataScope, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditWriter } from './audit-writer';

@Injectable()
export class RoleMappingRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsert(input: { roleKey: string; abilities: string[]; dataScope: DataScope; enabled: boolean }) {
    const data = { capabilities: input.abilities as Prisma.InputJsonValue, dataScope: input.dataScope, enabled: input.enabled };
    return this.prisma.db.roleMapping.upsert({ where: { roleKey: input.roleKey }, create: { roleKey: input.roleKey, ...data }, update: data });
  }

  upsertWithAudit(input: { roleKey: string; abilities: string[]; dataScope: DataScope; enabled: boolean; actorUserId: string }) {
    return this.prisma.db.$transaction(async (tx) => {
      const data = { capabilities: input.abilities as Prisma.InputJsonValue, dataScope: input.dataScope, enabled: input.enabled };
      const mapping = await tx.roleMapping.upsert({ where: { roleKey: input.roleKey }, create: { roleKey: input.roleKey, ...data }, update: data });
      await AuditWriter.append(tx, { data: {
        actorUserId: input.actorUserId,
        action: 'ROLE_MAPPING_UPDATED',
        targetType: 'RoleMapping',
        targetId: input.roleKey,
        detail: { abilities: input.abilities, dataScope: input.dataScope, enabled: input.enabled },
      } });
      return mapping;
    });
  }

  find(roleKey: string) {
    return this.prisma.db.roleMapping.findUnique({ where: { roleKey } });
  }

  list() {
    return this.prisma.db.roleMapping.findMany({ orderBy: { roleKey: 'asc' } });
  }

  upsertUpstreamUser(input: { userId: string; name: string; departmentId?: string; departmentName?: string; roles: string[] }) {
    const data = { name: input.name, departmentId: input.departmentId, departmentName: input.departmentName, roles: input.roles };
    return this.prisma.db.upstreamUser.upsert({ where: { id: input.userId }, create: { id: input.userId, ...data }, update: data });
  }
}
