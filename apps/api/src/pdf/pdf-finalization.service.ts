import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { isContentAddressedStorageKey, MAX_FILE_BYTES, validateFileContent, validateReadablePdf, type Storage } from '@auth/storage';
import { STORAGE } from '../files/storage.provider';

export type PdfFinalizedEvent={jobId:string;caseId:string;businessVersion:number;fileObjectId:string;sha256:string};
export type FinalizationInspection={businessVersion:number;materialsApproved:boolean;declarationAccepted:boolean;signingValid:boolean;placementsValid:boolean;pdfReadable:boolean;pdfShaMatches:boolean;storageKey?:string;persistedSha256?:string;dbFingerprint?:string};
export interface PdfFinalizationRepository{inspect(event:PdfFinalizedEvent):Promise<FinalizationInspection>;reinspect(event:PdfFinalizedEvent,dbFingerprint?:string):Promise<FinalizationInspection>;finalize(event:PdfFinalizedEvent,dbFingerprint?:string):Promise<{kind:'completed'|'duplicate'}>;recordDeliveryFailure(event:PdfFinalizedEvent,reason:string,terminal:boolean):Promise<void>}
const storageEvidence=async(storage:Storage,inspection:FinalizationInspection,event:PdfFinalizedEvent)=>{if(!inspection.storageKey)throw new BadRequestException('PDF_FINALIZATION_STORAGE_KEY_MISSING');if(!isContentAddressedStorageKey(inspection.storageKey,event.sha256,'.pdf'))throw new BadRequestException('PDF_FINALIZATION_STORAGE_KEY_SHA_MISMATCH');const result=await storage.readWithLimit(inspection.storageKey,MAX_FILE_BYTES);validateFileContent(result.bytes,'application/pdf');await validateReadablePdf(result.bytes);if(result.sha256!==event.sha256||inspection.persistedSha256!==event.sha256)throw new BadRequestException('PDF_FINALIZATION_STORAGE_CHANGED');return{sha256:result.sha256,sizeBytes:result.sizeBytes,storageKey:inspection.storageKey};};
const dbFailed=(inspection:FinalizationInspection)=>(['materialsApproved','declarationAccepted','signingValid','placementsValid','pdfShaMatches'] as const).filter(key=>!inspection[key]);

@Injectable()
export class PdfFinalizationService{
  constructor(@Inject('PDF_FINALIZATION_REPOSITORY') private readonly repository:PdfFinalizationRepository,@Optional()@Inject(STORAGE) private readonly storage?:Storage){}
  async finalize(event:PdfFinalizedEvent){
    const phase1=await this.repository.inspect(event);
    if(phase1.businessVersion!==event.businessVersion)throw new BadRequestException('PDF_FINALIZATION_VERSION_MISMATCH');
    const failed1=dbFailed(phase1);if(failed1.length)throw new BadRequestException(`PDF_FINALIZATION_GATE_FAILED:${failed1.join(',')}`);
    if(!phase1.storageKey){if(!phase1.pdfReadable)throw new BadRequestException('PDF_FINALIZATION_GATE_FAILED:pdfReadable');return this.repository.finalize(event,phase1.dbFingerprint);}
    if(!this.storage)throw new BadRequestException('PDF_FINALIZATION_STORAGE_UNAVAILABLE');
    let first;try{first=await storageEvidence(this.storage,phase1,event);}catch(error){throw error instanceof BadRequestException?error:new BadRequestException('PDF_FINALIZATION_GATE_FAILED:pdfReadable,pdfShaMatches');}
    const phase2=await this.repository.reinspect(event,phase1.dbFingerprint);
    const failed2=dbFailed(phase2);if(failed2.length)throw new BadRequestException(`PDF_FINALIZATION_PHASE2_GATE_FAILED:${failed2.join(',')}`);
    if(phase2.storageKey!==first.storageKey||phase2.persistedSha256!==first.sha256)throw new BadRequestException('PDF_FINALIZATION_DB_CHANGED');
    let second;try{second=await storageEvidence(this.storage,phase2,event);}catch(error){throw error instanceof BadRequestException?error:new BadRequestException('PDF_FINALIZATION_STORAGE_CHANGED');}
    if(second.sha256!==first.sha256||second.sizeBytes!==first.sizeBytes)throw new BadRequestException('PDF_FINALIZATION_STORAGE_CHANGED');
    return this.repository.finalize(event,phase2.dbFingerprint);
  }
  recordDeliveryFailure(event:PdfFinalizedEvent,reason:string,terminal:boolean){return this.repository.recordDeliveryFailure(event,reason,terminal);}
}
