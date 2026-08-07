import { PrismaService } from '../src/database/prisma.service';
import { CaseRepository } from '../src/database/repositories/case.repository';
import { CatalogRepository } from '../src/database/repositories/catalog.repository';
import { AuditRepository } from '../src/database/repositories/audit.repository';
import { RoleMappingRepository } from '../src/database/repositories/role-mapping.repository';
import { SettingsRepository } from '../src/database/repositories/settings.repository';
import { PdfTaskRepository } from '../src/database/repositories/pdf-task.repository';

const describeDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeDatabase('PostgreSQL workflow persistence', () => {
  let prisma: PrismaService;
  let cases: CaseRepository;
  let catalog: CatalogRepository;
  let audit: AuditRepository;
  let roles: RoleMappingRepository;
  let settings: SettingsRepository;
  let pdfTasks: PdfTaskRepository;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    prisma = new PrismaService();
    await prisma.onModuleInit();
    cases = new CaseRepository(prisma);
    catalog = new CatalogRepository(prisma);
    audit = new AuditRepository(prisma);
    roles = new RoleMappingRepository(prisma);
    settings = new SettingsRepository(prisma);
    pdfTasks = new PdfTaskRepository(prisma);
  });

  afterAll(async () => prisma.onModuleDestroy());

  test('stores immutable requirement and template versions', async () => {
    const requirement = await catalog.createRequirement({
      key: `authorization_letter_${Date.now()}`,
      name: '授权书',
      definition: { key: 'authorization_letter', label: '授权书', type: 'FILE', required: true },
      actorUserId: 'admin',
    });
    const second = await catalog.createRequirementVersion(requirement.id, {
      ...requirement.versions[0].definition as object,
      description: '必须盖章',
    }, 'admin');
    expect(second.version).toBe(2);
    expect(await prisma.db.requirementVersion.count({ where: { requirementId: requirement.id } })).toBe(2);
    await expect(prisma.db.requirementVersion.update({ where: { id: requirement.versions[0].id }, data: { status: 'PUBLISHED' } })).rejects.toThrow();
    await expect(prisma.db.requirementVersion.create({ data: { requirementId: requirement.id, version: 99, status: 'DRAFT', definition: { invalid: true }, createdBy: 'admin', publishedAt: new Date() } })).rejects.toThrow();
    await expect(prisma.db.requirementVersion.create({ data: { requirementId: requirement.id, version: 98, status: 'PUBLISHED', definition: { invalid: true }, createdBy: 'admin', publishedAt: new Date() } })).rejects.toThrow();
    await expect(prisma.db.requirementVersion.create({ data: { requirementId: requirement.id, version: 97, status: 'DISABLED', definition: { invalid: true }, createdBy: 'admin', publishedAt: new Date(), disabledAt: new Date() } })).rejects.toThrow();
    await prisma.db.requirementVersion.update({ where: { id: second.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
    await expect(prisma.db.requirementVersion.update({ where: { id: second.id }, data: { definition: { changed: true } } })).rejects.toThrow();
    await expect(prisma.db.requirementVersion.delete({ where: { id: second.id } })).rejects.toThrow();

    const template = await catalog.createTemplate({
      key: `production_${Date.now()}`,
      name: '委托生产授权书',
      ast: { type: 'page', children: [{ type: 'paragraph', children: [{ type: 'text', text: '授权生产' }] }] },
      signatureMode: 'HANDWRITTEN',
      requirementVersionIds: [second.id],
      actorUserId: 'admin',
    });
    await catalog.publishTemplateVersion(template.versions[0].id, 'admin');
    await expect(prisma.db.templateVersion.create({ data: { templateId: template.id, version: 99, status: 'DRAFT', ast: { type: 'page', children: [] }, signatureMode: 'HANDWRITTEN', createdBy: 'admin', publishedAt: new Date() } })).rejects.toThrow();
    await expect(prisma.db.templateVersion.create({ data: { templateId: template.id, version: 98, status: 'PUBLISHED', ast: { type: 'page', children: [] }, signatureMode: 'HANDWRITTEN', createdBy: 'admin', publishedAt: new Date() } })).rejects.toThrow();
    await expect(prisma.db.templateVersion.create({ data: { templateId: template.id, version: 97, status: 'DISABLED', ast: { type: 'page', children: [] }, signatureMode: 'HANDWRITTEN', createdBy: 'admin', publishedAt: new Date(), disabledAt: new Date() } })).rejects.toThrow();
    expect((await prisma.db.templateVersion.findUniqueOrThrow({ where: { id: template.versions[0].id } })).publishedAt).not.toBeNull();
    await expect(prisma.db.templateVersion.update({ where: { id: template.versions[0].id }, data: { ast: { type: 'page', children: [] } } })).rejects.toThrow();
    await expect(prisma.db.templateVersionRequirement.create({
      data: { templateVersionId: template.versions[0].id, requirementVersionId: requirement.versions[0].id, position: 1 },
    })).rejects.toThrow();
    await expect(prisma.db.templateVersionRequirement.delete({
      where: { templateVersionId_requirementVersionId: { templateVersionId: template.versions[0].id, requirementVersionId: second.id } },
    })).rejects.toThrow();
    await expect(prisma.db.requirement.update({ where: { id: requirement.id }, data: { key: `changed_${Date.now()}`, name: '不可修改' } })).rejects.toThrow();
    await expect(prisma.db.template.update({ where: { id: template.id }, data: { name: '不可修改', description: '不可修改' } })).rejects.toThrow();
    await expect(prisma.db.requirementVersion.update({ where: { id: second.id }, data: { status: 'DISABLED' } })).rejects.toThrow();
    await expect(prisma.db.templateVersion.update({ where: { id: template.versions[0].id }, data: { status: 'DISABLED' } })).rejects.toThrow();
    const disabledRequirement = await prisma.db.requirementVersion.update({ where: { id: second.id }, data: { status: 'DISABLED', disabledAt: new Date() } });
    const disabledTemplate = await prisma.db.templateVersion.update({ where: { id: template.versions[0].id }, data: { status: 'DISABLED', disabledAt: new Date() } });
    expect([disabledRequirement.status, disabledTemplate.status]).toEqual(['DISABLED', 'DISABLED']);
    await expect(prisma.db.requirementVersion.update({ where: { id: second.id }, data: { definition: { changedAfterDisable: true } } })).rejects.toThrow();
    await expect(prisma.db.templateVersion.update({ where: { id: template.versions[0].id }, data: { ast: { type: 'page', children: [] } } })).rejects.toThrow();
  });

  test('creates a case with an immutable business snapshot and canonical transitions', async () => {
    const fixture = await createCatalogFixture(catalog);
    const created = await cases.create({
      customerName: '甲方品牌', contactName: '张三', factoryDepartment: '一厂',
      templateVersionId: fixture.templateVersionId,
      requirementVersionIds: [fixture.requirementVersionId],
      materials: [{ name: '不干胶', specification: '10×10', quantity: 1000, material: 'PVC', craft: '四色印刷' }],
      quotation: { source: 'URL', sourceSystem: 'quotation-system', reference: 'QT-2026-001', snapshot: { totalWithTax: 199.11 } },
      ownerUserId: 'service-1', reviewerUserId: 'reviewer-1', departmentId: 'dept-1', actorUserId: 'admin',
    });
    await cases.transition(created.id, 'DRAFT', 'AWAITING_CUSTOMER', 'admin');
    const snapshot = await prisma.db.caseSnapshot.findFirstOrThrow({ where: { caseId: created.id } });
    expect(snapshot.materials).toEqual(expect.arrayContaining([expect.objectContaining({ name: '不干胶' })]));
    expect(snapshot.quotationReference).toBe('QT-2026-001');
    expect(snapshot.quotationSnapshot).toEqual(expect.objectContaining({ totalWithTax: 199.11 }));
    expect(await prisma.db.caseStatusHistory.count({ where: { caseId: created.id } })).toBe(2);
    await expect(prisma.db.caseSnapshot.update({ where: { id: snapshot.id }, data: { customerName: '不可修改' } })).rejects.toThrow();
    await expect(prisma.db.caseSnapshotRequirement.deleteMany({ where: { caseSnapshotId: snapshot.id } })).rejects.toThrow();
  });

  test('persists only a public-link token hash and lifecycle markers', async () => {
    const fixture = await createCaseFixture(catalog, cases);
    const tokenHash = fixture.caseId.padEnd(64, 'a');
    const link = await cases.createPublicLink({ caseId: fixture.caseId, tokenHash, expiresAt: new Date(Date.now() + 60_000) });
    expect(link.tokenHash).toBe(tokenHash);
    expect(JSON.stringify(link)).not.toContain('plaintext-token');
    await cases.disablePublicLink(link.id, new Date());
    expect((await prisma.db.publicCaseLink.findUniqueOrThrow({ where: { id: link.id } })).disabledAt).not.toBeNull();
  });

  test('persists localStorage quotation provenance as server-side snapshot data', async () => {
    const fixture = await createCaseFixture(catalog, cases, 'LOCAL_STORAGE');
    const snapshot = await prisma.db.caseSnapshot.findUniqueOrThrow({ where: { caseId_version: { caseId: fixture.caseId, version: 1 } } });
    expect(snapshot.quotationSource).toBe('LOCAL_STORAGE');
    expect(snapshot.quotationSnapshot).toEqual({ source: 'localStorage-import' });
    expect(snapshot.frozenAt).not.toBeNull();
  });

  test('keeps versioned drafts, answers, files, signing and review histories', async () => {
    const fixture = await createCaseFixture(catalog, cases);
    const draft = await cases.saveDraft({ caseId: fixture.caseId, baseVersion: 0, answers: { brandName: '示例品牌' }, actorType: 'CUSTOMER' });
    const file = await cases.addFileVersion({ caseId: fixture.caseId, requirementVersionId: fixture.requirementVersionId, originalName: 'license.pdf', mimeType: 'application/pdf', sizeBytes: 42, sha256: 'b'.repeat(64), storageKey: `cases/${fixture.caseId}/license-v1.pdf`, actorType: 'CUSTOMER' });
    const fileV2 = await cases.appendFileVersion({ fileId: file.fileId, caseId: fixture.caseId, originalName: 'license-v2.pdf', mimeType: 'application/pdf', sizeBytes: 43, sha256: 'd'.repeat(64), storageKey: `cases/${fixture.caseId}/license-v2.pdf`, actorType: 'CUSTOMER' });
    const anotherCase = await createCaseFixture(catalog, cases);
    await expect(cases.appendFileVersion({ fileId: file.fileId, caseId: anotherCase.caseId, originalName: 'wrong.pdf', mimeType: 'application/pdf', sizeBytes: 1, sha256: 'e'.repeat(64), storageKey: `cases/${anotherCase.caseId}/wrong.pdf`, actorType: 'CUSTOMER' })).rejects.toThrow('FILE_CASE_MISMATCH');
    const anotherFile = await cases.addFileVersion({ caseId: anotherCase.caseId, originalName: 'other-signature.png', mimeType: 'image/png', sizeBytes: 12, sha256: 'e'.repeat(64), storageKey: `cases/${anotherCase.caseId}/other-signature.png`, actorType: 'CUSTOMER' });
    await expect(cases.recordSigning({ caseId: fixture.caseId, mode: 'HANDWRITTEN', evidenceMode: 'ORDINARY', resourceFileVersionId: anotherFile.id, payload: { slotId: 'party-a' }, preSignPdfFileVersionId: file.id, preSignPdfSha256: 'c'.repeat(64), clientIp: '127.0.0.1', userAgent: 'jest' })).rejects.toThrow('SIGNING_FILE_CASE_MISMATCH');
    await expect(prisma.db.signingRecord.create({ data: { caseId: fixture.caseId, version: 1, draftVersion: 0, contentDigest: '0'.repeat(64), mode: 'HANDWRITTEN', evidenceMode: 'ORDINARY', resourceFileVersionId: anotherFile.id, payload: { slotId: 'party-a' }, preSignPdfFileVersionId: file.id, preSignPdfSha256: 'c'.repeat(64), clientIp: '127.0.0.1', userAgent: 'jest' } })).rejects.toThrow();
    const signing = await cases.recordSigning({ caseId: fixture.caseId, mode: 'HANDWRITTEN', evidenceMode: 'ORDINARY', resourceFileVersionId: file.id, payload: { slotId: 'party-a' }, preSignPdfFileVersionId: file.id, preSignPdfSha256: 'c'.repeat(64), clientIp: '127.0.0.1', userAgent: 'jest' });
    const invalidated = await cases.invalidateSigning(signing.id, { reason: '客户重新提交', invalidatedAt: new Date() });
    expect(invalidated.valid).toBe(false);
    await expect(prisma.db.signingRecord.update({ where: { id: signing.id }, data: { valid: true } })).rejects.toThrow();
    await expect(prisma.db.signingRecord.update({ where: { id: signing.id }, data: { payload: { changed: true } } })).rejects.toThrow();
    await cases.reviewRequirement({ caseId: fixture.caseId, requirementVersionId: fixture.requirementVersionId, decision: 'REJECT', reason: '请补充盖章页', reviewerUserId: 'reviewer-1' });
    expect(draft.version).toBe(1);
    expect(signing.version).toBe(1);
    expect(fileV2.version).toBe(2);
    expect(await prisma.db.answerHistory.count({ where: { caseId: fixture.caseId } })).toBe(1);
    expect(await prisma.db.fileVersion.count({ where: { caseId: fixture.caseId } })).toBe(2);
    expect(await prisma.db.reviewHistory.count({ where: { caseId: fixture.caseId } })).toBe(1);
  });

  test('stores upstream identities, scoped role mappings, audit events and masked settings', async () => {
    const targetId = `example-${Date.now()}-${Math.random()}`;
    await roles.upsertUpstreamUser({ userId: 'reviewer-1', name: '审核员', departmentId: 'dept-1', departmentName: '审核部', roles: ['reviewer'] });
    await roles.upsert({ roleKey: 'reviewer', abilities: ['CASE_READ', 'REVIEW_ITEM'], dataScope: 'DEPT', enabled: true });
    await audit.append({ actorUserId: 'reviewer-1', action: 'CASE_VIEW', targetType: 'CASE', targetId, detail: { source: 'integration-test' } });
    await settings.set({ key: 'upstream.client_secret', value: 'secret-value', masked: true, actorUserId: 'admin' });
    expect((await roles.find('reviewer'))?.dataScope).toBe('DEPT');
    expect((await audit.list({ targetId }))).toHaveLength(1);
    expect((await settings.getForDisplay('upstream.client_secret'))?.value).toBe('******');
    const rawSecret = await prisma.db.systemSetting.findUniqueOrThrow({ where: { key: 'upstream.client_secret' } });
    expect(rawSecret.encryptionVersion).toBe(1);
    expect(rawSecret.encryptionIv).toBeTruthy();
    expect(rawSecret.encryptionTag).toBeTruthy();
    expect(rawSecret.value).not.toContain('secret-value');
    expect((await settings.getInternal('upstream.client_secret'))?.value).toBe('secret-value');
  });

  test('seeds distinct ALL admin, SELF customer-service and DEPT reviewer identities', async () => {
    const customerService = await prisma.db.upstreamUser.findUniqueOrThrow({ where: { id: 'seed-customer-service' } });
    const admin = await prisma.db.roleMapping.findUniqueOrThrow({ where: { roleKey: 'admin' } });
    const service = await prisma.db.roleMapping.findUniqueOrThrow({ where: { roleKey: 'customer_service' } });
    const reviewer = await prisma.db.roleMapping.findUniqueOrThrow({ where: { roleKey: 'reviewer' } });
    expect(customerService.roles).toEqual(['customer_service']);
    expect(customerService.departmentId).toBe('dept-service');
    expect([admin.dataScope, service.dataScope, reviewer.dataScope]).toEqual(['ALL', 'SELF', 'DEPT']);
    expect(service.capabilities).toContain('CASE_ASSIGN_REVIEWER');
    const seededRequirement = await prisma.db.requirementVersion.findUniqueOrThrow({ where: { id: 'reqv-authorization-letter-v1' } });
    const seededTemplate = await prisma.db.templateVersion.findUniqueOrThrow({ where: { id: 'templatev-production-authorization-v1' } });
    expect([seededRequirement.status, seededTemplate.status]).toEqual(['PUBLISHED', 'PUBLISHED']);
    expect([seededRequirement.publishedAt, seededTemplate.publishedAt]).not.toContain(null);
  });

  test('deduplicates PDF tasks and preserves result or failure details', async () => {
    const fixture = await createCaseFixture(catalog, cases);
    const identity = { caseId: fixture.caseId, templateVersionId: fixture.templateVersionId, dataSnapshotVersion: 1, signatureVersion: 1 };
    await expect(pdfTasks.enqueue(identity)).rejects.toThrow();
    const file = await cases.addFileVersion({ caseId: fixture.caseId, originalName: 'pre-sign.pdf', mimeType: 'application/pdf', sizeBytes: 10, sha256: 'f'.repeat(64), storageKey: `cases/${fixture.caseId}/pre-sign.pdf`, actorType: 'SYSTEM' });
    await cases.recordSigning({ caseId: fixture.caseId, mode: 'HANDWRITTEN', evidenceMode: 'ORDINARY', resourceFileVersionId: file.id, payload: { slotId: 'party-a' }, preSignPdfFileVersionId: file.id, preSignPdfSha256: 'f'.repeat(64), clientIp: '127.0.0.1', userAgent: 'jest' });
    const first = await pdfTasks.enqueue(identity);
    const duplicate = await pdfTasks.enqueue(identity);
    expect(duplicate.id).toBe(first.id);
    const otherCase = await createCaseFixture(catalog, cases);
    const otherOutput = await cases.addFileVersion({ caseId: otherCase.caseId, originalName: 'other-output.pdf', mimeType: 'application/pdf', sizeBytes: 10, sha256: 'a'.repeat(64), storageKey: `cases/${otherCase.caseId}/other-output.pdf`, actorType: 'SYSTEM' });
    await expect(pdfTasks.markSucceeded(first.id, { outputFileVersionId: otherOutput.id, outputSha256: 'a'.repeat(64) })).rejects.toThrow('PDF_OUTPUT_FILE_CASE_MISMATCH');
    await expect(prisma.db.pdfTask.update({ where: { id: first.id }, data: { status: 'SUCCEEDED', outputFileVersionId: otherOutput.id, outputSha256: 'a'.repeat(64), finishedAt: new Date() } })).rejects.toThrow();
    await pdfTasks.markFailed(first.id, { failureCode: 'RENDER_FAILED', failureMessage: 'renderer exited' });
    expect((await pdfTasks.findById(first.id))?.failureCode).toBe('RENDER_FAILED');
  });

  test('allocates concurrent versions without duplicates and reports stale drafts as typed conflicts', async () => {
    const fixture = await createCaseFixture(catalog, cases);
    const initial = await cases.addFileVersion({ caseId: fixture.caseId, originalName: 'v1.pdf', mimeType: 'application/pdf', sizeBytes: 1, sha256: '1'.repeat(64), storageKey: `cases/${fixture.caseId}/v1.pdf`, actorType: 'CUSTOMER' });
    const appended = await Promise.all([
      cases.appendFileVersion({ fileId: initial.fileId, caseId: fixture.caseId, originalName: 'v2.pdf', mimeType: 'application/pdf', sizeBytes: 2, sha256: '2'.repeat(64), storageKey: `cases/${fixture.caseId}/v2.pdf`, actorType: 'CUSTOMER' }),
      cases.appendFileVersion({ fileId: initial.fileId, caseId: fixture.caseId, originalName: 'v3.pdf', mimeType: 'application/pdf', sizeBytes: 3, sha256: '3'.repeat(64), storageKey: `cases/${fixture.caseId}/v3.pdf`, actorType: 'CUSTOMER' }),
    ]);
    expect(appended.map((item) => item.version).sort()).toEqual([2, 3]);

    const drafts = await Promise.allSettled([
      cases.saveDraft({ caseId: fixture.caseId, baseVersion: 0, answers: { value: 'a' }, actorType: 'CUSTOMER' }),
      cases.saveDraft({ caseId: fixture.caseId, baseVersion: 0, answers: { value: 'b' }, actorType: 'CUSTOMER' }),
    ]);
    expect(drafts.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const rejected = drafts.find((item) => item.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'DRAFT_VERSION_CONFLICT' });
  });

  test('serializes concurrent catalog, signing and review version allocation', async () => {
    const suffix = `${Date.now()}_${Math.random()}`;
    const requirement = await catalog.createRequirement({ key: `concurrent_${suffix}`, name: '并发资料', definition: { key: `concurrent_${suffix}`, label: '并发资料', type: 'TEXT', required: false }, actorUserId: 'admin' });
    const versions = await Promise.all([
      catalog.createRequirementVersion(requirement.id, { key: `concurrent_${suffix}`, label: '并发资料 A', type: 'TEXT', required: false }, 'admin'),
      catalog.createRequirementVersion(requirement.id, { key: `concurrent_${suffix}`, label: '并发资料 B', type: 'TEXT', required: false }, 'admin'),
    ]);
    expect(versions.map((item) => item.version).sort()).toEqual([2, 3]);

    const fixture = await createCaseFixture(catalog, cases);
    const file = await cases.addFileVersion({ caseId: fixture.caseId, originalName: 'sign.png', mimeType: 'image/png', sizeBytes: 10, sha256: '9'.repeat(64), storageKey: `cases/${fixture.caseId}/sign.png`, actorType: 'CUSTOMER' });
    const signings = await Promise.all([
      cases.recordSigning({ caseId: fixture.caseId, mode: 'HANDWRITTEN', evidenceMode: 'ORDINARY', resourceFileVersionId: file.id, payload: { slotId: 'a' }, preSignPdfFileVersionId: file.id, preSignPdfSha256: '9'.repeat(64), clientIp: '127.0.0.1', userAgent: 'jest' }),
      cases.recordSigning({ caseId: fixture.caseId, mode: 'HANDWRITTEN', evidenceMode: 'ORDINARY', resourceFileVersionId: file.id, payload: { slotId: 'b' }, preSignPdfFileVersionId: file.id, preSignPdfSha256: '9'.repeat(64), clientIp: '127.0.0.1', userAgent: 'jest' }),
    ]);
    expect(signings.map((item) => item.version).sort()).toEqual([1, 2]);

    await Promise.all([
      cases.reviewRequirement({ caseId: fixture.caseId, requirementVersionId: fixture.requirementVersionId, decision: 'APPROVE', reviewerUserId: 'reviewer-1' }),
      cases.reviewRequirement({ caseId: fixture.caseId, requirementVersionId: fixture.requirementVersionId, decision: 'APPROVE', reviewerUserId: 'reviewer-1' }),
    ]);
    expect(await prisma.db.reviewHistory.findMany({ where: { caseId: fixture.caseId }, orderBy: { version: 'asc' }, select: { version: true } })).toEqual([{ version: 1 }, { version: 2 }]);
  });

  test('serializes publication against parent metadata and template membership mutation', async () => {
    const suffix = `${Date.now()}_${Math.random()}`;
    const requirement = await catalog.createRequirement({ key: `publish_lock_${suffix}`, name: '发布锁资料', definition: { key: `publish_lock_${suffix}`, label: '发布锁资料', type: 'TEXT', required: false }, actorUserId: 'admin' });
    const requirementVersionId = requirement.versions[0].id;
    let requirementLockAcquired!: () => void;
    const requirementLocked = new Promise<void>((resolve) => { requirementLockAcquired = resolve; });
    const publishRequirement = prisma.db.$transaction(async (tx) => {
      await tx.requirementVersion.update({ where: { id: requirementVersionId }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
      requirementLockAcquired();
      await tx.$executeRaw`SELECT pg_sleep(0.2)`;
    });
    await requirementLocked;
    const mutateParent = prisma.db.requirement.update({ where: { id: requirement.id }, data: { name: '竞态修改' } });
    const requirementResults = await Promise.allSettled([publishRequirement, mutateParent]);
    expect(requirementResults.map((item) => item.status)).toEqual(['fulfilled', 'rejected']);
    expect((await prisma.db.requirement.findUniqueOrThrow({ where: { id: requirement.id } })).name).toBe('发布锁资料');

    const template = await catalog.createTemplate({ key: `publish_lock_template_${suffix}`, name: '发布锁模板', ast: { type: 'page', children: [] }, signatureMode: 'HANDWRITTEN', requirementVersionIds: [requirementVersionId], actorUserId: 'admin' });
    const templateVersionId = template.versions[0].id;
    let templateLockAcquired!: () => void;
    const templateLocked = new Promise<void>((resolve) => { templateLockAcquired = resolve; });
    const publishTemplate = prisma.db.$transaction(async (tx) => {
      await tx.templateVersion.update({ where: { id: templateVersionId }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
      templateLockAcquired();
      await tx.$executeRaw`SELECT pg_sleep(0.2)`;
    });
    await templateLocked;
    const mutateMembership = prisma.db.templateVersionRequirement.delete({ where: { templateVersionId_requirementVersionId: { templateVersionId, requirementVersionId } } });
    const mutateTemplateParent = prisma.db.template.update({ where: { id: template.id }, data: { name: '竞态模板修改' } });
    const templateResults = await Promise.allSettled([publishTemplate, mutateMembership, mutateTemplateParent]);
    expect(templateResults.map((item) => item.status)).toEqual(['fulfilled', 'rejected', 'rejected']);
    expect(await prisma.db.templateVersionRequirement.count({ where: { templateVersionId } })).toBe(1);
    expect((await prisma.db.template.findUniqueOrThrow({ where: { id: template.id } })).name).toBe('发布锁模板');
  });

  test('uses compare-and-swap for concurrent case transitions', async () => {
    const fixture = await createCaseFixture(catalog, cases);
    const results = await Promise.allSettled([
      cases.transition(fixture.caseId, 'DRAFT', 'AWAITING_CUSTOMER', 'admin'),
      cases.transition(fixture.caseId, 'DRAFT', 'CLOSED', 'admin'),
    ]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((item) => item.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'CASE_STATUS_CONFLICT' });
    expect(await prisma.db.caseStatusHistory.count({ where: { caseId: fixture.caseId } })).toBe(2);
  });

  test('persists records across a fresh Prisma service and repository instance', async () => {
    const targetId = `restart-${Date.now()}-${Math.random()}`;
    const fixture = await createCaseFixture(catalog, cases);
    await audit.append({ actorUserId: 'admin', action: 'PERSISTENCE_CHECK', targetType: 'CASE', targetId, detail: { persisted: true } });
    await settings.set({ key: `persistence.${targetId}`, value: 'kept', masked: false, actorUserId: 'admin' });
    await prisma.onModuleDestroy();

    prisma = new PrismaService();
    await prisma.onModuleInit();
    audit = new AuditRepository(prisma);
    settings = new SettingsRepository(prisma);
    cases = new CaseRepository(prisma);
    catalog = new CatalogRepository(prisma);
    roles = new RoleMappingRepository(prisma);
    pdfTasks = new PdfTaskRepository(prisma);

    expect(await audit.list({ targetId })).toHaveLength(1);
    expect((await settings.getForDisplay(`persistence.${targetId}`))?.value).toBe('kept');
    const persistedSnapshot = await prisma.db.caseSnapshot.findUniqueOrThrow({ where: { caseId_version: { caseId: fixture.caseId, version: 1 } } });
    expect(persistedSnapshot.frozenAt).not.toBeNull();
    expect(persistedSnapshot.quotationSnapshot).toEqual({ source: 'manual-entry' });
  });
});

async function createCatalogFixture(catalog: CatalogRepository) {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const requirement = await catalog.createRequirement({
    key: `authorization_${suffix}`, name: '授权书', actorUserId: 'admin',
    definition: { key: `authorization_${suffix}`, label: '授权书', type: 'FILE', required: true },
  });
  const template = await catalog.createTemplate({
    key: `template_${suffix}`, name: '委托生产授权书', actorUserId: 'admin', signatureMode: 'HANDWRITTEN',
    ast: { type: 'page', children: [] }, requirementVersionIds: [requirement.versions[0].id],
  });
  return { requirementVersionId: requirement.versions[0].id, templateVersionId: template.versions[0].id };
}

async function createCaseFixture(catalog: CatalogRepository, cases: CaseRepository, quotationSource: 'MANUAL' | 'LOCAL_STORAGE' = 'MANUAL') {
  const fixture = await createCatalogFixture(catalog);
  const businessCase = await cases.create({
    customerName: '测试客户', contactName: '联系人', factoryDepartment: '测试工厂',
    materials: [{ name: '物料', specification: 'A4', quantity: 1, material: '纸', craft: '印刷' }],
    quotation: {
      source: quotationSource,
      reference: `${quotationSource.toLowerCase()}-${Date.now()}`,
      snapshot: { source: quotationSource === 'LOCAL_STORAGE' ? 'localStorage-import' : 'manual-entry' },
    },
    ...fixture, requirementVersionIds: [fixture.requirementVersionId],
    ownerUserId: 'service-1', reviewerUserId: 'reviewer-1', departmentId: 'dept-1', actorUserId: 'admin',
  });
  return { caseId: businessCase.id, ...fixture };
}
