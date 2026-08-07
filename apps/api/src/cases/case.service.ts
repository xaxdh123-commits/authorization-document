import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ActorType, CaseStatus, CatalogVersionStatus, FilePurpose, Prisma, QuotationSource } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Storage } from '@auth/storage';
import { AuditRepository } from '../database/repositories/audit.repository';
import { CaseRepository } from '../database/repositories/case.repository';
import { DraftVersionConflictError } from '../database/repositories/repository-errors';
import { PrismaService } from '../database/prisma.service';
import { serializableTransaction } from '../database/repositories/transaction';
import { TokenService } from './token.service';
import { PRESIGN_PREVIEW_SERVICE, PresignPreviewRenderer } from './presign-preview.service';
import { prepareCanonicalPresignInput, type CanonicalPresignInput } from './presign-canonical';
import { STORAGE } from '../files/storage.provider';
import { ORDINARY_SIGNING_DECLARATION_V1, ORDINARY_SIGNING_DISCLAIMER, validateSigningCommand, validateSigningResourceBinding } from '../files/file-policy';
import { CASE_FILE_CAPACITY_BYTES, evidenceRetainedBytes } from '../files/evidence-capacity';
import { AuditWriter } from '../database/repositories/audit-writer';

type Actor = { userId: string; departmentId?: string | null };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const plain=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const readAll = async (stream: Readable) => { const chunks:Buffer[]=[]; for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)); return Buffer.concat(chunks); };
function signatureSlots(ast: unknown): Array<{slotId:string;page:number;x:number;y:number;width:number;height:number;required:boolean}> { const found:any[]=[]; const visit=(value:any)=>{if(Array.isArray(value))return value.forEach(visit);if(!value||typeof value!=='object')return;if(value.type==='signatureSlot'&&value.signer==='PARTY_A')found.push({slotId:value.slotId,page:value.page,x:value.x,y:value.y,width:value.width,height:value.height,required:value.required});Object.values(value).forEach(visit);};visit(ast);return found; }

@Injectable()
export class CaseService {
  private readonly previewFlights = new Map<string, Promise<any>>();
  private readonly previewRenderGates = new Map<string, { startedAt: number; attempts: number; active: number }>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CaseRepository,
    private readonly tokens: TokenService,
    private readonly audit: AuditRepository,
    @Optional() @Inject(PRESIGN_PREVIEW_SERVICE) private readonly previewService?: PresignPreviewRenderer,
    @Optional() @Inject(STORAGE) private readonly storage?: Storage,
  ) {}

  async create(raw: any, actor: Actor) {
    const templateVersion = await this.resolveTemplate(raw.templateVersionId);
    const requirementVersionIds = await this.resolveRequirements(raw.requirementVersionIds ?? raw.requirements, templateVersion.id);
    const quote = this.quotation(raw);
    const created = await this.cases.create({
      customerName: raw.customerName,
      contactName: raw.contactName,
      factoryDepartment: raw.factoryDepartment,
      materials: raw.materials as Prisma.InputJsonValue,
      templateVersionId: templateVersion.id,
      requirementVersionIds,
      quotation: quote,
      ownerUserId: actor.userId,
      departmentId: actor.departmentId ?? 'unassigned',
      actorUserId: actor.userId,
    });
    if (raw.linkExpiresInDays) {
      const expiresAt = new Date(Date.now() + Number(raw.linkExpiresInDays) * 86400000);
      return this.submitDraft(created.id, actor, expiresAt);
    }
    return this.detail(created.id);
  }

  async list() {
    const rows = await this.prisma.db.businessCase.findMany({ include: { snapshots: { orderBy: { version: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' } });
    return rows.map((row) => ({ ...row, title: row.customerName, factory: row.factoryDepartment, owner: row.ownerUserId, materialCount: Array.isArray(row.snapshots[0]?.materials) ? row.snapshots[0].materials.length : 0 }));
  }

  async detail(id: string) {
    const item = await this.prisma.db.businessCase.findUnique({ where: { id }, include: {
      templateVersion: { include: { template: true } }, snapshots: { include: { requirements: { include: { requirementVersion: { include: { requirement: true } } } } }, orderBy: { version: 'desc' } },
      publicLinks: { orderBy: { createdAt: 'desc' } }, reviews: true, statusHistory: { orderBy: { createdAt: 'asc' } }, signings: { orderBy: { version: 'desc' } },
    } });
    if (!item) throw new NotFoundException('业务单不存在');
    return {
      id: item.id, caseNumber: item.caseNumber, customerName: item.customerName, contactName: item.contactName,
      factoryDepartment: item.factoryDepartment, status: item.status, templateVersionId: item.templateVersionId,
      ownerUserId: item.ownerUserId, reviewerUserId: item.reviewerUserId, departmentId: item.departmentId,
      createdBy: item.createdBy, createdAt: item.createdAt, updatedAt: item.updatedAt, closedAt: item.closedAt,
      templateVersion: { id: item.templateVersion.id, version: item.templateVersion.version, signatureMode: item.templateVersion.signatureMode, template: { id: item.templateVersion.template.id, key: item.templateVersion.template.key, name: item.templateVersion.template.name } },
      snapshots: item.snapshots.map((snapshot) => ({
        id: snapshot.id, version: snapshot.version, templateVersionId: snapshot.templateVersionId, customerName: snapshot.customerName,
        contactName: snapshot.contactName, factoryDepartment: snapshot.factoryDepartment, materials: snapshot.materials,
        quotationSource: snapshot.quotationSource, quotationSourceSystem: snapshot.quotationSourceSystem, quotationReference: snapshot.quotationReference,
        createdAt: snapshot.createdAt, frozenAt: snapshot.frozenAt,
        requirements: snapshot.requirements.map((entry) => ({ position: entry.position, requirementVersionId: entry.requirementVersionId, requirementVersion: { id: entry.requirementVersion.id, version: entry.requirementVersion.version, status: entry.requirementVersion.status, definition: entry.requirementVersion.definition, requirement: { id: entry.requirementVersion.requirement.id, key: entry.requirementVersion.requirement.key, name: entry.requirementVersion.requirement.name } } })),
      })),
      publicLinks: item.publicLinks.map((link) => ({ id: link.id, expiresAt: link.expiresAt, disabledAt: link.disabledAt, consumedAt: link.consumedAt, completedAt: link.completedAt, createdAt: link.createdAt })),
      reviews: item.reviews.map((review) => ({ id: review.id, requirementVersionId: review.requirementVersionId, version: review.version, decision: review.decision, reason: review.reason, reviewerUserId: review.reviewerUserId, updatedAt: review.updatedAt })),
      statusHistory: item.statusHistory.map((history) => ({ id: history.id, fromStatus: history.fromStatus, toStatus: history.toStatus, actorUserId: history.actorUserId, reason: history.reason, createdAt: history.createdAt })),
      signings: item.signings.map((signing) => ({ id: signing.id, version: signing.version, draftVersion: signing.draftVersion, contentDigest: signing.contentDigest, signer: signing.signer, mode: signing.mode, evidenceMode: signing.evidenceMode, signedAt: signing.signedAt, valid: signing.valid, invalidatedAt: signing.invalidatedAt, invalidationReason: signing.invalidationReason })),
    };
  }

  async submitDraft(id: string, actor: Actor, expiresAt = new Date(Date.now() + 7 * 86400000)) {
    const issued = this.tokens.issue();
    const updated = await serializableTransaction(this.prisma.db, async (tx) => {
      const moved = await tx.businessCase.updateMany({ where: { id, status: CaseStatus.DRAFT }, data: { status: CaseStatus.AWAITING_CUSTOMER } });
      if (moved.count !== 1) throw new BadRequestException('当前业务状态不允许此操作');
      await tx.publicCaseLink.updateMany({ where: { caseId: id, disabledAt: null }, data: { disabledAt: new Date() } });
      await tx.publicCaseLink.create({ data: { caseId: id, tokenHash: issued.tokenHash, expiresAt } });
      await tx.caseStatusHistory.create({ data: { caseId: id, fromStatus: CaseStatus.DRAFT, toStatus: CaseStatus.AWAITING_CUSTOMER, actorUserId: actor.userId } });
      await AuditWriter.append(tx, { data: { actorUserId: actor.userId, action: 'PUBLIC_LINK_CREATED', targetType: 'BusinessCase', targetId: id, detail: { expiresAt: expiresAt.toISOString() } } });
      return tx.businessCase.findUniqueOrThrow({ where: { id } });
    });
    return { ...updated, accessToken: issued.token, linkExpiresAt: expiresAt.toISOString() };
  }

  async regenerateLink(id: string, expiresAt: Date, actor: Actor) {
    return this.replaceLink(id, expiresAt, actor, 'PUBLIC_LINK_REGENERATED');
  }

  async renewLink(id: string, expiresAt: Date, actor: Actor) {
    return this.replaceLink(id, expiresAt, actor, 'PUBLIC_LINK_RENEWED', true);
  }

  async disableLink(id: string, reason: string, actor: Actor) {
    if (!reason?.trim()) throw new BadRequestException('停用原因不能为空');
    await this.prisma.db.$transaction(async (tx) => {
      await tx.businessCase.findUniqueOrThrow({ where: { id } });
      const active = await tx.publicCaseLink.findFirst({ where: { caseId: id, disabledAt: null, consumedAt: null, completedAt: null, expiresAt: { gt: new Date() } } });
      if (!active) throw new NotFoundException('有效链接不存在');
      const disabled = await tx.publicCaseLink.updateMany({ where: { id: active.id, disabledAt: null, consumedAt: null, completedAt: null }, data: { disabledAt: new Date() } });
      if (disabled.count !== 1) throw new ConflictException({ code: 'LINK_STATE_CHANGED', message: '链接状态已变化，请刷新后重试' });
      await AuditWriter.append(tx, { data: { actorUserId: actor.userId, action: 'PUBLIC_LINK_DISABLED', targetType: 'BusinessCase', targetId: id, detail: { reason: reason.trim() } } });
    });
    return { disabled: true };
  }

  async close(id: string, reason: string, actor: Actor) {
    if (!reason?.trim()) throw new BadRequestException('关闭原因不能为空');
    return this.prisma.db.$transaction(async (tx) => {
      const item = await tx.businessCase.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('业务单不存在');
      if (item.status === CaseStatus.COMPLETED || item.status === CaseStatus.CLOSED) throw new BadRequestException('终态业务单不能关闭');
      await tx.publicCaseLink.updateMany({ where: { caseId: id, disabledAt: null }, data: { disabledAt: new Date() } });
      const updated = await tx.businessCase.update({ where: { id }, data: { status: CaseStatus.CLOSED, closedAt: new Date() } });
      await tx.caseStatusHistory.create({ data: { caseId: id, fromStatus: item.status, toStatus: CaseStatus.CLOSED, actorUserId: actor.userId, reason: reason.trim() } });
      await AuditWriter.append(tx, { data: { actorUserId: actor.userId, action: 'CASE_CLOSED', targetType: 'BusinessCase', targetId: id, detail: { reason: reason.trim() } } });
      return updated;
    });
  }

  async publicView(token: string) {
    const link = await this.tokens.resolve(token);
    const item = await this.detail(link.caseId);
    const snapshot = item.snapshots[0];
    const latestDraft = await this.prisma.db.caseDraft.findFirst({ where: { caseId: item.id }, orderBy: { version: 'desc' } });
    const rejected = new Map(item.reviews.filter((review) => review.decision === 'REJECT').map((review) => [review.requirementVersionId, review.reason]));
    return {
      id: item.id, caseNo: item.caseNumber, customerName: item.customerName, trusteeName: item.factoryDepartment,
      contactName: item.contactName, contactPhone: '', deadline: link.expiresAt.toISOString(), version: latestDraft?.version ?? 0,
      mode: item.status === CaseStatus.NEEDS_SUPPLEMENT ? 'supplement' : 'normal',
      materials: ((snapshot?.materials as any[]) ?? []).map((material, index) => ({ id: `material-${index + 1}`, unit: '件', editable: item.status !== CaseStatus.NEEDS_SUPPLEMENT, ...material })),
      requirements: (snapshot?.requirements ?? []).map(({ requirementVersion }) => {
        const definition = requirementVersion.definition as any;
        const reason = rejected.get(requirementVersion.id);
        return { key: definition.key ?? requirementVersion.requirement.key, label: definition.label ?? requirementVersion.requirement.name, type: String(definition.type ?? 'FILE').toLowerCase(), required: Boolean(definition.required), description: definition.description, rejectionReason: reason ?? undefined, locked: item.status === CaseStatus.NEEDS_SUPPLEMENT && !reason };
      }),
    };
  }

  async savePublicDraft(token: string, body: any, force = false) {
    const baseVersion = Number(body.version ?? body.basedOnVersion ?? 0);
    try {
      return await serializableTransaction(this.prisma.db, async (tx) => {
        const link = await this.tokens.resolveForMutation(tx, token);
        const item = await tx.businessCase.findUnique({ where: { id: link.caseId } });
        if (!item) throw new NotFoundException('业务单不存在');
        if (![CaseStatus.AWAITING_CUSTOMER, CaseStatus.CUSTOMER_EDITING, CaseStatus.NEEDS_SUPPLEMENT].includes(item.status as any)) throw new BadRequestException('当前业务状态不允许此操作');
        const latest = await tx.caseDraft.findFirst({ where: { caseId: item.id }, orderBy: { version: 'desc' } });
        const currentVersion = latest?.version ?? 0;
        if (!force && currentVersion !== baseVersion) throw new DraftVersionConflictError(baseVersion, currentVersion);
        if (item.status === CaseStatus.NEEDS_SUPPLEMENT) await this.assertSupplementOnlyTx(tx, item.id, body.answers ?? {}, latest);
        const version = currentVersion + 1;
        const content = { answers: body.answers ?? {}, materials: body.materials ?? (body.answers?.__materials ?? undefined), fileVersionIds: body.fileVersionIds ?? [] } as Prisma.InputJsonValue;
        const beforeDigest=latest?await this.contentDigestTx(tx,item.id,latest):null;
        const afterDigest=await this.contentDigestTx(tx,item.id,{version,content});
        const contentChanged=beforeDigest!==afterDigest;
        await tx.caseDraft.create({ data: { caseId: item.id, version, baseVersion: force ? currentVersion : baseVersion, content, actorType: ActorType.CUSTOMER } });
        await tx.answerHistory.create({ data: { caseId: item.id, draftVersion: version, answers: (body.answers ?? {}) as Prisma.InputJsonValue, actorType: ActorType.CUSTOMER } });
        if (item.status === CaseStatus.AWAITING_CUSTOMER) {
          await tx.businessCase.update({ where: { id: item.id }, data: { status: CaseStatus.CUSTOMER_EDITING } });
          await tx.caseStatusHistory.create({ data: { caseId: item.id, fromStatus: item.status, toStatus: CaseStatus.CUSTOMER_EDITING, actorUserId: 'CUSTOMER' } });
        }
        if(contentChanged)await tx.signingRecord.updateMany({ where: { caseId: item.id, valid: true }, data: { valid: false, invalidatedAt: new Date(), invalidationReason: '业务内容发生变化' } });
        await AuditWriter.append(tx, { data: { actorType: ActorType.CUSTOMER, action: force ? 'PUBLIC_DRAFT_NEW_VERSION' : 'PUBLIC_DRAFT_SAVED', targetType: 'BusinessCase', targetId: item.id, detail: { baseVersion, version, signingInvalidated: contentChanged } } });
        return { version };
      });
    } catch (error) {
      if (error instanceof DraftVersionConflictError) throw new ConflictException({ status: 409, code: 'DRAFT_VERSION_CONFLICT', serverVersion: error.currentVersion });
      throw error;
    }
  }

  async submitPublic(token: string, body: any, metadata: { ip?: string; userAgent?: string }) {
    if (body.consent !== true || body.declaration !== true) throw new BadRequestException('请确认真实性声明并同意授权');
    if(!this.storage)throw new BadRequestException('文件存储服务暂不可用');
    const verification=await serializableTransaction(this.prisma.db, async (tx) => {
      const link = await this.tokens.resolveForMutation(tx, token);
      await this.lockCaseForUpdate(tx,link.caseId);
      const item = await tx.businessCase.findUnique({ where: { id: link.caseId } });
      if (!item) throw new NotFoundException('业务单不存在');
      if (![CaseStatus.CUSTOMER_EDITING, CaseStatus.NEEDS_SUPPLEMENT, CaseStatus.AWAITING_CUSTOMER].includes(item.status as any)) throw new BadRequestException('当前业务状态不允许此操作');
      const draft = await tx.caseDraft.findFirst({ where: { caseId: item.id }, orderBy: { version: 'desc' } });
      if (!draft) throw new BadRequestException('请先保存最新填写内容');
      const digest = await this.contentDigestTx(tx, item.id, draft);
      const signing = await tx.signingRecord.findFirst({ where: { caseId: item.id, valid: true }, orderBy: { version: 'desc' }, include: { preSignPdfFileVersion: true } });
      if (!signing || signing.version !== Number(body.signingVersion) || signing.contentDigest !== digest || !signing.preSignPdfFileVersion || signing.preSignPdfFileVersion.mimeType !== 'application/pdf' || signing.preSignPdfSha256 !== signing.preSignPdfFileVersion.sha256) throw new BadRequestException('签署已过期，请根据最新内容重新预览并签署');
      return{caseId:item.id,status:item.status,draftVersion:draft.version,digest,signingId:signing.id,signingVersion:signing.version,previewId:signing.preSignPdfFileVersion.id,previewStorageKey:signing.preSignPdfFileVersion.storageKey,previewSha256:signing.preSignPdfSha256};
    });
    const previewBytes=await readAll(await this.storage.read(verification.previewStorageKey));
    if(!previewBytes.length||sha256(previewBytes)!==verification.previewSha256)throw new BadRequestException('签署已过期，请根据最新内容重新预览并签署');
    return serializableTransaction(this.prisma.db,async(tx)=>{
      const link=await this.tokens.resolveForMutation(tx,token);if(link.caseId!==verification.caseId)throw new ConflictException('签署验证期间业务数据已变化');await this.lockCaseForUpdate(tx,link.caseId);
      const item=await tx.businessCase.findUnique({where:{id:verification.caseId}});if(!item||item.status!==verification.status)throw new ConflictException('签署验证期间业务状态已变化');
      const draft=await tx.caseDraft.findFirst({where:{caseId:item.id},orderBy:{version:'desc'}});if(!draft||draft.version!==verification.draftVersion)throw new ConflictException('签署验证期间填写内容已变化');
      const digest=await this.contentDigestTx(tx,item.id,draft);if(digest!==verification.digest)throw new ConflictException('签署验证期间业务内容已变化');
      const signing=await tx.signingRecord.findFirst({where:{id:verification.signingId,caseId:item.id,valid:true},include:{preSignPdfFileVersion:true}});
      if(!signing||signing.version!==verification.signingVersion||signing.contentDigest!==digest||signing.preSignPdfFileVersion?.id!==verification.previewId||signing.preSignPdfSha256!==verification.previewSha256||signing.preSignPdfFileVersion.sha256!==verification.previewSha256)throw new ConflictException('签署验证期间签署记录已变化');
      const target = item.status === CaseStatus.NEEDS_SUPPLEMENT ? CaseStatus.PENDING_REREVIEW : CaseStatus.PENDING_REVIEW;
      const updated = await tx.businessCase.update({ where: { id: item.id }, data: { status: target } });
      await tx.caseStatusHistory.create({ data: { caseId: item.id, fromStatus: item.status, toStatus: target, actorUserId: 'CUSTOMER' } });
      await this.tokens.consumeForMutation(tx, link);
      await AuditWriter.append(tx, { data: { actorType: ActorType.CUSTOMER, action: 'CASE_FORMALLY_SUBMITTED', targetType: 'BusinessCase', targetId: item.id, detail: { draftVersion: draft.version, contentDigest: digest, signingVersion: signing.version, ip: metadata.ip, userAgent: metadata.userAgent } } });
      return { completed: true, status: updated.status };
    });
  }

  async createPresignPreview(token:string) {
    if (!this.previewService || !this.storage) throw new BadRequestException('PDF 生成服务暂不可用');
    const link=await this.tokens.resolve(token);
    const supportsPrepared=typeof this.previewService.prepare==='function'&&typeof this.previewService.renderPrepared==='function';
    const legacyRendered=supportsPrepared?undefined:await this.previewService.render({caseId:link.caseId});
    const prepared=supportsPrepared?await this.previewService.prepare({caseId:link.caseId}):{caseId:link.caseId,draftVersion:legacyRendered!.draftVersion,contentDigest:legacyRendered!.contentDigest,renderInput:legacyRendered!.renderInput??{templateVersionId:'legacy',ast:{type:'page',children:[]},snapshot:{},draftVersion:legacyRendered!.draftVersion},imageResources:[]};
    const cached=supportsPrepared?await this.validPresignCache(link.caseId,prepared.contentDigest):null;
    if(cached)return this.presignResponse(cached,prepared);
    const flightKey=`${link.caseId}:${prepared.contentDigest}`;
    const running=this.previewFlights.get(flightKey);
    if(running)return running;
    const flight=this.renderAndPersistPresign(token,link.caseId,prepared,legacyRendered,supportsPrepared);
    this.previewFlights.set(flightKey,flight);
    try{return await flight;}finally{if(this.previewFlights.get(flightKey)===flight)this.previewFlights.delete(flightKey);}
  }

  private async renderAndPersistPresign(token:string,caseId:string,prepared:CanonicalPresignInput,legacyRendered?:any,verifyCanonical=true) {
    if (!this.previewService || !this.storage) throw new BadRequestException('PDF 生成服务暂不可用');
    const release=this.acquirePreviewRender(`${typeof this.tokens.digest==='function'?this.tokens.digest(token):sha256(token)}:${caseId}`);
    let rendered;
    try{rendered=legacyRendered??await this.previewService.renderPrepared(prepared);}finally{release();}
    const {bytes,contentDigest}=rendered;
    const fileId=randomUUID(); const stored=await this.storage.write(Readable.from(bytes),fileId,'签署前预览.pdf');
    try {
      const persisted=await serializableTransaction(this.prisma.db,async(tx)=>{
        const lockedLink=await this.tokens.resolveForMutation(tx,token);
        if(lockedLink.caseId!==caseId)throw new BadRequestException('公开链接与业务单不匹配');
        if(verifyCanonical){const currentCanonical=await prepareCanonicalPresignInput(tx,caseId);if(currentCanonical.contentDigest!==contentDigest)throw new ConflictException('预签内容已变更，请重新生成');}
        const existing=await tx.fileVersion.findFirst({where:{caseId:lockedLink.caseId,purpose:FilePurpose.PRESIGN_PDF,contentDigest,cacheActive:true,file:{removedAt:null}}});
        if(existing)return{version:existing,ast:prepared.renderInput.ast,reused:true,retiredKeys:[] as string[]};
        const oldPreviews=await tx.fileVersion.findMany({where:{caseId:lockedLink.caseId,purpose:FilePurpose.PRESIGN_PDF,cacheActive:true,file:{removedAt:null}},include:{file:true,preSignPdfs:{select:{id:true},take:1}},orderBy:{createdAt:'desc'}});
        const retired=oldPreviews.slice(2);
        if(retired.length){await tx.fileVersion.updateMany({where:{id:{in:retired.map((entry)=>entry.id)},cacheActive:true},data:{cacheActive:false}});await tx.fileRecord.updateMany({where:{id:{in:retired.map((entry)=>entry.fileId)},caseId:lockedLink.caseId,removedAt:null},data:{removedAt:new Date(),removedBy:'SYSTEM',removeReason:'预签预览缓存轮换'}});}
        const retainedBytes=await evidenceRetainedBytes(tx,lockedLink.caseId);
        if(retainedBytes+bytes.length>CASE_FILE_CAPACITY_BYTES)throw new BadRequestException('业务单文件总容量超过限制');
        const record=await tx.fileRecord.create({data:{id:fileId,caseId:lockedLink.caseId}});
        const version=await tx.fileVersion.create({data:{fileId:record.id,caseId:lockedLink.caseId,version:1,originalName:'签署前预览.pdf',mimeType:'application/pdf',sizeBytes:bytes.length,sha256:stored.sha256,storageKey:stored.storageKey,actorType:ActorType.SYSTEM,purpose:FilePurpose.PRESIGN_PDF,draftVersion:rendered.draftVersion,contentDigest}});
        return{version,ast:prepared.renderInput.ast,reused:false,retiredKeys:retired.filter((entry:any)=>!entry.preSignPdfs?.length).map((entry)=>entry.storageKey)};
      });
      if(persisted.reused)await this.storage.remove(stored.storageKey).catch(()=>undefined);
      await Promise.all(persisted.retiredKeys.filter((key)=>key!==persisted.version.storageKey).map((key)=>this.storage!.remove(key).catch(()=>undefined)));
      return this.presignResponse(persisted.version,{...prepared,draftVersion:persisted.version.draftVersion??rendered.draftVersion});
    }catch(error){await this.storage.remove(stored.storageKey).catch(()=>undefined);throw error;}
  }

  async prepareOrdinarySigning(token: string, body: any, metadata: { ip?: string; userAgent?: string }) {
    if(!this.storage)throw new BadRequestException('文件存储服务暂不可用');
    const verification=await serializableTransaction(this.prisma.db, async (tx) => {
      const link = await this.tokens.resolveForMutation(tx, token);
      await this.lockCaseForUpdate(tx,link.caseId);
      const item = await tx.businessCase.findUnique({ where: { id: link.caseId },include:{templateVersion:true} });
      if (!item || ![CaseStatus.AWAITING_CUSTOMER, CaseStatus.CUSTOMER_EDITING, CaseStatus.NEEDS_SUPPLEMENT].includes(item.status as any)) throw new BadRequestException('当前业务状态不能签署');
      const draft = await tx.caseDraft.findFirst({ where: { caseId: item.id }, orderBy: { version: 'desc' } });
      if (!draft) throw new BadRequestException('请先保存最新内容');
      const contentDigest = await this.contentDigestTx(tx, item.id, draft);
      const command=validateSigningCommand(body,signatureSlots(item.templateVersion.ast));
      const resourceVersion=await tx.fileVersion.findFirst({where:{caseId:item.id,version:command.signatureResourceVersion,OR:[{id:command.signatureResourceId},{fileId:command.signatureResourceId}],purpose:{in:[FilePurpose.HANDWRITTEN,FilePurpose.SEAL_ORIGINAL,FilePurpose.SEAL_PROCESSED]},file:{removedAt:null}}});
      if(!resourceVersion)throw new BadRequestException('签名或印章资源不存在');
      let sealOriginal:any=null;
      if(command.mode==='SEAL'){
        if(!command.sealOriginalFileVersionId)throw new BadRequestException('印章签署必须关联原始印章图片');
        sealOriginal=await tx.fileVersion.findFirst({where:{id:command.sealOriginalFileVersionId,caseId:item.id,purpose:FilePurpose.SEAL_ORIGINAL,file:{removedAt:null}}});
        if(!sealOriginal)throw new BadRequestException('印章原图不存在');
      }
      validateSigningResourceBinding(command.mode,resourceVersion as any,sealOriginal?.id);
      const previewVersion=await tx.fileVersion.findFirst({where:{caseId:item.id,purpose:FilePurpose.PRESIGN_PDF,contentDigest},orderBy:{createdAt:'desc'}});
      if(!previewVersion)throw new BadRequestException('请先根据最新内容重新生成并查看签署前预览');
      return{caseId:item.id,status:item.status,draftVersion:draft.version,contentDigest,command,resource:{id:resourceVersion.id,fileId:resourceVersion.fileId,version:resourceVersion.version,purpose:resourceVersion.purpose,originalFileVersionId:resourceVersion.originalFileVersionId,sha256:resourceVersion.sha256,storageKey:resourceVersion.storageKey},sealOriginal:sealOriginal?{id:sealOriginal.id,sha256:sealOriginal.sha256,storageKey:sealOriginal.storageKey}:null,preview:{id:previewVersion.id,sha256:previewVersion.sha256,storageKey:previewVersion.storageKey}};
    });
    const persistedResource=await readAll(await this.storage.read(verification.resource.storageKey));
    if(!persistedResource.length||sha256(persistedResource)!==verification.resource.sha256)throw new BadRequestException('签名或印章文件校验失败，请重新上传');
    if(verification.resource.purpose===FilePurpose.SEAL_PROCESSED&&verification.sealOriginal){const persistedOriginal=await readAll(await this.storage.read(verification.sealOriginal.storageKey));if(!persistedOriginal.length||sha256(persistedOriginal)!==verification.sealOriginal.sha256)throw new BadRequestException('印章原图文件校验失败，请重新上传');}
    const persistedPreview=await readAll(await this.storage.read(verification.preview.storageKey));if(!persistedPreview.length||sha256(persistedPreview)!==verification.preview.sha256)throw new BadRequestException('签署前预览文件校验失败，请重新生成');
    return serializableTransaction(this.prisma.db,async(tx)=>{
      const link=await this.tokens.resolveForMutation(tx,token);if(link.caseId!==verification.caseId)throw new ConflictException('签署验证期间业务数据已变化');await this.lockCaseForUpdate(tx,link.caseId);
      const item=await tx.businessCase.findUnique({where:{id:verification.caseId},include:{templateVersion:true}});if(!item||item.status!==verification.status)throw new ConflictException('签署验证期间业务状态已变化');
      const draft=await tx.caseDraft.findFirst({where:{caseId:item.id},orderBy:{version:'desc'}});if(!draft||draft.version!==verification.draftVersion)throw new ConflictException('签署验证期间填写内容已变化');
      const contentDigest=await this.contentDigestTx(tx,item.id,draft);if(contentDigest!==verification.contentDigest)throw new ConflictException('签署验证期间业务内容已变化');
      const command=validateSigningCommand(body,signatureSlots(item.templateVersion.ast));if(stable(command)!==stable(verification.command))throw new ConflictException('签署验证期间签署指令已变化');
      const resourceVersion=await tx.fileVersion.findFirst({where:{id:verification.resource.id,caseId:item.id,version:verification.resource.version,purpose:verification.resource.purpose,file:{removedAt:null}}});
      if(!resourceVersion||resourceVersion.sha256!==verification.resource.sha256||resourceVersion.storageKey!==verification.resource.storageKey||resourceVersion.originalFileVersionId!==verification.resource.originalFileVersionId)throw new ConflictException('签署验证期间签署资源已变化');
      const sealOriginal=verification.sealOriginal?await tx.fileVersion.findFirst({where:{id:verification.sealOriginal.id,caseId:item.id,purpose:FilePurpose.SEAL_ORIGINAL,file:{removedAt:null}}}):null;
      if(verification.sealOriginal&&(!sealOriginal||sealOriginal.sha256!==verification.sealOriginal.sha256||sealOriginal.storageKey!==verification.sealOriginal.storageKey))throw new ConflictException('签署验证期间印章原图已变化');
      validateSigningResourceBinding(command.mode,resourceVersion as any,sealOriginal?.id);
      const previewVersion=await tx.fileVersion.findFirst({where:{id:verification.preview.id,caseId:item.id,purpose:FilePurpose.PRESIGN_PDF,contentDigest,file:{removedAt:null}}});if(!previewVersion||previewVersion.sha256!==verification.preview.sha256||previewVersion.storageKey!==verification.preview.storageKey)throw new ConflictException('签署验证期间预览文件已变化');
      await tx.signingRecord.updateMany({ where: { caseId: item.id, valid: true }, data: { valid: false, invalidatedAt: new Date(), invalidationReason: '客户重新签署' } });
      const latest = await tx.signingRecord.aggregate({ where: { caseId: item.id }, _max: { version: true } });
      const signing = await tx.signingRecord.create({ data: {
        caseId: item.id, version: (latest._max.version ?? 0) + 1, draftVersion: draft.version, contentDigest,
        mode: command.mode === 'HANDWRITTEN' ? 'HANDWRITTEN' : 'STAMP_UPLOAD', evidenceMode: 'ORDINARY',
        resourceFileVersionId: resourceVersion.id, preSignPdfFileVersionId: previewVersion.id, preSignPdfSha256: previewVersion.sha256,
        payload: { positions:command.positions,declarationVersion:ORDINARY_SIGNING_DECLARATION_V1,declarationAccepted:true,disclaimer:ORDINARY_SIGNING_DISCLAIMER,resourcePurpose:resourceVersion.purpose,sealOriginalFileVersionId:sealOriginal?.id??null,sealProcessedFileVersionId:resourceVersion.purpose===FilePurpose.SEAL_PROCESSED?resourceVersion.id:null,sealProcessingStatus:command.mode==='SEAL'?(resourceVersion.purpose===FilePurpose.SEAL_PROCESSED?'PROCESSED_CONFIRMED':'ORIGINAL_CONFIRMED'):null },
        clientIp: metadata.ip ?? 'unknown', userAgent: metadata.userAgent ?? 'unknown',
      } });
      await AuditWriter.append(tx, { data: { actorType: ActorType.CUSTOMER, action: 'ORDINARY_SIGNING_PREPARED', targetType: 'BusinessCase', targetId: item.id, detail: { signingVersion: signing.version, draftVersion: draft.version, contentDigest, mode: signing.mode } } });
      return { signingVersion: signing.version, draftVersion: draft.version, contentDigest, evidenceMode: 'ORDINARY' as const, disclaimer: ORDINARY_SIGNING_DISCLAIMER };
    });
  }

  async answerReviewSigningHistory(id: string) {
    await this.assertCaseExists(id);
    const [answers, signings, reviews, statuses] = await Promise.all([
      this.prisma.db.answerHistory.findMany({ where: { caseId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.db.signingRecord.findMany({ where: { caseId: id }, orderBy: { version: 'asc' } }),
      this.prisma.db.reviewHistory.findMany({ where: { caseId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.db.caseStatusHistory.findMany({ where: { caseId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      answers: answers.map((item) => ({ id: item.id, draftVersion: item.draftVersion, actorType: item.actorType, createdAt: item.createdAt })),
      signings: signings.map((item) => ({ id: item.id, version: item.version, draftVersion: item.draftVersion, contentDigest: item.contentDigest, mode: item.mode, evidenceMode: item.evidenceMode, signedAt: item.signedAt, valid: item.valid, invalidatedAt: item.invalidatedAt, invalidationReason: item.invalidationReason })),
      reviews: reviews.map((item) => ({ id: item.id, requirementVersionId: item.requirementVersionId, version: item.version, decision: item.decision, reason: item.reason, reviewerUserId: item.reviewerUserId, createdAt: item.createdAt })),
      statuses,
    };
  }

  async fileHistory(id: string) {
    await this.assertCaseExists(id);
    const rows = await this.fileHistoryRows(id);
    return rows.filter((item) => !this.isSensitiveFile(item)).map((item) => this.fileHistoryMetadata(item));
  }

  async sensitiveFileHistory(id: string) {
    await this.assertCaseExists(id);
    const rows = await this.fileHistoryRows(id);
    return rows.filter((item) => this.isSensitiveFile(item)).map((item) => this.fileHistoryMetadata(item));
  }

  async sensitiveFile(id: string, fileVersionId: string) {
    const file = await this.prisma.db.fileVersion.findUnique({ where: { id: fileVersionId } });
    if (!file || file.caseId !== id) throw new NotFoundException('文件不存在');
    return { caseId: id, fileVersionId, authorized: true };
  }

  private async requireStatus(id: string, statuses: CaseStatus[]) {
    const item = await this.prisma.db.businessCase.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('业务单不存在');
    if (!statuses.includes(item.status)) throw new BadRequestException('当前业务状态不允许此操作');
    return item;
  }

  private async assertCaseExists(id: string) {
    if (!(await this.prisma.db.businessCase.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('业务单不存在');
  }

  private fileHistoryRows(id: string) {
    return this.prisma.db.fileVersion.findMany({
      where: { caseId: id },
      include: { file: { include: { requirementVersion: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private isSensitiveFile(item: { file: { requirementVersion: { definition: unknown } | null } }) {
    return (item.file.requirementVersion?.definition as { sensitive?: unknown } | undefined)?.sensitive === true;
  }

  private fileHistoryMetadata(item: any) {
    return { id: item.id, fileId: item.fileId, requirementVersionId: item.file.requirementVersionId, version: item.version, originalName: item.originalName, mimeType: item.mimeType, sizeBytes: item.sizeBytes, sha256: item.sha256, actorType: item.actorType, createdAt: item.createdAt };
  }

  private async resolveTemplate(reference: string) {
    const value = await this.prisma.db.templateVersion.findFirst({ where: { status: CatalogVersionStatus.PUBLISHED, OR: [{ id: reference }, { template: { key: reference } }] } });
    if (value) return value;
    const fallback = await this.prisma.db.templateVersion.findFirst({ where: { status: CatalogVersionStatus.PUBLISHED }, orderBy: { publishedAt: 'desc' } });
    if (!fallback) throw new BadRequestException('没有可用的已发布授权书模板');
    return fallback;
  }

  private async resolveRequirements(references: string[] | undefined, templateVersionId: string) {
    const configured = await this.prisma.db.templateVersionRequirement.findMany({ where: { templateVersionId }, include: { requirementVersion: { include: { requirement: true } } }, orderBy: { position: 'asc' } });
    const requested = new Set(references ?? configured.map((x) => x.requirementVersionId));
    const selected = configured.filter((x) => requested.has(x.requirementVersionId) || requested.has(x.requirementVersion.requirement.key));
    const mandatory = configured.find((x) => x.requirementVersion.requirement.key === 'authorization_letter');
    if (mandatory && !selected.some((x) => x.requirementVersionId === mandatory.requirementVersionId)) selected.unshift(mandatory);
    if (!selected.length) throw new BadRequestException('至少选择一项资料，授权书为必选');
    return [...new Set(selected.map((x) => x.requirementVersionId))];
  }

  private quotation(raw: any) {
    const source = (raw.quotationSource ?? (raw.quoteReference ? 'URL' : 'MANUAL')) as QuotationSource;
    if (!Object.values(QuotationSource).includes(source)) throw new BadRequestException('报价来源无效');
    return { source, sourceSystem: raw.quotationSourceSystem, reference: raw.quoteReference, snapshot: (raw.quotationSnapshot ?? { reference: raw.quoteReference ?? null }) as Prisma.InputJsonValue };
  }

  private async replaceLink(id: string, expiresAt: Date, actor: Actor, action: string, requireExisting = false) {
    if (Number.isNaN(expiresAt.getTime())) throw new BadRequestException('链接有效期无效');
    const issued = this.tokens.issue();
    const link = await this.prisma.db.$transaction(async (tx) => {
      await tx.businessCase.findUniqueOrThrow({ where: { id } });
      const active = await tx.publicCaseLink.findFirst({ where: { caseId: id, disabledAt: null, consumedAt: null, completedAt: null, expiresAt: { gt: new Date() } } });
      if (requireExisting && !active) throw new NotFoundException('有效链接不存在');
      if (active) {
        const disabled = await tx.publicCaseLink.updateMany({ where: { id: active.id, disabledAt: null, consumedAt: null, completedAt: null }, data: { disabledAt: new Date() } });
        if (disabled.count !== 1) throw new ConflictException({ code: 'LINK_STATE_CHANGED', message: '链接状态已变化，请刷新后重试' });
      }
      const created = await tx.publicCaseLink.create({ data: { caseId: id, tokenHash: issued.tokenHash, expiresAt } });
      await AuditWriter.append(tx, { data: { actorUserId: actor.userId, action, targetType: 'BusinessCase', targetId: id, detail: { expiresAt: expiresAt.toISOString() } } });
      return created;
    });
    return { token: issued.token, expiresAt: link.expiresAt };
  }

  private presignResponse(version:any,prepared:CanonicalPresignInput){
    return {fileVersionId:version.id,draftVersion:version.draftVersion??prepared.draftVersion,contentDigest:prepared.contentDigest,sha256:version.sha256,url:`/public/files/${version.id}`,slots:signatureSlots(prepared.renderInput.ast),disclaimer:ORDINARY_SIGNING_DISCLAIMER};
  }

  private async lockCaseForUpdate(tx:Prisma.TransactionClient,caseId:string){
    if(typeof (tx as any).$queryRawUnsafe==='function')await (tx as any).$queryRawUnsafe('SELECT "id" FROM "BusinessCase" WHERE "id" = $1 FOR UPDATE',caseId);
  }

  private async validPresignCache(caseId:string,contentDigest:string){
    if(!this.storage)return null;
    const version=await this.prisma.db.fileVersion.findFirst({where:{caseId,purpose:FilePurpose.PRESIGN_PDF,contentDigest,cacheActive:true,file:{removedAt:null}},orderBy:{createdAt:'desc'}});
    if(!version)return null;
    try{const bytes=await readAll(await this.storage.read(version.storageKey));if(bytes.length&&sha256(bytes)===version.sha256)return version;}catch{}
    await serializableTransaction(this.prisma.db,async(tx)=>{
      const disabled=await tx.fileVersion.updateMany({where:{id:version.id,cacheActive:true},data:{cacheActive:false}});
      if(disabled.count===1)await tx.fileRecord.updateMany({where:{id:version.fileId,removedAt:null},data:{removedAt:new Date(),removedBy:'SYSTEM',removeReason:'预签缓存损坏或缺失'}});
    });
    await this.storage.remove(version.storageKey).catch(()=>undefined);
    return null;
  }

  private acquirePreviewRender(key:string){
    const now=Date.now();const current=this.previewRenderGates.get(key);
    const state=!current||now-current.startedAt>=60_000?{startedAt:now,attempts:0,active:0}:current;
    if(state.attempts>=6||state.active>=1)throw new HttpException('预签预览生成过于频繁，请稍后重试',HttpStatus.TOO_MANY_REQUESTS);
    state.attempts+=1;state.active+=1;this.previewRenderGates.set(key,state);let released=false;
    return()=>{if(released)return;released=true;state.active=Math.max(0,state.active-1);};
  }

  private async contentDigestTx(tx: Prisma.TransactionClient, caseId: string, draft?: { version: number; content: unknown } | null) {
    return (await prepareCanonicalPresignInput(tx,caseId,draft??undefined)).contentDigest;
  }

  private async assertSupplementOnlyTx(tx: Prisma.TransactionClient, caseId: string, answers: Record<string, unknown>, latest?: { content: unknown } | null) {
    const reviews = await tx.requirementReview.findMany({ where: { caseId } });
    const rejectedIds = new Set(reviews.filter((x) => x.decision === 'REJECT').map((x) => x.requirementVersionId));
    const snapshot = await tx.caseSnapshot.findFirst({ where: { caseId }, include: { requirements: { include: { requirementVersion: { include: { requirement: true } } } } }, orderBy: { version: 'desc' } });
    const allowedKeys = new Set((snapshot?.requirements ?? []).filter((x) => rejectedIds.has(x.requirementVersionId)).flatMap((x) => [x.requirementVersionId, x.requirementVersion.requirement.key]));
    const previous = ((latest?.content as any)?.answers ?? {}) as Record<string, unknown>;
    const changed = Object.keys(answers).filter((key) => !allowedKeys.has(key) && key !== 'materialsVersion' && JSON.stringify(answers[key]) !== JSON.stringify(previous[key]));
    if (changed.length) throw new BadRequestException('补件阶段仅可修改被驳回的资料项');
  }
}
