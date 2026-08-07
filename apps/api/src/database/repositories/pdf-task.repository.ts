import { Injectable } from '@nestjs/common';
import { PdfTaskStatus } from '@prisma/client';
import { createPdfTaskIdempotencyKey, type PdfTaskIdentity } from '@auth/contracts';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PdfTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  enqueue(identity: PdfTaskIdentity) {
    const idempotencyKey = createPdfTaskIdempotencyKey(identity);
    return this.prisma.db.pdfTask.upsert({
      where: { idempotencyKey },
      create: { ...identity, idempotencyKey },
      update: {},
    });
  }

  findById(id: string) {
    return this.prisma.db.pdfTask.findUnique({ where: { id } });
  }

  markFailed(id: string, failure: { failureCode: string; failureMessage: string }) {
    return this.prisma.db.pdfTask.update({ where: { id }, data: { ...failure, status: PdfTaskStatus.FAILED, finishedAt: new Date() } });
  }

  markSucceeded(id: string, output: { outputFileVersionId: string; outputSha256: string }) {
    return this.prisma.db.$transaction(async (tx) => {
      const [task, outputFile] = await Promise.all([
        tx.pdfTask.findUniqueOrThrow({ where: { id } }),
        tx.fileVersion.findUniqueOrThrow({ where: { id: output.outputFileVersionId } }),
      ]);
      if (task.caseId !== outputFile.caseId) throw new Error('PDF_OUTPUT_FILE_CASE_MISMATCH');
      return tx.pdfTask.update({ where: { id }, data: { ...output, status: PdfTaskStatus.SUCCEEDED, finishedAt: new Date(), failureCode: null, failureMessage: null } });
    });
  }
}
