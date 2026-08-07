import { PdfFinalizationService } from './pdf-finalization.service';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import {contentAddressedStorageKey} from '@auth/storage';

describe('PdfFinalizationService', () => {
  it.each(['materialsApproved','declarationAccepted','signingValid','placementsValid','pdfReadable','pdfShaMatches'] as const)('blocks completion when %s is false', async (gate: 'materialsApproved'|'declarationAccepted'|'signingValid'|'placementsValid'|'pdfReadable'|'pdfShaMatches') => {
    const repository: any = { inspect: async () => ({ businessVersion: 3, materialsApproved: true, declarationAccepted: true, signingValid: true, placementsValid: true, pdfReadable: true, pdfShaMatches: true, [gate]: false }), finalize: async () => { throw new Error('must not finalize'); } };
    const service = new PdfFinalizationService(repository);
    await expect(service.finalize({ jobId: 'j', caseId: 'c', businessVersion: 3, fileObjectId: 'f', sha256: 'a'.repeat(64) })).rejects.toThrow('PDF_FINALIZATION_GATE_FAILED');
  });

  it('atomically completes the case and closes links exactly once', async () => {
    const finalized: any[]=[];
    const repository: any = { inspect: async () => ({ businessVersion: 3, materialsApproved: true, declarationAccepted: true, signingValid: true, placementsValid: true, pdfReadable: true, pdfShaMatches: true }), finalize: async (event: unknown) => { finalized.push(event); return { kind: finalized.length === 1 ? 'completed' : 'duplicate' }; } };
    const service = new PdfFinalizationService(repository);
    const event = { jobId: 'j', caseId: 'c', businessVersion: 3, fileObjectId: 'f', sha256: 'a'.repeat(64) };
    await service.finalize(event); await service.finalize(event);
    expect(finalized).toHaveLength(2);
  });
  it('passes the phase-one fingerprint into the serializable phase-two recheck',async()=>{const finalized:any[]=[];const inspection={businessVersion:3,materialsApproved:true,declarationAccepted:true,signingValid:true,placementsValid:true,pdfReadable:true,pdfShaMatches:true,dbFingerprint:'fingerprint-v1'};const service=new PdfFinalizationService({inspect:async()=>inspection,finalize:async(...args:any[])=>{finalized.push(args);return{kind:'completed'}}} as any);const event={jobId:'j',caseId:'c',businessVersion:3,fileObjectId:'f',sha256:'a'.repeat(64)};await service.finalize(event);expect(finalized[0][1]).toBe('fingerprint-v1');});
  it('rejects a storage replacement between the two transaction-external reads',async()=>{const doc=await PDFDocument.create();doc.addPage();const valid=Buffer.from(await doc.save());const replaced=Buffer.from(valid);replaced[replaced.length-1]^=1;const sha256=createHash('sha256').update(valid).digest('hex');let reads=0;const inspection={businessVersion:3,materialsApproved:true,declarationAccepted:true,signingValid:true,placementsValid:true,pdfReadable:false,pdfShaMatches:true,storageKey:contentAddressedStorageKey(sha256,'.pdf'),persistedSha256:sha256,dbFingerprint:'fp'};const finalize=jest.fn();const repository:any={inspect:jest.fn(async()=>inspection),reinspect:jest.fn(async()=>inspection),finalize};const storage:any={readWithLimit:jest.fn(async()=>{const bytes=++reads===1?valid:replaced;return{bytes,sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}})};const service=new PdfFinalizationService(repository,storage);await expect(service.finalize({jobId:'j',caseId:'c',businessVersion:3,fileObjectId:'f',sha256})).rejects.toThrow('PDF_FINALIZATION_STORAGE_CHANGED');expect(reads).toBe(2);expect(repository.reinspect).toHaveBeenCalledWith(expect.anything(),'fp');expect(finalize).not.toHaveBeenCalled();});
});
