import { RolesController } from './roles.controller';

describe('RolesController', () => {
  it('lists mappings and audits updates with the authenticated actor', async () => {
    const service = { list: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({ roleKey: 'reviewer' }) };
    const controller = new RolesController(service as any);
    await expect(controller.list()).resolves.toEqual([]);
    await expect(controller.update('reviewer', { abilities: ['CASE_READ'], dataScope: 'DEPT', enabled: true }, { auth: { user: { userId: '1' } } } as any)).resolves.toEqual({ roleKey: 'reviewer' });
    expect(service.update).toHaveBeenCalledWith('reviewer', { abilities: ['CASE_READ'], dataScope: 'DEPT', enabled: true }, '1');
  });
});
