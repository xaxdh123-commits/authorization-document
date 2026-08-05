# Chinese Functional UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让后台和客户 H5 以简体中文完整呈现首期需求，并交付可测试的业务单、资料配置、模板、审核、普通签署、文件和 PDF 闭环。

**Architecture:** 先完成共享契约、PostgreSQL 模型和受保护 API，再并行构建中文后台与 H5，最后接入文件/签署/PDF Worker 并做端到端验收。React 页面只通过领域客户端访问 API；NestJS Guard 执行能力与数据范围校验；API 与 Worker 通过持久化 PDF 任务协作。

**Tech Stack:** pnpm monorepo、React 18、React Router、TypeScript、Vitest/Testing Library、NestJS 11、Jest/Supertest、Zod、Prisma/PostgreSQL、Node Worker、Playwright/Chromium、PM2。

**Design Spec:** `docs/superpowers/specs/2026-08-05-chinese-functional-ui-design.md`

**Execution order:** Chunk 1 → Chunk 2 and Chunk 3 frontend tasks in parallel → Chunk 3 PDF/E2E tasks. Do not start a task until its listed dependency is green.

---

## Chunk 1: Contracts, PostgreSQL and Protected APIs

### Task 1: Workflow contracts and Chinese status boundary

**Files:**
- Modify: `packages/contracts/src/enums.ts`
- Modify: `packages/contracts/src/case.ts`
- Modify: `packages/contracts/src/requirement.ts`
- Modify: `packages/contracts/src/template.ts`
- Modify: `packages/contracts/src/auth.ts`
- Create: `packages/contracts/src/signing.ts`
- Create: `packages/contracts/src/pdf.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/contracts.test.ts`

- [ ] Write RED tests for all ten statuses; case create/snapshot/filter DTOs; link renew/disable/regenerate DTOs; public case view; versioned draft save/409/explicit-new-version; supplement submit; claim/assign/reassign/per-item-review commands; abilities and SELF/DEPT/ALL; eight requirement types; immutable requirement/template versions; template AST; one-signer signing; PDF task schemas.
- [ ] Run `pnpm --filter @auth/contracts test`; expect FAIL on missing schemas/statuses.
- [ ] Implement minimal Zod schemas and exported TypeScript types. Keep stable English machine keys; expose one `caseStatusZh` map for UI/API presenters.
- [ ] Run `pnpm --filter @auth/contracts test && pnpm --filter @auth/contracts typecheck && pnpm --filter @auth/contracts build`; expect PASS.
- [ ] Commit `feat(contracts): define complete authorization workflow`.

### Task 2: PostgreSQL schema, repositories and seed data

**Depends on:** Task 1.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260805_chinese_workflow/migration.sql`
- Modify: `prisma/seed.ts`
- Modify: `apps/api/package.json`
- Modify: `packages/template-engine/package.json`
- Modify: `apps/api/src/database/database.module.ts`
- Create: `apps/api/src/database/repositories/case.repository.ts`
- Create: `apps/api/src/database/repositories/catalog.repository.ts`
- Create: `apps/api/src/database/repositories/audit.repository.ts`
- Create: `apps/api/src/database/repositories/role-mapping.repository.ts`
- Create: `apps/api/src/database/repositories/settings.repository.ts`
- Create: `apps/api/src/database/repositories/pdf-task.repository.ts`
- Create: `apps/api/test/database.integration-spec.ts`
- Modify: `apps/api/test/jest-integration.json`
- Create: `scripts/test-db.mjs`

- [ ] First add `test:db:reset` and `test:integration` package scripts invoking `node ../../scripts/test-db.mjs reset|test`. The wrapper requires `TEST_DATABASE_URL`, rejects database names not ending `_test`, maps it to `DATABASE_URL` only for every Prisma/Jest child process, and never reads or mutates the development URL. All integration RED/GREEN commands in Tasks 2–5 use this safe entry.
- [ ] Write RED database integration tests for requirement/template versions, business snapshots, token hash without plaintext, answer/file/sign/review histories, audit events, settings and idempotent PDF tasks.
- [ ] Run `$env:TEST_DATABASE_URL='<dedicated _test URL>'; pnpm --filter @auth/api test:integration`; expect FAIL because tables/repositories are missing.
- [ ] Add models, foreign keys, unique constraints and transaction-oriented repositories; register/export repositories from `DatabaseModule`. Use a deterministic seed: admin, SELF customer-service, DEPT reviewer, one published template, three requirements, two-material case and twenty-material case.
- [ ] Run `$env:TEST_DATABASE_URL='<dedicated _test URL>'; pnpm --filter @auth/api test:db:reset; pnpm --filter @auth/api prisma:generate; pnpm --filter @auth/api test:integration`; expect PASS and verify data remains readable after a new app/repository instance.
- [ ] Commit `feat(database): persist authorization workflow versions`.

### Task 3: Upstream auth, role mappings and server enforcement

**Depends on:** Task 2.

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.controller.spec.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/ability.service.ts`
- Create: `apps/api/src/auth/ability.guard.ts`
- Create: `apps/api/src/auth/require-ability.decorator.ts`
- Create: `apps/api/src/roles/roles.controller.ts`
- Create: `apps/api/src/roles/roles.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/dashboard/dashboard.controller.ts`
- Modify: `apps/api/src/cases/cases.controller.ts`
- Modify: `apps/api/src/review/review.controller.ts`
- Modify: `apps/api/src/templates/templates.controller.ts`
- Create: `apps/api/src/auth/auth.service.spec.ts`
- Create: `apps/api/src/auth/ability.guard.spec.ts`
- Create: `apps/api/src/roles/roles.controller.spec.ts`
- Create: `apps/api/test/protected-routes.integration-spec.ts`

- [ ] Write RED tests for valid getInfo; HTTP 200 missing `user.userId`; no valid `roles[].roleKey`; invalid business code; 401/403→401; timeout/network/5xx→503; 3-second timeout; 60-second token-digest cache; no raw-token persistence/logging; cached read allowed but every write rejected when upstream is unavailable.
- [ ] Write RED permission matrix tests for admin/customer-service/reviewer, unknown role denial, multi-role union, SELF/DEPT/ALL, sensitive download and route 403.
- [ ] Write RED protected-route integration tests that call dashboard/cases/review/templates with allowed and denied sessions, proving each controller actually has the guard/decorator and returns 2xx/403.
- [ ] Run `pnpm --filter @auth/api test -- auth roles && pnpm --filter @auth/api test:integration`; expect FAIL.
- [ ] Implement AuthService, digest cache, persistent/audited role mapping API, ability decorator/guard and safe Chinese errors.
- [ ] Apply guard/decorator to existing `dashboard.controller.ts`, `cases.controller.ts`, `review.controller.ts`, and `templates.controller.ts`; Tasks 4–5 protect their own new controllers before GREEN.
- [ ] Run `pnpm --filter @auth/api test && pnpm --filter @auth/api typecheck`; expect PASS.
- [ ] Commit `feat(api): enforce upstream roles and data scopes`.

### Task 4: Requirement, template, audit and settings APIs

**Depends on:** Tasks 2–3.

**Files:**
- Create: `apps/api/src/requirements/requirements.controller.ts`
- Create: `apps/api/src/requirements/requirements.service.ts`
- Create: `apps/api/src/requirements/requirements.controller.spec.ts`
- Create: `apps/api/src/database/repositories/catalog-version.repository.ts`
- Modify: `apps/api/src/database/database.module.ts`
- Create: `apps/api/src/templates/templates.service.ts`
- Modify: `apps/api/src/templates/templates.controller.ts`
- Modify: `apps/api/src/templates/templates.controller.spec.ts`
- Create: `apps/api/src/audit/audit.controller.ts`
- Create: `apps/api/src/audit/audit.service.ts`
- Create: `apps/api/src/audit/audit.controller.spec.ts`
- Create: `apps/api/src/settings/settings.controller.ts`
- Create: `apps/api/src/settings/settings.service.ts`
- Create: `apps/api/src/settings/settings.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/catalog.integration-spec.ts`

- [ ] Write RED tests for eight requirement types, description/example/default/validation, duplicate machine key, publish immutability, disable-only-new-cases and Chinese field-located errors.
- [ ] Write RED tests for template copy/draft/save/publish/disable/history and validation of variables, type/component match, required sources, multi-material loops, header/footer/margins and signature bounds.
- [ ] Write RED tests for masked settings, audit query authorization and 2xx/403 on every catalog/audit/settings route.
- [ ] Write RED integration tests proving publish immutability, disable-only-new-cases, fixed historical template/requirement references and persistence after app restart.
- [ ] Run `pnpm --filter @auth/api test -- requirements templates audit settings && pnpm --filter @auth/api test:integration`; expect FAIL.
- [ ] Implement guarded controllers/services against Prisma repositories and write audit events for every mutation. Remove Map-based production stores and constructor `new Store()` fallbacks.
- [ ] Run `pnpm --filter @auth/api test && pnpm --filter @auth/api typecheck && pnpm --filter @auth/api build`; expect PASS.
- [ ] Commit `feat(api): add versioned catalogs audit and settings`.

### Task 5: Cases, links, reviews and immutable histories

**Depends on:** Tasks 2–4.

**Files:**
- Modify: `apps/api/src/cases/case.store.ts`
- Modify: `apps/api/src/cases/cases.controller.ts`
- Create: `apps/api/src/cases/case.service.ts`
- Create: `apps/api/src/cases/token.service.ts`
- Create: `apps/api/src/cases/token.service.spec.ts`
- Modify: `apps/api/src/cases/cases.controller.spec.ts`
- Modify: `apps/api/src/review/review.controller.ts`
- Create: `apps/api/src/review/review.service.ts`
- Create: `apps/api/src/review/review.controller.spec.ts`
- Modify: `apps/api/src/dashboard/dashboard.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/workflow.integration-spec.ts`

- [ ] Write RED token tests using an injected clock for ≥128-bit entropy, hash-only storage, one-time plaintext response, renew, atomic old-token revocation and one-second effect. Invalid, expired, disabled, completed and unknown tokens all return identical HTTP 404 and `{code:'LINK_UNAVAILABLE', message:'链接无效或已失效'}`; logs contain only digest.
- [ ] Write RED close tests: admin/reviewer may close nonterminal; customer-service only own unsubmitted; missing reason 400; submitted/other case 403; terminal cannot close.
- [ ] Write RED review tests for atomic claim competition, assign/reassign rules, per-item rejection reason, non-rejected read-only, rereview and copied rejection message without automatic sending.
- [ ] Write RED history metadata/permission tests for answers/files/signing/reviews before and after supplement. Task 10 adds real authorized file download tests once storage endpoints exist.
- [ ] Write RED public API tests for token public view, versioned draft save, 409 response, explicit create-new-version, formal submit, supplement allowing only rejected items and content-changing supplement invalidating signing.
- [ ] Write RED status tests: final review may only enter `FINALIZING`; every background/public HTTP endpoint is forbidden from directly writing `COMPLETED`; admin reassigns any nonterminal task, department customer-service reassigns within department, reviewer reassign is 403; admin/reviewer may request retry from `PDF_FAILED`. Task 11 alone supplies an internal, non-HTTP finalizer transaction after readable-file/hash verification.
- [ ] For formal submit, RED-test missing latest preview/signature/declaration as 400. Use a persisted valid-signing fixture to exercise the successful branch without weakening validation; Task 10 replaces the fixture path with real signing integration.
- [ ] Run `pnpm --filter @auth/api test -- cases review` and `pnpm --filter @auth/api test:integration`; expect FAIL.
- [ ] Implement guarded, transaction-backed Prisma services, public draft endpoints, complete state transitions, link actions and audit events. Remove Map-based production paths and constructor fallback stores.
- [ ] Run `pnpm --filter @auth/api test && pnpm --filter @auth/api test:integration && pnpm --filter @auth/api typecheck && pnpm --filter @auth/api build`; expect PASS.
- [ ] Commit `feat(api): complete secure case and review lifecycle`.

---

## Chunk 2: Complete Chinese Admin

### Task 6: Chinese shell, navigation and localization gate

**Depends on:** Tasks 1–5.

**Files:**
- Create: `apps/admin/src/i18n/zh-CN.ts`
- Create: `apps/admin/src/app/navigation.ts`
- Modify: `apps/admin/src/app/App.tsx`
- Modify: `apps/admin/src/app/router.tsx`
- Modify: `apps/admin/src/styles.css`
- Modify: `apps/admin/src/errors/ForbiddenPage.tsx`
- Modify: `apps/admin/src/auth/AuthProvider.tsx`
- Create: `apps/admin/src/auth/AuthProvider.test.tsx`
- Modify: `apps/admin/src/auth/RouteGuard.tsx`
- Modify: `apps/admin/src/auth/RouteGuard.test.tsx`
- Modify: `apps/admin/src/features/dashboard/DashboardGuard.test.tsx`
- Modify: `apps/admin/src/app/App.test.tsx`
- Create: `apps/admin/src/app/Navigation.test.tsx`
- Create: `apps/admin/src/app/Router.test.tsx`

- [ ] Write RED tests for the Chinese product title, grouped left navigation, responsive shell, Chinese loading/403/404/errors and all ten status labels.
- [ ] Test navigation for admin all entries, customer-service/reviewer filtered entries, no-ability hidden entries, unknown role denial, multi-role union and protected route 403.
- [ ] Run `pnpm --filter @auth/admin test -- src/app/App.test.tsx src/app/Navigation.test.tsx src/app/Router.test.tsx src/auth/AuthProvider.test.tsx src/auth/RouteGuard.test.tsx src/features/dashboard/DashboardGuard.test.tsx`; expect FAIL.
- [ ] Implement dictionary/status map, navigation model, application shell and protected route definitions. In Task 6, `Router.test.tsx` only verifies route protection, known route registration and Chinese 404, and must turn GREEN here. Task 8 later extends the same test with functional page assertions.
- [ ] Run `pnpm --filter @auth/admin test && pnpm --filter @auth/admin typecheck`; expect PASS.
- [ ] Commit `feat(admin): add chinese management shell`.

### Task 7: Dashboard, case list/create/detail and safe quotation handoff

**Depends on:** Tasks 4–6.

**Files:**
- Modify: `apps/admin/src/api/client.ts`
- Create: `apps/admin/src/features/quotes/quotation-handoff.ts`
- Create: `apps/admin/src/features/quotes/quotation-handoff.test.ts`
- Modify: `apps/admin/src/features/dashboard/DashboardPage.tsx`
- Modify: `apps/admin/src/features/dashboard/DashboardPage.test.tsx`
- Modify: `apps/admin/src/features/cases/CaseListPage.tsx`
- Modify: `apps/admin/src/features/cases/CaseListPage.test.tsx`
- Modify: `apps/admin/src/features/cases/CaseCreatePage.tsx`
- Modify: `apps/admin/src/features/cases/CaseCreatePage.test.tsx`
- Modify: `apps/admin/src/features/cases/CaseCreatePage.command.test.tsx`
- Modify: `apps/admin/src/features/cases/CaseDetailPage.tsx`
- Modify: `apps/admin/src/features/cases/CaseDetailPage.test.tsx`
- Modify: `apps/admin/src/features/cases/CaseDetail.command.test.tsx`

- [ ] Write RED tests for all ten dashboard states, tasks/recent/overdue and three quick actions.
- [ ] Write RED list tests for number/customer/factory/owner/status/date filters and linked rows.
- [ ] Write RED creation tests for委托方、联系人、受托方/工厂部门, 2 and 20 materials, quotation reference, URL whitelist, sensitive parameter rejection, same-origin non-sensitive draft read-and-delete, template versions, mandatory authorization letter, optional credentials and returned/copyable customer link.
- [ ] Write RED detail tests for seven tabs, immutable version timelines, link expiry/access state/last-save time, copy/renew/disable/regenerate, close with required reason/permission feedback and flow timeline.
- [ ] Run `pnpm --filter @auth/admin test -- src/features/dashboard src/features/cases src/features/quotes`; expect FAIL.
- [ ] Implement pages and typed client mappings; never parse full customer/price JSON from URL.
- [ ] Run `pnpm --filter @auth/admin test && pnpm --filter @auth/admin typecheck && pnpm --filter @auth/admin build`; expect PASS.
- [ ] Commit `feat(admin): deliver chinese case workspace`.

### Task 8: Review, configuration, editor, roles, audit and settings pages

**Depends on:** Tasks 4–7.

**Files:**
- Modify: `apps/admin/src/app/router.tsx`
- Modify: `apps/admin/src/api/client.ts`
- Modify: `apps/admin/src/styles.css`
- Modify: `apps/admin/src/features/reviews/ReviewQueuePage.tsx`
- Modify: `apps/admin/src/features/reviews/ReviewQueuePage.test.tsx`
- Modify: `apps/admin/src/features/reviews/ReviewDetailPage.tsx`
- Modify: `apps/admin/src/features/reviews/ReviewDetailPage.test.tsx`
- Modify: `apps/admin/src/features/reviews/ReviewDetail.command.test.tsx`
- Modify: `apps/admin/src/app/Router.test.tsx`
- Create: `apps/admin/src/features/requirements/RequirementCatalogPage.tsx`
- Create: `apps/admin/src/features/requirements/RequirementCatalogPage.test.tsx`
- Create: `apps/admin/src/features/templates/TemplateListPage.tsx`
- Create: `apps/admin/src/features/templates/TemplateListPage.test.tsx`
- Create: `apps/admin/src/features/templates/TemplateEditorPage.tsx`
- Create: `apps/admin/src/features/templates/TemplateEditorPage.test.tsx`
- Create: `apps/admin/src/features/roles/RoleMappingPage.tsx`
- Create: `apps/admin/src/features/roles/RoleMappingPage.test.tsx`
- Create: `apps/admin/src/features/audit/AuditLogPage.tsx`
- Create: `apps/admin/src/features/audit/AuditLogPage.test.tsx`
- Create: `apps/admin/src/features/settings/SystemSettingsPage.tsx`
- Create: `apps/admin/src/features/settings/SystemSettingsPage.test.tsx`

- [ ] Write RED review tests for pending/my queues, claim, admin assign/reassign, department customer-service reassignment, reviewer reassignment denial, per-item approve/reject with required reason, other items read-only, rereview, final approval, PDF retry and complete copied rejection text plus audit/no-auto-send assertions and Chinese errors.
- [ ] Write RED requirement tests for eight types, description/example/default/validation, duplicate machine key, default-value type error, Chinese field-located publish failure, draft/publish/disable/history, immutable published versions and disabled catalog not changing historical cases. Write template list tests for copy/draft/publish/disable/history. Write role tests for abilities and SELF/DEPT/ALL; audit tests for actor/time/object/action/before-after/result/note and filters; settings tests for auth/storage/H5/expiry/signing/PDF read-update and masked secrets.
- [ ] Write RED editor tests before implementation: component palette, A4 canvas, property panel, fixed text/image/table/page break/material loop/signature slot, font/size/alignment/line/paragraph spacing/header/footer/margins, slot size, variables, AST save/reopen, preview equivalence and exact disclaimer “当前为普通电子签署，不等同于第三方可靠电子签名。”
- [ ] Write RED route tests proving every approved navigation path renders a functional Chinese page.
- [ ] Run `pnpm --filter @auth/admin test -- src/app/Router.test.tsx src/features/reviews src/features/requirements src/features/templates src/features/roles src/features/audit src/features/settings`; expect FAIL.
- [ ] Implement pages and typed clients, including ordinary-signing disclaimer in preview/editor.
- [ ] Run `pnpm --filter @auth/admin test && pnpm --filter @auth/admin typecheck && pnpm --filter @auth/admin build`; expect PASS.
- [ ] Commit `feat(admin): expose review configuration and template tools`.

---

## Chunk 3: Chinese H5, Secure Files, Signing, PDF and E2E

### Task 9: Public case, Chinese H5 and versioned drafts

**Depends on:** Tasks 1 and 5.

**Files:**
- Create: `apps/h5/src/i18n/zh-CN.ts`
- Modify: `apps/h5/src/api/client.ts`
- Modify: `apps/h5/src/app/router.tsx`
- Modify: `apps/h5/src/features/case-wizard/CaseWizardPage.tsx`
- Modify: `apps/h5/src/features/case-wizard/CaseWizardPage.test.tsx`
- Modify: `apps/h5/src/features/case-wizard/InformationStep.tsx`
- Modify: `apps/h5/src/features/case-wizard/InformationStep.test.tsx`
- Modify: `apps/h5/src/features/case-wizard/autosave.ts`
- Modify: `apps/h5/src/features/case-wizard/CaseWizardAutosave.test.tsx`
- Modify: `apps/h5/src/features/case-wizard/ConflictDialog.tsx`
- Modify: `apps/h5/src/features/case-wizard/ConflictDialog.test.tsx`
- Modify: `apps/h5/src/features/supplement/SupplementPage.tsx`
- Modify: `apps/h5/src/features/supplement/SupplementPage.test.tsx`
- Create: `apps/h5/src/errors/InvalidLinkPage.tsx`
- Create: `apps/h5/src/errors/InvalidLinkPage.test.tsx`

- [ ] Write RED tests for Chinese four steps, customer/material snapshot, dynamic requirement names, mandatory authorization letter, read-only submitted page and 390px-friendly structure. Upload behavior is RED/GREEN in Task 10 after file API exists.
- [ ] Write RED draft tests for refresh recovery and 409 behavior: local content retained, no automatic merge/overwrite, explicit new-version confirmation.
- [ ] Write RED supplement test with three items/one rejected: only rejected editable; two approved read-only; old signature invalidated.
- [ ] Write RED uniform invalid/expired/closed link tests; page must not reveal whether a case exists.
- [ ] Run `pnpm --filter @auth/h5 test -- src/features/case-wizard src/features/supplement src/errors`; expect FAIL.
- [ ] Remove full `caseData` URL parsing; load public view only by token. Implement Chinese pages and versioned clients.
- [ ] Run `pnpm --filter @auth/h5 test && pnpm --filter @auth/h5 typecheck && pnpm --filter @auth/h5 build`; expect PASS.
- [ ] Commit `feat(h5): add chinese public case and supplement flow`.

### Task 10: Secure file and ordinary-signing APIs plus H5 UI

**Depends on:** Tasks 1–5 and Task 9.

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/files/files.controller.ts`
- Create: `apps/api/src/files/files.service.ts`
- Create: `apps/api/src/files/files.controller.spec.ts`
- Create: `apps/api/src/signing/signing.controller.ts`
- Create: `apps/api/src/signing/signing.service.ts`
- Create: `apps/api/src/signing/presign-preview.service.ts`
- Create: `apps/api/src/signing/signing.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `packages/storage/src/file-policy.ts`
- Modify: `packages/storage/src/file-policy.test.ts`
- Modify: `packages/template-engine/src/index.ts`
- Modify: `packages/template-engine/src/index.test.ts`
- Create: `packages/template-engine/src/pdf-renderer.ts`
- Create: `packages/template-engine/src/pdf-renderer.test.ts`
- Modify: `apps/h5/src/api/client.ts`
- Modify: `apps/h5/src/features/uploads/UploadStep.tsx`
- Modify: `apps/h5/src/features/uploads/UploadStep.test.tsx`
- Modify: `apps/h5/src/features/uploads/UploadRetry.test.tsx`
- Create: `apps/h5/src/features/signing/HandwrittenSignaturePad.tsx`
- Create: `apps/h5/src/features/signing/HandwrittenSignaturePad.test.tsx`
- Create: `apps/h5/src/features/signing/SealUploadEditor.tsx`
- Create: `apps/h5/src/features/signing/SealUploadEditor.test.tsx`
- Modify: `apps/h5/src/features/signing/SignaturePlacementEditor.tsx`
- Modify: `apps/h5/src/features/signing/SignaturePlacementEditor.test.tsx`
- Modify: `apps/h5/src/features/signing/PdfPreviewStep.tsx`
- Modify: `apps/h5/src/features/signing/PdfPreviewStep.test.tsx`

- [ ] Write RED storage/API tests for PDF/PNG/JPEG magic bytes, double extensions, traversal, 20 MB/20 MB+1, 10/11 files and 200 MB/over using atomic counters and the stricter of system/catalog limits; every response is attachment and never executable inline; cover path hiding, retry and refresh recovery.
- [ ] Write RED file authorization matrix for ordinary upload/download, SELF/DEPT/ALL, sensitive-file independent ability and fixed 403 denial.
- [ ] Add PDF/Chromium dependencies to `@auth/template-engine` and `@auth/template-engine` dependency to API. Before signing tests, write RED shared-renderer/presign tests that deterministically render and persist an immutable pre-sign preview PDF from the exact template/data snapshot. Task 11 imports this same `pdf-renderer.ts` for final PDF and must not introduce a second renderer.
- [ ] Write RED signing API tests: client submits only mode/resource/version/positions/declaration; server saves the immutable pre-sign PDF reference, computes its SHA-256, and records declaration version, server time, IP and User-Agent. Reject client-supplied time/hash/evidence fields.
- [ ] Write RED invalidation tests: supplement, answer/file version, material or business-content change invalidates signing; unrelated metadata does not; submission requires re-preview, re-sign and re-confirmation.
- [ ] Write RED H5 tests for exact disclaimer, one signer, handwritten/seal exclusivity, all required slots, bounds rejection, failed background removal retaining original, retry upload and switch-to-handwriting.
- [ ] Run `pnpm --filter @auth/storage test`, `pnpm --filter @auth/template-engine test`, `pnpm --filter @auth/api test -- files signing`, and `pnpm --filter @auth/h5 test -- src/features/uploads src/features/signing`; expect FAIL.
- [ ] Add `@auth/storage` API dependency; register guarded controllers in `AppModule`; implement services/controllers, ability/data-scope checks, atomic limits and H5 upload/signing components.
- [ ] Run `pnpm --filter @auth/storage test && pnpm --filter @auth/storage typecheck && pnpm --filter @auth/template-engine test && pnpm --filter @auth/template-engine typecheck && pnpm --filter @auth/template-engine build && pnpm --filter @auth/api test && pnpm --filter @auth/api typecheck && pnpm --filter @auth/h5 test && pnpm --filter @auth/h5 typecheck`; expect PASS.
- [ ] Commit `feat: add secure files and ordinary signing`.

### Task 11: Persistent idempotent PDF worker

**Depends on:** Tasks 1–5 and 10.

**Files:**
- Modify: `apps/worker/package.json`
- Modify: `apps/worker/src/main.ts`
- Modify: `packages/template-engine/src/index.ts`
- Modify: `packages/template-engine/src/index.test.ts`
- Modify: `apps/worker/src/pdf/queue.ts`
- Modify: `apps/worker/src/pdf/queue.test.ts`
- Create: `apps/worker/src/pdf/render.visual.test.ts`
- Create: `apps/worker/src/pdf/pdf-task.repository.ts`
- Create: `apps/worker/src/pdf/finalize.ts`
- Create: `apps/api/src/pdf/pdf.controller.ts`
- Create: `apps/api/src/pdf/pdf.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/worker/test/fixtures/single-page.json`
- Create: `apps/worker/test/fixtures/multi-page.json`
- Create: `apps/worker/test/fixtures/two-materials.json`
- Create: `apps/worker/test/fixtures/twenty-materials.json`
- Create: `apps/worker/test/fonts/NotoSansSC-Regular.otf`
- Modify: `.github/workflows/ci.yml`

- [ ] Add `@auth/contracts`, Prisma/database client, Chromium, PDF and image-comparison dependencies plus fixed Chinese font fixture to worker/CI.
- [ ] Write RED API tests for PDF status/retry abilities and denial before implementing controller; run `pnpm --filter @auth/api test -- pdf` and expect FAIL.
- [ ] Write RED tests first for AST render, key text, row count, pagination, header/footer and signature rectangle.
- [ ] Write RED queue tests for idempotency key `(case, templateVersion, snapshotVersion, signingVersion)`, max 3 retries, 60-second restart recovery, SHA-256 verification, atomic completed/failed transition and no duplicate final record.
- [ ] Write RED visual tests comparing preview PDF and final PDF from the same snapshot for all four fixtures at fixed Chromium/font/A4/144 DPI. Assert key text, row count, page count and signature rectangle; after ignoring channel differences ≤8, remaining pixel difference must be ≤0.5%. CI must fail, not skip, when fixtures/font/Chromium are missing.
- [ ] Run `pnpm --filter @auth/template-engine test && pnpm --filter @auth/worker test`; expect FAIL.
- [ ] Implement deterministic renderer, persistent task repository, guarded API retry/status endpoint, final transaction, and a long-running `worker/main.ts` poll loop that recovers pending jobs within 60 seconds and remains alive under PM2.
- [ ] Run `pnpm --filter @auth/template-engine test && pnpm --filter @auth/template-engine typecheck && pnpm --filter @auth/template-engine build && pnpm --filter @auth/worker test && pnpm --filter @auth/worker typecheck && pnpm --filter @auth/worker build && pnpm --filter @auth/api test && pnpm --filter @auth/api typecheck && pnpm --filter @auth/api build`; expect PASS.
- [ ] Commit `feat(worker): generate verified idempotent final pdfs`.

### Task 12: End-to-end, Chinese copy and deployment gate

**Depends on:** Tasks 1–11, applied migration and fixed seed data.

**Files:**
- Modify: `apps/api/test/jest-integration.json`
- Modify: `apps/api/package.json`
- Create: `apps/api/test/authorization-workflow.integration-spec.ts`
- Create: `apps/admin/src/test/chinese-copy.test.tsx`
- Create: `apps/h5/src/test/chinese-copy.test.tsx`
- Create: `ecosystem.config.cjs`
- Create: `scripts/preview.ps1`
- Modify: `.github/workflows/ci.yml`

- [ ] Run `$env:TEST_DATABASE_URL='<dedicated _test URL>'; pnpm --filter @auth/api test:db:reset; pnpm --filter @auth/api prisma:generate` before E2E. The Task 2 package script invokes `scripts/test-db.mjs`, maps validated `TEST_DATABASE_URL` to child `DATABASE_URL`, and rejects non-`_test` names.
- [ ] Add Supertest dependency/config and E2E: create → secure token → H5 save/upload/sign → submit → claim → reject 1 of 3 → supplement (other 2 read-only) → re-sign → approve → PDF complete → token closed.
- [ ] Add E2E matrices for SELF/DEPT/ALL 2xx/403, claim competition, close rules, valid/expired/disabled/regenerated token, upload boundaries, history downloads, two-window 409, API/Worker restart and PDF geometry/hash.
- [ ] Add Chinese copy scans for every approved route with whitelist only for machine keys, template variables, extensions and technical digests.
- [ ] Run `pnpm --filter @auth/api test:integration`; expect PASS with fixed database.
- [ ] Run `pnpm typecheck && pnpm test && pnpm build`; expect all workspaces PASS.
- [ ] Implement `ecosystem.config.cjs` using actual build outputs `apps/api/dist/apps/api/src/main.js` and `apps/worker/dist/main.js`, with restart policy and health environment. Implement `scripts/preview.ps1` to build first, reject occupied ports, start API/Admin/H5, health-check 3000/5173/5174, and print exact `pm2 delete authorization-api authorization-worker` plus tracked frontend process stop commands.
- [ ] Start preview; kill Worker once and verify PM2 restarts it and pending work resumes; inspect every primary route at desktop and 390px with no console errors; then commit `test: verify chinese authorization workflow end to end`.
