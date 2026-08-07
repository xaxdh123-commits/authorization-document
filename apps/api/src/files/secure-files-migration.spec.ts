import fs from 'node:fs';
import path from 'node:path';

describe('secure files migration invariants',()=>{
  const sql=fs.readFileSync(path.resolve(__dirname,'../../../../prisma/migrations/202608060002_secure_files/migration.sql'),'utf8');
  it('adds derivation FK and purpose-specific metadata checks',()=>{
    expect(sql).toContain('FileVersion_original_file_version_id_fkey');
    expect(sql).toContain('REFERENCES "FileVersion"("id")');
    expect(sql).toContain('FileVersion_presign_metadata_check');
    expect(sql).toMatch(/"purpose" <> 'PRESIGN_PDF'[\s\S]*"draft_version" IS NOT NULL[\s\S]*"content_digest" IS NOT NULL/);
    expect(sql).toContain('FileVersion_seal_derivation_check');
  });
  it('safely backfills legacy rows before creating the canonical preview unique index',()=>{
    const backfill=sql.indexOf('COALESCE("draft_version", 1)');
    const dedupe=sql.indexOf('ROW_NUMBER() OVER');
    const unique=sql.indexOf('FileVersion_active_presign_digest_key');
    expect(backfill).toBeGreaterThanOrEqual(0);expect(dedupe).toBeGreaterThan(backfill);expect(unique).toBeGreaterThan(dedupe);
  });
});
