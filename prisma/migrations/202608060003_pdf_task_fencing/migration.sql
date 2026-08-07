ALTER TABLE "PdfTask" ADD COLUMN "lease_token" TEXT;
ALTER TABLE "PdfTask" ADD COLUMN "claim_generation" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "PdfTask_status_started_at_idx" ON "PdfTask"("status", "started_at");
