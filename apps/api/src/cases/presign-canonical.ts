import { BadRequestException } from '@nestjs/common';
import { CatalogVersionStatus, FilePurpose, type Prisma } from '@prisma/client';
import { computePdfContentDigest, type PdfContentInput } from '@auth/template-engine';

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type PresignImageResource = {
  id: string;
  fileId: string;
  requirementKey?: string;
  mimeType: string;
  sha256: string;
  storageKey: string;
};

export type CanonicalPresignInput = {
  caseId: string;
  draftVersion: number;
  contentDigest: string;
  renderInput: PdfContentInput;
  imageResources: PresignImageResource[];
};

/** Builds the one canonical digest input used by preview and signing. It never reads storage. */
export async function prepareCanonicalPresignInput(
  tx: Prisma.TransactionClient,
  caseId: string,
  requestedDraft?: number | { version: number; content: unknown },
): Promise<CanonicalPresignInput> {
  const draftVersion=typeof requestedDraft==='number'?requestedDraft:requestedDraft?.version;
  const item = await tx.businessCase.findUnique({
    where: { id: caseId },
    include: {
      templateVersion: true,
      snapshots: { orderBy: { version: 'desc' }, take: 1 },
      drafts: { ...(draftVersion ? { where: { version: draftVersion } } : {}), orderBy: { version: 'desc' }, take: 1 },
      fileVersions: {
        include: { file: { include: { requirementVersion: { include: { requirement: true } } } } },
        orderBy: [{ fileId: 'asc' }, { version: 'asc' }],
      },
    },
  });
  const snapshot = item?.snapshots?.[0] ?? await tx.caseSnapshot.findFirst({ where: { caseId }, orderBy: { version: 'desc' } });
  const draft = typeof requestedDraft==='object'?requestedDraft:item?.drafts?.[0] ?? await tx.caseDraft.findFirst({ where: { caseId, ...(draftVersion ? { version: draftVersion } : {}) }, orderBy: { version: 'desc' } });
  if (!item || !snapshot || !draft) throw new BadRequestException('签署预览所需的固定版本数据不完整');
  if (item.templateVersion.status && item.templateVersion.status !== CatalogVersionStatus.PUBLISHED) throw new BadRequestException('授权书模板版本未发布');

  const content = (draft.content ?? {}) as Record<string, unknown>;
  const rows = item.fileVersions ?? await tx.fileVersion.findMany({ where: { caseId, purpose: FilePurpose.MATERIAL }, include: { file: { include: { requirementVersion: { include: { requirement: true } } } } }, orderBy: [{ fileId: 'asc' }, { version: 'asc' }] });
  const active = rows.filter((row) => row.purpose === FilePurpose.MATERIAL && !row.file?.removedAt);
  const files = active.map((row) => ({
    id: row.id,
    fileId: row.fileId,
    version: row.version,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    purpose: row.purpose,
    requirementKey: row.file?.requirementVersion?.requirement?.key ?? null,
  }));
  const renderInput: PdfContentInput = {
    templateVersionId: item.templateVersion.id,
    ast: plain(item.templateVersion.ast) as PdfContentInput['ast'],
    snapshot: plain({ ...snapshot, materials: content.materials ?? snapshot.materials }) as Record<string, unknown>,
    draftVersion: draft.version,
    answers: plain((content.answers ?? {}) as Record<string, unknown>),
    files: plain(files),
  };
  return {
    caseId,
    draftVersion: draft.version,
    contentDigest: computePdfContentDigest(renderInput),
    renderInput,
    imageResources: active.map((row) => ({
      id: row.id,
      fileId: row.fileId,
      requirementKey: row.file?.requirementVersion?.requirement?.key,
      mimeType: row.mimeType,
      sha256: row.sha256,
      storageKey: row.storageKey,
    })),
  };
}
