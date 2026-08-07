CREATE TYPE "FilePurpose" AS ENUM ('MATERIAL', 'HANDWRITTEN', 'SEAL_ORIGINAL', 'SEAL_PROCESSED', 'PRESIGN_PDF', 'FINAL_PDF');
ALTER TABLE "FileVersion" ADD COLUMN "purpose" "FilePurpose" NOT NULL DEFAULT 'MATERIAL';
ALTER TABLE "FileVersion" ADD COLUMN "draft_version" INTEGER;
ALTER TABLE "FileVersion" ADD COLUMN "content_digest" TEXT;
ALTER TABLE "FileVersion" ADD COLUMN "original_file_version_id" TEXT;
ALTER TABLE "FileVersion" ADD COLUMN "cache_active" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "FileRecord" ADD COLUMN "removed_at" TIMESTAMP(3);
ALTER TABLE "FileRecord" ADD COLUMN "removed_by" TEXT;
ALTER TABLE "FileRecord" ADD COLUMN "remove_reason" TEXT;
CREATE INDEX "FileVersion_case_id_purpose_draft_version_content_digest_idx" ON "FileVersion"("case_id", "purpose", "draft_version", "content_digest");
CREATE INDEX "FileVersion_original_file_version_id_idx" ON "FileVersion"("original_file_version_id");
UPDATE "FileVersion" SET "draft_version" = COALESCE("draft_version", 1), "content_digest" = COALESCE("content_digest", "sha256") WHERE "purpose" = 'PRESIGN_PDF';
UPDATE "FileVersion" SET "purpose" = 'SEAL_ORIGINAL' WHERE "purpose" = 'SEAL_PROCESSED' AND "original_file_version_id" IS NULL;
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_original_file_version_id_fkey" FOREIGN KEY ("original_file_version_id") REFERENCES "FileVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_presign_metadata_check" CHECK ("purpose" <> 'PRESIGN_PDF' OR ("draft_version" IS NOT NULL AND "content_digest" IS NOT NULL));
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_seal_derivation_check" CHECK (("purpose" = 'SEAL_PROCESSED' AND "original_file_version_id" IS NOT NULL) OR ("purpose" <> 'SEAL_PROCESSED' AND "original_file_version_id" IS NULL));
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "case_id", "purpose", "content_digest" ORDER BY "created_at" DESC, "id" DESC) AS position
  FROM "FileVersion" WHERE "content_digest" IS NOT NULL
)
UPDATE "FileVersion" AS target SET "cache_active" = FALSE
FROM ranked WHERE target."id" = ranked."id" AND ranked.position > 1;
CREATE UNIQUE INDEX "FileVersion_active_presign_digest_key" ON "FileVersion"("case_id", "content_digest") WHERE "purpose" = 'PRESIGN_PDF' AND "cache_active" = TRUE;
DROP INDEX "FileRecord_case_id_requirement_version_id_idx";
CREATE INDEX "FileRecord_case_id_requirement_version_id_removed_at_idx" ON "FileRecord"("case_id", "requirement_version_id", "removed_at");
