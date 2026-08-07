import { PrismaClient } from '@prisma/client';
import { RoleMappingRepository } from '../src/database/repositories/role-mapping.repository';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('role mapping transaction integration', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const repository = new RoleMappingRepository({ db: prisma } as any);
  const roleKey = '_test_task3_atomic_role';

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { targetType: 'RoleMapping', targetId: roleKey } });
    await prisma.roleMapping.deleteMany({ where: { roleKey } });
    await prisma.$disconnect();
  });

  it('persists the mapping and matching audit event atomically', async () => {
    await repository.upsertWithAudit({ roleKey, abilities: ['CASE_READ'], dataScope: 'SELF', enabled: true, actorUserId: '_test_admin' });
    await expect(prisma.roleMapping.findUnique({ where: { roleKey } })).resolves.toMatchObject({ roleKey, dataScope: 'SELF' });
    await expect(prisma.auditEvent.findFirst({ where: { targetType: 'RoleMapping', targetId: roleKey } })).resolves.toMatchObject({ action: 'ROLE_MAPPING_UPDATED', actorUserId: '_test_admin' });
  });
});
