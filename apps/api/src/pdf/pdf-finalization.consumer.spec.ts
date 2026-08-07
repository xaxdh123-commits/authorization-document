import { PdfFinalizationConsumer } from './pdf-finalization.consumer';

describe('PdfFinalizationConsumer', () => {
  it('acknowledges only after finalization succeeds and rethrows transient failures', async () => {
    const acknowledgements: string[]=[];
    const failures:any[]=[];const consumer = new PdfFinalizationConsumer({ finalize: async () => { throw new Error('serialization failure'); },recordDeliveryFailure:async(...args:any[])=>failures.push(args) } as any);
    await expect(consumer.consume({ id: 'boss-1', data: { jobId:'j',caseId:'c',businessVersion:1,fileObjectId:'f',sha256:'a'.repeat(64) } }, async (id:string) => { acknowledgements.push(id); })).rejects.toThrow('serialization failure');
    expect(acknowledgements).toEqual([]);
    expect(failures[0][2]).toBe(false);
  });
  it('marks retry exhaustion as a visible terminal delivery failure',async()=>{const failures:any[]=[];const consumer=new PdfFinalizationConsumer({finalize:async()=>{throw new Error('storage unavailable')},recordDeliveryFailure:async(...args:any[])=>failures.push(args)} as any);await expect(consumer.consume({id:'boss-last',retryCount:5,retryLimit:5,data:{jobId:'j',caseId:'c',businessVersion:1,fileObjectId:'f',sha256:'a'.repeat(64)}})).rejects.toThrow('storage unavailable');expect(failures).toEqual([[expect.any(Object),'storage unavailable',true]]);});
});
