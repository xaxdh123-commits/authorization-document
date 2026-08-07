import { Injectable } from '@nestjs/common';
import { ActorType, CaseStatus, EvidenceMode, Prisma, QuotationSource, ReviewDecision, SignatureMode } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CaseStatusConflictError, DraftVersionConflictError } from './repository-errors';
import { isRetryableWriteConflict, serializableTransaction } from './transaction';
import { AuditWriter } from './audit-writer';

type CreateCaseInput = {
  customerName: string; contactName: string; factoryDepartment: string;
  templateVersionId: string; requirementVersionIds: string[]; materials: Prisma.InputJsonValue;
  quotation: { source: QuotationSource; sourceSystem?: string; reference?: string; snapshot: Prisma.InputJsonValue };
  ownerUserId: string; reviewerUserId?: string; departmentId: string; actorUserId: string;
};

@Injectable()
export class CaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateCaseInput) {
    return serializableTransaction(this.prisma.db, async (tx) => {
      const businessCase = await tx.businessCase.create({ data: {
        caseNumber: `WT${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        customerName: input.customerName, contactName: input.contactName,
        factoryDepartment: input.factoryDepartment, templateVersionId: input.templateVersionId,
        ownerUserId: input.ownerUserId, reviewerUserId: input.reviewerUserId,
        departmentId: input.departmentId, createdBy: input.actorUserId,
      } });
      const snapshot = await tx.caseSnapshot.create({ data: {
        caseId: businessCase.id, version: 1, templateVersionId: input.templateVersionId,
        customerName: input.customerName, contactName: input.contactName,
        factoryDepartment: input.factoryDepartment, materials: input.materials, createdBy: input.actorUserId,
        quotationSource: input.quotation.source, quotationSourceSystem: input.quotation.sourceSystem,
        quotationReference: input.quotation.reference, quotationSnapshot: input.quotation.snapshot,
        requirements: { create: input.requirementVersionIds.map((requirementVersionId, position) => ({ requirementVersionId, position })) },
      } });
      await tx.caseSnapshot.update({ where: { id: snapshot.id }, data: { frozenAt: new Date() } });
      await tx.caseStatusHistory.create({ data: { caseId: businessCase.id, toStatus: CaseStatus.DRAFT, actorUserId: input.actorUserId } });
      await AuditWriter.append(tx, { data: { actorUserId: input.actorUserId, action: 'CASE_CREATED', targetType: 'BusinessCase', targetId: businessCase.id, detail: { templateVersionId: input.templateVersionId, requirementVersionIds: input.requirementVersionIds, quotationSource: input.quotation.source } } });
      return businessCase;
    });
  }

  transition(caseId: string, expectedStatus: CaseStatus, toStatus: CaseStatus, actorUserId: string, reason?: string) {
    return serializableTransaction(this.prisma.db, async (tx) => {
      const result = await tx.businessCase.updateMany({
        where: { id: caseId, status: expectedStatus },
        data: { status: toStatus, closedAt: toStatus === 'CLOSED' ? new Date() : undefined },
      });
      if (result.count !== 1) throw new CaseStatusConflictError();
      await tx.caseStatusHistory.create({ data: { caseId, fromStatus: expectedStatus, toStatus, actorUserId, reason } });
      await AuditWriter.append(tx, { data: { actorUserId, action: 'CASE_STATUS_TRANSITIONED', targetType: 'BusinessCase', targetId: caseId, detail: { fromStatus: expectedStatus, toStatus, reason } } });
      return tx.businessCase.findUniqueOrThrow({ where: { id: caseId } });
    });
  }

  createPublicLink(input: { caseId: string; tokenHash: string; expiresAt: Date }) {
    return this.prisma.db.publicCaseLink.create({ data: input });
  }

  disablePublicLink(id: string, disabledAt = new Date()) {
    return this.prisma.db.publicCaseLink.update({ where: { id }, data: { disabledAt } });
  }

  saveDraft(input: { caseId: string; baseVersion: number; answers: Prisma.InputJsonValue; actorType: ActorType }) {
    return serializableTransaction(this.prisma.db, async (tx) => {
      const latest = await tx.caseDraft.aggregate({ where: { caseId: input.caseId }, _max: { version: true } });
      const currentVersion = latest._max.version ?? 0;
      if (currentVersion !== input.baseVersion) throw new DraftVersionConflictError(input.baseVersion, currentVersion);
      const version = currentVersion + 1;
      const draft = await tx.caseDraft.create({ data: { caseId: input.caseId, version, baseVersion: input.baseVersion, content: { answers: input.answers }, actorType: input.actorType } });
      await tx.answerHistory.create({ data: { caseId: input.caseId, draftVersion: version, answers: input.answers, actorType: input.actorType } });
      await tx.signingRecord.updateMany({ where: { caseId: input.caseId, valid: true }, data: { valid: false, invalidatedAt: new Date(), invalidationReason: '业务内容发生变化' } });
      await AuditWriter.append(tx, { data: { actorType: input.actorType, action: 'DRAFT_SAVED', targetType: 'BusinessCase', targetId: input.caseId, detail: { baseVersion: input.baseVersion, version } } });
      return draft;
    }).catch(async (error: unknown) => {
      if (!isRetryableWriteConflict(error)) throw error;
      const latest = await this.prisma.db.caseDraft.aggregate({ where: { caseId: input.caseId }, _max: { version: true } });
      throw new DraftVersionConflictError(input.baseVersion, latest._max.version ?? 0);
    });
  }

  addFileVersion(input: { caseId: string; requirementVersionId?: string; originalName: string; mimeType: string; sizeBytes: number; sha256: string; storageKey: string; actorType: ActorType }) {
    return serializableTransaction(this.prisma.db, async (tx) => {
      const file = await tx.fileRecord.create({ data: { caseId: input.caseId, requirementVersionId: input.requirementVersionId } });
      const version = await tx.fileVersion.create({ data: {
        fileId: file.id, caseId: input.caseId, version: 1, originalName: input.originalName,
        mimeType: input.mimeType, sizeBytes: input.sizeBytes, sha256: input.sha256,
        storageKey: input.storageKey, actorType: input.actorType,
      } });
      await tx.signingRecord.updateMany({ where: { caseId: input.caseId, valid: true }, data: { valid: false, invalidatedAt: new Date(), invalidationReason: '业务文件发生变化' } });
      await AuditWriter.append(tx, { data: { actorType: input.actorType, action: 'FILE_VERSION_ADDED', targetType: 'BusinessCase', targetId: input.caseId, detail: { fileId: file.id, fileVersionId: version.id, requirementVersionId: input.requirementVersionId } } });
      return version;
    });
  }

  appendFileVersion(input: { fileId: string; caseId: string; originalName: string; mimeType: string; sizeBytes: number; sha256: string; storageKey: string; actorType: ActorType }) {
    return serializableTransaction(this.prisma.db, async (tx) => {
      const file = await tx.fileRecord.findUniqueOrThrow({ where: { id: input.fileId } });
      if (file.caseId !== input.caseId) throw new Error('FILE_CASE_MISMATCH');
      const latest = await tx.fileVersion.aggregate({ where: { fileId: input.fileId }, _max: { version: true } });
      const version = await tx.fileVersion.create({ data: {
        fileId: input.fileId, caseId: input.caseId, version: (latest._max.version ?? 0) + 1,
        originalName: input.originalName, mimeType: input.mimeType, sizeBytes: input.sizeBytes,
        sha256: input.sha256, storageKey: input.storageKey, actorType: input.actorType,
      } });
      await tx.signingRecord.updateMany({ where: { caseId: input.caseId, valid: true }, data: { valid: false, invalidatedAt: new Date(), invalidationReason: '业务文件发生变化' } });
      await AuditWriter.append(tx, { data: { actorType: input.actorType, action: 'FILE_VERSION_APPENDED', targetType: 'BusinessCase', targetId: input.caseId, detail: { fileId: input.fileId, fileVersionId: version.id } } });
      return version;
    });
  }

  recordSigning(input: {
    caseId: string; mode: SignatureMode; evidenceMode: EvidenceMode; resourceFileVersionId: string;
    draftVersion?: number; contentDigest?: string;
    payload: Prisma.InputJsonValue; preSignPdfFileVersionId: string; preSignPdfSha256: string;
    clientIp: string; userAgent: string;
  }) {
    return serializableTransaction(this.prisma.db, async (tx) => {
      const [resourceFile, preSignPdf] = await Promise.all([
        tx.fileVersion.findUniqueOrThrow({ where: { id: input.resourceFileVersionId } }),
        tx.fileVersion.findUniqueOrThrow({ where: { id: input.preSignPdfFileVersionId } }),
      ]);
      if (resourceFile.caseId !== input.caseId || preSignPdf.caseId !== input.caseId) {
        throw new Error('SIGNING_FILE_CASE_MISMATCH');
      }
      const latest = await tx.signingRecord.aggregate({ where: { caseId: input.caseId }, _max: { version: true } });
      const signing = await tx.signingRecord.create({ data: { ...input, draftVersion: input.draftVersion ?? 0, contentDigest: input.contentDigest ?? '0'.repeat(64), version: (latest._max.version ?? 0) + 1 } });
      await AuditWriter.append(tx, { data: { actorType: ActorType.CUSTOMER, action: 'SIGNING_RECORDED', targetType: 'BusinessCase', targetId: input.caseId, detail: { signingVersion: signing.version, draftVersion: signing.draftVersion, contentDigest: signing.contentDigest, evidenceMode: signing.evidenceMode } } });
      return signing;
    });
  }

  invalidateSigning(id: string, input: { reason: string; invalidatedAt?: Date }) {
    if (!input.reason.trim()) throw new Error('SIGNING_INVALIDATION_REASON_REQUIRED');
    return this.prisma.db.$transaction(async (tx) => {
      const signing = await tx.signingRecord.update({ where: { id }, data: { valid: false, invalidatedAt: input.invalidatedAt ?? new Date(), invalidationReason: input.reason.trim() } });
      await AuditWriter.append(tx, { data: { actorType: ActorType.SYSTEM, action: 'SIGNING_INVALIDATED', targetType: 'BusinessCase', targetId: signing.caseId, detail: { signingVersion: signing.version, reason: input.reason.trim() } } });
      return signing;
    });
  }

  reviewRequirement(input: { caseId: string; requirementVersionId: string; decision: ReviewDecision; reason?: string; reviewerUserId: string }) {
    return serializableTransaction(this.prisma.db, async (tx) => {
      const current = await tx.requirementReview.findUnique({ where: { caseId_requirementVersionId: { caseId: input.caseId, requirementVersionId: input.requirementVersionId } } });
      const version = (current?.version ?? 0) + 1;
      const review = await tx.requirementReview.upsert({
        where: { caseId_requirementVersionId: { caseId: input.caseId, requirementVersionId: input.requirementVersionId } },
        create: { ...input, version }, update: { decision: input.decision, reason: input.reason, reviewerUserId: input.reviewerUserId, version },
      });
      await tx.reviewHistory.create({ data: { ...input, version } });
      await AuditWriter.append(tx, { data: { actorUserId: input.reviewerUserId, action: 'REQUIREMENT_REVIEWED', targetType: 'BusinessCase', targetId: input.caseId, detail: { requirementVersionId: input.requirementVersionId, decision: input.decision, reason: input.reason } } });
      return review;
    });
  }
}
