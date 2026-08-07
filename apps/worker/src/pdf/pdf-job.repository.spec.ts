import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { PrismaPdfJobRepository } from './pdf-job.repository.js';

describe('PrismaPdfJobRepository failure invariants', () => {
  it('keeps failure fields null for a retryable QUEUED task and records the attempt reason in audit', async () => {
    const updateMany = vi.fn(async()=>({count:1}));
    const audit = vi.fn();
    const tx: any = {
      pdfTask: {
        findUnique: vi.fn(async () => ({ id: 'task-1', caseId: 'case-1', status: 'PROCESSING', leaseToken: 'lease-1', claimGeneration: 2, attempts: 1 })),
        updateMany,
      },
      auditEvent: { create: audit },
    };
    const db: any = { $transaction: (work: (value: unknown) => unknown) => work(tx) };

    await new PrismaPdfJobRepository(db).fail({ taskId: 'task-1', leaseToken: 'lease-1', claimGeneration: 2, reason: 'chrome exited', terminal: false });

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ leaseToken:'lease-1',claimGeneration:2 }),data: expect.objectContaining({ status: 'QUEUED', failureCode: null, failureMessage: null }) }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'PDF_GENERATION_ATTEMPT_FAILED', detail: expect.objectContaining({ reason: 'chrome exited', attempts: 1 }) }) }));
  });

  it('rejects an old claim generation even if a lease token is accidentally reused',async()=>{const updateMany=vi.fn();const audit=vi.fn();const tx:any={pdfTask:{findUnique:vi.fn(async()=>({id:'task-1',caseId:'case-1',status:'PROCESSING',leaseToken:'reused',claimGeneration:8,attempts:2})),updateMany},auditEvent:{create:audit}};const db:any={$transaction:(work:(value:unknown)=>unknown)=>work(tx)};await new PrismaPdfJobRepository(db).fail({taskId:'task-1',leaseToken:'reused',claimGeneration:7,reason:'stale',terminal:true});expect(updateMany).not.toHaveBeenCalled();expect(audit).not.toHaveBeenCalled();});
  it('rejects stale completion generation before creating a file even when the token is reused',async()=>{const createRecord=vi.fn();const tx:any={pdfTask:{findUniqueOrThrow:vi.fn(async()=>({id:'task-1',caseId:'case-1',dataSnapshotVersion:4,status:'PROCESSING',leaseToken:'reused',claimGeneration:8,signing:{draftVersion:1,contentDigest:'a'.repeat(64)}}))},fileRecord:{create:createRecord}};const db:any={$transaction:(work:(value:unknown)=>unknown)=>work(tx)};await expect(new PrismaPdfJobRepository(db).complete({taskId:'task-1',leaseToken:'reused',claimGeneration:7,caseId:'case-1',businessVersion:4,storageKey:'k',relativePath:'k',sizeBytes:10,sha256:'b'.repeat(64),generatedAt:new Date()})).rejects.toThrow('PDF_COMPLETE_FENCING_REJECTED');expect(createRecord).not.toHaveBeenCalled();});

  it('locks the case and rejects a final PDF that would exceed retained evidence capacity',async()=>{const createRecord=vi.fn();const lock=vi.fn(async()=>[{id:'case-1'}]);const aggregate=vi.fn(async()=>({_sum:{sizeBytes:200*1024*1024}}));const sha='b'.repeat(64);const tx:any={$queryRaw:lock,pdfTask:{findUniqueOrThrow:vi.fn(async()=>({id:'task-1',caseId:'case-1',dataSnapshotVersion:4,status:'PROCESSING',leaseToken:'lease',claimGeneration:8,pendingSha256:sha,pendingSizeBytes:1,signing:{draftVersion:1,contentDigest:'a'.repeat(64)}}))},fileVersion:{aggregate},fileRecord:{create:createRecord}};const db:any={$transaction:(work:(value:unknown)=>unknown)=>work(tx)};await expect(new PrismaPdfJobRepository(db).complete({taskId:'task-1',leaseToken:'lease',claimGeneration:8,caseId:'case-1',businessVersion:4,storageKey:'k',relativePath:'k',sizeBytes:1,sha256:sha,generatedAt:new Date()})).rejects.toThrow('CASE_FILE_CAPACITY_EXCEEDED');expect(lock).toHaveBeenCalled();expect(aggregate).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({OR:expect.arrayContaining([{purpose:'FINAL_PDF'}])})}));expect(createRecord).not.toHaveBeenCalled();});

  it('ships a database constraint matching the terminal failure-field invariant', () => {
    const migration = readFileSync(fileURLToPath(new URL('../../../../prisma/migrations/202608060004_pdf_failure_invariant/migration.sql', import.meta.url)), 'utf8');
    expect(migration).toContain('PdfTask_failure_fields_terminal_check');
    expect(migration).toMatch(/status.*FAILED.*failure_code.*IS NOT NULL/is);
    expect(migration).toMatch(/status.*<>.*FAILED.*failure_code.*IS NULL/is);
  });
  it.each([{status:'COMPLETED',valid:true,error:'PDF_JOB_CASE_NOT_FINALIZING'},{status:'FINALIZING',valid:false,error:'PDF_JOB_SIGNING_INVALID'}])('refuses claim before rendering when case/signing gate fails',async gate=>{const updateMany=vi.fn();const tx:any={pdfTask:{findUnique:vi.fn(async()=>({id:'j',caseId:'c',dataSnapshotVersion:1,status:'QUEUED',businessCase:{status:gate.status},signing:{valid:gate.valid}})),updateMany}};const db:any={$transaction:(work:any)=>work(tx)};await expect(new PrismaPdfJobRepository(db).claim({jobId:'j',caseId:'c',businessVersion:1})).rejects.toThrow(gate.error);expect(updateMany).not.toHaveBeenCalled();});
});
