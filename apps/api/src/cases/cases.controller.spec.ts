import { CasesController } from './cases.controller';
describe('CasesController', () => {
  it('creates and lists typed cases', () => { const c = new CasesController(); const created = c.create({ customerName: 'C', contactName: 'P', factoryDepartment: 'F', materials: [{ name: 'M' }], templateVersionId: 't' }); expect(created.status).toBe('DRAFT'); expect(created.signingMode).toBe('STANDARD'); expect(created.accessToken).toHaveLength(32); expect(c.list()).toHaveLength(1); });
  it('submits a case and closes its public link', () => { const c = new CasesController(); const created = c.create({ customerName: 'C', contactName: 'P', factoryDepartment: 'F', materials: [{ name: 'M' }], templateVersionId: 't' }); expect(c.access(created.accessToken).id).toBe(created.id); expect(c.submit(created.id).status).toBe('SUBMITTED'); expect(() => c.closeAccess(created.id) && c.access(created.accessToken)).toThrow(); });
});
