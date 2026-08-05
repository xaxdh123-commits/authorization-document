CREATE TABLE "CachedBackendUser" (
  "token_digest" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "name" TEXT,
  "department_id" TEXT,
  "department_name" TEXT,
  "roles" JSONB NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "CachedBackendUser_expires_at_idx" ON "CachedBackendUser" ("expires_at");
CREATE TABLE "RoleMapping" (
  "role_key" TEXT PRIMARY KEY,
  "capabilities" JSONB NOT NULL,
  "data_scope" TEXT NOT NULL CHECK ("data_scope" IN ('SELF','DEPT','ALL')),
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
