CREATE TYPE "FinalizationDeliveryStatus" AS ENUM ('NOT_READY','PENDING','DELIVERED','FAILED');
ALTER TABLE "PdfTask"
  ADD COLUMN "finalization_status" "FinalizationDeliveryStatus" NOT NULL DEFAULT 'NOT_READY',
  ADD COLUMN "finalization_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "finalization_failure" TEXT,
  ADD COLUMN "finalization_failed_at" TIMESTAMP(3),
  ADD COLUMN "finalized_at" TIMESTAMP(3);
UPDATE "PdfTask" t SET "finalization_status"=CASE WHEN c.status='COMPLETED' THEN 'DELIVERED'::"FinalizationDeliveryStatus" ELSE 'PENDING'::"FinalizationDeliveryStatus" END,"finalized_at"=CASE WHEN c.status='COMPLETED' THEN COALESCE(t.finished_at,NOW()) ELSE NULL END FROM "BusinessCase" c WHERE t.case_id=c.id AND t.status='SUCCEEDED';
ALTER TABLE "PdfTask" ADD CONSTRAINT "PdfTask_finalization_delivery_check" CHECK (("finalization_status"='FAILED' AND "finalization_failure" IS NOT NULL AND "finalization_failed_at" IS NOT NULL) OR ("finalization_status"<>'FAILED' AND "finalization_failure" IS NULL AND "finalization_failed_at" IS NULL));
