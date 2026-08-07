import { CasesController } from './cases.controller';
import { REQUIRED_ABILITY } from '../auth/require-ability.decorator';
import { METHOD_METADATA } from '@nestjs/common/constants';

const request = { auth: { user: { userId: 'admin', departmentId: 'dept' } } } as any;
describe('CasesController', () => {
  it('delegates case creation to the persistent service', async () => {
    const service = { create: jest.fn(async () => ({ id: 'case-1', status: 'DRAFT' })) } as any;
    await expect(new CasesController(service).create({ customerName: '客户' }, request)).resolves.toMatchObject({ id: 'case-1' });
    expect(service.create).toHaveBeenCalledWith({ customerName: '客户' }, { userId: 'admin', departmentId: 'dept' });
  });
  it('declares route abilities without applying data-scope filtering', () => {
    expect(Reflect.getMetadata(REQUIRED_ABILITY, CasesController.prototype.list)).toBe('CASE_READ');
    expect(Reflect.getMetadata(REQUIRED_ABILITY, CasesController.prototype.create)).toBe('CASE_CREATE');
    expect(Reflect.getMetadata(REQUIRED_ABILITY, CasesController.prototype.close)).toBe('CASE_CLOSE');
    expect(Reflect.getMetadata(REQUIRED_ABILITY, CasesController.prototype.answerHistory)).toBe('CASE_READ');
    expect(Reflect.getMetadata(REQUIRED_ABILITY, CasesController.prototype.fileHistory)).toBe('FILE_READ');
    expect(Reflect.getMetadata(REQUIRED_ABILITY, CasesController.prototype.sensitiveFileHistory)).toBe('SENSITIVE_FILE_READ');
  });
  it('exposes no HTTP action that can directly set COMPLETED', () => {
    const httpMethods = Object.getOwnPropertyNames(CasesController.prototype)
      .filter((name) => name !== 'constructor' && Reflect.hasMetadata(METHOD_METADATA, (CasesController.prototype as any)[name]));
    expect(httpMethods).not.toContain('complete');
    for (const name of httpMethods) expect((CasesController.prototype as any)[name].toString()).not.toMatch(/\bCOMPLETED\b/);
  });
});
