import fs from 'node:fs';
import path from 'node:path';

describe('signing content binding migration', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../../../prisma/migrations/20260806_signing_content_binding/migration.sql'), 'utf8');

  it('drops the immutable trigger before backfill and recreates it afterwards', () => {
    const drop = sql.indexOf('DROP TRIGGER IF EXISTS "SigningRecord_immutable"');
    const backfill = sql.indexOf("invalidation_reason\" = 'LEGACY_UNBOUND'");
    const recreate = sql.lastIndexOf('CREATE TRIGGER "SigningRecord_immutable"');
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(backfill).toBeGreaterThan(drop);
    expect(recreate).toBeGreaterThan(backfill);
    expect(sql.slice(recreate)).toContain('EXECUTE FUNCTION protect_signing_evidence()');
  });

  it('never leaves a legacy zero-digest signing valid', () => {
    expect(sql).toMatch(/SET "valid" = FALSE[\s\S]*"invalidation_reason" = 'LEGACY_UNBOUND'/);
    expect(sql).toContain('CHECK (NOT "valid" OR "content_digest" <> repeat(\'0\', 64))');
  });
});
