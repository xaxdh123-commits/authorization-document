import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { MAX_FILE_BYTES, validateFileContent, validateReadablePdf, type Storage } from '@auth/storage';
import type { PdfJob } from './queue.js';
import type { PdfJobRepository } from './pdf-job.repository.js';
import type { PdfRenderer } from './pdf.renderer.js';
import type { PdfFinalizationPublisher } from './pdf-finalization.publisher.js';

const readAll=async(stream:Readable)=>{const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks)};
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

export class PdfJobHandler{
  constructor(private readonly repository:PdfJobRepository,private readonly renderer:PdfRenderer,private readonly storage:Storage,private readonly publisher:PdfFinalizationPublisher){}
  async handle(job:PdfJob){
    const claim=await this.repository.claim(job);if(claim.kind==='duplicate'){await this.storage.remove(`staging/${job.jobId}/v${job.businessVersion}.stage`).catch(()=>undefined);return{status:'DUPLICATE'};}if(claim.kind==='busy')throw new Error('PDF_TASK_LEASE_ACTIVE');
    let completedDurably=false;
    try{
      const signatureBytes=claim.snapshot.resource.bytes??(await this.storage.readWithLimit(claim.snapshot.resource.storageKey,MAX_FILE_BYTES)).bytes;if(signatureBytes.length>MAX_FILE_BYTES)throw new Error('SIGNATURE_RESOURCE_SIZE_EXCEEDED');if(digest(signatureBytes)!==claim.snapshot.resource.sha256)throw new Error('SIGNATURE_RESOURCE_SHA_MISMATCH');
      const stagingKey=`staging/${job.jobId}/v${job.businessVersion}.stage`;let bytes:Buffer;
      if(await this.storage.exists(stagingKey)){const recovered=await this.storage.readWithLimit(stagingKey,MAX_FILE_BYTES);bytes=recovered.bytes;}else{bytes=await this.renderer.renderFinal({...claim.snapshot,resource:{...claim.snapshot.resource,bytes:signatureBytes}});validateFileContent(bytes,'application/pdf');await validateReadablePdf(bytes);if(bytes.length>MAX_FILE_BYTES)throw new Error('FINAL_PDF_SIZE_EXCEEDED');await this.storage.writeOnce(Readable.from(bytes),stagingKey,MAX_FILE_BYTES);const delay=process.env.NODE_ENV!=='production'?Number(process.env.PDF_STAGING_JOURNAL_DELAY_MS??0):0;if(Number.isFinite(delay)&&delay>0)await new Promise(resolve=>setTimeout(resolve,Math.min(delay,120_000)));const staged=await this.storage.readWithLimit(stagingKey,MAX_FILE_BYTES);bytes=staged.bytes;}
      validateFileContent(bytes,'application/pdf');await validateReadablePdf(bytes);if(bytes.length>MAX_FILE_BYTES)throw new Error('FINAL_PDF_SIZE_EXCEEDED');const expected=digest(bytes);await this.repository.journalPending({taskId:claim.task.id,leaseToken:claim.task.leaseToken,claimGeneration:claim.task.claimGeneration,storageKey:stagingKey,sha256:expected,sizeBytes:bytes.length});const stored=await this.storage.writeContentAddressed(Readable.from(bytes),expected,'.pdf');
      const rereadResult=await this.storage.readWithLimit(stored.storageKey,MAX_FILE_BYTES);const reread=rereadResult.bytes;validateFileContent(reread,'application/pdf');await validateReadablePdf(reread);if(rereadResult.sha256!==expected||stored.sha256!==expected)throw new Error('FINAL_PDF_STORAGE_SHA_MISMATCH');
      const completed=await this.repository.complete({taskId:claim.task.id,leaseToken:claim.task.leaseToken,claimGeneration:claim.task.claimGeneration,caseId:job.caseId,businessVersion:job.businessVersion,storageKey:stored.storageKey,relativePath:stored.relativePath,sizeBytes:reread.length,sha256:expected,generatedAt:new Date()});
      if(completed.kind==='duplicate')return{status:'DUPLICATE'};
      if(!completed.fileObjectId)throw new Error('FINAL_PDF_FILE_RECORD_MISSING');
      completedDurably=true;
      if(completed.outbox)await this.publisher.publishOutbox(completed.outbox);
      await this.storage.remove(stagingKey);
      return{status:'SUCCEEDED',sha256:expected,fileObjectId:completed.fileObjectId};
    }catch(error){const reason=error instanceof Error?error.message:'UNKNOWN_PDF_FAILURE';const terminal=claim.task.attempts>=claim.task.maxAttempts;if(!completedDurably)await this.repository.fail({taskId:claim.task.id,leaseToken:claim.task.leaseToken,claimGeneration:claim.task.claimGeneration,reason,terminal,retryAt:terminal?undefined:new Date(Date.now()+Math.min(60_000,2**claim.task.attempts*1000))});throw error;}
  }
}
