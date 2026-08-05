export type PdfJob = { jobId: string; caseId: string; businessVersion: number };
export interface PdfQueue { publish(job: PdfJob): Promise<void>; consume(handler: (job: PdfJob)=>Promise<void>): Promise<void>; }
export class InMemoryPdfQueue implements PdfQueue {
  private readonly handlers: Array<(job: PdfJob)=>Promise<void>>=[];
  async publish(job: PdfJob): Promise<void> { await Promise.all(this.handlers.map(h=>h(job))); }
  async consume(handler: (job: PdfJob)=>Promise<void>): Promise<void> { this.handlers.push(handler); }
}
