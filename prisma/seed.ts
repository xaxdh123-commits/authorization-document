import { CatalogVersionStatus, CaseStatus, DataScope, Prisma, PrismaClient, SignatureMode } from '@prisma/client';

const prisma = new PrismaClient();

const requirementSeeds = [
  {
    id: 'req-authorization-letter', versionId: 'reqv-authorization-letter-v1', key: 'authorization_letter', name: '盖章授权书',
    definition: { key: 'authorization_letter', label: '盖章授权书', type: 'FILE', required: true, sensitive: true, description: '下载系统生成的授权书，签署或盖章后上传', validation: { maxFiles: 1, maxFileSizeBytes: 20 * 1024 * 1024, allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'] } },
  },
  {
    id: 'req-business-license', versionId: 'reqv-business-license-v1', key: 'business_license', name: '营业执照',
    definition: { key: 'business_license', label: '营业执照', type: 'FILE', required: false, sensitive: true, validation: { maxFiles: 10, maxFileSizeBytes: 20 * 1024 * 1024, allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'] } },
  },
  {
    id: 'req-trademark-certificate', versionId: 'reqv-trademark-certificate-v1', key: 'trademark_certificate', name: '商标注册证',
    definition: { key: 'trademark_certificate', label: '商标注册证', type: 'FILE', required: false, validation: { maxFiles: 10, maxFileSizeBytes: 20 * 1024 * 1024, allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'] } },
  },
  {
    id: 'req-brand-authorization-chain', versionId: 'reqv-brand-authorization-chain-v1', key: 'brand_authorization_chain', name: '品牌授权链',
    definition: { key: 'brand_authorization_chain', label: '品牌授权链', type: 'FILE', required: false, sensitive: true, validation: { maxFiles: 10, maxFileSizeBytes: 20 * 1024 * 1024, allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'] } },
  },
  {
    id: 'req-legal-representative-id', versionId: 'reqv-legal-representative-id-v1', key: 'legal_representative_id', name: '法人身份证',
    definition: { key: 'legal_representative_id', label: '法人身份证', type: 'IMAGE', required: false, sensitive: true, validation: { maxFiles: 2, maxFileSizeBytes: 20 * 1024 * 1024, allowedMimeTypes: ['image/png', 'image/jpeg'] } },
  },
];

export async function seed() {
  await prisma.$transaction(async (tx) => {
    await tx.upstreamDepartment.upsert({ where: { id: 'dept-service' }, create: { id: 'dept-service', name: '客服部' }, update: { name: '客服部' } });
    await tx.upstreamDepartment.upsert({ where: { id: 'dept-review' }, create: { id: 'dept-review', name: '审核部' }, update: { name: '审核部' } });
    await tx.upstreamUser.upsert({
      where: { id: '1' },
      create: { id: '1', name: '若依', departmentId: 'dept-service', departmentName: '客服部', roles: ['admin'] },
      update: { name: '若依', departmentId: 'dept-service', departmentName: '客服部', roles: ['admin'], active: true },
    });
    await tx.upstreamUser.upsert({
      where: { id: 'seed-reviewer' },
      create: { id: 'seed-reviewer', name: '示例审核员', departmentId: 'dept-review', departmentName: '审核部', roles: ['reviewer'] },
      update: { name: '示例审核员', departmentId: 'dept-review', departmentName: '审核部', roles: ['reviewer'], active: true },
    });
    await tx.upstreamUser.upsert({
      where: { id: 'seed-customer-service' },
      create: { id: 'seed-customer-service', name: '示例客服', departmentId: 'dept-service', departmentName: '客服部', roles: ['customer_service'] },
      update: { name: '示例客服', departmentId: 'dept-service', departmentName: '客服部', roles: ['customer_service'], active: true },
    });

    await tx.roleMapping.upsert({
      where: { roleKey: 'admin' },
      create: { roleKey: 'admin', capabilities: ['*:*:*'], dataScope: DataScope.ALL },
      update: { capabilities: ['*:*:*'], dataScope: DataScope.ALL, enabled: true },
    });
    await tx.roleMapping.upsert({
      where: { roleKey: 'customer_service' },
      create: { roleKey: 'customer_service', capabilities: ['CASE_READ', 'CASE_CREATE', 'CASE_EDIT_DRAFT', 'CASE_MANAGE_LINK', 'CASE_ASSIGN_REVIEWER', 'CASE_CLOSE'], dataScope: DataScope.SELF },
      update: { capabilities: ['CASE_READ', 'CASE_CREATE', 'CASE_EDIT_DRAFT', 'CASE_MANAGE_LINK', 'CASE_ASSIGN_REVIEWER', 'CASE_CLOSE'], dataScope: DataScope.SELF, enabled: true },
    });
    await tx.roleMapping.upsert({
      where: { roleKey: 'reviewer' },
      create: { roleKey: 'reviewer', capabilities: ['CASE_READ', 'FILE_READ', 'REVIEW_ITEM', 'REVIEW_CONFIRM', 'CASE_CLOSE', 'PDF_RETRY'], dataScope: DataScope.DEPT },
      update: { capabilities: ['CASE_READ', 'FILE_READ', 'REVIEW_ITEM', 'REVIEW_CONFIRM', 'CASE_CLOSE', 'PDF_RETRY'], dataScope: DataScope.DEPT, enabled: true },
    });

    for (const item of requirementSeeds) {
      const requirement = await tx.requirement.findUnique({ where: { id: item.id } });
      if (!requirement) await tx.requirement.create({ data: { id: item.id, key: item.key, name: item.name } });
      const requirementVersion = await tx.requirementVersion.findUnique({ where: { id: item.versionId } });
      if (!requirementVersion) {
        await tx.requirementVersion.create({
          data: { id: item.versionId, requirementId: item.id, version: 1, status: CatalogVersionStatus.DRAFT, definition: item.definition, createdBy: '1' },
        });
        await tx.requirementVersion.update({
          where: { id: item.versionId },
          data: { status: CatalogVersionStatus.PUBLISHED, publishedAt: new Date('2026-08-05T00:00:00.000Z') },
        });
      } else {
        await tx.requirementVersion.update({ where: { id: item.versionId }, data: { definition: item.definition } });
      }
    }

    const template = await tx.template.findUnique({ where: { id: 'template-production-authorization' } });
    if (!template) {
      await tx.template.create({
        data: { id: 'template-production-authorization', key: 'production_authorization', name: '委托生产物料授权书', description: '客户授权公司或指定工厂生产物料' },
      });
    }
    const templateVersion = await tx.templateVersion.findUnique({ where: { id: 'templatev-production-authorization-v1' } });
    if (!templateVersion) {
      await tx.templateVersion.create({ data: {
        id: 'templatev-production-authorization-v1', templateId: 'template-production-authorization', version: 1,
        status: CatalogVersionStatus.DRAFT, signatureMode: SignatureMode.HANDWRITTEN, createdBy: '1',
        ast: { type: 'page', children: [
          { type: 'heading', level: 1, children: [{ type: 'text', text: '委托生产物料授权书' }] },
          { type: 'paragraph', children: [{ type: 'text', text: '甲方授权乙方按照确认资料生产下列物料。' }] },
          { type: 'loopTable', source: 'materials', columns: [{ header: '物料名称', variable: 'name' }, { header: '规格', variable: 'specification' }, { header: '数量', variable: 'quantity' }] },
          { type: 'signatureSlot', slotId: 'party-a', signer: 'PARTY_A', page: 1, x: 360, y: 650, width: 120, height: 80, required: true },
        ] },
      } });
      for (const [position, item] of requirementSeeds.entries()) {
        await tx.templateVersionRequirement.create({
          data: { templateVersionId: 'templatev-production-authorization-v1', requirementVersionId: item.versionId, position },
        });
      }
      await tx.templateVersion.update({
        where: { id: 'templatev-production-authorization-v1' },
        data: { status: CatalogVersionStatus.PUBLISHED, publishedAt: new Date('2026-08-05T00:00:00.000Z') },
      });
    }

    await upsertExampleCase(tx, 'seed-case-two-materials', 'WT-SEED-002', makeMaterials(2));
    await upsertExampleCase(tx, 'seed-case-twenty-materials', 'WT-SEED-020', makeMaterials(20));
  });
}

function makeMaterials(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `示例物料${index + 1}`, specification: index % 2 ? 'A4' : '10×10cm', quantity: (index + 1) * 100,
    material: index % 2 ? '铜版纸' : 'PVC不干胶', craft: index % 2 ? '覆膜' : '四色印刷、模切',
  }));
}

async function upsertExampleCase(tx: Prisma.TransactionClient, id: string, caseNumber: string, materials: ReturnType<typeof makeMaterials>) {
  await tx.businessCase.upsert({
    where: { id },
    create: { id, caseNumber, customerName: '示例品牌方', contactName: '张三', factoryDepartment: '系统部门', status: CaseStatus.DRAFT, templateVersionId: 'templatev-production-authorization-v1', ownerUserId: '1', reviewerUserId: 'seed-reviewer', departmentId: 'dept-service', createdBy: '1' },
    update: { customerName: '示例品牌方', contactName: '张三', factoryDepartment: '系统部门' },
  });
  const snapshot = await tx.caseSnapshot.findUnique({ where: { caseId_version: { caseId: id, version: 1 } } });
  if (!snapshot) {
    await tx.caseSnapshot.create({
      data: {
        id: `${id}-snapshot-v1`, caseId: id, version: 1, templateVersionId: 'templatev-production-authorization-v1',
        customerName: '示例品牌方', contactName: '张三', factoryDepartment: '系统部门', materials, createdBy: '1',
        quotationSource: 'UPSTREAM_SYSTEM', quotationSourceSystem: 'quotation-system', quotationReference: `${caseNumber}-QUOTE`,
        quotationSnapshot: { quotationNumber: `${caseNumber}-QUOTE`, source: 'seed', materialCount: materials.length },
      },
    });
    for (const [position, item] of requirementSeeds.entries()) {
      await tx.caseSnapshotRequirement.create({
        data: { caseSnapshotId: `${id}-snapshot-v1`, requirementVersionId: item.versionId, position },
      });
    }
    await tx.caseSnapshot.update({ where: { id: `${id}-snapshot-v1` }, data: { frozenAt: new Date('2026-08-05T00:00:00.000Z') } });
  }
  const statusEvent = await tx.caseStatusHistory.findUnique({ where: { id: `${id}-status-draft` } });
  if (!statusEvent) {
    await tx.caseStatusHistory.create({ data: { id: `${id}-status-draft`, caseId: id, toStatus: CaseStatus.DRAFT, actorUserId: '1' } });
  }
}

seed()
  .then(() => console.log('测试数据初始化完成'))
  .finally(() => prisma.$disconnect());
