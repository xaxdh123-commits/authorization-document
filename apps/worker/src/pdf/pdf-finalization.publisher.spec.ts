import {describe,expect,it,vi} from 'vitest';
import {PdfFinalizationPublisher} from './pdf-finalization.publisher.js';

describe('durable PDF queue outbox publisher',()=>{
  const row={id:'o1',taskId:'job-1',queueName:'authorization-pdf-finalized',generation:3,payload:{jobId:'job-1'}};
  it('uses task:generation and marks published only after a non-null boss id',async()=>{const mark=vi.fn();const boss={send:vi.fn(async()=> 'boss-new')};const store:any={pending:vi.fn(async()=>[row]),markPublished:mark,recordFailure:vi.fn()};await new PdfFinalizationPublisher(boss as any,store).reconcile();expect(boss.send).toHaveBeenCalledWith(row.queueName,row.payload,expect.objectContaining({singletonKey:'job-1:3'}));expect(mark).toHaveBeenCalledWith('o1','boss-new');});
  it.each([null,new Error('down')])('keeps the outbox pending when send returns null or throws',async result=>{const mark=vi.fn();const failure=vi.fn();const boss={send:vi.fn(async()=>{if(result instanceof Error)throw result;return result;})};const store:any={pending:vi.fn(async()=>[row]),markPublished:mark,recordFailure:failure};await new PdfFinalizationPublisher(boss as any,store).reconcile();expect(mark).not.toHaveBeenCalled();expect(failure).toHaveBeenCalledWith('o1',expect.any(String));});
});
