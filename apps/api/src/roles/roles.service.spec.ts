import { RolesService } from './roles.service';

describe('RolesService', () => {
  it('delegates mapping and audit to one atomic repository operation', async () => {
    const repository = { upsertWithAudit: jest.fn().mockResolvedValue({ roleKey: 'reviewer' }), list: jest.fn() };
    const service = new RolesService(repository as any);
    await expect(service.update('reviewer', { abilities: ['CASE_READ'], dataScope: 'DEPT', enabled: true }, 'admin-1')).resolves.toEqual({ roleKey: 'reviewer' });
    expect(repository.upsertWithAudit).toHaveBeenCalledTimes(1);
    expect(repository.upsertWithAudit).toHaveBeenCalledWith({ roleKey: 'reviewer', abilities: ['CASE_READ'], dataScope: 'DEPT', enabled: true, actorUserId: 'admin-1' });
  });
});
