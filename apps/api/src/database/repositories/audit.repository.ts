import { Injectable } from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditWrite, AuditWriter } from './audit-writer';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  append(input: AuditWrite) {
    return this.prisma.db.$transaction((tx) => AuditWriter.append(tx, input));
  }

  appendInTransaction(tx: Prisma.TransactionClient, input: AuditWrite) { return AuditWriter.append(tx, input); }

  list(filter: { targetId?: string; actorUserId?: string }) {
    return this.prisma.db.auditEvent.findMany({ where: filter, orderBy: { createdAt: 'asc' } });
  }

  async listPage(filter: { targetType?: string; targetId?: string; actorUserId?: string; action?: string; createdFrom?: Date; createdTo?: Date; page: number; pageSize: number }) {
    const { page, pageSize, createdFrom, createdTo, ...base } = filter;
    const where: Prisma.AuditEventWhereInput = { ...base, createdAt: createdFrom || createdTo ? { gte: createdFrom, lte: createdTo } : undefined };
    const [items, total] = await this.prisma.db.$transaction([
      this.prisma.db.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.db.auditEvent.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
