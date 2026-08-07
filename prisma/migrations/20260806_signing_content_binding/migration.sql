DROP TRIGGER IF EXISTS "SigningRecord_immutable" ON "SigningRecord";

ALTER TABLE "SigningRecord"
  ADD COLUMN IF NOT EXISTS "draft_version" INTEGER,
  ADD COLUMN IF NOT EXISTS "content_digest" TEXT;

UPDATE "SigningRecord" s
SET "draft_version" = COALESCE((SELECT MAX(d."version") FROM "CaseDraft" d WHERE d."case_id" = s."case_id"), 0),
    "content_digest" = repeat('0', 64);

UPDATE "SigningRecord"
SET "valid" = FALSE,
    "invalidated_at" = COALESCE("invalidated_at", NOW()),
    "invalidation_reason" = 'LEGACY_UNBOUND';

ALTER TABLE "SigningRecord"
  ALTER COLUMN "draft_version" SET NOT NULL,
  ALTER COLUMN "content_digest" SET NOT NULL,
  ADD CONSTRAINT "SigningRecord_draft_version_check" CHECK ("draft_version" >= 0),
  ADD CONSTRAINT "SigningRecord_content_digest_check" CHECK ("content_digest" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "SigningRecord_valid_digest_check" CHECK (NOT "valid" OR "content_digest" <> repeat('0', 64));

CREATE INDEX "SigningRecord_case_id_draft_version_content_digest_idx"
  ON "SigningRecord"("case_id", "draft_version", "content_digest");

CREATE TRIGGER "SigningRecord_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "SigningRecord"
  FOR EACH ROW EXECUTE FUNCTION protect_signing_evidence();
