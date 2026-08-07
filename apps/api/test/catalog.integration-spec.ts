import { PrismaService } from '../src/database/prisma.service';
import { CatalogVersionRepository } from '../src/database/repositories/catalog-version.repository';
import { SettingsRepository } from '../src/database/repositories/settings.repository';
import { TemplatesService } from '../src/templates/templates.service';
import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../src/database/database.module';

const describeDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const signedAst = { type: 'page' as const, children: [{ type: 'signatureSlot' as const, slotId: 'party-a', signer: 'PARTY_A' as const, page: 1, x: 400, y: 700, width: 100, height: 80, required: true }] };

describeDatabase('catalog persistence integration', () => {
  let prisma: PrismaService;
  let catalog: CatalogVersionRepository;
  let authorizationVersionId: string;
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    prisma = new PrismaService();
    await prisma.onModuleInit();
    catalog = new CatalogVersionRepository(prisma);
    const canonical = await prisma.db.requirement.findUnique({ where: { key: 'authorization_letter' }, include: { versions: { where: { status: 'PUBLISHED', disabledAt: null }, take: 1 } } });
    if (canonical?.versions[0]) authorizationVersionId = canonical.versions[0].id;
    else if (canonical) {
      const draft = await catalog.saveRequirementDraft(canonical.id, { key: 'authorization_letter', label: '授权书', type: 'FILE', required: true, validation: { maxFiles: 10, maxFileSizeBytes: 20971520, allowedMimeTypes: ['application/pdf'] } }, 'admin');
      authorizationVersionId = (await catalog.publishRequirement(draft.id, 'admin')).id;
    } else {
      const created = await catalog.createRequirement({ key: 'authorization_letter', name: '授权书', definition: { key: 'authorization_letter', label: '授权书', type: 'FILE', required: true, validation: { maxFiles: 10, maxFileSizeBytes: 20971520, allowedMimeTypes: ['application/pdf'] } } }, 'admin');
      authorizationVersionId = (await catalog.publishRequirement(created.versions[0].id, 'admin')).id;
    }
  });
  afterAll(async () => prisma?.onModuleDestroy());

  it('rejects duplicate machine keys and rolls back the failed mutation audit', async () => {
    const key = `authorization_letter_${suffix}`;
    await catalog.createRequirement({ key, name: '授权书', definition: { key: 'authorization_letter', label: '授权书', type: 'FILE', required: true } }, 'admin');
    await expect(catalog.createRequirement({ key, name: '重复', definition: { key: 'duplicate', label: '重复', type: 'TEXT', required: false } }, 'admin')).rejects.toThrow('字段 key 已存在');
    expect(await prisma.db.auditEvent.count({ where: { action: 'REQUIREMENT_CREATE', detail: { path: ['key'], equals: key } } })).toBe(1);
  });

  it('keeps published versions immutable and disabled versions available to historical references', async () => {
    const requirement = await catalog.createRequirement({ key: `license_${suffix}`, name: '营业执照', definition: { key: `license_${suffix}`, label: '营业执照', type: 'TEXT', required: false } }, 'admin');
    const version = await catalog.publishRequirement(requirement.versions[0].id, 'admin');
    await expect(prisma.db.requirementVersion.update({ where: { id: version.id }, data: { definition: { changed: true } } })).rejects.toThrow();
    const template = await catalog.createTemplate({ key: `template_${suffix}`, name: '委托生产授权书', ast: signedAst, signatureMode: 'HANDWRITTEN', requirementVersionIds: [authorizationVersionId, version.id] }, 'admin');
    const templateVersion = await new TemplatesService(catalog).publish(template.versions[0].id, 'admin');
    const businessCase = await prisma.db.businessCase.create({ data: { caseNumber: `CASE-${suffix}`, customerName: '客户', contactName: '联系人', factoryDepartment: '工厂', templateVersionId: templateVersion.id, ownerUserId: 'admin', departmentId: '100', createdBy: 'admin' } });
    await catalog.disableTemplate(templateVersion.id, 'admin');
    await catalog.disableRequirement(version.id, 'admin');
    const fixed = await prisma.db.templateVersionRequirement.findFirstOrThrow({ where: { templateVersionId: templateVersion.id, requirementVersionId: version.id } });
    expect(fixed.requirementVersionId).toBe(version.id);
    expect((await prisma.db.requirementVersion.findUniqueOrThrow({ where: { id: version.id } })).status).toBe('DISABLED');
    expect((await prisma.db.businessCase.findUniqueOrThrow({ where: { id: businessCase.id } })).templateVersionId).toBe(templateVersion.id);
    expect((await catalog.listSelectableTemplates()).some((item) => item.id === templateVersion.id)).toBe(false);
    expect((await catalog.listSelectableRequirements()).some((item) => item.id === version.id)).toBe(false);
  });

  it('survives a new Nest application context and Prisma connection', async () => {
    const item = await catalog.createRequirement({ key: `restart_${suffix}`, name: '重启测试', definition: { key: `restart_${suffix}`, label: '重启测试', type: 'TEXT', required: false } }, 'admin');
    const first = await NestFactory.createApplicationContext(DatabaseModule, { logger: false });
    await first.close();
    const restarted = await NestFactory.createApplicationContext(DatabaseModule, { logger: false });
    await expect(restarted.get(PrismaService).db.requirement.findUnique({ where: { id: item.id } })).resolves.toMatchObject({ id: item.id });
    await restarted.close();
  });

  it('rejects publish against a draft source without mutating status or writing a publish audit', async () => {
    const draft = await catalog.createRequirement({ key: `draft_source_${suffix}`, name: '草稿来源', definition: { key: `draft_source_${suffix}`, label: '草稿来源', type: 'TEXT', required: false } }, 'admin');
    const template = await catalog.createTemplate({ key: `invalid_template_${suffix}`, name: '无效模板', ast: signedAst, signatureMode: 'HANDWRITTEN', requirementVersionIds: [authorizationVersionId, draft.versions[0].id] }, 'admin');
    const versionId = template.versions[0].id;
    const before = await prisma.db.auditEvent.count({ where: { action: 'TEMPLATE_PUBLISHED', targetId: versionId } });
    await expect(new TemplatesService(catalog).publish(versionId, 'admin')).rejects.toThrow('必须是已发布');
    expect((await prisma.db.templateVersion.findUniqueOrThrow({ where: { id: versionId } })).status).toBe('DRAFT');
    expect(await prisma.db.auditEvent.count({ where: { action: 'TEMPLATE_PUBLISHED', targetId: versionId } })).toBe(before);
  });

  it('does not publish when a referenced requirement is disabled while publication waits for its lock', async () => {
    const requirement = await catalog.createRequirement({ key: `race_source_${suffix}`, name: '并发来源', definition: { key: `race_source_${suffix}`, label: '并发来源', type: 'TEXT', required: false } }, 'admin');
    const source = await catalog.publishRequirement(requirement.versions[0].id, 'admin');
    const template = await catalog.createTemplate({ key: `race_template_${suffix}`, name: '并发模板', ast: signedAst, signatureMode: 'HANDWRITTEN', requirementVersionIds: [authorizationVersionId, source.id] }, 'admin');
    const versionId = template.versions[0].id;
    let releaseDisable!: () => void;
    let reportLocked!: () => void;
    const release = new Promise<void>((resolve) => { releaseDisable = resolve; });
    const locked = new Promise<void>((resolve) => { reportLocked = resolve; });
    const disable = prisma.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RequirementVersion" WHERE id = ${source.id} FOR UPDATE`;
      reportLocked();
      await release;
      await tx.requirementVersion.update({ where: { id: source.id }, data: { status: 'DISABLED', disabledAt: new Date() } });
    });
    await locked;
    const publication = new TemplatesService(catalog).publish(versionId, 'admin').then(() => null, (error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseDisable();
    await disable;
    expect(await publication).toBeTruthy();
    expect((await prisma.db.templateVersion.findUniqueOrThrow({ where: { id: versionId } })).status).toBe('DRAFT');
  });

  it('serializes concurrent template save and publish without deadlock', async () => {
    const template = await catalog.createTemplate({ key: `save_publish_${suffix}`, name: '并发保存发布', ast: signedAst, signatureMode: 'HANDWRITTEN', requirementVersionIds: [authorizationVersionId] }, 'admin');
    const versionId = template.versions[0].id;
    const operations = Promise.allSettled([
      new TemplatesService(catalog).publish(versionId, 'admin'),
      catalog.saveTemplateDraft(template.id, { ast: signedAst, signatureMode: 'HANDWRITTEN', requirementVersionIds: [authorizationVersionId], name: '并发保存发布' }, 'admin'),
    ]);
    const results = await Promise.race([operations, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('catalog concurrency timeout')), 5000))]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await prisma.db.templateVersion.count({ where: { templateId: template.id } })).toBeGreaterThan(0);
  });

  it('serializes concurrent saves started from a published requirement version with explicit outcomes', async () => {
    const requirement = await catalog.createRequirement({ key: `concurrent_requirement_${suffix}`, name: '并发字段', definition: { key: `concurrent_requirement_${suffix}`, label: '并发字段', type: 'TEXT', required: false } }, 'admin');
    await catalog.publishRequirement(requirement.versions[0].id, 'admin');
    const definitions = ['A', 'B'].map((description) => ({ key: `concurrent_requirement_${suffix}`, label: '并发字段', type: 'TEXT', required: false, description }));
    const results = await Promise.allSettled(definitions.map((definition) => catalog.saveRequirementDraft(requirement.id, definition, 'admin')));
    const fulfilled = results.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof catalog.saveRequirementDraft>>> => result.status === 'fulfilled');
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value.version).toBe(2);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ status: 409, response: { fields: expect.arrayContaining([expect.objectContaining({ path: 'version' })]) } });
    expect(await prisma.db.requirementVersion.count({ where: { requirementId: requirement.id } })).toBe(2);
  });

  it('stores masked settings encrypted and never returns plaintext for display', async () => {
    const settings = new SettingsRepository(prisma);
    const key = `nas.password.${suffix}`;
    await settings.setAudited({ key, value: 'plain-secret', masked: true, actorUserId: 'admin' });
    const raw = await prisma.db.systemSetting.findUniqueOrThrow({ where: { key } });
    expect(raw.value).not.toContain('plain-secret');
    expect(await settings.getForDisplay(key)).toMatchObject({ value: '******' });
  });
});
