import { Injectable } from '@nestjs/common';
import { PdfFinalizationService, type PdfFinalizedEvent } from './pdf-finalization.service';
export type BossFinalizationJob={id:string;data:PdfFinalizedEvent;retryCount?:number;retryLimit?:number};
@Injectable()
export class PdfFinalizationConsumer{
  constructor(private readonly service:PdfFinalizationService){}
  async consume(job:BossFinalizationJob,acknowledge?:(jobId:string)=>Promise<void>){try{const result=await this.service.finalize(job.data);await acknowledge?.(job.id);return result;}catch(error){const reason=error instanceof Error?error.message:'PDF_FINALIZATION_DELIVERY_FAILED';const terminal=Number.isInteger(job.retryLimit)&&Number(job.retryCount)>=Number(job.retryLimit);await this.service.recordDeliveryFailure(job.data,reason,terminal);throw error;}}
}
