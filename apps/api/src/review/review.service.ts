import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { CaseStatus, PdfTaskStatus, ReviewDecision } from '@prisma/client';
import { AuditRepository } from '../database/repositories/audit.repository';
import { CaseRepository } from '../database/repositories/case.repository';
import { PrismaService } from '../database/prisma.service';
import { TokenService } from '../cases/token.service';
import { PdfRetryService } from '../pdf/pdf-retry.service';
import { AuditWriter } from '../database/repositories/audit-writer';

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService, private readonly cases: CaseRepository, private readonly tokens: TokenService, private readonly audit: AuditRepository,@Optional() private readonly pdfRetry?:PdfRetryService) {}

  async queue() {
    const items = await this.prisma.db.businessCase.findMany({
      where: { status: { in: [CaseStatus.PENDING_REVIEW, CaseStatus.PENDING_REREVIEW, CaseStatus.NEEDS_SUPPLEMENT] } },
      include: { snapshots: { orderBy: { version: 'desc' }, take: 1, include: { _count: { select: { requirements: true } } } } },
      orderBy: { updatedAt: 'asc' },
    });
    return items.map((item) => ({ id: item.id, caseNo: item.caseNumber, caseTitle: item.customerName, status: item.status, itemCount: item.snapshots[0]?._count.requirements ?? 0, submittedAt: item.updatedAt, owner: item.ownerUserId, reviewerUserId: item.reviewerUserId }));
  }

  async detail(id: string) {
    const item = await this.prisma.db.businessCase.findUnique({ where: { id }, include: { snapshots: { orderBy: { version: 'desc' }, take: 1, include: { requirements: { include: { requirementVersion: { include: { requirement: true, files: { where: { caseId: id }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } } } } } } } }, reviews: true } });
    if (!item) throw new NotFoundException('审核业务单不存在');
    return item;
  }

  async claim(id: string, reviewerUserId: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const result = await tx.businessCase.updateMany({ where: { id, reviewerUserId: null, status: { in: [CaseStatus.PENDING_REVIEW, CaseStatus.PENDING_REREVIEW] } }, data: { reviewerUserId } });
      if (result.count !== 1) throw new ConflictException({ code: 'REVIEW_ALREADY_CLAIMED', message: '该审核任务已被领取' });
      await AuditWriter.append(tx, { data: { actorUserId: reviewerUserId, action: 'REVIEW_CLAIMED', targetType: 'BusinessCase', targetId: id, detail: {} } });
      return tx.businessCase.findUniqueOrThrow({ where: { id } });
    });
  }

  async assign(id: string, reviewerUserId: string, actorUserId: string, reason?: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const item = await tx.businessCase.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('审核业务单不存在');
      if ([CaseStatus.COMPLETED, CaseStatus.CLOSED].includes(item.status as any)) throw new BadRequestException('终态业务单不能指派审核人');
      if (item.reviewerUserId && !reason?.trim()) throw new BadRequestException('重新指派原因不能为空');
      const moved = await tx.businessCase.updateMany({ where: { id, status: item.status, reviewerUserId: item.reviewerUserId }, data: { reviewerUserId } });
      if (moved.count !== 1) throw new ConflictException({ code: 'REVIEW_ASSIGNMENT_CHANGED', message: '审核人或业务状态已变化，请刷新后重试' });
      await AuditWriter.append(tx, { data: { actorUserId, action: item.reviewerUserId ? 'REVIEW_REASSIGNED' : 'REVIEW_ASSIGNED', targetType: 'BusinessCase', targetId: id, detail: { from: item.reviewerUserId, to: reviewerUserId, reason: reason?.trim() } } });
      return tx.businessCase.findUniqueOrThrow({ where: { id } });
    });
  }

  async reviewItem(caseId: string, requirementVersionId: string, decision: 'APPROVE' | 'REJECT', reason: string | undefined, reviewerUserId: string) {
    if (decision === 'REJECT' && !reason?.trim()) throw new BadRequestException('驳回原因不能为空');
    return this.prisma.db.$transaction(async (tx) => {
      const locked = await tx.businessCase.updateMany({
        where: { id: caseId, reviewerUserId, status: { in: [CaseStatus.PENDING_REVIEW, CaseStatus.PENDING_REREVIEW] } },
        data: { reviewerUserId },
      });
      if (locked.count !== 1) throw new ConflictException({ code: 'REVIEW_ASSIGNMENT_CHANGED', message: '审核人或业务状态已变化，请刷新后重试' });
      const item = await tx.businessCase.findUnique({ where: { id: caseId } });
      if (!item) throw new NotFoundException('审核业务单不存在');
      const included = await tx.caseSnapshotRequirement.findFirst({ where: { caseSnapshot: { caseId }, requirementVersionId } });
      if (!included) throw new BadRequestException('资料项不属于该业务单');
      const current = await tx.requirementReview.findUnique({ where: { caseId_requirementVersionId: { caseId, requirementVersionId } } });
      if (item.status === CaseStatus.PENDING_REREVIEW && current?.decision === ReviewDecision.APPROVE) throw new BadRequestException('已通过资料项在复审中不可修改');
      const version = (current?.version ?? 0) + 1;
      const normalizedReason = reason?.trim();
      const review = await tx.requirementReview.upsert({
        where: { caseId_requirementVersionId: { caseId, requirementVersionId } },
        create: { caseId, requirementVersionId, decision: decision as ReviewDecision, reason: normalizedReason, reviewerUserId, version },
        update: { decision: decision as ReviewDecision, reason: normalizedReason, reviewerUserId, version },
      });
      await tx.reviewHistory.create({ data: { caseId, requirementVersionId, decision: decision as ReviewDecision, reason: normalizedReason, reviewerUserId, version } });
      await AuditWriter.append(tx, { data: { actorUserId: reviewerUserId, action: 'REQUIREMENT_REVIEWED', targetType: 'BusinessCase', targetId: caseId, detail: { requirementVersionId, decision, reason: normalizedReason } } });
      return review;
    });
  }

  async confirm(caseId: string, reviewerUserId: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const locked = await tx.businessCase.updateMany({
        where: { id: caseId, reviewerUserId, status: { in: [CaseStatus.PENDING_REVIEW, CaseStatus.PENDING_REREVIEW] } },
        data: { reviewerUserId },
      });
      if (locked.count !== 1) throw new ConflictException({ code: 'REVIEW_ASSIGNMENT_CHANGED', message: '审核人或业务状态已变化，请刷新后重试' });
      const item = await tx.businessCase.findUnique({ where: { id: caseId }, include: { snapshots: { orderBy: { version: 'desc' }, take: 1, include: { requirements: true } }, reviews: true, signings: { where: { valid: true }, orderBy: { version: 'desc' }, take: 1 } } });
      if (!item) throw new NotFoundException('审核业务单不存在');
      const requiredIds = item.snapshots[0]?.requirements.map((x) => x.requirementVersionId) ?? [];
      if (!requiredIds.length || requiredIds.some((id) => !item.reviews.some((review) => review.requirementVersionId === id))) throw new BadRequestException('请先完成全部资料项审核');
      if (item.reviews.some((review) => review.decision === ReviewDecision.REJECT)) {
        const issued = this.tokens.issue();
        const expiresAt = new Date(Date.now() + 7 * 86400000);
        const moved = await tx.businessCase.updateMany({ where: { id: caseId, status: item.status, reviewerUserId }, data: { status: CaseStatus.NEEDS_SUPPLEMENT } });
        if (moved.count !== 1) throw new ConflictException({ code: 'REVIEW_ASSIGNMENT_CHANGED', message: '审核人或业务状态已变化，请刷新后重试' });
        await tx.publicCaseLink.updateMany({ where: { caseId, disabledAt: null }, data: { disabledAt: new Date() } });
        await tx.publicCaseLink.create({ data: { caseId, tokenHash: issued.tokenHash, expiresAt } });
        await tx.caseStatusHistory.create({ data: { caseId, fromStatus: item.status, toStatus: CaseStatus.NEEDS_SUPPLEMENT, actorUserId: reviewerUserId } });
        await AuditWriter.append(tx, { data: { actorUserId: reviewerUserId, action: 'REVIEW_CONFIRMED_REJECTED', targetType: 'BusinessCase', targetId: caseId, detail: { rejectedCount: item.reviews.filter((review) => review.decision === ReviewDecision.REJECT).length } } });
        const updated = await tx.businessCase.findUniqueOrThrow({ where: { id: caseId } });
        return { ...updated, supplementToken: issued.token, linkExpiresAt: expiresAt, plaintextTokenShownOnce: true };
      }
      const signing = item.signings[0];
      const snapshot = item.snapshots[0];
      if (!signing || !snapshot) throw new BadRequestException('缺少有效签署或数据快照');
      const moved = await tx.businessCase.updateMany({ where: { id: caseId, status: item.status, reviewerUserId }, data: { status: CaseStatus.FINALIZING } });
      if (moved.count !== 1) throw new ConflictException({ code: 'REVIEW_ASSIGNMENT_CHANGED', message: '审核人或业务状态已变化，请刷新后重试' });
      await tx.caseStatusHistory.create({ data: { caseId, fromStatus: item.status, toStatus: CaseStatus.FINALIZING, actorUserId: reviewerUserId } });
      await tx.pdfTask.upsert({
        where: { idempotencyKey: `${caseId}:${item.templateVersionId}:${snapshot.version}:${signing.version}` },
        create: { caseId, templateVersionId: item.templateVersionId, dataSnapshotVersion: snapshot.version, signatureVersion: signing.version, idempotencyKey: `${caseId}:${item.templateVersionId}:${snapshot.version}:${signing.version}`, status: PdfTaskStatus.QUEUED },
        update: { status: PdfTaskStatus.QUEUED, failureCode: null, failureMessage: null },
      });
      await AuditWriter.append(tx, { data: { actorUserId: reviewerUserId, action: 'REVIEW_CONFIRMED_FINALIZING', targetType: 'BusinessCase', targetId: caseId, detail: { pdfTaskQueued: true } } });
      return tx.businessCase.findUniqueOrThrow({ where: { id: caseId } });
    });
  }

  async retryPdf(caseId: string, actorUserId: string) {
    if(!this.pdfRetry)throw new BadRequestException('PDF_RETRY_SERVICE_UNAVAILABLE');return this.pdfRetry.retry(caseId,actorUserId);
  }

  async copyRejectionMessage(caseId: string, actorUserId: string, publicBaseUrl = process.env.PUBLIC_H5_BASE_URL ?? '/p') {
    return this.generateRejectionMessage(caseId, actorUserId, publicBaseUrl, false);
  }

  async regenerateRejectionMessage(caseId: string, actorUserId: string, input: { reason?: string; confirmed?: boolean; publicBaseUrl?: string }) {
    if (input.confirmed !== true || !input.reason?.trim()) throw new BadRequestException('重新生成补件链接需要确认并填写原因');
    return this.generateRejectionMessage(caseId, actorUserId, input.publicBaseUrl ?? process.env.PUBLIC_H5_BASE_URL ?? '/p', true, input.reason.trim());
  }

  private async generateRejectionMessage(caseId: string, actorUserId: string, publicBaseUrl: string, rotate: boolean, regenerationReason?: string) {
    const issued = this.tokens.issue();
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    return this.prisma.db.$transaction(async (tx) => {
      const item = await tx.businessCase.findUnique({ where: { id: caseId }, include: { reviews: { where: { decision: ReviewDecision.REJECT }, include: { requirementVersion: { include: { requirement: true } } } } } });
      if (!item) throw new NotFoundException('业务单不存在');
      if (item.status !== CaseStatus.NEEDS_SUPPLEMENT || !item.reviews.length) throw new BadRequestException('当前业务单没有待补件资料');
      const active = await tx.publicCaseLink.findFirst({ where: { caseId, disabledAt: null, consumedAt: null, completedAt: null, expiresAt: { gt: new Date() } } });
      if (active && !rotate) throw new ConflictException({ code: 'LINK_ALREADY_ACTIVE', message: '补件链接已生成；明文链接仅展示一次，如需更换请使用重新生成操作' });
      if (active) {
        const disabled = await tx.publicCaseLink.updateMany({ where: { id: active.id, disabledAt: null, consumedAt: null, completedAt: null }, data: { disabledAt: new Date() } });
        if (disabled.count !== 1) throw new ConflictException({ code: 'LINK_STATE_CHANGED', message: '补件链接状态已变化，请刷新后重试' });
      }
      await tx.publicCaseLink.create({ data: { caseId, tokenHash: issued.tokenHash, expiresAt } });
      const link = `${publicBaseUrl.replace(/\/$/, '')}/${issued.token}`;
      const lines = item.reviews.map((review, index) => `${index + 1}. ${review.requirementVersion.requirement.name}：${review.reason}`);
      const message = `业务单 ${item.caseNumber} 需要补充以下资料：\n${lines.join('\n')}\n补件链接：${link}\n请于 ${expiresAt.toLocaleString('zh-CN', { hour12: false })} 前完成。`;
      await AuditWriter.append(tx, { data: { actorUserId, action: rotate ? 'REJECTION_LINK_REGENERATED' : 'REJECTION_MESSAGE_GENERATED', targetType: 'BusinessCase', targetId: caseId, detail: { rejectedCount: item.reviews.length, expiresAt: expiresAt.toISOString(), reason: regenerationReason } } });
      return { caseNumber: item.caseNumber, rejectedItems: item.reviews.map((review) => ({ label: review.requirementVersion.requirement.name, reason: review.reason })), supplementLink: link, deadline: expiresAt, message };
    });
  }
}
