CREATE TYPE "DataScope" AS ENUM ('SELF','DEPT','ALL');
CREATE TYPE "CatalogVersionStatus" AS ENUM ('DRAFT','PUBLISHED','DISABLED');
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT','AWAITING_CUSTOMER','CUSTOMER_EDITING','PENDING_REVIEW','NEEDS_SUPPLEMENT','PENDING_REREVIEW','FINALIZING','PDF_FAILED','COMPLETED','CLOSED');
CREATE TYPE "ActorType" AS ENUM ('INTERNAL','CUSTOMER','SYSTEM');
CREATE TYPE "SignatureMode" AS ENUM ('HANDWRITTEN','STAMP_UPLOAD');
CREATE TYPE "EvidenceMode" AS ENUM ('ORDINARY','TRUSTED_TIMESTAMP','CA_CERTIFICATE','E_CONTRACT_PROVIDER');
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVE','REJECT');
CREATE TYPE "PdfTaskStatus" AS ENUM ('QUEUED','PROCESSING','SUCCEEDED','FAILED');
CREATE TYPE "QuotationSource" AS ENUM ('MANUAL','URL','LOCAL_STORAGE','UPSTREAM_SYSTEM');

ALTER TABLE "RoleMapping" DROP CONSTRAINT IF EXISTS "RoleMapping_data_scope_check";
ALTER TABLE "RoleMapping" ALTER COLUMN "data_scope" TYPE "DataScope" USING "data_scope"::"DataScope";

CREATE TABLE "UpstreamDepartment" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "parent_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "UpstreamUser" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "department_id" TEXT, "department_name" TEXT,
  "roles" JSONB NOT NULL, "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "UpstreamUser_department_id_idx" ON "UpstreamUser"("department_id");

CREATE TABLE "Requirement" (
  "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "RequirementVersion" (
  "id" TEXT PRIMARY KEY, "requirement_id" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0),
  "status" "CatalogVersionStatus" NOT NULL DEFAULT 'DRAFT', "definition" JSONB NOT NULL, "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "published_at" TIMESTAMP(3), "disabled_at" TIMESTAMP(3),
  CONSTRAINT "RequirementVersion_lifecycle_check" CHECK (("status" = 'DRAFT' AND "published_at" IS NULL AND "disabled_at" IS NULL) OR ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL AND "disabled_at" IS NULL) OR ("status" = 'DISABLED' AND "published_at" IS NOT NULL AND "disabled_at" IS NOT NULL)),
  CONSTRAINT "RequirementVersion_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RequirementVersion_requirement_id_version_key" UNIQUE ("requirement_id","version")
);
CREATE INDEX "RequirementVersion_status_idx" ON "RequirementVersion"("status");

CREATE TABLE "Template" (
  "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "TemplateVersion" (
  "id" TEXT PRIMARY KEY, "template_id" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0),
  "status" "CatalogVersionStatus" NOT NULL DEFAULT 'DRAFT', "ast" JSONB NOT NULL, "signature_mode" "SignatureMode" NOT NULL,
  "created_by" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMP(3), "disabled_at" TIMESTAMP(3),
  CONSTRAINT "TemplateVersion_lifecycle_check" CHECK (("status" = 'DRAFT' AND "published_at" IS NULL AND "disabled_at" IS NULL) OR ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL AND "disabled_at" IS NULL) OR ("status" = 'DISABLED' AND "published_at" IS NOT NULL AND "disabled_at" IS NOT NULL)),
  CONSTRAINT "TemplateVersion_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TemplateVersion_template_id_version_key" UNIQUE ("template_id","version")
);
CREATE INDEX "TemplateVersion_status_idx" ON "TemplateVersion"("status");
CREATE TABLE "TemplateVersionRequirement" (
  "template_version_id" TEXT NOT NULL, "requirement_version_id" TEXT NOT NULL, "position" INTEGER NOT NULL CHECK ("position" >= 0),
  PRIMARY KEY ("template_version_id","requirement_version_id"),
  CONSTRAINT "TemplateVersionRequirement_template_version_id_position_key" UNIQUE ("template_version_id","position"),
  CONSTRAINT "TemplateVersionRequirement_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "TemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TemplateVersionRequirement_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "RequirementVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "BusinessCase" (
  "id" TEXT PRIMARY KEY, "case_number" TEXT NOT NULL UNIQUE, "customer_name" TEXT NOT NULL, "contact_name" TEXT NOT NULL,
  "factory_department" TEXT NOT NULL, "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT', "template_version_id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL, "reviewer_user_id" TEXT, "department_id" TEXT NOT NULL, "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, "closed_at" TIMESTAMP(3),
  CONSTRAINT "BusinessCase_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "TemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "BusinessCase_status_department_id_idx" ON "BusinessCase"("status","department_id");
CREATE INDEX "BusinessCase_owner_user_id_idx" ON "BusinessCase"("owner_user_id");
CREATE INDEX "BusinessCase_reviewer_user_id_idx" ON "BusinessCase"("reviewer_user_id");

CREATE TABLE "CaseSnapshot" (
  "id" TEXT PRIMARY KEY, "case_id" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0), "template_version_id" TEXT NOT NULL,
  "customer_name" TEXT NOT NULL, "contact_name" TEXT NOT NULL, "factory_department" TEXT NOT NULL, "materials" JSONB NOT NULL,
  "quotation_source" "QuotationSource" NOT NULL, "quotation_source_system" TEXT, "quotation_reference" TEXT, "quotation_snapshot" JSONB NOT NULL,
  "created_by" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "frozen_at" TIMESTAMP(3),
  CONSTRAINT "CaseSnapshot_case_id_version_key" UNIQUE ("case_id","version"),
  CONSTRAINT "CaseSnapshot_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "BusinessCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CaseSnapshot_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "TemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "CaseSnapshotRequirement" (
  "case_snapshot_id" TEXT NOT NULL, "requirement_version_id" TEXT NOT NULL, "position" INTEGER NOT NULL CHECK ("position" >= 0),
  PRIMARY KEY ("case_snapshot_id","requirement_version_id"),
  CONSTRAINT "CaseSnapshotRequirement_case_snapshot_id_position_key" UNIQUE ("case_snapshot_id","position"),
  CONSTRAINT "CaseSnapshotRequirement_case_snapshot_id_fkey" FOREIGN KEY ("case_snapshot_id") REFERENCES "CaseSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CaseSnapshotRequirement_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "RequirementVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "CaseStatusHistory" (
  "id" TEXT PRIMARY KEY, "case_id" TEXT NOT NULL, "from_status" "CaseStatus", "to_status" "CaseStatus" NOT NULL,
  "actor_user_id" TEXT NOT NULL, "reason" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaseStatusHistory_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "BusinessCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CaseStatusHistory_case_id_created_at_idx" ON "CaseStatusHistory"("case_id","created_at");

CREATE TABLE "PublicCaseLink" (
  "id" TEXT PRIMARY KEY, "case_id" TEXT NOT NULL, "token_hash" TEXT NOT NULL UNIQUE CHECK (length("token_hash") >= 32),
  "expires_at" TIMESTAMP(3) NOT NULL, "disabled_at" TIMESTAMP(3), "consumed_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicCaseLink_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "BusinessCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PublicCaseLink_case_id_idx" ON "PublicCaseLink"("case_id");

CREATE TABLE "CaseDraft" (
  "id" TEXT PRIMARY KEY, "case_id" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0), "base_version" INTEGER NOT NULL CHECK ("base_version" >= 0),
  "content" JSONB NOT NULL, "actor_type" "ActorType" NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaseDraft_case_id_version_key" UNIQUE ("case_id","version"),
  CONSTRAINT "CaseDraft_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "BusinessCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "AnswerHistory" (
  "id" TEXT PRIMARY KEY, "case_id" TEXT NOT NULL, "draft_version" INTEGER NOT NULL CHECK ("draft_version" > 0),
  "answers" JSONB NOT NULL, "actor_type" "ActorType" NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnswerHistory_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "BusinessCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AnswerHistory_case_id_draft_version_idx" ON "AnswerHistory"("case_id","draft_version");

CREATE TABLE "FileRecord" (
  "id" TEXT PRIMARY KEY, "case_id" TEXT NOT NULL, "requirement_version_id" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FileRecord_id_case_id_key" UNIQUE ("id","case_id"),
  CONSTRAINT "FileRecord_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "BusinessCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FileRecord_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "RequirementVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "FileRecord_case_id_requirement_version_id_idx" ON "FileRecord"("case_id","requirement_version_id");
CREATE TABLE "FileVersion" (
  "id" TEXT PRIMARY KEY, "file_id" TEXT NOT NULL, "case_id" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0),
  "original_name" TEXT NOT NULL, "mime_type" TEXT NOT NULL, "size_bytes" INTEGER NOT NULL CHECK ("size_bytes" >= 0),
  "sha256" TEXT NOT NULL CHECK ("sha256" ~ '^[a-f0-9]{64}$'), "storage_key" TEXT NOT NULL UNIQUE,
  "actor_type" "ActorType" NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FileVersion_file_id_version_key" UNIQUE ("file_id","version"),
  CONSTRAINT "FileVersion_id_case_id_key" UNIQUE ("id","case_id"),
  CONSTRAINT "FileVersion_file_id_case_id_fkey" FOREIGN KEY ("file_id","case_id") REFERENCES "FileRecord"("id","case_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FileVersion_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "BusinessCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "FileVersion_case_id_idx" ON "FileVersion"("case_id");

CREATE TABLE "SigningRecord" (
  "id" TEXT PRIMARY KEY, "case_id" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0), "signer" TEXT NOT NULL DEFAULT 'PARTY_A' CHECK ("signer" = 'PARTY_A'),
  "mode" "SignatureMode" NOT NULL, "evidence_mode" "EvidenceMode" NOT NULL DEFAULT 'ORDINARY', "evidence_provider" TEXT,
  "evidence_external_id" TEXT, "evidence_payload" JSONB, "resource_file_version_id" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "pre_sign_pdf_file_version_id" TEXT NOT NULL, "pre_sign_pdf_sha256" TEXT NOT NULL CHECK ("pre_sign_pdf_sha256" ~ '^[a-f0-9]{64}$'),
  "client_ip" TEXT NOT NULL, "user_agent" TEXT NOT NULL, "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "valid" BOOLEAN NOT NULL DEFAULT TRUE,
  "invalidated_at" TIMESTAMP(3), "invalidation_reason" TEXT,
  CONSTRAINT "SigningRecord_validity_check" CHECK (("valid" AND "invalidated_at" IS NULL AND "invalidation_reason" IS NULL) OR (NOT "valid" AND "invalidated_at" IS NOT NULL AND "invalidation_reason" IS NOT NULL AND length(trim("invalidation_reason")) > 0)),
  CONSTRAINT "SigningRecord_case_id_version_key" UNIQUE ("case_id","version"),
  CONSTRAINT "SigningRecord_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "BusinessCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SigningRecord_resource_file_version_id_case_id_fkey" FOREIGN KEY ("resource_file_version_id","case_id") REFERENCES "FileVersion"("id","case_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SigningRecord_pre_sign_pdf_file_version_id_case_id_fkey" FOREIGN KEY ("pre_sign_pdf_file_version_id","case_id") REFERENCES "FileVersion"("id","case_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "RequirementReview" (
  "id" TEXT PRIMARY KEY, "case_id" TEXT NOT NULL, "requirement_version_id" TEXT NOT NULL, "decision" "ReviewDecision" NOT NULL,
  "reason" TEXT, "reviewer_user_id" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0), "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RequirementReview_reject_reason_check" CHECK ("decision" <> 'REJECT' OR ("reason" IS NOT NULL AND length(trim("reason")) > 0)),
  CONSTRAINT "RequirementReview_case_id_requirement_version_id_key" UNIQUE ("case_id","requirement_version_id"),
  CONSTRAINT "RequirementReview_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "BusinessCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RequirementReview_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "RequirementVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "ReviewHistory" (
  "id" TEXT PRIMARY KEY, "case_id" TEXT NOT NULL, "requirement_version_id" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0),
  "decision" "ReviewDecision" NOT NULL, "reason" TEXT, "reviewer_user_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewHistory_reject_reason_check" CHECK ("decision" <> 'REJECT' OR ("reason" IS NOT NULL AND length(trim("reason")) > 0)),
  CONSTRAINT "ReviewHistory_case_id_requirement_version_id_version_key" UNIQUE ("case_id","requirement_version_id","version"),
  CONSTRAINT "ReviewHistory_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "BusinessCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReviewHistory_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "RequirementVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AuditEvent" (
  "id" TEXT PRIMARY KEY, "actor_user_id" TEXT, "actor_type" "ActorType" NOT NULL DEFAULT 'INTERNAL', "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL, "target_id" TEXT NOT NULL, "detail" JSONB NOT NULL, "ip_address" TEXT, "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditEvent_target_type_target_id_created_at_idx" ON "AuditEvent"("target_type","target_id","created_at");
CREATE INDEX "AuditEvent_actor_user_id_created_at_idx" ON "AuditEvent"("actor_user_id","created_at");
CREATE TABLE "SystemSetting" (
  "key" TEXT PRIMARY KEY, "value" TEXT NOT NULL, "masked" BOOLEAN NOT NULL DEFAULT FALSE,
  "encryption_version" INTEGER, "encryption_iv" TEXT, "encryption_tag" TEXT, "updated_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemSetting_encryption_check" CHECK ((NOT "masked" AND "encryption_version" IS NULL AND "encryption_iv" IS NULL AND "encryption_tag" IS NULL) OR ("masked" AND "encryption_version" = 1 AND "encryption_iv" IS NOT NULL AND "encryption_tag" IS NOT NULL))
);

CREATE TABLE "PdfTask" (
  "id" TEXT PRIMARY KEY, "case_id" TEXT NOT NULL, "template_version_id" TEXT NOT NULL, "data_snapshot_version" INTEGER NOT NULL CHECK ("data_snapshot_version" > 0),
  "signature_version" INTEGER NOT NULL CHECK ("signature_version" > 0), "idempotency_key" TEXT NOT NULL UNIQUE,
  "status" "PdfTaskStatus" NOT NULL DEFAULT 'QUEUED', "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "max_attempts" INTEGER NOT NULL DEFAULT 3 CHECK ("max_attempts" > 0 AND "attempts" <= "max_attempts"),
  "output_file_version_id" TEXT, "output_sha256" TEXT, "failure_code" TEXT, "failure_message" TEXT,
  "started_at" TIMESTAMP(3), "finished_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PdfTask_terminal_fields_check" CHECK (
    ("status" = 'SUCCEEDED' AND "output_file_version_id" IS NOT NULL AND "output_sha256" IS NOT NULL AND "output_sha256" ~ '^[a-f0-9]{64}$' AND "failure_code" IS NULL AND "failure_message" IS NULL)
    OR ("status" = 'FAILED' AND "output_file_version_id" IS NULL AND "output_sha256" IS NULL AND "failure_code" IS NOT NULL AND "failure_message" IS NOT NULL AND length("failure_code") > 0 AND length("failure_message") > 0)
    OR ("status" IN ('QUEUED','PROCESSING') AND "output_file_version_id" IS NULL AND "output_sha256" IS NULL AND "failure_code" IS NULL AND "failure_message" IS NULL)
  ),
  CONSTRAINT "PdfTask_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "BusinessCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PdfTask_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "TemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PdfTask_output_file_version_id_case_id_fkey" FOREIGN KEY ("output_file_version_id","case_id") REFERENCES "FileVersion"("id","case_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PdfTask_case_id_data_snapshot_version_fkey" FOREIGN KEY ("case_id","data_snapshot_version") REFERENCES "CaseSnapshot"("case_id","version") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PdfTask_case_id_signature_version_fkey" FOREIGN KEY ("case_id","signature_version") REFERENCES "SigningRecord"("case_id","version") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PdfTask_status_created_at_idx" ON "PdfTask"("status","created_at");
CREATE INDEX IF NOT EXISTS "CachedBackendUser_expires_at_idx" ON "CachedBackendUser"("expires_at");

CREATE FUNCTION prevent_immutable_record_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% records are immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_catalog_version() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' OR NEW.published_at IS NOT NULL OR NEW.disabled_at IS NOT NULL THEN
      RAISE EXCEPTION '% versions must be inserted as DRAFT', TG_TABLE_NAME;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'RequirementVersion' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('catalog:requirement:' || OLD.requirement_id, 0));
  ELSE
    -- Template publication always locks parent identity before version membership.
    PERFORM pg_advisory_xact_lock(hashtextextended('catalog:template:' || OLD.template_id, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended('catalog:template-version:' || OLD.id, 0));
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION '% published versions are immutable', TG_TABLE_NAME; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'DRAFT' THEN
    IF NEW.status = 'DRAFT' THEN RETURN NEW; END IF;
    IF NEW.status = 'PUBLISHED' AND NEW.published_at IS NOT NULL AND
       (to_jsonb(NEW) - ARRAY['status','published_at','disabled_at']) IS NOT DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','published_at','disabled_at']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION '% content cannot change while publishing', TG_TABLE_NAME;
  END IF;
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'DISABLED' AND NEW.disabled_at IS NOT NULL AND
     (to_jsonb(NEW) - ARRAY['status','disabled_at']) IS NOT DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','disabled_at']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% published versions only permit one-way disabling', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_catalog_parent() RETURNS trigger AS $$
DECLARE locked BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'Requirement' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('catalog:requirement:' || OLD.id, 0));
    SELECT EXISTS(SELECT 1 FROM "RequirementVersion" WHERE requirement_id = OLD.id AND status <> 'DRAFT') INTO locked;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('catalog:template:' || OLD.id, 0));
    SELECT EXISTS(SELECT 1 FROM "TemplateVersion" WHERE template_id = OLD.id AND status <> 'DRAFT') INTO locked;
  END IF;
  IF locked THEN RAISE EXCEPTION '% identity metadata is locked by a published version', TG_TABLE_NAME; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_template_membership() RETURNS trigger AS $$
DECLARE published BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('catalog:template-version:' || LEAST(OLD.template_version_id, NEW.template_version_id), 0));
    IF OLD.template_version_id <> NEW.template_version_id THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('catalog:template-version:' || GREATEST(OLD.template_version_id, NEW.template_version_id), 0));
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'catalog:template-version:' || CASE WHEN TG_OP = 'DELETE' THEN OLD.template_version_id ELSE NEW.template_version_id END,
      0
    ));
  END IF;
  SELECT status <> 'DRAFT' INTO published FROM "TemplateVersion"
    WHERE id IN (CASE WHEN TG_OP = 'DELETE' THEN OLD.template_version_id ELSE NEW.template_version_id END)
    LIMIT 1;
  IF published THEN RAISE EXCEPTION 'published template membership is immutable'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.template_version_id <> NEW.template_version_id THEN
    SELECT status <> 'DRAFT' INTO published FROM "TemplateVersion" WHERE id = OLD.template_version_id;
    IF published THEN RAISE EXCEPTION 'published template membership is immutable'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_case_snapshot() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.frozen_at IS NOT NULL THEN RAISE EXCEPTION 'case snapshots are immutable'; END IF;
  IF NEW.frozen_at IS NULL OR
     (to_jsonb(NEW) - 'frozen_at') IS DISTINCT FROM (to_jsonb(OLD) - 'frozen_at') THEN
    RAISE EXCEPTION 'only freezing a case snapshot is permitted';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_case_snapshot_membership() RETURNS trigger AS $$
DECLARE frozen BOOLEAN;
BEGIN
  SELECT frozen_at IS NOT NULL INTO frozen FROM "CaseSnapshot"
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.case_snapshot_id ELSE NEW.case_snapshot_id END;
  IF frozen THEN RAISE EXCEPTION 'frozen case snapshot membership is immutable'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.case_snapshot_id <> NEW.case_snapshot_id THEN
    SELECT frozen_at IS NOT NULL INTO frozen FROM "CaseSnapshot" WHERE id = OLD.case_snapshot_id;
    IF frozen THEN RAISE EXCEPTION 'frozen case snapshot membership is immutable'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_signing_evidence() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT NEW.valid OR NEW.invalidated_at IS NOT NULL OR NEW.invalidation_reason IS NOT NULL THEN
      RAISE EXCEPTION 'signing evidence must start valid';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'signing evidence is immutable'; END IF;
  IF NOT OLD.valid OR NEW.valid OR NEW.invalidated_at IS NULL OR COALESCE(length(trim(NEW.invalidation_reason)), 0) = 0 OR
     (to_jsonb(NEW) - ARRAY['valid','invalidated_at','invalidation_reason']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['valid','invalidated_at','invalidation_reason']) THEN
    RAISE EXCEPTION 'only one-way signing invalidation is permitted';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RequirementVersion_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "RequirementVersion" FOR EACH ROW EXECUTE FUNCTION protect_catalog_version();
CREATE TRIGGER "TemplateVersion_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "TemplateVersion" FOR EACH ROW EXECUTE FUNCTION protect_catalog_version();
CREATE TRIGGER "Requirement_identity_locked" BEFORE UPDATE OR DELETE ON "Requirement" FOR EACH ROW EXECUTE FUNCTION protect_catalog_parent();
CREATE TRIGGER "Template_identity_locked" BEFORE UPDATE OR DELETE ON "Template" FOR EACH ROW EXECUTE FUNCTION protect_catalog_parent();
CREATE TRIGGER "TemplateVersionRequirement_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "TemplateVersionRequirement" FOR EACH ROW EXECUTE FUNCTION protect_template_membership();
CREATE TRIGGER "CaseSnapshot_immutable" BEFORE UPDATE OR DELETE ON "CaseSnapshot" FOR EACH ROW EXECUTE FUNCTION protect_case_snapshot();
CREATE TRIGGER "CaseSnapshotRequirement_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "CaseSnapshotRequirement" FOR EACH ROW EXECUTE FUNCTION protect_case_snapshot_membership();
CREATE TRIGGER "SigningRecord_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "SigningRecord" FOR EACH ROW EXECUTE FUNCTION protect_signing_evidence();
CREATE TRIGGER "CaseStatusHistory_immutable" BEFORE UPDATE OR DELETE ON "CaseStatusHistory" FOR EACH ROW EXECUTE FUNCTION prevent_immutable_record_mutation();
CREATE TRIGGER "CaseDraft_immutable" BEFORE UPDATE OR DELETE ON "CaseDraft" FOR EACH ROW EXECUTE FUNCTION prevent_immutable_record_mutation();
CREATE TRIGGER "AnswerHistory_immutable" BEFORE UPDATE OR DELETE ON "AnswerHistory" FOR EACH ROW EXECUTE FUNCTION prevent_immutable_record_mutation();
CREATE TRIGGER "FileVersion_immutable" BEFORE UPDATE OR DELETE ON "FileVersion" FOR EACH ROW EXECUTE FUNCTION prevent_immutable_record_mutation();
CREATE TRIGGER "ReviewHistory_immutable" BEFORE UPDATE OR DELETE ON "ReviewHistory" FOR EACH ROW EXECUTE FUNCTION prevent_immutable_record_mutation();
CREATE TRIGGER "AuditEvent_immutable" BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION prevent_immutable_record_mutation();
