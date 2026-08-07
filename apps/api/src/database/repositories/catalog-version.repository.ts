import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CatalogVersionStatus, Prisma, SignatureMode } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditWriter } from './audit-writer';

type AuditInput = { actorUserId: string; action: string; targetType: string; targetId: string; detail: Prisma.InputJsonValue };
type TemplatePublishSnapshot = Prisma.TemplateVersionGetPayload<{ include: { requirements: { include: { requirementVersion: { include: { requirement: true } } } } } }>;
type RequirementPublishSnapshot = Prisma.RequirementVersionGetPayload<{ include: { requirement: true } }>;

@Injectable()
export class CatalogVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  listRequirements() {
    return this.prisma.db.requirement.findMany({ include: { versions: { orderBy: { version: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' } });
  }
  getRequirement(id: string) {
    return this.prisma.db.requirement.findUnique({ where: { id }, include: { versions: { orderBy: { version: 'desc' } } } });
  }
  requirementHistory(id: string) {
    return this.prisma.db.requirementVersion.findMany({ where: { requirementId: id }, orderBy: { version: 'desc' } });
  }
  async createRequirement(input: { key: string; name: string; definition: Prisma.InputJsonValue }, actorUserId: string) {
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const item = await tx.requirement.create({ data: { key: input.key, name: input.name, versions: { create: { version: 1, definition: input.definition, createdBy: actorUserId } } }, include: { versions: true } });
        await this.audit(tx, { actorUserId, action: 'REQUIREMENT_CREATE', targetType: 'REQUIREMENT', targetId: item.id, detail: { before: null, after: { key: input.key, name: input.name, status: 'DRAFT' }, result: 'SUCCESS', note: '创建资料字段草稿' } });
        return item;
      });
    } catch (error) { this.rethrowDuplicate(error, '字段 key 已存在'); }
  }
  async saveRequirementDraft(requirementId: string, definition: Prisma.InputJsonValue, actorUserId: string) {
    const observed = await this.prisma.db.requirementVersion.findFirst({ where: { requirementId }, orderBy: { version: 'desc' }, select: { id: true } });
    if (!observed) throw new NotFoundException('资料字段不存在');
    return this.withCatalogRetry(() => this.prisma.db.$transaction(async (tx) => {
      await this.lockAdvisory(tx, `catalog:requirement:${requirementId}`);
      await tx.$queryRaw`SELECT id FROM "Requirement" WHERE id = ${requirementId} FOR UPDATE`;
      const requirement = await tx.requirement.findUnique({ where: { id: requirementId }, select: { key: true } });
      const definitionKey = definition && typeof definition === 'object' && !Array.isArray(definition) ? (definition as Record<string, unknown>).key : undefined;
      if (!requirement) throw new NotFoundException('资料字段不存在');
      if (definitionKey !== requirement.key) throw new BadRequestException({ message: '资料字段校验失败', fields: [{ path: 'definition.key', message: '机器 key 创建后不可修改' }] });
      const latestIdentity = await tx.requirementVersion.findFirst({ where: { requirementId }, orderBy: { version: 'desc' }, select: { id: true } });
      if (!latestIdentity) throw new NotFoundException('资料字段不存在');
      await tx.$queryRaw`SELECT id FROM "RequirementVersion" WHERE id = ${latestIdentity.id} FOR UPDATE`;
      const latest = await tx.requirementVersion.findUnique({ where: { id: latestIdentity.id } });
      if (!latest) throw new NotFoundException('资料字段不存在');
      if (latest.id !== observed.id) throw new ConflictException({ message: '资料字段版本已被其他操作更新', fields: [{ path: 'version', message: '请刷新后重试' }] });
      let result;
      if (latest.status === CatalogVersionStatus.DRAFT) result = await tx.requirementVersion.update({ where: { id: latest.id }, data: { definition } });
      else result = await tx.requirementVersion.create({ data: { requirementId, version: latest.version + 1, definition, createdBy: actorUserId } });
      await this.audit(tx, { actorUserId, action: 'REQUIREMENT_DRAFT_SAVE', targetType: 'REQUIREMENT_VERSION', targetId: result.id, detail: { before: { version: latest.version, status: latest.status, definition: latest.definition }, after: { version: result.version, status: result.status, definition }, result: 'SUCCESS', note: '保存资料字段草稿' } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
  publishRequirement(versionId: string, actorUserId: string) { return this.transitionRequirement(versionId, CatalogVersionStatus.PUBLISHED, actorUserId); }
  async publishRequirementAtomically(versionId: string, actorUserId: string, validate: (snapshot: RequirementPublishSnapshot) => void) {
    const identity = await this.prisma.db.requirementVersion.findUnique({ where: { id: versionId }, select: { requirementId: true } });
    if (!identity) throw new NotFoundException('资料字段版本不存在');
    return this.withCatalogRetry(() => this.prisma.db.$transaction(async (tx) => {
      await this.lockAdvisory(tx, `catalog:requirement:${identity.requirementId}`);
      await tx.$queryRaw`SELECT id FROM "RequirementVersion" WHERE id = ${versionId} FOR UPDATE`;
      const current = await tx.requirementVersion.findUnique({ where: { id: versionId }, include: { requirement: true } });
      if (!current) throw new NotFoundException('资料字段版本不存在');
      if (current.status !== CatalogVersionStatus.DRAFT) throw new ConflictException('只有草稿版本可以发布');
      validate(current);
      const result = await tx.requirementVersion.update({ where: { id: versionId }, data: { status: CatalogVersionStatus.PUBLISHED, publishedAt: new Date() } });
      await this.audit(tx, { actorUserId, action: 'REQUIREMENT_PUBLISHED', targetType: 'REQUIREMENT_VERSION', targetId: versionId, detail: { before: { status: current.status }, after: { status: 'PUBLISHED' }, result: 'SUCCESS', note: '资料字段版本已发布' } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
  disableRequirement(versionId: string, actorUserId: string) { return this.transitionRequirement(versionId, CatalogVersionStatus.DISABLED, actorUserId); }

  listTemplates() { return this.prisma.db.template.findMany({ include: { versions: { orderBy: { version: 'desc' }, take: 1, include: { requirements: true } } }, orderBy: { createdAt: 'desc' } }); }
  getTemplate(id: string) { return this.prisma.db.template.findUnique({ where: { id }, include: { versions: { orderBy: { version: 'desc' }, include: { requirements: { include: { requirementVersion: { include: { requirement: true } } } } } } } }); }
  templateHistory(id: string) { return this.prisma.db.templateVersion.findMany({ where: { templateId: id }, orderBy: { version: 'desc' }, include: { requirements: true } }); }
  getRequirementVersions(ids: string[]) { return this.prisma.db.requirementVersion.findMany({ where: { id: { in: ids } }, include: { requirement: true } }); }
  getTemplateVersionForPublish(id: string) { return this.prisma.db.templateVersion.findUnique({ where: { id }, include: { requirements: { orderBy: { position: 'asc' }, include: { requirementVersion: { include: { requirement: true } } } } } }); }
  listSelectableRequirements() { return this.prisma.db.requirementVersion.findMany({ where: { status: CatalogVersionStatus.PUBLISHED, disabledAt: null }, include: { requirement: true }, orderBy: { createdAt: 'desc' } }); }
  listSelectableTemplates() { return this.prisma.db.templateVersion.findMany({ where: { status: CatalogVersionStatus.PUBLISHED, disabledAt: null }, include: { template: true, requirements: true }, orderBy: { createdAt: 'desc' } }); }

  async createTemplate(input: { key: string; name: string; description?: string; ast: Prisma.InputJsonValue; signatureMode: SignatureMode; requirementVersionIds: string[] }, actorUserId: string) {
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const item = await tx.template.create({ data: { key: input.key, name: input.name, description: input.description, versions: { create: { version: 1, ast: input.ast, signatureMode: input.signatureMode, createdBy: actorUserId, requirements: { create: input.requirementVersionIds.map((requirementVersionId, position) => ({ requirementVersionId, position })) } } } }, include: { versions: { include: { requirements: true } } } });
        await this.audit(tx, { actorUserId, action: 'TEMPLATE_CREATE', targetType: 'TEMPLATE', targetId: item.id, detail: { before: null, after: { key: input.key, name: input.name, status: 'DRAFT', requirementVersionIds: input.requirementVersionIds }, result: 'SUCCESS', note: '创建模板草稿' } });
        return item;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = JSON.stringify(error.meta?.target ?? '');
        if (target.includes('TemplateVersionRequirement') || target.includes('requirement_version_id') || target.includes('requirementVersionId')) throw new ConflictException('模板资料来源不能重复');
        throw new ConflictException('模板 key 已存在');
      }
      throw error;
    }
  }
  async copyTemplate(templateId: string, input: { key: string; name: string }, actorUserId: string) {
    const source = await this.getTemplate(templateId);
    const version = source?.versions[0];
    if (!source || !version) throw new NotFoundException('模板不存在');
    return this.createTemplate({ key: input.key, name: input.name, description: source.description ?? undefined, ast: version.ast as Prisma.InputJsonValue, signatureMode: version.signatureMode, requirementVersionIds: version.requirements.map((r) => r.requirementVersionId) }, actorUserId);
  }
  async saveTemplateDraft(templateId: string, input: { ast: Prisma.InputJsonValue; signatureMode: SignatureMode; requirementVersionIds: string[]; name?: string; description?: string }, actorUserId: string) {
    try { return await this.withCatalogRetry(() => this.prisma.db.$transaction(async (tx) => {
      await this.lockAdvisory(tx, `catalog:template:${templateId}`);
      await tx.$queryRaw`SELECT id FROM "Template" WHERE id = ${templateId} FOR UPDATE`;
      const template = await tx.template.findUnique({ where: { id: templateId }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
      const latest = template?.versions[0];
      if (!template || !latest) throw new NotFoundException('模板不存在');
      await this.lockAdvisory(tx, `catalog:template-version:${latest.id}`);
      await tx.$queryRaw`SELECT id FROM "TemplateVersion" WHERE id = ${latest.id} FOR UPDATE`;
      if (input.name !== undefined || input.description !== undefined) await tx.template.update({ where: { id: templateId }, data: { name: input.name, description: input.description } });
      let result;
      if (latest.status === CatalogVersionStatus.DRAFT) {
        await tx.templateVersionRequirement.deleteMany({ where: { templateVersionId: latest.id } });
        result = await tx.templateVersion.update({ where: { id: latest.id }, data: { ast: input.ast, signatureMode: input.signatureMode, requirements: { create: input.requirementVersionIds.map((requirementVersionId, position) => ({ requirementVersionId, position })) } } });
      } else {
        result = await tx.templateVersion.create({ data: { templateId, version: latest.version + 1, ast: input.ast, signatureMode: input.signatureMode, createdBy: actorUserId, requirements: { create: input.requirementVersionIds.map((requirementVersionId, position) => ({ requirementVersionId, position })) } } });
      }
      await this.audit(tx, { actorUserId, action: 'TEMPLATE_DRAFT_SAVE', targetType: 'TEMPLATE_VERSION', targetId: result.id, detail: { before: { version: latest.version, status: latest.status }, after: { version: result.version, status: result.status, requirementVersionIds: input.requirementVersionIds }, result: 'SUCCESS', note: '保存模板草稿' } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })); }
    catch (error) { this.rethrowCatalogWrite(error); }
  }
  publishTemplate(versionId: string, actorUserId: string) { return this.transitionTemplate(versionId, CatalogVersionStatus.PUBLISHED, actorUserId); }
  async publishTemplateAtomically(versionId: string, actorUserId: string, validate: (snapshot: TemplatePublishSnapshot) => void) {
    const identity = await this.prisma.db.templateVersion.findUnique({ where: { id: versionId }, select: { templateId: true } });
    if (!identity) throw new NotFoundException('模板版本不存在');
    return this.withCatalogRetry(() => this.prisma.db.$transaction(async (tx) => {
      await this.lockAdvisory(tx, `catalog:template:${identity.templateId}`);
      await this.lockAdvisory(tx, `catalog:template-version:${versionId}`);
      await tx.$queryRaw`SELECT id FROM "Template" WHERE id = ${identity.templateId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "TemplateVersion" WHERE id = ${versionId} FOR UPDATE`;
      const links = await tx.templateVersionRequirement.findMany({ where: { templateVersionId: versionId }, select: { requirementVersionId: true } });
      const requirementIds = links.map((link) => link.requirementVersionId).sort();
      if (requirementIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM "RequirementVersion" WHERE id IN (${Prisma.join(requirementIds)}) ORDER BY id FOR UPDATE`);
      const current = await tx.templateVersion.findUnique({ where: { id: versionId }, include: { requirements: { orderBy: { position: 'asc' }, include: { requirementVersion: { include: { requirement: true } } } } } });
      if (!current) throw new NotFoundException('模板版本不存在');
      validate(current);
      const result = await tx.templateVersion.update({ where: { id: versionId }, data: { status: CatalogVersionStatus.PUBLISHED, publishedAt: new Date() } });
      await this.audit(tx, { actorUserId, action: 'TEMPLATE_PUBLISHED', targetType: 'TEMPLATE_VERSION', targetId: versionId, detail: { before: { status: current.status }, after: { status: CatalogVersionStatus.PUBLISHED, requirementVersionIds: requirementIds }, result: 'SUCCESS', note: '模板版本已发布' } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
  disableTemplate(versionId: string, actorUserId: string) { return this.transitionTemplate(versionId, CatalogVersionStatus.DISABLED, actorUserId); }

  private async transitionRequirement(id: string, status: CatalogVersionStatus, actorUserId: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const current = await tx.requirementVersion.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('资料字段版本不存在');
      if (status === CatalogVersionStatus.PUBLISHED && current.status !== CatalogVersionStatus.DRAFT) throw new ConflictException('只有草稿版本可以发布');
      if (status === CatalogVersionStatus.DISABLED && current.status !== CatalogVersionStatus.PUBLISHED) throw new ConflictException('只有已发布版本可以停用');
      const result = await tx.requirementVersion.update({ where: { id }, data: status === CatalogVersionStatus.PUBLISHED ? { status, publishedAt: new Date() } : { status, disabledAt: new Date() } });
      await this.audit(tx, { actorUserId, action: `REQUIREMENT_${status}`, targetType: 'REQUIREMENT_VERSION', targetId: id, detail: { before: { status: current.status }, after: { status }, result: 'SUCCESS', note: status === CatalogVersionStatus.PUBLISHED ? '资料字段版本已发布' : '资料字段版本已停用' } });
      return result;
    });
  }
  private async transitionTemplate(id: string, status: CatalogVersionStatus, actorUserId: string) {
    return this.prisma.db.$transaction(async (tx) => {
      const current = await tx.templateVersion.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('模板版本不存在');
      if (status === CatalogVersionStatus.PUBLISHED && current.status !== CatalogVersionStatus.DRAFT) throw new ConflictException('只有草稿版本可以发布');
      if (status === CatalogVersionStatus.DISABLED && current.status !== CatalogVersionStatus.PUBLISHED) throw new ConflictException('只有已发布版本可以停用');
      const result = await tx.templateVersion.update({ where: { id }, data: status === CatalogVersionStatus.PUBLISHED ? { status, publishedAt: new Date() } : { status, disabledAt: new Date() } });
      await this.audit(tx, { actorUserId, action: `TEMPLATE_${status}`, targetType: 'TEMPLATE_VERSION', targetId: id, detail: { before: { status: current.status }, after: { status }, result: 'SUCCESS', note: status === CatalogVersionStatus.PUBLISHED ? '模板版本已发布' : '模板版本已停用' } });
      return result;
    });
  }
  private audit(tx: Prisma.TransactionClient, input: AuditInput) { return AuditWriter.append(tx, input); }
  private lockAdvisory(tx: Prisma.TransactionClient, key: string) { return tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`; }
  private async withCatalogRetry<T>(work: () => Promise<T>, maxAttempts = 3): Promise<T> {
    let last: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try { return await work(); }
      catch (error) { last = error; if (!this.isConcurrencyError(error) || attempt === maxAttempts) throw error; }
    }
    throw last;
  }
  private isConcurrencyError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return true;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return true;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010') return ['40001', '40P01'].includes(String((error.meta as Record<string, unknown> | undefined)?.code));
    return false;
  }
  private rethrowCatalogWrite(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = JSON.stringify(error.meta?.target ?? '');
      if (target.includes('TemplateVersionRequirement') || target.includes('requirement_version_id') || target.includes('requirementVersionId')) throw new ConflictException('模板资料来源不能重复');
    }
    throw error;
  }
  private rethrowDuplicate(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(message);
    throw error;
  }
}
