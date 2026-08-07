import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ActorType, FilePurpose, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  effectiveFileLimits,
  validateCaseBytes,
  validateFileContent,
  validateFileMetadata,
  validateMaterialCount,
  type Storage,
} from '@auth/storage';
import { AuditWriter } from '../database/repositories/audit-writer';
import { PrismaService } from '../database/prisma.service';
import { serializableTransaction } from '../database/repositories/transaction';
import { TokenService } from '../cases/token.service';
import { STORAGE } from './storage.provider';
import { evidenceRetainedBytes } from './evidence-capacity';

export type IncomingFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
type SigningPurpose = 'HANDWRITTEN' | 'SEAL_ORIGINAL' | 'SEAL_PROCESSED';

@Injectable()
export class FileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  async uploadPublic(token: string, requirementReference: string, file: IncomingFile) {
    this.validateIncoming(file);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await this.tokens.resolve(token);
    const fileId = randomUUID();
    const stored = await this.storage.write(Readable.from(file.buffer), fileId, file.originalname);
    try {
      if(stored.sha256!==sha256)throw new BadRequestException('文件存储校验失败');
      const result=await serializableTransaction(this.prisma.db, async (tx) => {
        const link = await this.tokens.resolveForMutation(tx, token);
        await this.lockCase(tx, link.caseId);
        const snapshot = await tx.caseSnapshot.findFirst({
          where: { caseId: link.caseId },
          orderBy: { version: 'desc' },
          include: { requirements: { include: { requirementVersion: { include: { requirement: true } } } } },
        });
        const entry = snapshot?.requirements.find((candidate) =>
          candidate.requirementVersionId === requirementReference || candidate.requirementVersion.requirement.key === requirementReference,
        );
        if (!entry) throw new BadRequestException('资料项不属于当前业务单');
        const definition = entry.requirementVersion.definition as Record<string, unknown>;
        const limits = effectiveFileLimits({
          maxFileBytes: Number(definition.maxFileBytes) || undefined,
          maxFiles: Number(definition.maxFiles) || undefined,
          maxCaseBytes: Number(definition.maxCaseBytes) || undefined,
        });
        if (file.size > limits.maxFileBytes) throw new BadRequestException('单个文件超过允许大小');

        const duplicate = await tx.fileVersion.findFirst({
          where: {
            caseId: link.caseId,
            purpose: FilePurpose.MATERIAL,
            sha256,
            file: { requirementVersionId: entry.requirementVersionId, removedAt: null },
          },
          select: { id: true, fileId: true },
        });
        if (duplicate) return { fileId: duplicate.fileId, fileVersionId: duplicate.id, reused: true };

        const [count, retainedBytes] = await Promise.all([
          tx.fileRecord.count({ where: { caseId: link.caseId, requirementVersionId: entry.requirementVersionId, removedAt: null } }),
          evidenceRetainedBytes(tx,link.caseId),
        ]);
        try {
          validateMaterialCount(count + 1);
          if (count + 1 > limits.maxFiles) throw new Error('MATERIAL_COUNT_EXCEEDED');
          validateCaseBytes(retainedBytes + file.size);
          if (retainedBytes + file.size > limits.maxCaseBytes) throw new Error('CASE_SIZE_EXCEEDED');
        } catch {
          throw new BadRequestException('文件数量或业务单总容量超过限制');
        }

        const record = await tx.fileRecord.create({ data: { id: fileId, caseId: link.caseId, requirementVersionId: entry.requirementVersionId } });
        const version = await tx.fileVersion.create({
          data: {
            fileId: record.id,
            caseId: link.caseId,
            version: 1,
            originalName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            sha256,
            storageKey: stored.storageKey,
            actorType: ActorType.CUSTOMER,
            purpose: FilePurpose.MATERIAL,
          },
        });
        await this.invalidateSigning(tx, link.caseId, '客户上传资料发生变化');
        return { fileId: record.id, fileVersionId: version.id, reused: false };
      });
      if(result.reused)await this.storage.remove(stored.storageKey).catch(()=>undefined);
      return result;
    } catch (error) {
      await this.storage.remove(stored.storageKey).catch(() => undefined);
      throw error;
    }
  }

  async listPublic(token: string) {
    const link = await this.tokens.resolve(token);
    const records = await this.prisma.db.fileRecord.findMany({
      where: { caseId: link.caseId, removedAt: null, versions: { some: { purpose: FilePurpose.MATERIAL } } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        requirementVersionId: true,
        requirementVersion: { select: { definition: true, requirement: { select: { key: true, name: true } } } },
        versions: {
          where: { purpose: FilePurpose.MATERIAL },
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, version: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    });
    const groups = new Map<string, { requirementKey: string; requirementVersionId: string; label: string; files: unknown[] }>();
    let totalBytes = 0;
    for (const record of records) {
      const version = record.versions[0];
      if (!version || !record.requirementVersionId || !record.requirementVersion) continue;
      const definition = record.requirementVersion.definition as Record<string, unknown>;
      const requirementKey = record.requirementVersion.requirement.key;
      const group = groups.get(record.requirementVersionId) ?? {
        requirementKey,
        requirementVersionId: record.requirementVersionId,
        label: typeof definition.label === 'string' ? definition.label : record.requirementVersion.requirement.name,
        files: [],
      };
      group.files.push({
        fileId: record.id,
        fileVersionId: version.id,
        version: version.version,
        name: version.originalName,
        mimeType: version.mimeType,
        sizeBytes: version.sizeBytes,
        createdAt: version.createdAt,
        downloadUrl: `/public/files/${version.id}`,
      });
      totalBytes += version.sizeBytes;
      groups.set(record.requirementVersionId, group);
    }
    return { totalBytes, groups: [...groups.values()] };
  }

  async removePublic(token: string, fileId: string) {
    return serializableTransaction(this.prisma.db, async (tx) => {
      const link = await this.tokens.resolveForMutation(tx, token);
      await this.lockCase(tx, link.caseId);
      const record = await tx.fileRecord.findFirst({
        where: { id: fileId, caseId: link.caseId, removedAt: null, versions: { some: { purpose: FilePurpose.MATERIAL } } },
        select: { id: true },
      });
      if (!record) throw new NotFoundException('文件不存在');
      const removedAt = new Date();
      const removed = await tx.fileRecord.updateMany({
        where: { id: fileId, caseId: link.caseId, removedAt: null },
        data: { removedAt, removedBy: 'CUSTOMER', removeReason: '客户主动移除' },
      });
      if (removed.count !== 1) throw new NotFoundException('文件不存在');
      await this.invalidateSigning(tx, link.caseId, '客户移除资料');
      await AuditWriter.append(tx, {
        data: {
          actorType: ActorType.CUSTOMER,
          action: 'FILE_REMOVED',
          targetType: 'FileRecord',
          targetId: fileId,
          detail: { caseId: link.caseId, reason: '客户主动移除' },
        },
      });
      return { removed: true };
    });
  }

  async uploadSigningResource(token: string, purpose: SigningPurpose, file: IncomingFile, originalFileVersionId?: string) {
    this.validateIncoming(file);
    if (!['image/png', 'image/jpeg'].includes(file.mimetype)) throw new BadRequestException('签名或印章仅支持 PNG/JPEG');
    if (!['HANDWRITTEN', 'SEAL_ORIGINAL', 'SEAL_PROCESSED'].includes(purpose)) throw new BadRequestException('签署资源类型无效');
    if (purpose === 'SEAL_PROCESSED' && !originalFileVersionId) throw new BadRequestException('印章处理图必须关联原图');
    if (purpose !== 'SEAL_PROCESSED' && originalFileVersionId) throw new BadRequestException('仅印章处理图可关联原图');
    const digest = createHash('sha256').update(file.buffer).digest('hex');
    await this.tokens.resolve(token);
    const fileId = randomUUID();
    const stored = await this.storage.write(Readable.from(file.buffer), fileId, file.originalname);
    try {
      if(stored.sha256!==digest)throw new BadRequestException('文件存储校验失败');
      const result=await serializableTransaction(this.prisma.db, async (tx) => {
        const link = await this.tokens.resolveForMutation(tx, token);
        await this.lockCase(tx, link.caseId);
        if (purpose === 'SEAL_PROCESSED') {
          const original = await tx.fileVersion.findFirst({
            where: { id: originalFileVersionId, caseId: link.caseId, purpose: FilePurpose.SEAL_ORIGINAL, file: { removedAt: null } },
            select: { id: true },
          });
          if (!original) throw new BadRequestException('印章原图不存在或不属于当前业务单');
        }
        const duplicate = await tx.fileVersion.findFirst({
          where: { caseId: link.caseId, purpose: purpose as FilePurpose, sha256: digest, originalFileVersionId: originalFileVersionId ?? null, file: { removedAt: null } },
        });
        if (duplicate) return { fileId: duplicate.fileId, fileVersionId: duplicate.id, version: duplicate.version, reused: true };
        const retainedBytes = await evidenceRetainedBytes(tx,link.caseId);
        try { validateCaseBytes(retainedBytes + file.size); } catch { throw new BadRequestException('业务单总容量超过限制'); }
        const record = await tx.fileRecord.create({ data: { id: fileId, caseId: link.caseId } });
        const version = await tx.fileVersion.create({
          data: {
            fileId: record.id,
            caseId: link.caseId,
            version: 1,
            originalName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            sha256: stored.sha256,
            storageKey: stored.storageKey,
            actorType: ActorType.CUSTOMER,
            purpose: purpose as FilePurpose,
            originalFileVersionId,
          },
        });
        return { fileId, fileVersionId: version.id, version: 1, reused: false };
      });
      if(result.reused)await this.storage.remove(stored.storageKey).catch(()=>undefined);
      return result;
    } catch (error) {
      await this.storage.remove(stored.storageKey).catch(() => undefined);
      throw error;
    }
  }

  async get(caseId: string, fileVersionId: string, activeOnly = false, actorType: ActorType = ActorType.INTERNAL) {
    const version = await this.prisma.db.fileVersion.findFirst({
      where: { id: fileVersionId, caseId, ...(activeOnly ? { file: { removedAt: null } } : {}) },
      include: { file: { include: { requirementVersion: true } } },
    });
    if (!version) throw new NotFoundException('文件不存在');
    if(!await this.storage.exists(version.storageKey))throw new NotFoundException('文件内容不存在');
    const stream = await this.storage.read(version.storageKey);
    return {
      version,
      stream,
      sensitive: (version.file.requirementVersion?.definition as Record<string, unknown> | null)?.sensitive === true,
      audit: { caseId, actorType },
    };
  }

  recordDownload(input: { caseId: string; fileVersionId: string; actorType: ActorType; result: 'SUCCESS' | 'FAILURE'; reason?: string; actorUserId?: string; requestId?: string }) {
    return this.prisma.db.$transaction((tx) => AuditWriter.append(tx, {
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      action: input.result === 'SUCCESS' ? 'FILE_DOWNLOADED' : 'FILE_DOWNLOAD_FAILED',
      targetType: 'FileVersion',
      targetId: input.fileVersionId,
      source: input.actorType === ActorType.CUSTOMER ? 'PUBLIC_H5' : 'ADMIN_API',
      requestId: input.requestId,
      detail: { caseId: input.caseId, result: input.result, reason: input.reason ?? null },
    }));
  }

  authorizeDownload(input: { caseId: string; fileVersionId: string; actorType: ActorType; actorUserId?: string; requestId?: string }) {
    return this.prisma.db.$transaction((tx) => AuditWriter.append(tx, {
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      action: 'DOWNLOAD_AUTHORIZED',
      targetType: 'FileVersion',
      targetId: input.fileVersionId,
      source: input.actorType === ActorType.CUSTOMER ? 'PUBLIC_H5' : 'ADMIN_API',
      requestId: input.requestId,
      detail: { caseId: input.caseId },
    }));
  }

  async getPublic(token: string, fileVersionId: string) {
    const link = await this.tokens.resolve(token);
    return this.get(link.caseId, fileVersionId, true, ActorType.CUSTOMER);
  }

  private validateIncoming(file: IncomingFile) {
    try {
      validateFileMetadata(file.originalname, file.mimetype, file.size);
      validateFileContent(file.buffer, file.mimetype);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '文件校验失败');
    }
  }

  private lockCase(tx: Prisma.TransactionClient, caseId: string) {
    return tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BusinessCase" WHERE "id" = ${caseId} FOR UPDATE`);
  }

  private invalidateSigning(tx: Prisma.TransactionClient, caseId: string, reason: string) {
    return tx.signingRecord.updateMany({
      where: { caseId, valid: true },
      data: { valid: false, invalidatedAt: new Date(), invalidationReason: reason },
    });
  }
}
