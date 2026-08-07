ALTER TABLE "AuditEvent"
  ADD COLUMN "source" TEXT,
  ADD COLUMN "request_id" TEXT,
  ADD COLUMN "before_state" JSONB,
  ADD COLUMN "after_state" JSONB,
  ADD COLUMN "note" TEXT;

CREATE INDEX "AuditEvent_request_id_created_at_idx" ON "AuditEvent"("request_id", "created_at");
