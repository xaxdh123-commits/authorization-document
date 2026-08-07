import { CatalogVersionStatus, SignatureMode } from '@prisma/client';
import { AuditRepository } from '../src/database/repositories/audit.repository';
import { CaseRepository } from '../src/database/repositories/case.repository';
import { PrismaService } from '../src/database/prisma.service';
import { CaseService } from '../src/cases/case.service';
import { TokenService } from '../src/cases/token.service';
import { ReviewService } from '../src/review/review.service';

const describeDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeDatabase('real case, public link and review workflow', () => {
  let prisma: PrismaService;
  let repository: CaseRepository;
  let cases: CaseService;
  let reviews: ReviewService;
  let tokens: TokenService;
  let claimCaseId: string;
  let finalizedCaseId: string;
  let workflowTemplateVersionId: string;
  let workflowRequirementVersionId: string;
  let workflowSensitiveRequirementVersionId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    prisma = new PrismaService();
    await prisma.onModuleInit();
    repository = new CaseRepository(prisma);
    const audit = new AuditRepository(prisma);
    tokens = new TokenService(prisma);
    cases = new CaseService(prisma, repository, tokens, audit);
    reviews = new ReviewService(prisma, repository, tokens, audit);
  });
  afterAll(async () => prisma?.onModuleDestroy());

  it('persists create, reject, supplement, rereview and stops at FINALIZING', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const requirement = await prisma.db.requirement.create({ data: { key: `authorization_letter_${suffix}`, name: '授权书' } });
    const requirementVersion = await prisma.db.requirementVersion.create({ data: { requirementId: requirement.id, version: 1, definition: { key: requirement.key, label: '授权书', type: 'FILE', required: true, sensitive: true }, createdBy: 'admin' } });
    await prisma.db.requirementVersion.update({ where: { id: requirementVersion.id }, data: { status: CatalogVersionStatus.PUBLISHED, publishedAt: new Date() } });
    const acceptedRequirement = await prisma.db.requirement.create({ data: { key: `business_license_${suffix}`, name: '营业执照' } });
    const acceptedVersion = await prisma.db.requirementVersion.create({ data: { requirementId: acceptedRequirement.id, version: 1, definition: { key: acceptedRequirement.key, label: '营业执照', type: 'FILE', required: false, sensitive: false }, createdBy: 'admin' } });
    await prisma.db.requirementVersion.update({ where: { id: acceptedVersion.id }, data: { status: CatalogVersionStatus.PUBLISHED, publishedAt: new Date() } });
    const template = await prisma.db.template.create({ data: { key: `workflow_${suffix}`, name: '委托生产授权书' } });
    const templateVersion = await prisma.db.templateVersion.create({ data: { templateId: template.id, version: 1, ast: { type: 'page', children: [] }, signatureMode: SignatureMode.HANDWRITTEN, createdBy: 'admin', requirements: { create: [{ requirementVersionId: requirementVersion.id, position: 0 }, { requirementVersionId: acceptedVersion.id, position: 1 }] } } });
    await prisma.db.templateVersion.update({ where: { id: templateVersion.id }, data: { status: CatalogVersionStatus.PUBLISHED, publishedAt: new Date() } });
    workflowTemplateVersionId = templateVersion.id;
    workflowRequirementVersionId = acceptedVersion.id;
    workflowSensitiveRequirementVersionId = requirementVersion.id;

    const created = await cases.create({ customerName: '品牌方', contactName: '张三', factoryDepartment: '一厂', materials: [{ name: '标签', specification: '10x10', quantity: 100, material: 'PVC', craft: '印刷' }], templateVersionId: templateVersion.id, requirementVersionIds: [requirementVersion.id, acceptedVersion.id], quotationSource: 'LOCAL_STORAGE', quotationSnapshot: { quoteNo: 'Q1' } }, { userId: 'service', departmentId: 'dept' });
    const access = await cases.submitDraft(created.id, { userId: 'service', departmentId: 'dept' });
    await cases.savePublicDraft(access.accessToken, { version: 0, answers: { [requirement.key]: 'v1', [acceptedRequirement.key]: 'accepted-v1' } });
    const initialSigning = await cases.prepareOrdinarySigning(access.accessToken, { version: 1, signature: ordinarySignature('handwritten') }, { ip: '127.0.0.1', userAgent: 'jest' });
    await cases.savePublicDraft(access.accessToken, { version: 1, answers: { [requirement.key]: 'v1-updated', [acceptedRequirement.key]: 'accepted-v1' } });
    await expect(cases.submitPublic(access.accessToken, { consent: true, declaration: true, signingVersion: initialSigning.signingVersion }, { ip: '127.0.0.1', userAgent: 'jest' })).rejects.toThrow('签署已过期');
    const currentSigning = await cases.prepareOrdinarySigning(access.accessToken, { version: 2, signature: ordinarySignature('handwritten') }, { ip: '127.0.0.1', userAgent: 'jest' });
    await cases.submitPublic(access.accessToken, { consent: true, declaration: true, signingVersion: currentSigning.signingVersion }, { ip: '127.0.0.1', userAgent: 'jest' });
    await reviews.claim(created.id, 'reviewer');
    await reviews.reviewItem(created.id, requirementVersion.id, 'REJECT', '请补充盖章页', 'reviewer');
    await reviews.reviewItem(created.id, acceptedVersion.id, 'APPROVE', undefined, 'reviewer');
    const rejected = await reviews.confirm(created.id, 'reviewer') as Awaited<ReturnType<ReviewService['confirm']>> & { supplementToken?: string };
    expect(rejected.status).toBe('NEEDS_SUPPLEMENT');
    expect(rejected.supplementToken).toBeTruthy();
    await expect(reviews.copyRejectionMessage(created.id, 'reviewer', 'https://h5.example/p')).rejects.toMatchObject({ response: { code: 'LINK_ALREADY_ACTIVE' } });
    const supplementToken = rejected.supplementToken!;
    await expect(cases.savePublicDraft(supplementToken, { version: 2, answers: { [requirement.key]: 'v2', [acceptedRequirement.key]: 'changed' } })).rejects.toThrow('仅可修改被驳回');
    await cases.savePublicDraft(supplementToken, { version: 2, answers: { [requirement.key]: 'v2', [acceptedRequirement.key]: 'accepted-v1' } });
    const supplementSigning = await cases.prepareOrdinarySigning(supplementToken, { version: 3, signature: ordinarySignature('seal') }, { ip: '127.0.0.1', userAgent: 'jest' });
    await cases.submitPublic(supplementToken, { consent: true, declaration: true, signingVersion: supplementSigning.signingVersion }, { ip: '127.0.0.1', userAgent: 'jest' });
    await reviews.reviewItem(created.id, requirementVersion.id, 'APPROVE', undefined, 'reviewer');
    const finalized = await reviews.confirm(created.id, 'reviewer');
    finalizedCaseId = created.id;
    expect(finalized.status).toBe('FINALIZING');
    expect(await prisma.db.pdfTask.count({ where: { caseId: created.id, status: 'QUEUED' } })).toBe(1);
    expect(await prisma.db.businessCase.findUniqueOrThrow({ where: { id: created.id } })).not.toMatchObject({ status: 'COMPLETED' });
    expect(await prisma.db.answerHistory.count({ where: { caseId: created.id } })).toBe(3);
    expect(await prisma.db.reviewHistory.count({ where: { caseId: created.id } })).toBe(3);
    expect(await prisma.db.auditEvent.count({ where: { targetId: created.id } })).toBeGreaterThan(1);
    const claimCase = await cases.create({ customerName: '并发领取客户', contactName: '李四', factoryDepartment: '二厂', materials: [{ name: '包装', specification: 'A4', quantity: 1, material: '纸', craft: '印刷' }], templateVersionId: templateVersion.id, requirementVersionIds: [requirementVersion.id] }, { userId: 'service', departmentId: 'dept' });
    claimCaseId = claimCase.id;
    await prisma.db.businessCase.update({ where: { id: claimCaseId }, data: { status: 'PENDING_REVIEW', reviewerUserId: null } });
  });

  it('allows exactly one concurrent reviewer claim', async () => {
    const results = await Promise.allSettled([reviews.claim(claimCaseId, 'r1'), reviews.claim(claimCaseId, 'r2')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('enforces close reason and terminal-state matrix', async () => {
    const create = () => cases.create({ customerName: '关闭矩阵客户', contactName: '张三', factoryDepartment: '一厂', materials: [{ name: '标签', specification: 'A4', quantity: 1, material: '纸', craft: '印刷' }], templateVersionId: workflowTemplateVersionId, requirementVersionIds: [workflowSensitiveRequirementVersionId] }, { userId: 'service', departmentId: 'dept' });
    const closable = await create();
    await expect(cases.close(closable.id, '', { userId: 'service' })).rejects.toThrow('关闭原因不能为空');
    await expect(cases.close(closable.id, '客户取消', { userId: 'service' })).resolves.toMatchObject({ status: 'CLOSED' });
    await expect(cases.close(closable.id, '再次关闭', { userId: 'service' })).rejects.toThrow('终态业务单不能关闭');
    const completed = await create();
    await prisma.db.businessCase.update({ where: { id: completed.id }, data: { status: 'COMPLETED' } });
    await expect(cases.close(completed.id, '不允许', { userId: 'service' })).rejects.toThrow('终态业务单不能关闭');
  });

  it('separates sensitive history, redacts paths and retries PDF_FAILED', async () => {
    await repository.addFileVersion({ caseId: finalizedCaseId, requirementVersionId: workflowRequirementVersionId, originalName: '普通说明.pdf', mimeType: 'application/pdf', sizeBytes: 4, sha256: '1'.repeat(64), storageKey: `workflow/${finalizedCaseId}/ordinary-${Date.now()}`, actorType: 'CUSTOMER' });
    await repository.addFileVersion({ caseId: finalizedCaseId, requirementVersionId: workflowSensitiveRequirementVersionId, originalName: '法人身份证.png', mimeType: 'image/png', sizeBytes: 4, sha256: '2'.repeat(64), storageKey: `workflow/${finalizedCaseId}/sensitive-${Date.now()}`, actorType: 'CUSTOMER' });
    const ordinary = await cases.fileHistory(finalizedCaseId);
    const sensitive = await cases.sensitiveFileHistory(finalizedCaseId);
    expect(ordinary.some((item) => item.originalName === '普通说明.pdf')).toBe(true);
    expect(ordinary.some((item) => item.originalName === '法人身份证.png')).toBe(false);
    expect(sensitive.some((item) => item.originalName === '法人身份证.png')).toBe(true);
    expect(JSON.stringify({ ordinary, sensitive })).not.toContain('storageKey');
    expect(JSON.stringify({ ordinary, sensitive })).not.toContain(`workflow/${finalizedCaseId}`);

    await prisma.db.businessCase.update({ where: { id: finalizedCaseId }, data: { status: 'PDF_FAILED' } });
    await prisma.db.pdfTask.updateMany({ where: { caseId: finalizedCaseId }, data: { status: 'FAILED', failureCode: 'RENDER_FAILED', failureMessage: 'test failure' } });
    await expect(reviews.retryPdf(finalizedCaseId, 'reviewer')).resolves.toEqual({ status: 'FINALIZING' });
    expect(await prisma.db.pdfTask.count({ where: { caseId: finalizedCaseId, status: 'QUEUED' } })).toBeGreaterThan(0);
    expect(await prisma.db.auditEvent.count({ where: { targetId: finalizedCaseId, action: 'PDF_RETRY_QUEUED' } })).toBe(1);
  });

  it('makes all unavailable token states indistinguishable and survives a fresh connection', async () => {
    const errors: unknown[] = [];
    for (const setup of ['unknown', 'expired', 'disabled', 'consumed', 'completed'] as const) {
      let token = `unknown-${Date.now()}`;
      if (setup !== 'unknown') {
        const created = await tokens.create(claimCaseId, setup === 'expired' ? new Date(Date.now() - 1000) : new Date(Date.now() + 60000));
        token = created.token;
        if (setup !== 'expired') await prisma.db.publicCaseLink.update({ where: { id: created.link.id }, data: setup === 'disabled' ? { disabledAt: new Date() } : setup === 'consumed' ? { consumedAt: new Date() } : { completedAt: new Date() } });
      }
      try { await tokens.resolve(token); } catch (error) { errors.push((error as any).getResponse()); }
    }
    expect(errors).toHaveLength(5);
    expect(new Set(errors.map((error) => JSON.stringify(error)))).toEqual(new Set([JSON.stringify({ code: 'LINK_UNAVAILABLE', message: '链接无效或已失效' })]));

    const fresh = new PrismaService();
    await fresh.onModuleInit();
    await expect(fresh.db.businessCase.findUnique({ where: { id: finalizedCaseId } })).resolves.toMatchObject({ status: 'FINALIZING' });
    await fresh.onModuleDestroy();
  });
});

const ordinarySignature = (method: 'handwritten' | 'seal') => ({ method, resource: 'data:image/png;base64,AQ==', x: 62, y: 72, scale: 1 });
