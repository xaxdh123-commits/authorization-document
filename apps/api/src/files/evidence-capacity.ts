import type { Prisma } from '@prisma/client';

export const CASE_FILE_CAPACITY_BYTES = 200 * 1024 * 1024;

/** Active files plus every immutable file retained by a signing record are evidence-bearing bytes. */
export async function evidenceRetainedBytes(tx: Prisma.TransactionClient, caseId: string): Promise<number> {
  const total = await tx.fileVersion.aggregate({
    where: {
      caseId,
      OR: [
        { file: { removedAt: null } },
        { preSignPdfs: { some: {} } },
        { signingResources: { some: {} } },
        { derivedFileVersions: { some: { signingResources: { some: {} } } } },
        { purpose: 'FINAL_PDF' },
      ],
    },
    _sum: { sizeBytes: true },
  });
  return total._sum.sizeBytes ?? 0;
}
