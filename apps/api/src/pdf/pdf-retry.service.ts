import { BadRequestException, Injectable } from '@nestjs/common';
import { CaseStatus, FinalizationDeliveryStatus, PdfTaskStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditWriter } from '../database/repositories/audit-writer';

@Injectable()
export class PdfRetryService {
  constructor(private readonly prisma: PrismaService) {}

  async retry(caseId: string, actorUserId: string, reason?: string) {
    const queued = await this.prisma.db.$transaction(async (tx) => {
      const item = await tx.businessCase.findUniqueOrThrow({ where: { id: caseId } });
      if (item.status !== CaseStatus.PDF_FAILED) throw new BadRequestException('PDF_NOT_IN_FAILED_STATE');
      const task = await tx.pdfTask.findFirst({ where: { caseId }, orderBy: { createdAt: 'desc' } });
      if (!task) throw new BadRequestException('FAILED_PDF_TASK_NOT_FOUND');
      const deliveryRetry = task.status === PdfTaskStatus.SUCCEEDED && task.finalizationStatus === FinalizationDeliveryStatus.FAILED;
      if (!deliveryRetry && task.status !== PdfTaskStatus.FAILED) throw new BadRequestException('FAILED_PDF_TASK_NOT_FOUND');
      if (deliveryRetry && (!task.outputFileVersionId || !task.outputSha256)) throw new BadRequestException('FINALIZED_PDF_OUTPUT_MISSING');
      const updated=deliveryRetry
        ? await tx.pdfTask.update({ where: { id: task.id }, data: { finalizationStatus: FinalizationDeliveryStatus.PENDING, finalizationFailure: null, finalizationFailedAt: null,deliveryGeneration:{increment:1} } })
        : await tx.pdfTask.update({ where: { id: task.id }, data: { status: PdfTaskStatus.QUEUED, attempts: 0, leaseToken: null, failureCode: null, failureMessage: null, startedAt: null, finishedAt: null,queueGeneration:{increment:1} } });
      await tx.businessCase.update({ where: { id: caseId }, data: { status: CaseStatus.FINALIZING } });
      await tx.caseStatusHistory.create({ data: { caseId, fromStatus: CaseStatus.PDF_FAILED, toStatus: CaseStatus.FINALIZING, actorUserId, reason: reason?.trim() } });
      await AuditWriter.append(tx, { data: { actorUserId, action: deliveryRetry ? 'PDF_FINALIZATION_MANUAL_RETRY' : 'PDF_MANUAL_RETRY', targetType: 'BusinessCase', targetId: caseId, detail: { taskId: task.id, reason: reason ?? null } } });
      const queueName=deliveryRetry?'authorization-pdf-finalized':'authorization-pdf-final';const generation=deliveryRetry?updated.deliveryGeneration:updated.queueGeneration;const payload=deliveryRetry?{jobId:task.id,caseId:task.caseId,businessVersion:task.dataSnapshotVersion,fileObjectId:task.outputFileVersionId!,sha256:task.outputSha256!}:{jobId:task.id,caseId:task.caseId,businessVersion:task.dataSnapshotVersion};
      await tx.pdfQueueOutbox.create({data:{taskId:task.id,queueName,generation,payload}});
      return deliveryRetry
        ? { taskId: task.id, status: 'PENDING_FINALIZATION' as const }
        : { taskId: task.id, status: 'QUEUED' as const };
    });
    return queued;
  }
}
