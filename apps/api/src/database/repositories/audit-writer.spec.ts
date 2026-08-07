import { AuditWriter } from './audit-writer';

describe('AuditWriter', () => {
  it('uses the supplied transaction client so a failed audit rolls back its business write', async () => {
    const error = new Error('audit failed');
    const tx = { auditEvent: { create: jest.fn().mockRejectedValue(error) } } as any;
    await expect(AuditWriter.append(tx, { action: 'CASE_CREATED', targetType: 'BusinessCase', targetId: 'c1', detail: {}, source: 'API', requestId: 'r1' })).rejects.toBe(error);
    expect(tx.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ source: 'API', requestId: 'r1' }) });
  });

  it('normalizes every event with actor, source, request id and occurrence time', async () => {
    const tx = { auditEvent: { create: jest.fn().mockResolvedValue({ id: 'a1' }) } } as any;
    await AuditWriter.append(tx, { action: 'PDF_FAILED', targetType: 'PdfTask', targetId: 'p1', detail: {} });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorUserId: expect.any(String),
      actorType: expect.any(String),
      source: expect.any(String),
      requestId: expect.any(String),
      createdAt: expect.any(Date),
    }) });
  });

  it('is the only production entry point that creates audit events', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { resolve } = require('node:path') as typeof import('node:path');
    const root = resolve(__dirname, '../../../../..');
    const productionFiles = [
      'apps/api/src/database/repositories/case.repository.ts',
      'apps/api/src/database/repositories/settings.repository.ts',
      'apps/api/src/database/repositories/role-mapping.repository.ts',
      'apps/api/src/database/repositories/audit.repository.ts',
      'apps/worker/src/pdf/pdf-job.repository.ts',
    ];
    for (const path of productionFiles) {
      const source = readFileSync(resolve(root, path), 'utf8');
      expect(source.includes('.auditEvent.create')).toBe(false);
    }
  });
});
