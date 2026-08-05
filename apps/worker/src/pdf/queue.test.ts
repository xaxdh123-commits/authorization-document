import { expect, it } from 'vitest'; import { InMemoryPdfQueue } from './queue.js';
it('delivers queued PDF jobs to consumers', async () => { const q=new InMemoryPdfQueue(); const seen:any[]=[]; await q.consume(async j=>{seen.push(j)}); await q.publish({jobId:'j1',caseId:'c1',businessVersion:1}); expect(seen).toEqual([{jobId:'j1',caseId:'c1',businessVersion:1}]); });
