import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationOrder = (name: string): bigint => {
  const timestamp = name.match(/^\d+/)?.[0];
  if (!timestamp) throw new Error(`Migration has no numeric prefix: ${name}`);
  return BigInt(timestamp);
};

describe('fresh database migration order', () => {
  it('creates RoleMapping before a later migration alters it', () => {
    const root = join(__dirname, '../../../../prisma/migrations');
    const migrations = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        sql: readFileSync(join(root, entry.name, 'migration.sql'), 'utf8'),
      }));

    const creator = migrations.find(({ sql }) => sql.includes('CREATE TABLE "RoleMapping"'));
    const firstReference = migrations.find(({ sql }) => sql.includes('ALTER TABLE "RoleMapping"'));

    expect(creator).toBeDefined();
    expect(firstReference).toBeDefined();
    expect(migrationOrder(creator!.name)).toBeLessThan(migrationOrder(firstReference!.name));
  });
});
