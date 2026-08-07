import { RoleMappingRepository } from './role-mapping.repository';

describe('RoleMappingRepository atomic mapping update', () => {
  it('performs mapping and audit writes inside one Prisma transaction', async () => {
    const tx = {
      roleMapping: { upsert: jest.fn().mockResolvedValue({ roleKey: 'reviewer' }) },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const transaction = jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx));
    const repository = new RoleMappingRepository({ db: { $transaction: transaction } } as any);
    await repository.upsertWithAudit({ roleKey: 'reviewer', abilities: ['CASE_READ'], dataScope: 'DEPT', enabled: true, actorUserId: 'admin' });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.roleMapping.upsert).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('rejects the transaction result when the audit write fails', async () => {
    const failure = new Error('audit failed');
    const tx = { roleMapping: { upsert: jest.fn().mockResolvedValue({}) }, auditEvent: { create: jest.fn().mockRejectedValue(failure) } };
    const repository = new RoleMappingRepository({ db: { $transaction: (work: any) => work(tx) } } as any);
    await expect(repository.upsertWithAudit({ roleKey: 'reviewer', abilities: [], dataScope: 'DEPT', enabled: true, actorUserId: 'admin' })).rejects.toBe(failure);
  });
});
