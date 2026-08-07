import { REQUIRED_ABILITY } from '../auth/require-ability.decorator';
import { AuditController } from './audit.controller';

describe('AuditController', () => {
  it('queries audit events with filters and pagination', async () => {
    const service = { list: jest.fn().mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 }) };
    const controller = new AuditController(service as any);
    await expect(controller.list('CASE', 'c1', 'u1', 'CASE_CREATE', '2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z', '2', '10')).resolves.toMatchObject({ page: 2 });
    expect(service.list).toHaveBeenCalledWith({ targetType: 'CASE', targetId: 'c1', actorUserId: 'u1', action: 'CASE_CREATE', createdFrom: '2026-08-01T00:00:00.000Z', createdTo: '2026-08-02T00:00:00.000Z', page: 2, pageSize: 10 });
    expect(Reflect.getMetadata(REQUIRED_ABILITY, AuditController.prototype.list)).toBe('AUDIT_READ_ALL');
  });

  it('rejects invalid date filters and reversed ranges', () => {
    const service = new (require('./audit.service').AuditService)({} as any);
    expect(() => service.list({ createdFrom: 'bad', page: 1, pageSize: 20 })).toThrow('时间筛选无效');
    expect(() => service.list({ createdFrom: '2026-08-02T00:00:00.000Z', createdTo: '2026-08-01T00:00:00.000Z', page: 1, pageSize: 20 })).toThrow('时间范围无效');
  });
});
