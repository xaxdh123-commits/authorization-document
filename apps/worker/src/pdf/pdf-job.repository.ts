import { randomUUID } from 'node:crypto';
import { ActorType,CaseStatus,FilePurpose,FinalizationDeliveryStatus,PdfTaskStatus,Prisma,PrismaClient } from '@prisma/client';
import { computePdfContentDigest,type PdfRenderInput } from '@auth/template-engine';
import { MAX_CASE_BYTES } from '@auth/storage';
import type { FinalRenderInput,SignaturePlacement } from './pdf.renderer.js';
import type { PdfQueueOutboxMessage } from './pdf-finalization.publisher.js';
import { AuditWriter } from '@auth/contracts';

export type ClaimedPdfTask={id:string;caseId:string;businessVersion:number;attempts:number;maxAttempts:number;leaseToken:string;claimGeneration:number};
export type PreparedFinalSnapshot=Omit<FinalRenderInput,'resource'>&{resource:{storageKey:string;mimeType:'image/png'|'image/jpeg';sha256:string;bytes?:Buffer}};
export type PdfClaim={kind:'duplicate';event:{jobId:string;caseId:string;businessVersion:number;fileObjectId:string;sha256:string}}|{kind:'busy'}|{kind:'claimed';task:ClaimedPdfTask;snapshot:PreparedFinalSnapshot};
export interface PdfJobRepository{
  claim(input:{jobId:string;caseId:string;businessVersion:number;leaseSeconds?:number}):Promise<PdfClaim>;
  journalPending(input:{taskId:string;leaseToken:string;claimGeneration:number;storageKey:string;sha256:string;sizeBytes:number}):Promise<void>;
  complete(input:{taskId:string;leaseToken:string;claimGeneration:number;caseId:string;businessVersion:number;storageKey:string;relativePath:string;sizeBytes:number;sha256:string;generatedAt:Date}):Promise<{kind:'completed'|'duplicate';fileObjectId?:string;outbox?:PdfQueueOutboxMessage}>;
  fail(input:{taskId:string;leaseToken:string;claimGeneration:number;reason:string;terminal:boolean;retryAt?:Date}):Promise<void>;
}
const plain=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
export class PrismaPdfJobRepository implements PdfJobRepository{
  constructor(private readonly db:PrismaClient){}
  async claim(input:{jobId:string;caseId:string;businessVersion:number;leaseSeconds?:number}):Promise<PdfClaim>{
    const cutoff=new Date(Date.now()-(input.leaseSeconds??45)*1000);const leaseToken=randomUUID();
    const state=await this.db.$transaction(async tx=>{
      const task=await tx.pdfTask.findUnique({where:{id:input.jobId},include:{businessCase:{select:{status:true}},signing:{select:{valid:true}}}});
      if(!task||task.caseId!==input.caseId||task.dataSnapshotVersion!==input.businessVersion)throw new Error('PDF_JOB_IDENTITY_MISMATCH');
      if(task.businessCase.status!==CaseStatus.FINALIZING)throw new Error('PDF_JOB_CASE_NOT_FINALIZING');
      if(!task.signing.valid)throw new Error('PDF_JOB_SIGNING_INVALID');
      if(task.status===PdfTaskStatus.SUCCEEDED){
        if(!task.outputFileVersionId||!task.outputSha256)throw new Error('PDF_SUCCEEDED_OUTPUT_MISSING');
        return{kind:'duplicate' as const,event:{jobId:task.id,caseId:task.caseId,businessVersion:task.dataSnapshotVersion,fileObjectId:task.outputFileVersionId,sha256:task.outputSha256}};
      }
      const expired=task.status===PdfTaskStatus.PROCESSING&&Boolean(task.startedAt&&task.startedAt<cutoff);
      if(expired&&task.attempts>=task.maxAttempts){
        const reason='PDF_PROCESSING_LEASE_EXPIRED_RETRY_EXHAUSTED';
        const failed=await tx.pdfTask.updateMany({where:{id:task.id,status:PdfTaskStatus.PROCESSING,leaseToken:task.leaseToken,startedAt:task.startedAt},data:{status:PdfTaskStatus.FAILED,leaseToken:null,failureCode:'PDF_RETRY_EXHAUSTED',failureMessage:reason,finishedAt:new Date(),startedAt:null}});
        if(failed.count===1){
          const moved=await tx.businessCase.updateMany({where:{id:task.caseId,status:CaseStatus.FINALIZING},data:{status:CaseStatus.PDF_FAILED}});
          if(moved.count===1)await tx.caseStatusHistory.create({data:{caseId:task.caseId,fromStatus:CaseStatus.FINALIZING,toStatus:CaseStatus.PDF_FAILED,actorUserId:'SYSTEM',reason}});
          await AuditWriter.append(tx as any,{data:{actorType:ActorType.SYSTEM,action:'PDF_GENERATION_FAILED',targetType:'BusinessCase',targetId:task.caseId,detail:{taskId:task.id,reason,attempts:task.attempts} as Prisma.InputJsonValue}});
        }
        return{kind:'busy' as const};
      }
      if(task.status===PdfTaskStatus.FAILED&&task.attempts>=task.maxAttempts)return{kind:'busy' as const};
      const claimed=await tx.pdfTask.updateMany({where:{id:task.id,attempts:{lt:task.maxAttempts},OR:[{status:PdfTaskStatus.QUEUED},{status:PdfTaskStatus.PROCESSING,startedAt:{lt:cutoff}}]},data:{status:PdfTaskStatus.PROCESSING,attempts:{increment:1},claimGeneration:{increment:1},leaseToken,startedAt:new Date(),finishedAt:null}});
      return claimed.count===1?{kind:'claimed' as const}:{kind:'busy' as const};
    });
    if(state.kind!=='claimed')return state;
    try{
      const task=await this.db.pdfTask.findUniqueOrThrow({where:{id:input.jobId},include:{templateVersion:true,dataSnapshot:true,signing:{include:{resourceFileVersion:true}}}});if(task.leaseToken!==leaseToken)throw new Error('PDF_TASK_LEASE_LOST');
      const [draft,files]=await Promise.all([this.db.caseDraft.findUnique({where:{caseId_version:{caseId:input.caseId,version:task.signing.draftVersion}}}),this.db.fileVersion.findMany({where:{caseId:input.caseId,purpose:FilePurpose.MATERIAL,file:{removedAt:null}},include:{file:{include:{requirementVersion:{include:{requirement:true}}}}},orderBy:[{fileId:'asc'},{version:'asc'}]})]);if(!draft)throw new Error('PDF_CANONICAL_DRAFT_MISSING');const content=(draft.content??{}) as Record<string,unknown>;
      const renderInput:PdfRenderInput={templateVersionId:task.templateVersionId,ast:plain(task.templateVersion.ast) as any,snapshot:plain({...task.dataSnapshot,materials:content.materials??task.dataSnapshot.materials}),draftVersion:draft.version,answers:plain((content.answers??{}) as Record<string,unknown>),files:plain(files.map(row=>({id:row.id,fileId:row.fileId,version:row.version,originalName:row.originalName,mimeType:row.mimeType,sizeBytes:row.sizeBytes,sha256:row.sha256,purpose:row.purpose,requirementKey:row.file.requirementVersion?.requirement.key??null}))),contentDigest:task.signing.contentDigest};const {contentDigest:_,...canonical}=renderInput;if(computePdfContentDigest(canonical)!==task.signing.contentDigest)throw new Error('PDF_CANONICAL_CONTENT_DIGEST_MISMATCH');
      const payload=task.signing.payload as any;const placements=(Array.isArray(payload?.positions)?payload.positions:[]) as SignaturePlacement[];const resource=task.signing.resourceFileVersion;if(!['image/png','image/jpeg'].includes(resource.mimeType))throw new Error('SIGNATURE_RESOURCE_TYPE_INVALID');return{kind:'claimed',task:{id:task.id,caseId:task.caseId,businessVersion:task.dataSnapshotVersion,attempts:task.attempts,maxAttempts:task.maxAttempts,leaseToken,claimGeneration:task.claimGeneration},snapshot:{renderInput,placements,resource:{storageKey:resource.storageKey,mimeType:resource.mimeType as any,sha256:resource.sha256}}};
    }catch(error){const task=await this.db.pdfTask.findUnique({where:{id:input.jobId}});await this.fail({taskId:input.jobId,leaseToken,claimGeneration:task?.claimGeneration??-1,reason:error instanceof Error?error.message:'PDF_CLAIM_SNAPSHOT_FAILED',terminal:Boolean(task&&task.attempts>=task.maxAttempts)});throw error;}
  }
  async complete(input:{taskId:string;leaseToken:string;claimGeneration:number;caseId:string;businessVersion:number;storageKey:string;relativePath:string;sizeBytes:number;sha256:string;generatedAt:Date}){return this.db.$transaction(async tx=>{
    const task=await tx.pdfTask.findUniqueOrThrow({where:{id:input.taskId},include:{signing:true}});
    if(task.caseId!==input.caseId||task.dataSnapshotVersion!==input.businessVersion)throw new Error('PDF_COMPLETE_IDENTITY_MISMATCH');
    if(task.status===PdfTaskStatus.SUCCEEDED)return{kind:'duplicate' as const,fileObjectId:task.outputFileVersionId??undefined};
    if(task.status!==PdfTaskStatus.PROCESSING||task.leaseToken!==input.leaseToken||task.claimGeneration!==input.claimGeneration)throw new Error('PDF_COMPLETE_FENCING_REJECTED');
    if(task.pendingSha256!==input.sha256||task.pendingSizeBytes!==input.sizeBytes)throw new Error('PDF_PENDING_JOURNAL_MISMATCH');
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BusinessCase" WHERE "id"=${input.caseId} FOR UPDATE`);
    const retained=await tx.fileVersion.aggregate({where:{caseId:input.caseId,OR:[{file:{removedAt:null}},{preSignPdfs:{some:{}}},{signingResources:{some:{}}},{derivedFileVersions:{some:{signingResources:{some:{}}}}},{purpose:FilePurpose.FINAL_PDF}]},_sum:{sizeBytes:true}});
    if((retained._sum.sizeBytes??0)+input.sizeBytes>MAX_CASE_BYTES)throw new Error('CASE_FILE_CAPACITY_EXCEEDED');
    const record=await tx.fileRecord.create({data:{caseId:input.caseId}});
    const version=await tx.fileVersion.create({data:{fileId:record.id,caseId:input.caseId,version:1,originalName:'authorization.pdf',mimeType:'application/pdf',sizeBytes:input.sizeBytes,sha256:input.sha256,storageKey:input.storageKey,actorType:ActorType.SYSTEM,purpose:FilePurpose.FINAL_PDF,draftVersion:task.signing.draftVersion,contentDigest:task.signing.contentDigest}});
    const generation=task.deliveryGeneration+1;
    const moved=await tx.pdfTask.updateMany({where:{id:task.id,status:PdfTaskStatus.PROCESSING,leaseToken:input.leaseToken,claimGeneration:input.claimGeneration,deliveryGeneration:task.deliveryGeneration,pendingSha256:input.sha256,outputFileVersionId:null},data:{status:PdfTaskStatus.SUCCEEDED,leaseToken:null,outputFileVersionId:version.id,outputSha256:input.sha256,finishedAt:input.generatedAt,failureCode:null,failureMessage:null,finalizationStatus:FinalizationDeliveryStatus.PENDING,finalizationAttempts:0,finalizationFailure:null,finalizationFailedAt:null,finalizedAt:null,deliveryGeneration:generation,pendingStorageKey:null,pendingSha256:null,pendingSizeBytes:null}});
    if(moved.count!==1)throw new Error('PDF_COMPLETE_FENCING_REJECTED');const payload={jobId:task.id,caseId:task.caseId,businessVersion:task.dataSnapshotVersion,fileObjectId:version.id,sha256:input.sha256};const outbox=await tx.pdfQueueOutbox.create({data:{taskId:task.id,queueName:'authorization-pdf-finalized',generation,payload},select:{id:true,taskId:true,queueName:true,generation:true,payload:true}});return{kind:'completed' as const,fileObjectId:version.id,outbox};
  });}
  async journalPending(input:{taskId:string;leaseToken:string;claimGeneration:number;storageKey:string;sha256:string;sizeBytes:number}){const changed=await this.db.pdfTask.updateMany({where:{id:input.taskId,status:PdfTaskStatus.PROCESSING,leaseToken:input.leaseToken,claimGeneration:input.claimGeneration,OR:[{pendingStorageKey:null,pendingSha256:null,pendingSizeBytes:null},{pendingStorageKey:input.storageKey,pendingSha256:input.sha256,pendingSizeBytes:input.sizeBytes}]},data:{pendingStorageKey:input.storageKey,pendingSha256:input.sha256,pendingSizeBytes:input.sizeBytes}});if(changed.count!==1)throw new Error('PDF_PENDING_JOURNAL_FENCING_REJECTED');}
  async fail(input:{taskId:string;leaseToken:string;claimGeneration:number;reason:string;terminal:boolean;retryAt?:Date}){await this.db.$transaction(async tx=>{const task=await tx.pdfTask.findUnique({where:{id:input.taskId}});if(!task||task.status!==PdfTaskStatus.PROCESSING||task.leaseToken!==input.leaseToken||task.claimGeneration!==input.claimGeneration)return;const changed=await tx.pdfTask.updateMany({where:{id:task.id,status:PdfTaskStatus.PROCESSING,leaseToken:input.leaseToken,claimGeneration:input.claimGeneration},data:{status:input.terminal?PdfTaskStatus.FAILED:PdfTaskStatus.QUEUED,leaseToken:null,failureCode:input.terminal?'PDF_RETRY_EXHAUSTED':null,failureMessage:input.terminal?input.reason:null,finishedAt:input.terminal?new Date():null,startedAt:null}});if(changed.count!==1)return;if(!input.terminal){await AuditWriter.append(tx as any,{data:{actorType:ActorType.SYSTEM,action:'PDF_GENERATION_ATTEMPT_FAILED',targetType:'PdfTask',targetId:task.id,detail:{caseId:task.caseId,reason:input.reason,attempts:task.attempts,retryAt:input.retryAt?.toISOString()??null} as Prisma.InputJsonValue}});return;}const moved=await tx.businessCase.updateMany({where:{id:task.caseId,status:CaseStatus.FINALIZING},data:{status:CaseStatus.PDF_FAILED}});if(moved.count===1)await tx.caseStatusHistory.create({data:{caseId:task.caseId,fromStatus:CaseStatus.FINALIZING,toStatus:CaseStatus.PDF_FAILED,actorUserId:'SYSTEM',reason:input.reason}});await AuditWriter.append(tx as any,{data:{actorType:ActorType.SYSTEM,action:'PDF_GENERATION_FAILED',targetType:'BusinessCase',targetId:task.caseId,detail:{taskId:task.id,reason:input.reason,attempts:task.attempts} as Prisma.InputJsonValue}});});}
}
