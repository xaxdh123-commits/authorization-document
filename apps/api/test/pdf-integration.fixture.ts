import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { PrismaClient } from '@prisma/client';
import { LocalStorage } from '@auth/storage';
import { computePdfContentDigest, type PdfContentInput } from '@auth/template-engine';
import { PDFDocument } from 'pdf-lib';
export const PDF_FIXTURE_CHINESE_TEXT=['第一页','第二页','甲方','授权书'] as const;

export function requireSafeTestUrl() {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) return undefined;
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (!/(?:_test|-test)$/i.test(name)) throw new Error('Integration database name must end in _test or -test');
  return url;
}

export async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  let value = await read();
  while (!accept(value)) {
    if (Date.now() > end) throw new Error(`Timed out waiting ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    value = await read();
  }
  return value;
}

export async function createPdfFixture(prisma: PrismaClient, root: string, mode: 'SUCCEEDED' | 'QUEUED' = 'SUCCEEDED') {
  const tag = randomUUID().replaceAll('-', '');
  const ids = {
    template: `tpl_${tag}`, templateVersion: `tv_${tag}`, requirement: `req_${tag}`, requirementVersion: `rv_${tag}`,
    caseId: `case_${tag}`, snapshot: `snap_${tag}`, draft: `draft_${tag}`,
    originalRecord: `or_${tag}`, originalVersion: `over_${tag}`, resourceRecord: `rr_${tag}`, resourceVersion: `rver_${tag}`,
    presignRecord: `pr_${tag}`, presignVersion: `pver_${tag}`, finalRecord: `fr_${tag}`, finalVersion: `fver_${tag}`,
    signing: `sign_${tag}`, task: `task_${tag}`, link: `link_${tag}`,
  };
  const ast = { type: 'page', children: [
    { type: 'paragraph', children: [{ type: 'text', text: PDF_FIXTURE_CHINESE_TEXT[0] }] },
    { type: 'signatureSlot', slotId: 'p1', signer: 'PARTY_A', page: 1, x: 10, y: 10, width: 100, height: 60, required: true },
    { type: 'pageBreak' },
    { type: 'paragraph', children: [{ type: 'text', text: PDF_FIXTURE_CHINESE_TEXT[1] }] },
    { type: 'signatureSlot', slotId: 'p2', signer: 'PARTY_A', page: 2, x: 100, y: 100, width: 100, height: 60, required: true },
  ] };

  await prisma.template.create({ data: { id: ids.template, key: `tpl-${tag}`, name: '测试模板' } });
  await prisma.templateVersion.create({ data: { id: ids.templateVersion, templateId: ids.template, version: 1, status: 'DRAFT', ast, signatureMode: 'STAMP_UPLOAD', createdBy: 'test' } });
  await prisma.requirement.create({ data: { id: ids.requirement, key: `req-${tag}`, name: '授权书' } });
  await prisma.requirementVersion.create({ data: { id: ids.requirementVersion, requirementId: ids.requirement, version: 1, status: 'DRAFT', definition: { required: true }, createdBy: 'test' } });
  await prisma.templateVersionRequirement.create({ data: { templateVersionId: ids.templateVersion, requirementVersionId: ids.requirementVersion, position: 0 } });
  const publishedAt = new Date();
  await prisma.requirementVersion.update({ where: { id: ids.requirementVersion }, data: { status: 'PUBLISHED', publishedAt } });
  await prisma.templateVersion.update({ where: { id: ids.templateVersion }, data: { status: 'PUBLISHED', publishedAt } });

  await prisma.businessCase.create({ data: { id: ids.caseId, caseNumber: `CASE-${tag}`, customerName: '甲方', contactName: '张三', factoryDepartment: '工厂', status: 'FINALIZING', templateVersionId: ids.templateVersion, ownerUserId: 'owner', reviewerUserId: 'reviewer', departmentId: 'dept', createdBy: 'owner' } });
  await prisma.caseSnapshot.create({ data: { id: ids.snapshot, caseId: ids.caseId, version: 1, templateVersionId: ids.templateVersion, customerName: '甲方', contactName: '张三', factoryDepartment: '工厂', materials: [], quotationSource: 'MANUAL', quotationSnapshot: {}, createdBy: 'owner' } });
  await prisma.caseSnapshotRequirement.create({ data: { caseSnapshotId: ids.snapshot, requirementVersionId: ids.requirementVersion, position: 0 } });
  await prisma.caseSnapshot.update({ where: { id: ids.snapshot }, data: { frozenAt: new Date() } });
  await prisma.requirementReview.create({ data: { caseId: ids.caseId, requirementVersionId: ids.requirementVersion, decision: 'APPROVE', reviewerUserId: 'reviewer', version: 1 } });
  await prisma.publicCaseLink.create({ data: { id: ids.link, caseId: ids.caseId, tokenHash: `hash-${tag}`, expiresAt: new Date(Date.now() + 86_400_000) } });
  await prisma.caseDraft.create({ data: { id: ids.draft, caseId: ids.caseId, version: 1, baseVersion: 1, content: { materials: [], answers: {} }, actorType: 'CUSTOMER' } });

  const storage = new LocalStorage(root);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJ8AAAAASUVORK5CYII=', 'base64');
  const originalStored = await storage.write(Readable.from(png), ids.originalRecord, 'seal-original.png');
  await prisma.fileRecord.create({ data: { id: ids.originalRecord, caseId: ids.caseId } });
  await prisma.fileVersion.create({ data: { id: ids.originalVersion, fileId: ids.originalRecord, caseId: ids.caseId, version: 1, originalName: 'seal-original.png', mimeType: 'image/png', sizeBytes: png.length, sha256: originalStored.sha256, storageKey: originalStored.storageKey, actorType: 'CUSTOMER', purpose: 'SEAL_ORIGINAL' } });
  const resourceStored = await storage.write(Readable.from(png), ids.resourceRecord, 'seal-processed.png');
  await prisma.fileRecord.create({ data: { id: ids.resourceRecord, caseId: ids.caseId } });
  await prisma.fileVersion.create({ data: { id: ids.resourceVersion, fileId: ids.resourceRecord, caseId: ids.caseId, version: 1, originalName: 'seal-processed.png', mimeType: 'image/png', sizeBytes: png.length, sha256: resourceStored.sha256, storageKey: resourceStored.storageKey, actorType: 'CUSTOMER', purpose: 'SEAL_PROCESSED', originalFileVersionId: ids.originalVersion } });

  const snapshot = await prisma.caseSnapshot.findUniqueOrThrow({ where: { id: ids.snapshot } });
  const renderInput: PdfContentInput = { templateVersionId: ids.templateVersion, ast: ast as any, snapshot: JSON.parse(JSON.stringify({ ...snapshot, materials: [] })), draftVersion: 1, answers: {}, files: [] };
  const digest = computePdfContentDigest(renderInput);
  const doc = await PDFDocument.create(); doc.addPage(); doc.addPage(); const pdf = Buffer.from(await doc.save());
  const preStored = await storage.write(Readable.from(pdf), ids.presignRecord, 'presign.pdf');
  await prisma.fileRecord.create({ data: { id: ids.presignRecord, caseId: ids.caseId } });
  await prisma.fileVersion.create({ data: { id: ids.presignVersion, fileId: ids.presignRecord, caseId: ids.caseId, version: 1, originalName: 'presign.pdf', mimeType: 'application/pdf', sizeBytes: pdf.length, sha256: preStored.sha256, storageKey: preStored.storageKey, actorType: 'SYSTEM', purpose: 'PRESIGN_PDF', draftVersion: 1, contentDigest: digest } });
  await prisma.signingRecord.create({ data: { id: ids.signing, caseId: ids.caseId, version: 1, draftVersion: 1, contentDigest: digest, mode: 'STAMP_UPLOAD', resourceFileVersionId: ids.resourceVersion, payload: { declarationAccepted: true, positions: [{ slotId: 'p1', page: 1, x: 20, y: 20, width: 50, height: 30 }, { slotId: 'p2', page: 2, x: 110, y: 110, width: 50, height: 30 }] }, preSignPdfFileVersionId: ids.presignVersion, preSignPdfSha256: preStored.sha256, clientIp: '127.0.0.1', userAgent: 'integration' } });

  let finalSha: string | undefined;
  if (mode === 'SUCCEEDED') {
    finalSha = createHash('sha256').update(pdf).digest('hex');const finalStored = await storage.writeContentAddressed(Readable.from(pdf),finalSha,'.pdf');
    await prisma.fileRecord.create({ data: { id: ids.finalRecord, caseId: ids.caseId } });
    await prisma.fileVersion.create({ data: { id: ids.finalVersion, fileId: ids.finalRecord, caseId: ids.caseId, version: 1, originalName: 'authorization.pdf', mimeType: 'application/pdf', sizeBytes: pdf.length, sha256: finalStored.sha256, storageKey: finalStored.storageKey, actorType: 'SYSTEM', purpose: 'FINAL_PDF', draftVersion: 1, contentDigest: digest } });
  }
  await prisma.pdfTask.create({ data: { id: ids.task, caseId: ids.caseId, templateVersionId: ids.templateVersion, dataSnapshotVersion: 1, signatureVersion: 1, idempotencyKey: `pdf-${tag}`, status: mode, outputFileVersionId: mode === 'SUCCEEDED' ? ids.finalVersion : undefined, outputSha256: finalSha, finishedAt: mode === 'SUCCEEDED' ? new Date() : undefined } });
  return { ids, root, event: { jobId: ids.task, caseId: ids.caseId, businessVersion: 1, fileObjectId: ids.finalVersion, sha256: finalSha! }, digest };
}
