UPDATE "PdfTask"
SET "failure_code" = NULL, "failure_message" = NULL
WHERE "status" <> 'FAILED';

UPDATE "PdfTask"
SET "failure_code" = COALESCE("failure_code", 'PDF_RETRY_EXHAUSTED'),
    "failure_message" = COALESCE("failure_message", 'PDF generation failed')
WHERE "status" = 'FAILED';

ALTER TABLE "PdfTask"
ADD CONSTRAINT "PdfTask_failure_fields_terminal_check"
CHECK (
  ("status" = 'FAILED' AND "failure_code" IS NOT NULL AND "failure_message" IS NOT NULL)
  OR
  ("status" <> 'FAILED' AND "failure_code" IS NULL AND "failure_message" IS NULL)
);
