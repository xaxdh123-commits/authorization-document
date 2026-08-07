import { BadRequestException } from '@nestjs/common';
import { CaseService } from './case.service';

type FixtureOptions = {
  status?: 'CUSTOMER_EDITING' | 'NEEDS_SUPPLEMENT';
  answers?: Record<string, unknown>;
  materials?: unknown[];
};

function fixture(options: FixtureOptions = {}) {
  const status = options.status ?? 'CUSTOMER_EDITING';
  const answers = options.answers ?? { brand: 'A' };
  const materials = options.materials ?? [{ name: '标签', quantity: 100 }];
  const latest = { version: 4, content: { answers, materials } };
  const snapshot = {
    id: 'snapshot-1', version: 1, customerName: '甲方', materials,
    requirements: [{ requirementVersionId: 'rv-rejected', requirementVersion: { requirement: { key: 'brand' } } }],
  };
  const tx: any = {
    businessCase: {
      findUnique: jest.fn(async () => ({ id: 'case-1', status, templateVersion: { id: 'template-v1', ast: { type: 'page', children: [] } } })),
      update: jest.fn(),
    },
    caseDraft: { findFirst: jest.fn(async () => latest), create: jest.fn(async () => undefined) },
    caseSnapshot: { findFirst: jest.fn(async () => snapshot) },
    fileVersion: { findMany: jest.fn(async () => []), findFirst: jest.fn() },
    answerHistory: { create: jest.fn(async () => undefined) },
    signingRecord: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      aggregate: jest.fn(async () => ({ _max: { version: 1 } })),
      create: jest.fn(),
    },
    requirementReview: { findMany: jest.fn(async () => status === 'NEEDS_SUPPLEMENT' ? [{ requirementVersionId: 'rv-rejected', decision: 'REJECT' }] : []) },
    caseStatusHistory: { create: jest.fn() },
    auditEvent: { create: jest.fn(async () => undefined) },
  };
  const prisma = { db: { $transaction: jest.fn(async (work: any) => work(tx)) } } as any;
  const tokens = { resolveForMutation: jest.fn(async () => ({ caseId: 'case-1' })) } as any;
  return { service: new CaseService(prisma, {} as any, tokens, {} as any), tx };
}

describe('ordinary signing invalidation matrix', () => {
  it.each([
    ['answer version', { answers: { brand: 'B' }, materials: [{ name: '标签', quantity: 100 }] }],
    ['material/business content', { answers: { brand: 'A' }, materials: [{ name: '标签', quantity: 200 }] }],
  ])('invalidates exactly once when %s changes', async (_label, body) => {
    const { service, tx } = fixture();

    await service.savePublicDraft('token', { version: 4, ...body });

    expect(tx.signingRecord.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.signingRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { caseId: 'case-1', valid: true } }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ detail: expect.objectContaining({ signingInvalidated: true }) }) }));
  });

  it('invalidates exactly once when a rejected supplement answer changes', async () => {
    const { service, tx } = fixture({ status: 'NEEDS_SUPPLEMENT' });

    await service.savePublicDraft('token', { version: 4, answers: { brand: 'B' }, materials: [{ name: '标签', quantity: 100 }] });

    expect(tx.signingRecord.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unrelated request metadata', false, { version: 4, answers: { brand: 'A' }, materials: [{ name: '标签', quantity: 100 }], uiTraceId: 'trace-2' }],
    ['same-content force save', true, { basedOnVersion: 2, answers: { brand: 'A' }, materials: [{ name: '标签', quantity: 100 }] }],
  ])('does not invalidate for %s', async (_label, force, body) => {
    const { service, tx } = fixture();

    await service.savePublicDraft('token', body, force);

    expect(tx.signingRecord.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ detail: expect.objectContaining({ signingInvalidated: false }) }) }));
  });

  it('requires a new preview, signature and declaration after business content invalidates the prior signing', async () => {
    const { service, tx } = fixture();
    await service.savePublicDraft('token', { version: 4, answers: { brand: 'B' }, materials: [{ name: '标签', quantity: 100 }] });
    expect(tx.signingRecord.updateMany).toHaveBeenCalledTimes(1);

    tx.caseDraft.findFirst.mockResolvedValue({ version: 5, content: { answers: { brand: 'B' }, materials: [{ name: '标签', quantity: 100 }] } });
    tx.fileVersion.findFirst.mockImplementation(async ({ where }: any) => where.purpose?.in ? { id: 'signature-v1', fileId: 'signature-f1', version: 1, purpose: 'HANDWRITTEN', file: { removedAt: null } } : null);
    const command = { mode: 'HANDWRITTEN', signatureResourceId: 'signature-v1', signatureResourceVersion: 1, positions: [], declaration: true };

    await expect(service.prepareOrdinarySigning('token', command, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.signingRecord.create).not.toHaveBeenCalled();

    await expect(service.prepareOrdinarySigning('token', { ...command, declaration: false }, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.signingRecord.create).not.toHaveBeenCalled();
  });
});
