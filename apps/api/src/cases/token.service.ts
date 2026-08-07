import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export const linkUnavailable = () => new NotFoundException({ code: 'LINK_UNAVAILABLE', message: '链接无效或已失效' });

@Injectable()
export class TokenService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly clock: () => Date = () => new Date()) {}

  digest(token: string) { return createHash('sha256').update(token, 'utf8').digest('hex'); }
  issue() { const token = randomBytes(32).toString('base64url'); return { token, tokenHash: this.digest(token) }; }

  async create(caseId: string, expiresAt: Date) {
    const { token, tokenHash } = this.issue();
    const link = await this.prisma.db.publicCaseLink.create({ data: { caseId, tokenHash, expiresAt } });
    return { link, token };
  }

  async resolve(token: string) {
    const link = await this.prisma.db.publicCaseLink.findUnique({
      where: { tokenHash: this.digest(token) },
      include: { businessCase: true },
    });
    const now = this.clock();
    if (!link || link.expiresAt <= now || link.disabledAt || link.consumedAt || link.completedAt || ['COMPLETED', 'CLOSED'].includes(link.businessCase.status)) {
      throw linkUnavailable();
    }
    return link;
  }

  async resolveForMutation(tx: Prisma.TransactionClient, token: string) {
    const tokenHash = this.digest(token);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PublicCaseLink" WHERE "token_hash" = ${tokenHash} FOR UPDATE`);
    const link = await tx.publicCaseLink.findUnique({ where: { tokenHash }, include: { businessCase: true } });
    const now = this.clock();
    if (!link || link.expiresAt <= now || link.disabledAt || link.consumedAt || link.completedAt || ['COMPLETED', 'CLOSED'].includes(link.businessCase.status)) throw linkUnavailable();
    return link;
  }

  async consumeForMutation(tx: Prisma.TransactionClient, link: { id: string; expiresAt: Date }) {
    const now = this.clock();
    const consumed = await tx.publicCaseLink.updateMany({ where: { id: link.id, disabledAt: null, consumedAt: null, completedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    if (consumed.count !== 1) throw linkUnavailable();
  }

  async disable(caseId: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const active = await tx.publicCaseLink.findFirst({ where: { caseId, disabledAt: null, consumedAt: null, completedAt: null, expiresAt: { gt: this.clock() } } });
      if (!active) throw linkUnavailable();
      const result = await tx.publicCaseLink.updateMany({ where: { id: active.id, disabledAt: null, consumedAt: null, completedAt: null }, data: { disabledAt: this.clock() } });
      if (result.count !== 1) throw new ConflictException({ code: 'LINK_STATE_CHANGED', message: '链接状态已变化，请刷新后重试' });
      return result;
    });
  }

  async regenerate(caseId: string, expiresAt: Date) {
    const { token, tokenHash } = this.issue();
    const now = this.clock();
    const link = await this.prisma.db.$transaction(async (tx) => {
      const active = await tx.publicCaseLink.findFirst({ where: { caseId, disabledAt: null, consumedAt: null, completedAt: null, expiresAt: { gt: now } } });
      if (active) {
        const disabled = await tx.publicCaseLink.updateMany({ where: { id: active.id, disabledAt: null, consumedAt: null, completedAt: null }, data: { disabledAt: now } });
        if (disabled.count !== 1) throw new ConflictException({ code: 'LINK_STATE_CHANGED', message: '链接状态已变化，请刷新后重试' });
      }
      return tx.publicCaseLink.create({ data: { caseId, tokenHash, expiresAt } });
    });
    return { link, token };
  }
}
