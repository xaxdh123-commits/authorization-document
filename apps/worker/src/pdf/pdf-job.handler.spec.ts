import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { PdfJobHandler } from './pdf-job.handler.js';

const pdf = Buffer.from('JVBERi0xLjcKJYGBgYEKCjUgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL1R5cGUgL09ialN0bQovTiA0Ci9GaXJzdCAyMAovTGVuZ3RoIDI2OAo+PgpzdHJlYW0KeJzVkk1LxDAQhu/5FXPUy2YyTdNUSkH7cRFhWTy5eAjbsBRkI90W9N87aVbFg3iW8JKPeSZf7yhAINAaMigsaMgzgqoS8vH91YPcuqM/C3k/DmfYcxRhB89CNmE5zaBEXYtvtnGzewlHkZJARfiT2E5hWA5+gqrv+h6xQESjWQaRWu4bVskinnOMLI9Zhb6I14oMMbvlWJ9kipQT4yubX/I77pk1kWkTq22af50bz+rSHvTXfcpayIcwtG72cNXeEJJBi0ZlREo/XfN3TN7N4f8+br3/GE6/vvCHz9HeaPLkYw2sLsudP4dlOrDtzNXxv/wwurvwxlWD3PIy35AFq9XGllxBjHwAk4aPHQplbmRzdHJlYW0KZW5kb2JqCgo2IDAgb2JqCjw8Ci9TaXplIDcKL1Jvb3QgMiAwIFIKL0luZm8gMyAwIFIKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL1R5cGUgL1hSZWYKL0xlbmd0aCAzNAovVyBbIDEgMiAyIF0KL0luZGV4IFsgMCA3IF0KPj4Kc3RyZWFtCnicFcQxDgAgCASwHsbdN/txCB2K7nLZstV24pF8BkOhArYKZW5kc3RyZWFtCmVuZG9iagoKc3RhcnR4cmVmCjM4NgolJUVPRg==','base64');

describe('PdfJobHandler', () => {
  it('persists and re-reads one final PDF per case and business version before publishing', async () => {
    const writes: Buffer[] = [];
    const completed: any[] = [];
    const repository: any = {
      claim: async () => { const bytes=Buffer.from('sig'); return ({ kind: 'claimed', task: { id: 'job-1', caseId: 'case-1', businessVersion: 7, attempts: 1, maxAttempts: 3, leaseToken: 'lease-1', claimGeneration: 1 }, snapshot: { renderInput: {}, placements: [], resource: { bytes, sha256:createHash('sha256').update(bytes).digest('hex') } } }); },
      complete: async (value: any) => { completed.push(value); return { kind: 'completed', fileObjectId:'file-final-1',outbox:{id:'o1',taskId:'job-1',queueName:'authorization-pdf-finalized',generation:1,payload:{jobId:'job-1',caseId:'case-1',businessVersion:7,fileObjectId:'file-final-1',sha256:value.sha256}} }; },journalPending:async()=>undefined,
      fail: async () => undefined,
    };
    const storage: any = {
      writeOnce:async(stream:Readable)=>{const chunks:Buffer[]=[];for await(const c of stream)chunks.push(Buffer.from(c));writes.push(Buffer.concat(chunks));return{storageKey:'staging/job-1/v7.stage',relativePath:'staging/job-1/v7.stage',sha256:'x'};},writeContentAddressed: async (_stream: Readable,sha256:string) => ({ storageKey: `sha256/${sha256}.pdf`, relativePath: `sha256/${sha256}.pdf`, sha256 }),
      readWithLimit: async () => {const bytes=writes[0];return{bytes,sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}} , exists: async () => false, remove: async () => undefined,
    };
    const published: any[] = [];
    const handler = new PdfJobHandler(repository, { renderFinal: async () => pdf } as any, storage, { publishOutbox: async (event: unknown) => published.push(event) } as any);

    const result = await handler.handle({ jobId: 'job-1', caseId: 'case-1', businessVersion: 7 });

    expect(result.status).toBe('SUCCEEDED');
    expect(completed).toHaveLength(1);
    expect(completed[0].leaseToken).toBe('lease-1');
    expect(completed[0].claimGeneration).toBe(1);
    expect(completed[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(published).toEqual([expect.objectContaining({taskId:'job-1',generation:1,payload:expect.objectContaining({jobId:'job-1',caseId:'case-1',businessVersion:7,sha256:completed[0].sha256})})]);
  });

  it('records a bounded retry failure and never publishes an event when rendering fails', async () => {
    const failures: any[] = [];
    const repository: any = {
      claim: async () => { const bytes=Buffer.from('sig'); return ({ kind: 'claimed', task: { id: 'job-1', caseId: 'case-1', businessVersion: 7, attempts: 3, maxAttempts: 3, leaseToken: 'lease-3', claimGeneration: 3 }, snapshot: {resource:{bytes,sha256:createHash('sha256').update(bytes).digest('hex')}} }); },
      complete: async () => { throw new Error('must not complete'); },
      fail: async (value: unknown) => failures.push(value),
    };
    const handler = new PdfJobHandler(repository, { renderFinal: async () => { throw new Error('chrome crashed'); } } as any, {exists:async()=>false} as any, { publishOutbox: async () => { throw new Error('must not publish'); } } as any);
    await expect(handler.handle({ jobId: 'job-1', caseId: 'case-1', businessVersion: 7 })).rejects.toThrow('chrome crashed');
    expect(failures).toEqual([expect.objectContaining({ terminal: true, reason: 'chrome crashed' })]);
    expect(failures[0].leaseToken).toBe('lease-3');
    expect(failures[0].claimGeneration).toBe(3);
  });

  it('leaves duplicate completion delivery to the durable outbox reconciler and cleans stale staging',async()=>{const publishOutbox=vi.fn();const remove=vi.fn(async()=>undefined);const handler=new PdfJobHandler({claim:async()=>({kind:'duplicate',event:{jobId:'job-1',caseId:'case-1',businessVersion:7,fileObjectId:'file-1',sha256:'a'.repeat(64)}}),complete:async()=>{throw new Error('must not complete')},fail:async()=>undefined} as any,{renderFinal:async()=>{throw new Error('must not render')}} as any,{remove} as any,{publishOutbox} as any);await expect(handler.handle({jobId:'job-1',caseId:'case-1',businessVersion:7})).resolves.toEqual({status:'DUPLICATE'});expect(publishOutbox).not.toHaveBeenCalled();expect(remove).toHaveBeenCalledWith('staging/job-1/v7.stage');});
  it('does not acknowledge BUSY claims',async()=>{const handler=new PdfJobHandler({claim:async()=>({kind:'busy'}),complete:async()=>({kind:'duplicate'}),fail:async()=>undefined} as any,{} as any,{} as any,{} as any);await expect(handler.handle({jobId:'j',caseId:'c',businessVersion:1})).rejects.toThrow('PDF_TASK_LEASE_ACTIVE');});
  it('rejects an oversized in-memory signature before rendering',async()=>{const renderFinal=vi.fn();const failures:any[]=[];const bytes=Buffer.alloc(20*1024*1024+1);const handler=new PdfJobHandler({claim:async()=>({kind:'claimed',task:{id:'j',caseId:'c',businessVersion:1,attempts:1,maxAttempts:3,leaseToken:'l',claimGeneration:1},snapshot:{resource:{bytes,sha256:createHash('sha256').update(bytes).digest('hex')}}}),complete:async()=>({kind:'completed'}),fail:async(value:any)=>failures.push(value)} as any,{renderFinal} as any,{} as any,{} as any);await expect(handler.handle({jobId:'j',caseId:'c',businessVersion:1})).rejects.toThrow('SIGNATURE_RESOURCE_SIZE_EXCEEDED');expect(renderFinal).not.toHaveBeenCalled();expect(failures).toHaveLength(1);});
  it('recovers a deterministic staging object and journals it without invoking Chromium again',async()=>{const renderFinal=vi.fn();const journal=vi.fn();const complete=vi.fn(async()=>({kind:'completed',fileObjectId:'f'}));const sha=createHash('sha256').update(pdf).digest('hex');const signature=Buffer.from('sig');const storage:any={exists:vi.fn(async(key:string)=>key.endsWith('.stage')),readWithLimit:vi.fn(async()=>({bytes:pdf,sizeBytes:pdf.length,sha256:sha})),writeOnce:vi.fn(),writeContentAddressed:vi.fn(async()=>({storageKey:`sha256/${sha}.pdf`,relativePath:`sha256/${sha}.pdf`,sha256:sha})),remove:vi.fn()};const repository:any={claim:async()=>({kind:'claimed',task:{id:'j',caseId:'c',businessVersion:2,attempts:2,maxAttempts:3,leaseToken:'l',claimGeneration:2},snapshot:{resource:{bytes:signature,sha256:createHash('sha256').update(signature).digest('hex')}}}),journalPending:journal,complete,fail:vi.fn()};const handler=new PdfJobHandler(repository,{renderFinal} as any,storage,{publishOutbox:vi.fn()} as any);await expect(handler.handle({jobId:'j',caseId:'c',businessVersion:2})).resolves.toMatchObject({status:'SUCCEEDED'});expect(renderFinal).not.toHaveBeenCalled();expect(journal).toHaveBeenCalledWith(expect.objectContaining({storageKey:'staging/j/v2.stage',sha256:sha}));expect(storage.remove).toHaveBeenCalledWith('staging/j/v2.stage');});
});
