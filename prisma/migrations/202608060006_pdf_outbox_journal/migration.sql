ALTER TABLE "PdfTask"
  ADD COLUMN "queue_generation" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "delivery_generation" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pending_storage_key" TEXT,
  ADD COLUMN "pending_sha256" TEXT,
  ADD COLUMN "pending_size_bytes" INTEGER;

CREATE TABLE "PdfQueueOutbox" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "queue_name" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "boss_job_id" TEXT,
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PdfQueueOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PdfQueueOutbox_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "PdfTask"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PdfQueueOutbox_task_id_queue_name_generation_key" ON "PdfQueueOutbox"("task_id","queue_name","generation");
CREATE INDEX "PdfQueueOutbox_published_at_created_at_idx" ON "PdfQueueOutbox"("published_at","created_at");
ALTER TABLE "PdfTask" ADD CONSTRAINT "PdfTask_pending_storage_check" CHECK (("pending_storage_key" IS NULL AND "pending_sha256" IS NULL AND "pending_size_bytes" IS NULL) OR ("pending_storage_key" IS NOT NULL AND "pending_sha256" ~ '^[a-f0-9]{64}$' AND "pending_size_bytes" BETWEEN 1 AND 20971520));
