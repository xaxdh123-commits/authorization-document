import { BadRequestException, ConflictException } from '@nestjs/common';
import { ReviewService } from './review.service';

describe('ReviewService', () => {
  it('rejects an item rejection without a reason', async () => {
    const service = new ReviewService({ db: {} } as any, {} as any, {} as any, {} as any);
    await expect(service.reviewItem('c1', 'r1', 'REJECT', '', 'reviewer')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not let an unassigned reviewer decide an item', async () => {
    const tx = { businessCase: { updateMany: jest.fn(async () => ({ count: 0 })) } };
    const prisma = { db: { $transaction: jest.fn(async (work: any) => work(tx)) } } as any;
    const service = new ReviewService(prisma, {} as any, {} as any, {} as any);
    await expect(service.reviewItem('c1', 'r1', 'APPROVE', undefined, 'other')).rejects.toBeInstanceOf(ConflictException);
  });

  it('atomically rejects an item decision when the reviewer was concurrently reassigned', async () => {
    const tx: any = {
      businessCase: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        findUnique: jest.fn(async () => ({ id: 'c1', status: 'PENDING_REVIEW', reviewerUserId: 'new-reviewer' })),
      },
      caseSnapshotRequirement: { findFirst: jest.fn(async () => ({ requirementVersionId: 'r1' })) },
      requirementReview: { findUnique: jest.fn(async () => null), upsert: jest.fn() },
      reviewHistory: { create: jest.fn() },
      auditEvent: { create: jest.fn() },
    };
    const db: any = {
      businessCase: { findUnique: jest.fn(async () => ({ id: 'c1', status: 'PENDING_REVIEW', reviewerUserId: 'old-reviewer' })) },
      caseSnapshotRequirement: tx.caseSnapshotRequirement,
      $transaction: jest.fn(async (work: any) => work(tx)),
    };
    const cases = { reviewRequirement: jest.fn(async () => ({ decision: 'APPROVE' })) } as any;
    const service = new ReviewService({ db } as any, cases, {} as any, {} as any);
    await expect(service.reviewItem('c1', 'r1', 'APPROVE', undefined, 'old-reviewer')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.reviewHistory.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(cases.reviewRequirement).not.toHaveBeenCalled();
  });

  it('includes the reviewer in the all-approved FINALIZING compare-and-swap', async () => {
    const item = { id: 'c1', status: 'PENDING_REVIEW', reviewerUserId: 'old-reviewer', templateVersionId: 't1', snapshots: [{ version: 1, requirements: [{ requirementVersionId: 'r1' }] }], reviews: [{ requirementVersionId: 'r1', decision: 'APPROVE' }], signings: [{ version: 1 }] };
    const tx: any = {
      businessCase: {
        updateMany: jest.fn(async ({ where }: any) => ({ count: where.reviewerUserId === 'old-reviewer' ? 0 : 1 })),
        findUnique: jest.fn(async () => ({ ...item, reviewerUserId: 'new-reviewer' })),
        findUniqueOrThrow: jest.fn(async () => item),
      },
      caseStatusHistory: { create: jest.fn() }, pdfTask: { upsert: jest.fn() }, auditEvent: { create: jest.fn() },
    };
    const db: any = { businessCase: { findUnique: jest.fn(async () => item) }, $transaction: jest.fn(async (work: any) => work(tx)) };
    const service = new ReviewService({ db } as any, {} as any, {} as any, {} as any);
    await expect(service.confirm('c1', 'old-reviewer')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.businessCase.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ reviewerUserId: 'old-reviewer' }) }));
    expect(tx.caseStatusHistory.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects assignment of terminal cases', async () => {
    const businessCase = { findUnique: jest.fn(async () => ({ id: 'c1', status: 'COMPLETED', reviewerUserId: null })) };
    const prisma = { db: { businessCase, $transaction: jest.fn(async (work) => work({ businessCase })) } } as any;
    const service = new ReviewService(prisma, {} as any, {} as any, {} as any);
    await expect(service.assign('c1', 'reviewer', 'admin')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not write assignment audit when its compare-and-swap loses', async () => {
    const tx: any = { businessCase: { findUnique: jest.fn(async () => ({ id: 'c1', status: 'PENDING_REVIEW', reviewerUserId: null })), updateMany: jest.fn(async () => ({ count: 0 })), findUniqueOrThrow: jest.fn() }, auditEvent: { create: jest.fn() } };
    const service = new ReviewService({ db: { $transaction: jest.fn(async (work: any) => work(tx)) } } as any, {} as any, {} as any, {} as any);
    await expect(service.assign('c1', 'reviewer', 'admin')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('retries only PDF_FAILED and audits in the same transaction', async () => {
    const retry={retry:jest.fn(async()=>({taskId:'task-1',status:'QUEUED'}))};const service = new ReviewService({db:{}} as any, {} as any, {} as any, {} as any,retry as any);
    await expect(service.retryPdf('c1', 'reviewer')).resolves.toEqual({taskId:'task-1',status:'QUEUED'});expect(retry.retry).toHaveBeenCalledWith('c1','reviewer');
  });

  it('does not duplicate PDF retry history when CAS loses', async () => {
    const retry={retry:jest.fn(async()=>{throw new ConflictException({code:'PDF_RETRY_CONFLICT'});})};const service=new ReviewService({db:{}} as any,{} as any,{} as any,{} as any,retry as any);
    await expect(service.retryPdf('c1','reviewer')).rejects.toMatchObject({response:{code:'PDF_RETRY_CONFLICT'}});expect(retry.retry).toHaveBeenCalledTimes(1);
  });

  it('does not rotate an already active supplement link when copying the rejection message', async () => {
    const tx: any = {
      businessCase: { findUnique: jest.fn(async () => ({ id: 'c1', caseNumber: 'WT-1', status: 'NEEDS_SUPPLEMENT', reviews: [{ reason: '补件', requirementVersion: { requirement: { name: '授权书' } } }] })) },
      publicCaseLink: { findFirst: jest.fn(async () => ({ id: 'active' })), updateMany: jest.fn(), create: jest.fn() }, auditEvent: { create: jest.fn() },
    };
    const tokens = { issue: jest.fn(() => ({ token: 'new-token', tokenHash: 'hash' })) } as any;
    const service = new ReviewService({ db: { $transaction: jest.fn(async (work: any) => work(tx)) } } as any, {} as any, tokens, {} as any);
    await expect(service.copyRejectionMessage('c1', 'service')).rejects.toMatchObject({ response: { code: 'LINK_ALREADY_ACTIVE' } });
    expect(tx.publicCaseLink.updateMany).not.toHaveBeenCalled();
    expect(tx.publicCaseLink.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation and reason to regenerate a supplement link', async () => {
    const service = new ReviewService({ db: {} } as any, {} as any, {} as any, {} as any);
    await expect(service.regenerateRejectionMessage('c1', 'service', { confirmed: true })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.regenerateRejectionMessage('c1', 'service', { confirmed: false, reason: '客户遗失' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('delegates the legacy retry route to the single fenced retry service',async()=>{const retry={retry:jest.fn(async()=>({taskId:'t1',status:'QUEUED'}))};const service=new ReviewService({db:{}} as any,{} as any,{} as any,{} as any,retry as any);await expect(service.retryPdf('c1','reviewer')).resolves.toEqual({taskId:'t1',status:'QUEUED'});expect(retry.retry).toHaveBeenCalledWith('c1','reviewer');});
});
