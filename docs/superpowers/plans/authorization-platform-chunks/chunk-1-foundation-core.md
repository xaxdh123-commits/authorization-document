## Chunk 1: 工程基础、身份权限与业务核心

本 Chunk 中 Step 1 的每个测试条目都必须实现为独立命名用例；Step 3 只能实现使这些用例通过的接口和字段，不得以 TODO、伪实现或未列出的后续决策替代。所有 `Expected` 文本均为执行验收条件。

### Task 1: 建立可复现的 pnpm workspace

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.gitignore`
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/src/index.ts`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/template-engine/package.json`
- Create: `packages/template-engine/tsconfig.json`
- Create: `packages/template-engine/src/index.ts`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/nest-cli.json`
- Create: `prisma/schema.prisma`

- [ ] **Step 1: 创建根 workspace 清单**

根脚本必须包含：

```json
{
  "packageManager": "pnpm@10.15.0",
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:integration": "pnpm --filter @auth/api test:integration",
    "build": "pnpm -r build"
  }
}
```

`pnpm-workspace.yaml` 只包含 `apps/*` 和 `packages/*`；根 `engines.node` 固定为 `>=22 <23`。
初始 `prisma/schema.prisma` 只声明 PostgreSQL datasource 和 Prisma Client generator，使 CI 在首个模型迁移前也可执行 generate/deploy。

- [ ] **Step 2: 创建包清单和测试脚本**

```json
{
  "apiScripts": {
    "test": "jest --runInBand",
    "test:integration": "jest --config test/jest-integration.json --runInBand --passWithNoTests",
    "typecheck": "tsc --noEmit",
    "build": "nest build",
    "prisma:generate": "prisma generate --schema ../../prisma/schema.prisma",
    "prisma:migrate": "prisma migrate deploy --schema ../../prisma/schema.prisma",
    "prisma:seed": "prisma db seed --schema ../../prisma/schema.prisma"
  },
  "sharedPackageScripts": {
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit",
    "build": "tsc -p tsconfig.json"
  }
}
```

- [ ] **Step 3: 安装锁定依赖**

Run: `corepack enable && pnpm install`  
Expected: exit 0；生成 `pnpm-lock.yaml`；`pnpm --filter @auth/api exec node --version` 输出 `v22.x.x`。

- [ ] **Step 4: 验证包选择和锁定的 TypeScript 工具链**

Run: `pnpm --filter @auth/config exec node -p "require('./package.json').name" && pnpm --filter @auth/contracts exec node -p "require('./package.json').name" && pnpm --filter @auth/template-engine exec node -p "require('./package.json').name" && pnpm --filter @auth/api exec node -p "require('typescript').version"`  
Expected: exit 0；依次输出 `@auth/config`、`@auth/contracts`、`@auth/template-engine` 和 package.json 锁定的 TypeScript 版本。

- [ ] **Step 5: 提交**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json eslint.config.mjs .prettierrc.json .prettierignore .gitignore packages/config/package.json packages/config/tsconfig.json packages/config/src/index.ts packages/contracts/package.json packages/contracts/tsconfig.json packages/contracts/src/index.ts packages/template-engine/package.json packages/template-engine/tsconfig.json packages/template-engine/src/index.ts apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json prisma/schema.prisma
git commit -m "chore: initialize authorization workspace"
```

### Task 2: 建立 NestJS 健康检查与 CI 门禁

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health.controller.ts`
- Create: `apps/api/src/health.controller.spec.ts`
- Create: `apps/api/test/jest-integration.json`

- [ ] **Step 1: 写 API 健康检查测试**

```ts
describe('HealthController', () => {
  it('returns an explicit healthy result', () => {
    expect(new HealthController().getHealth()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/api test -- health.controller.spec.ts`  
Expected: exit 1，包含 `Cannot find module './health.controller'`。

- [ ] **Step 3: 实现最小 NestJS API 骨架**

`GET /health` 必须返回 `{ "status": "ok" }`。

- [ ] **Step 4: 建立与本地门禁同构的 CI**

CI 固定使用 Node 22、pnpm 10.15.0 和 PostgreSQL 16 service，依次运行 `pnpm install --frozen-lockfile`、`pnpm --filter @auth/api prisma:generate`、`pnpm --filter @auth/api prisma:migrate`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration` 和 `pnpm build`；数据库与测试环境变量使用 workflow 测试值。

Run: `pnpm --filter @auth/api test -- health.controller.spec.ts && pnpm format:check && pnpm lint && pnpm typecheck`  
Expected: exit 0；`PASS src/health.controller.spec.ts`；其余命令退出码均为 0。

- [ ] **Step 5: 提交**

```bash
git add .github/workflows/ci.yml apps/api/src/main.ts apps/api/src/app.module.ts apps/api/src/health.controller.ts apps/api/src/health.controller.spec.ts apps/api/test/jest-integration.json
git commit -m "ci: add api health and quality gates"
```

### Task 3: 实现完整环境配置契约

**Files:**

- Create: `.env.example`
- Create: `packages/config/src/env.ts`
- Create: `packages/config/src/env.test.ts`
- Modify: `packages/config/src/index.ts`

- [ ] **Step 1: 写环境配置失败测试**

测试必须覆盖：

```ts
const validEnv = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/authorization',
  AUTH_GET_INFO_URL: 'https://auth.example.test/getInfo',
  AUTH_TOKEN_HEADER: 'Authorization',
  FILE_ROOT: 'D:/authorization-data',
  PUBLIC_H5_URL: 'https://h5.example.test',
  LINK_DEADLINE_POLICY: 'CASE_DEADLINE',
  LOG_LEVEL: 'info',
};
```

断言：

- 缺少 `DATABASE_URL`、鉴权 URL、Token 请求头、文件根目录或 H5 URL 时抛出对应字段名。
- `AUTH_TIMEOUT_MS` 默认 `3000`。
- `AUTH_CACHE_TTL_SECONDS` 默认 `60`，且大于 `60` 时拒绝。
- `LINK_DEADLINE_POLICY` 仅允许 `CASE_DEADLINE`。
- `LOG_LEVEL` 仅允许 `error | warn | info | debug`。
- `.env.example` 不包含真实密码、Token 或生产 URL。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/config test -- env.test.ts`  
Expected: exit 1，包含 `Cannot find module './env'`。

- [ ] **Step 3: 实现 `parseEnv`**

导出：

```ts
export type AppEnv = {
  databaseUrl: string;
  authGetInfoUrl: string;
  authTokenHeader: string;
  authTimeoutMs: number;
  authCacheTtlSeconds: number;
  fileRoot: string;
  publicH5Url: string;
  linkDeadlinePolicy: 'CASE_DEADLINE';
  logLevel: 'error' | 'warn' | 'info' | 'debug';
};

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv;
```

不得为数据库凭据、鉴权 URL、Token 请求头、文件根目录或公共域名提供生产默认值。

- [ ] **Step 4: 运行配置测试和类型检查**

Run: `pnpm --filter @auth/config test -- env.test.ts && pnpm --filter @auth/config typecheck`  
Expected: exit 0；输出 `PASS packages/config/src/env.test.ts`；无 TypeScript 错误。

- [ ] **Step 5: 提交**

```bash
git add .env.example packages/config/src/env.ts packages/config/src/env.test.ts packages/config/src/index.ts
git commit -m "feat: validate authorization environment"
```

### Task 4: 建立共享状态、能力与 DTO 契约

**Files:**

- Create: `packages/contracts/src/case.ts`
- Create: `packages/contracts/src/material.ts`
- Create: `packages/contracts/src/requirement.ts`
- Create: `packages/contracts/src/template.ts`
- Create: `packages/contracts/src/auth.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/contracts.test.ts`

- [ ] **Step 1: 写契约失败测试**

必须覆盖：

```ts
const CASE_STATUSES = [
  'DRAFT',
  'AWAITING_CUSTOMER',
  'CUSTOMER_EDITING',
  'PENDING_REVIEW',
  'NEEDS_SUPPLEMENT',
  'PENDING_REREVIEW',
  'FINAL_PDF_PENDING',
  'FINAL_PDF_FAILED',
  'COMPLETED',
  'CLOSED',
] as const;

const REQUIREMENT_STATUSES = [
  'PENDING_INPUT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
] as const;

const DATA_SCOPES = ['SELF', 'DEPT', 'ALL'] as const;
const SIGNATURE_MODES = ['HANDWRITTEN', 'STAMP_UPLOAD'] as const;
```

测试还必须断言：

- 业务单至少有一条物料。
- 物料支持名称、规格、数量、材质、工艺和可选价格。
- 报价来源包含 `sourceType`、可选 `sourceQuoteId` 和 `sourceSnapshot`。
- 资料类型仅允许文本、长文本、单选、多选、日期、数字、文件和图片。
- 未知状态、未知签署方式和空物料数组均被拒绝。
- 能力名和数据范围使用封闭枚举。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/contracts test -- contracts.test.ts`  
Expected: exit 1，包含 `Cannot find module './case'`。

- [ ] **Step 3: 实现 Zod schemas 和推导类型**

`case.ts` 导出状态、数据范围、能力、创建/更新/查询 schemas；`material.ts` 导出物料与报价来源 schemas；`requirement.ts` 导出资料类型、字段规则和资料状态 schemas；`template.ts` 导出签署方式、变量引用和签章位 schemas；`auth.ts` 导出白名单用户与角色映射 schemas。`index.ts` 只做公共导出，不得加入数据库或 NestJS 依赖。

- [ ] **Step 4: 运行测试和类型检查**

Run: `pnpm --filter @auth/contracts test -- contracts.test.ts && pnpm --filter @auth/contracts typecheck`  
Expected: exit 0；输出 `PASS packages/contracts/src/contracts.test.ts`；无 TypeScript 错误。

- [ ] **Step 5: 提交**

```bash
git add packages/contracts/src/case.ts packages/contracts/src/material.ts packages/contracts/src/requirement.ts packages/contracts/src/template.ts packages/contracts/src/auth.ts packages/contracts/src/index.ts packages/contracts/src/contracts.test.ts
git commit -m "feat: add shared authorization contracts"
```

### Task 5: 先实现模板发布静态校验器

**Files:**

- Create: `packages/template-engine/src/template-ast.ts`
- Create: `packages/template-engine/src/variable-catalog.ts`
- Create: `packages/template-engine/src/publish-validator.ts`
- Create: `packages/template-engine/src/publish-validator.test.ts`
- Modify: `packages/template-engine/src/index.ts`

- [ ] **Step 1: 写模板发布校验失败测试**

测试必须覆盖：

- 客户、业务单、物料、系统日期、动态问卷五类变量。
- 未知或已停用变量禁止发布。
- 变量类型与组件不匹配时禁止发布。
- 物料变量出现在循环表格外时禁止发布。
- 循环嵌套或循环结构不完整时禁止发布。
- 必填变量没有值来源时禁止发布。
- 签章位缺少用途、页码/锚点、允许区域、尺寸或必填标记时禁止发布。
- 同一模板只允许一个甲方签署人，但可有多个甲方签章位。
- 手写签名和上传印章不能同时配置。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/template-engine test -- publish-validator.test.ts`  
Expected: exit 1，包含 `Cannot find module './publish-validator'`。

- [ ] **Step 3: 实现无副作用的静态校验接口**

```ts
export type ValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export function validateTemplateForPublish(
  ast: TemplateAst,
  variables: VariableDefinition[],
): ValidationIssue[];
```

`TemplateAst` 仅允许 `page | heading | paragraph | text | image | table | loopTable | variable | signatureSlot | pageBreak` 节点，每个节点使用封闭 Zod discriminated union。HTML 渲染、分页和 PDF 输出留给后续模板渲染任务。

- [ ] **Step 4: 运行校验测试和类型检查**

Run: `pnpm --filter @auth/template-engine test -- publish-validator.test.ts && pnpm --filter @auth/template-engine typecheck`  
Expected: exit 0；输出 `PASS packages/template-engine/src/publish-validator.test.ts`；无 TypeScript 错误。

- [ ] **Step 5: 提交**

```bash
git add packages/template-engine/src/template-ast.ts packages/template-engine/src/variable-catalog.ts packages/template-engine/src/publish-validator.ts packages/template-engine/src/publish-validator.test.ts packages/template-engine/src/index.ts
git commit -m "feat: validate template publication"
```

### Task 6: 建立鉴权缓存与角色映射数据模型

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/202608050001_auth_roles/migration.sql`
- Create: `apps/api/src/database/database.module.ts`
- Create: `apps/api/src/database/prisma.service.ts`
- Create: `apps/api/test/auth-role-schema.integration-spec.ts`

- [ ] **Step 1: 写鉴权数据模型集成测试**

测试使用 `pg.Client` 和显式 SQL 表名，不导入尚未生成的 Prisma model type。迁移后必须创建并读取：

- `CachedBackendUser`：Token 摘要、用户 ID、姓名、部门 ID/名称、白名单角色 JSON、缓存截止时间。
- `RoleMapping`：`roleKey`、能力数组、`SELF | DEPT | ALL`、启用状态。
- `roleKey` 唯一约束。
- 缓存表不包含原 Token、密码、MAC 地址或第三方密码字段。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/api test:integration -- auth-role-schema.integration-spec.ts`  
Expected: exit 1，包含 `relation "CachedBackendUser" does not exist`。

- [ ] **Step 3: 实现 schema、迁移和 Prisma 模块**

标准列保存用户标识、部门、角色映射和时间；仅角色白名单摘要使用 `JSONB`。为 `tokenDigest`、`userId`、`roleKey` 和 `expiresAt` 建索引或唯一约束。

- [ ] **Step 4: 应用迁移并重新运行测试**

Run: `pnpm --filter @auth/api prisma:generate && pnpm --filter @auth/api prisma:migrate && pnpm --filter @auth/api test:integration -- auth-role-schema.integration-spec.ts`  
Expected: exit 0；包含 `Generated Prisma Client` 和 `202608050001_auth_roles`；输出 `PASS test/auth-role-schema.integration-spec.ts`。

- [ ] **Step 5: 提交**

```bash
git add prisma/schema.prisma prisma/migrations/202608050001_auth_roles/migration.sql apps/api/src/database/database.module.ts apps/api/src/database/prisma.service.ts apps/api/test/auth-role-schema.integration-spec.ts
git commit -m "feat: persist auth cache and role mappings"
```

### Task 7: 建立资料项与模板版本数据模型

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/202608050002_catalog_versions/migration.sql`
- Create: `apps/api/test/catalog-schema.integration-spec.ts`

- [ ] **Step 1: 写版本模型集成测试**

测试使用 `pg.Client` 和显式 SQL 表名，避免在迁移前引用尚未生成的 Prisma model type。迁移后必须验证：

- `RequirementDefinition` 与多个 `RequirementVersion`。
- `AuthorizationTemplate` 与多个 `TemplateVersion`。
- 定义具有稳定机器键；版本具有独立版本号、状态、发布时间和停用时间。
- 资料项字段定义和模板 AST 使用 `JSONB`。
- 同一定义内版本号唯一。
- 已发布版本可继续被历史记录引用。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/api test:integration -- catalog-schema.integration-spec.ts`  
Expected: exit 1，包含 `relation "RequirementDefinition" does not exist`。

- [ ] **Step 3: 实现 schema 和迁移**

为资料项机器键、模板分类、版本状态、发布时间和停用状态建标准列及索引。不得把所有实体无差别存为单个 JSON 文档。

- [ ] **Step 4: 应用迁移并重新运行测试**

Run: `pnpm --filter @auth/api prisma:generate && pnpm --filter @auth/api prisma:migrate && pnpm --filter @auth/api test:integration -- catalog-schema.integration-spec.ts`  
Expected: exit 0；包含 `Generated Prisma Client` 和 `202608050002_catalog_versions`；输出 `PASS test/catalog-schema.integration-spec.ts`。

- [ ] **Step 5: 提交**

```bash
git add prisma/schema.prisma prisma/migrations/202608050002_catalog_versions/migration.sql apps/api/test/catalog-schema.integration-spec.ts
git commit -m "feat: persist versioned requirements and templates"
```

### Task 8: 建立业务单聚合数据模型

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/202608050003_case_aggregate/migration.sql`
- Create: `apps/api/test/case-aggregate-schema.integration-spec.ts`

- [ ] **Step 1: 写业务单聚合迁移测试**

测试使用 `pg.Client`；迁移后创建一个含 3 条 `MaterialItem` 和 3 条 `CaseRequirement` 的 `AuthorizationCase`。业务单必须以标准列保存编号、状态、乐观锁版本、创建人、负责人/部门、可空审核人/部门、`sourceType`、可空 `sourceQuoteId`、`sourceSnapshot`、模板版本/快照、截止时间和时间戳，并验证编号、状态、人员、部门和日期索引。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/api test:integration -- case-aggregate-schema.integration-spec.ts`  
Expected: exit 1，包含 `relation "AuthorizationCase" does not exist`。

- [ ] **Step 3: 只实现业务单聚合 schema 和外键迁移**

本任务仅增加 `AuthorizationCase`、`MaterialItem` 和 `CaseRequirement`；快照使用 `JSONB`，关系、状态和筛选字段使用标准列。

- [ ] **Step 4: 生成客户端、应用迁移并验证**

Run: `pnpm --filter @auth/api prisma:generate && pnpm --filter @auth/api prisma:migrate && pnpm --filter @auth/api test:integration -- case-aggregate-schema.integration-spec.ts`  
Expected: exit 0；包含 `Generated Prisma Client`、`202608050003_case_aggregate` 和 `PASS test/case-aggregate-schema.integration-spec.ts`。

- [ ] **Step 5: 提交**

```bash
git add prisma/schema.prisma prisma/migrations/202608050003_case_aggregate/migration.sql apps/api/test/case-aggregate-schema.integration-spec.ts
git commit -m "feat: persist case aggregates"
```

### Task 9: 建立回答、文件、签署与审核历史模型

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/202608050004_submission_history/migration.sql`
- Create: `apps/api/test/submission-history-schema.integration-spec.ts`

- [ ] **Step 1: 写不可变历史迁移测试**

测试使用 `pg.Client`；迁移后验证 `Answer`/`AnswerVersion`、`FileObject`/`FileVersion`、`SignatureResource`/`SignatureRecord` 和 `ReviewRecord` 的外键与版本唯一约束。追加新回答、文件、签署或审核版本后，旧版本必须仍可按时间查询。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/api test:integration -- submission-history-schema.integration-spec.ts`  
Expected: exit 1，包含 `relation "Answer" does not exist`。

- [ ] **Step 3: 只实现不可变提交历史 schema 和迁移**

文件元数据与文件版本、签章资源与签署记录必须分表；禁止通过更新覆盖历史版本。

- [ ] **Step 4: 生成客户端、应用迁移并验证**

Run: `pnpm --filter @auth/api prisma:generate && pnpm --filter @auth/api prisma:migrate && pnpm --filter @auth/api test:integration -- submission-history-schema.integration-spec.ts`  
Expected: exit 0；包含 `202608050004_submission_history` 和 `PASS test/submission-history-schema.integration-spec.ts`。

- [ ] **Step 5: 提交**

```bash
git add prisma/schema.prisma prisma/migrations/202608050004_submission_history/migration.sql apps/api/test/submission-history-schema.integration-spec.ts
git commit -m "feat: persist immutable submission history"
```

### Task 10: 建立令牌、PDF、审计模型与确定性 seed

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/202608050005_operations/migration.sql`
- Create: `prisma/seed.ts`
- Create: `apps/api/test/operations-schema.integration-spec.ts`

- [ ] **Step 1: 写运行状态迁移测试**

测试使用 `pg.Client`；迁移后验证 `CustomerAccessToken` 只保存 Token 哈希，`PdfJob` 保存幂等键/尝试次数/失败原因，`AuditEvent` 保存操作者、来源、动作、前后状态和备注。Seed 必须创建内置授权书、已发布资料项/模板版本和 `admin` 全能力映射，重复执行不得重复数据。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/api test:integration -- operations-schema.integration-spec.ts`  
Expected: exit 1，包含 `relation "CustomerAccessToken" does not exist`。

- [ ] **Step 3: 实现运行状态 schema、迁移与幂等 seed**

为 Token 哈希、PDF 幂等键、任务状态及审计业务单/时间建立唯一约束或索引；不得存储原 Token。

- [ ] **Step 4: 生成客户端、迁移、运行两次 seed 并验证**

Run: `pnpm --filter @auth/api prisma:generate && pnpm --filter @auth/api prisma:migrate && pnpm --filter @auth/api prisma:seed && pnpm --filter @auth/api prisma:seed && pnpm --filter @auth/api test:integration -- operations-schema.integration-spec.ts`  
Expected: exit 0；包含 `202608050005_operations`；两次 seed 均成功；输出 `PASS test/operations-schema.integration-spec.ts`。

- [ ] **Step 5: 提交**

```bash
git add prisma/schema.prisma prisma/migrations/202608050005_operations/migration.sql prisma/seed.ts apps/api/test/operations-schema.integration-spec.ts
git commit -m "feat: persist operational state and seed data"
```

### Task 11: 实现严格的 getInfo 客户端与缓存策略

**Files:**

- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/get-info.types.ts`
- Create: `apps/api/src/auth/get-info.client.ts`
- Create: `apps/api/src/auth/get-info.client.spec.ts`
- Create: `apps/api/src/auth/auth-cache.service.ts`
- Create: `apps/api/src/auth/auth-cache.service.spec.ts`
- Create: `apps/api/src/auth/current-user.decorator.ts`

- [ ] **Step 1: 写 getInfo 与缓存失败测试**

测试矩阵必须包含：

| 场景 | Expected |
|---|---|
| HTTP 200、`code=200`、有 `userId` 和有效 `roleKey` | 返回白名单用户 |
| HTTP 200 但无 `userId` 或无有效角色 | 401 |
| HTTP 401/403 | 清缓存并返回统一 401 |
| 业务 code 表示未登录或 Token 过期 | 清缓存并返回统一 401 |
| 网络错误、5xx、JSON 无法解析 | 503 |
| 超过 3000 ms | 503 |
| 成功读请求且缓存未超过 60 秒 | 可使用缓存 |
| 上游不可用且有有效缓存的读请求 | 允许读取 |
| 上游不可用且有有效缓存的写请求 | 503 |
| 缓存已过期 | 不允许读取或写入 |
| 响应含密码、MAC、第三方密码 | 不进入缓存 |
| 任意日志与数据库记录 | 不含原 Token |

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/api test -- get-info.client.spec.ts auth-cache.service.spec.ts`  
Expected: exit 1，包含 `Cannot find module './get-info.client'`。

- [ ] **Step 3: 实现客户端和缓存**

必须：

- 将原 Token 放入配置的请求头。
- 使用 SHA-256 Token 摘要作为缓存键。
- 使用配置的 URL、3000 ms 默认超时和最多 60 秒 TTL。
- 只保留用户 ID、姓名、部门和有效角色。
- 写请求向上游重新确认；上游不可用时拒绝写入。
- 将认证失败映射为 401，将可用性失败映射为 503。

- [ ] **Step 4: 运行测试和类型检查**

Run: `pnpm --filter @auth/api test -- get-info.client.spec.ts auth-cache.service.spec.ts && pnpm --filter @auth/api typecheck`  
Expected: exit 0；输出 `PASS src/auth/get-info.client.spec.ts` 和 `PASS src/auth/auth-cache.service.spec.ts`；无 TypeScript 错误。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/auth/auth.module.ts apps/api/src/auth/get-info.types.ts apps/api/src/auth/get-info.client.ts apps/api/src/auth/get-info.client.spec.ts apps/api/src/auth/auth-cache.service.ts apps/api/src/auth/auth-cache.service.spec.ts apps/api/src/auth/current-user.decorator.ts
git commit -m "feat: integrate upstream authentication"
```

### Task 12: 实现角色映射、能力 Guard 与数据范围

**Files:**

- Create: `apps/api/src/auth/capability.ts`
- Create: `apps/api/src/auth/ability.service.ts`
- Create: `apps/api/src/auth/ability.service.spec.ts`
- Create: `apps/api/src/auth/auth.guard.ts`
- Create: `apps/api/src/auth/auth.guard.spec.ts`
- Create: `apps/api/src/auth/require-capability.decorator.ts`
- Create: `apps/api/src/auth/sensitive-file-policy.ts`
- Create: `apps/api/src/auth/sensitive-file-policy.spec.ts`
- Create: `apps/api/src/role-mappings/role-mappings.module.ts`
- Create: `apps/api/src/role-mappings/role-mappings.controller.ts`
- Create: `apps/api/src/role-mappings/role-mappings.service.ts`
- Create: `apps/api/src/role-mappings/role-mapping.dto.ts`
- Create: `apps/api/test/role-mappings.integration-spec.ts`

- [ ] **Step 1: 写能力和映射失败测试**

测试必须断言：

- `admin` 默认拥有全部能力和 `ALL`。
- 未配置角色不能进入平台。
- 多角色取能力并集及最大数据范围。
- 客服默认 `SELF`，审核员默认 `DEPT`。
- `SELF` 对客服表示本人创建或负责，对审核员表示本人领取。
- `DEPT` 使用负责部门或审核部门。
- 不满足能力或数据范围时后端返回 403。
- 只有管理员可查看或修改角色映射。
- `PUT /admin/role-mappings/:roleKey` 可更新能力、数据范围和启用状态。
- 映射修改必须写 `AuditEvent`。
- 管理员可查看任意敏感文件；客服默认拒绝，只有显式获得 `SENSITIVE_FILE_READ` 且业务单在其数据范围内才允许。
- 审核员即使具有 `DEPT/ALL`，也仅在 `reviewerUserId` 为本人且状态为 `PENDING_REVIEW`、`NEEDS_SUPPLEMENT` 或 `PENDING_REREVIEW` 时允许敏感文件访问。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/api test -- ability.service.spec.ts auth.guard.spec.ts sensitive-file-policy.spec.ts && pnpm --filter @auth/api test:integration -- role-mappings.integration-spec.ts`  
Expected: exit 1，包含 `Cannot find module './ability.service'`。

- [ ] **Step 3: 实现固定能力集合、数据范围过滤和管理员映射 API**

能力集合必须至少包含：

```text
CASE_READ
CASE_CREATE
CASE_EDIT_DRAFT
CASE_MANAGE_LINK
CASE_ASSIGN_OWNER
CASE_ASSIGN_REVIEWER
FILE_READ
SENSITIVE_FILE_READ
REVIEW_ITEM
REVIEW_CONFIRM
CASE_CLOSE
PDF_RETRY
REQUIREMENT_MANAGE
TEMPLATE_MANAGE
TEMPLATE_PUBLISH
ROLE_MAPPING_MANAGE
AUDIT_READ_ALL
```

角色映射只能组合固定能力，不能创建任意能力字符串。

`canReadSensitiveFile(user, caseContext)` 必须在通用能力和数据范围检查之后执行上述角色、本人分配及状态约束；审核员的 `DEPT/ALL` 不得绕过本人分配条件。

- [ ] **Step 4: 运行测试**

Run: `pnpm --filter @auth/api test -- ability.service.spec.ts auth.guard.spec.ts sensitive-file-policy.spec.ts && pnpm --filter @auth/api test:integration -- role-mappings.integration-spec.ts`  
Expected: exit 0；输出 `PASS src/auth/ability.service.spec.ts`、`PASS src/auth/auth.guard.spec.ts`、`PASS src/auth/sensitive-file-policy.spec.ts` 和 `PASS test/role-mappings.integration-spec.ts`。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/auth/capability.ts apps/api/src/auth/ability.service.ts apps/api/src/auth/ability.service.spec.ts apps/api/src/auth/auth.guard.ts apps/api/src/auth/auth.guard.spec.ts apps/api/src/auth/require-capability.decorator.ts apps/api/src/auth/sensitive-file-policy.ts apps/api/src/auth/sensitive-file-policy.spec.ts apps/api/src/role-mappings/role-mappings.module.ts apps/api/src/role-mappings/role-mappings.controller.ts apps/api/src/role-mappings/role-mappings.service.ts apps/api/src/role-mappings/role-mapping.dto.ts apps/api/test/role-mappings.integration-spec.ts
git commit -m "feat: enforce role capabilities and scopes"
```

### Task 13: 实现纯业务单状态机

**Files:**

- Create: `apps/api/src/cases/case-state.ts`
- Create: `apps/api/src/cases/case-state.machine.ts`
- Create: `apps/api/src/cases/case-state.machine.spec.ts`

- [ ] **Step 1: 写表驱动状态机失败测试**

必须覆盖：

```text
DRAFT --GENERATE_LINK--> AWAITING_CUSTOMER
AWAITING_CUSTOMER --FIRST_SAVE--> CUSTOMER_EDITING
AWAITING_CUSTOMER/CUSTOMER_EDITING --SUBMIT--> PENDING_REVIEW
PENDING_REVIEW/PENDING_REREVIEW --REJECT_ITEM--> NEEDS_SUPPLEMENT
NEEDS_SUPPLEMENT --RESUBMIT--> PENDING_REREVIEW
PENDING_REVIEW/PENDING_REREVIEW --APPROVE_ALL--> FINAL_PDF_PENDING
FINAL_PDF_PENDING --PDF_SUCCEEDED--> COMPLETED
FINAL_PDF_PENDING --PDF_RETRIES_EXHAUSTED--> FINAL_PDF_FAILED
FINAL_PDF_FAILED --RETRY_PDF--> FINAL_PDF_PENDING
任一非终态 --CLOSE--> CLOSED
```

必须拒绝：

- 未正式提交直接进入审核。
- 有驳回项时 `APPROVE_ALL`。
- 缺少真实性/授权声明时 `APPROVE_ALL`。
- 签章位校验失败时 `APPROVE_ALL`。
- 缺少关闭原因时 `CLOSE`。
- `COMPLETED` 或 `CLOSED` 的任何重开/编辑。
- PDF 未完成哈希和可读性验证时进入 `COMPLETED`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/api test -- case-state.machine.spec.ts`  
Expected: exit 1，包含 `Cannot find module './case-state.machine'`。

- [ ] **Step 3: 实现纯函数状态机**

```ts
export function transitionCase(
  state: CaseStatus,
  command: CaseCommand,
  context: TransitionContext,
): CaseStatus;
```

函数不得访问数据库、网络或当前时间；无效迁移统一抛出 `InvalidTransitionError`。

- [ ] **Step 4: 运行状态机测试**

Run: `pnpm --filter @auth/api test -- case-state.machine.spec.ts`  
Expected: exit 0；输出 `PASS src/cases/case-state.machine.spec.ts`；Step 1 的全部允许和禁止迁移用例通过。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/cases/case-state.ts apps/api/src/cases/case-state.machine.ts apps/api/src/cases/case-state.machine.spec.ts
git commit -m "feat: add case state machine"
```

### Task 14: 实现业务单分配、领取与状态审计事务

**Files:**

- Create: `apps/api/src/cases/case-assignment.service.ts`
- Create: `apps/api/src/cases/case-assignment.service.spec.ts`
- Create: `apps/api/src/cases/case-command.service.ts`
- Create: `apps/api/src/cases/case-command.service.spec.ts`
- Create: `apps/api/src/audit/audit-writer.service.ts`
- Create: `apps/api/test/case-assignment.integration-spec.ts`

- [ ] **Step 1: 写事务失败测试**

必须覆盖：

- 创建时客服自动成为负责人，当前部门成为负责部门。
- 首次提交且未指定审核员时进入负责部门未分配队列。
- 部门审核员仅能查看和领取本部门队列。
- 管理员可查看和领取所有未分配业务单。
- 两个并发领取请求只有一个成功，另一个返回 409。
- 管理员可在任意非终态改派负责人或审核员。
- `DEPT` 客服仅能在本部门改派负责人。
- `SELF` 客服和审核员不能改派。
- 客服仅能关闭本人创建且尚未正式提交的业务单。
- 管理员或审核员可关闭任一非终态业务单。
- 分配、领取、改派和状态变化写入同一数据库事务。

每个 `AuditEvent` 必须记录操作者、时间、来源、动作、前后状态、业务单 ID 和备注。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/api test:integration -- case-assignment.integration-spec.ts`  
Expected: exit 1，包含 `Cannot find module '../src/cases/case-assignment.service'`。

- [ ] **Step 3: 实现原子领取和事务命令**

领取必须使用带条件的原子更新：

```text
WHERE id = :caseId
  AND reviewerUserId IS NULL
  AND status IN ('PENDING_REVIEW', 'PENDING_REREVIEW')
```

受影响行数不是 `1` 时返回 409。不得先查询再无条件更新。

- [ ] **Step 4: 运行单元和集成测试**

Run: `pnpm --filter @auth/api test -- case-assignment.service.spec.ts case-command.service.spec.ts && pnpm --filter @auth/api test:integration -- case-assignment.integration-spec.ts`  
Expected: exit 0；输出两个单元测试文件和 `PASS test/case-assignment.integration-spec.ts`；并发用例返回一个成功和一个 409。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/cases/case-assignment.service.ts apps/api/src/cases/case-assignment.service.spec.ts apps/api/src/cases/case-command.service.ts apps/api/src/cases/case-command.service.spec.ts apps/api/src/audit/audit-writer.service.ts apps/api/test/case-assignment.integration-spec.ts
git commit -m "feat: add atomic case assignment and audit"
```

### Task 15: 实现业务单创建、草稿编辑与查询 API

**Files:**

- Create: `apps/api/src/cases/cases.module.ts`
- Create: `apps/api/src/cases/cases.controller.ts`
- Create: `apps/api/src/cases/case-create.dto.ts`
- Create: `apps/api/src/cases/case-update.dto.ts`
- Create: `apps/api/src/cases/case-query.dto.ts`
- Create: `apps/api/src/cases/case-query.service.ts`
- Create: `apps/api/src/cases/case-query.service.spec.ts`
- Create: `apps/api/src/cases/case-draft.service.ts`
- Create: `apps/api/test/cases.integration-spec.ts`
- Create: `apps/api/test/cases.openapi-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: 写业务单 API 失败测试**

测试以下端点：

```text
POST  /cases
PATCH /cases/:id
GET   /cases
GET   /cases/:id
POST  /cases/:id/claim
POST  /cases/:id/reassign-owner
POST  /cases/:id/reassign-reviewer
POST  /cases/:id/close
```

创建测试必须断言：

- 客户、联系人、工厂/部门和至少一条物料必填。
- 只能选择已发布模板版本。
- 内置授权书资料项自动加入且不能移除。
- 所选资料项保存版本快照。
- 保存 `sourceType`、`sourceQuoteId` 和 `sourceSnapshot`。
- 负责人和负责部门取当前客服。
- 新业务单状态为 `DRAFT`。
- 草稿编辑使用 `version` 乐观锁；冲突返回 409。
- 非草稿及终态业务单不可通过草稿 API 编辑。
- 查询支持编号、客户、工厂/部门、客服、状态和日期过滤。
- 所有查询都应用 `SELF | DEPT | ALL` 数据范围。
- 越权请求返回 403。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/api test:integration -- cases.integration-spec.ts`  
Expected: exit 1，包含 `Cannot find module '../src/cases/cases.module'`。

- [ ] **Step 3: 实现 DTO、草稿命令和只读查询服务**

`case-draft.service.ts` 只负责创建和草稿更新；`case-query.service.ts` 只负责过滤和范围约束；状态变化继续委托 `case-command.service.ts`。

- [ ] **Step 4: 运行单元、集成和 OpenAPI 测试**

Run: `pnpm --filter @auth/api test -- case-query.service.spec.ts && pnpm --filter @auth/api test:integration -- cases.integration-spec.ts cases.openapi-spec.ts`  
Expected: exit 0；输出 `PASS src/cases/case-query.service.spec.ts`、`PASS test/cases.integration-spec.ts` 和 `PASS test/cases.openapi-spec.ts`；OpenAPI 快照包含 Step 1 的八个端点，所有越权用例返回 403。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/cases/cases.module.ts apps/api/src/cases/cases.controller.ts apps/api/src/cases/case-create.dto.ts apps/api/src/cases/case-update.dto.ts apps/api/src/cases/case-query.dto.ts apps/api/src/cases/case-query.service.ts apps/api/src/cases/case-query.service.spec.ts apps/api/src/cases/case-draft.service.ts apps/api/test/cases.integration-spec.ts apps/api/test/cases.openapi-spec.ts apps/api/src/app.module.ts
git commit -m "feat: add case creation and query api"
```

### Task 16: 实现资料项草稿与发布 API

**Files:**

- Create: `apps/api/src/requirements/requirements.module.ts`
- Create: `apps/api/src/requirements/requirements.controller.ts`
- Create: `apps/api/src/requirements/requirements.service.ts`
- Create: `apps/api/src/requirements/requirement.dto.ts`
- Create: `apps/api/src/requirements/requirements.service.spec.ts`
- Create: `apps/api/test/requirements.integration-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: 写资料项版本失败测试**

测试以下行为：

- 支持文本、长文本、单选、多选、日期、数字、文件和图片。
- 可配置标题、说明、示例、必填、默认值、允许 MIME、单文件大小、数量和排序。
- 发布前校验机器键唯一、必填规则完整、文件限制有效。
- 已发布版本不可修改。
- 改名、改规则或删除通过新版本完成。
- 停用只影响新业务单，不破坏历史引用。
- 内置授权书资料项不能删除、停用或从业务单移除。
- `REQUIREMENT_MANAGE` 可管理草稿；只有管理员可发布。
- 未授权请求返回 403。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/api test -- requirements.service.spec.ts && pnpm --filter @auth/api test:integration -- requirements.integration-spec.ts`  
Expected: exit 1，包含 `Cannot find module './requirements.service'`。

- [ ] **Step 3: 实现明确端点**

```text
POST /requirements
POST /requirements/:id/versions
PATCH /requirements/:id/versions/:versionId
POST /requirements/:id/versions/:versionId/publish
POST /requirements/:id/versions/:versionId/copy
POST /requirements/:id/disable
GET /requirements
GET /requirements/:id/versions
```

发布事务必须锁定草稿、执行校验、写发布时间并记录 `AuditEvent`。

- [ ] **Step 4: 运行测试**

Run: `pnpm --filter @auth/api test -- requirements.service.spec.ts && pnpm --filter @auth/api test:integration -- requirements.integration-spec.ts`  
Expected: exit 0；输出 `PASS src/requirements/requirements.service.spec.ts` 和 `PASS test/requirements.integration-spec.ts`。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/requirements/requirements.module.ts apps/api/src/requirements/requirements.controller.ts apps/api/src/requirements/requirements.service.ts apps/api/src/requirements/requirement.dto.ts apps/api/src/requirements/requirements.service.spec.ts apps/api/test/requirements.integration-spec.ts apps/api/src/app.module.ts
git commit -m "feat: add versioned requirement api"
```

### Task 17: 实现授权书模板草稿与发布 API

**Files:**

- Create: `apps/api/src/templates/templates.module.ts`
- Create: `apps/api/src/templates/templates.controller.ts`
- Create: `apps/api/src/templates/templates.service.ts`
- Create: `apps/api/src/templates/template.dto.ts`
- Create: `apps/api/src/templates/templates.service.spec.ts`
- Create: `apps/api/test/templates.integration-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: 写模板版本失败测试**

测试以下行为：

- 模板按工厂、部门或业务场景分类。
- 草稿保存 A4 编辑器 AST、变量引用和签章位定义。
- 发布调用 Task 5 的 `validateTemplateForPublish`。
- 未知/停用变量、错误类型、循环错误或不完整签章位禁止发布。
- 每次发布生成不可变版本。
- 修改、改名或删除通过新版本完成。
- 复制生成新草稿。
- 停用只影响新业务单。
- 历史业务单仍可引用旧版本。
- 一个甲方签署人可有多个签章位。
- 签署方式只能是手写或印章二选一。
- 只有管理员可发布模板。
- 发布和停用写入 `AuditEvent`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @auth/api test -- templates.service.spec.ts && pnpm --filter @auth/api test:integration -- templates.integration-spec.ts`  
Expected: exit 1，包含 `Cannot find module './templates.service'`。

- [ ] **Step 3: 实现明确端点**

```text
POST /templates
POST /templates/:id/versions
PATCH /templates/:id/versions/:versionId
POST /templates/:id/versions/:versionId/publish
POST /templates/:id/versions/:versionId/copy
POST /templates/:id/disable
GET /templates
GET /templates/:id/versions
```

本任务保存不可变编辑器 AST 和发布校验结果；业务单的确定性 HTML 渲染快照由后续模板渲染引擎任务生成。

- [ ] **Step 4: 运行模块、集成和 Chunk 1 总门禁**

Run: `pnpm --filter @auth/api test -- templates.service.spec.ts && pnpm --filter @auth/api test:integration -- templates.integration-spec.ts`  
Expected: exit 0；输出 `PASS src/templates/templates.service.spec.ts` 和 `PASS test/templates.integration-spec.ts`。

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build`  
Expected: exit 0；无跳过测试、无 TypeScript 或 lint 错误，全部迁移已应用。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/templates/templates.module.ts apps/api/src/templates/templates.controller.ts apps/api/src/templates/templates.service.ts apps/api/src/templates/template.dto.ts apps/api/src/templates/templates.service.spec.ts apps/api/test/templates.integration-spec.ts apps/api/src/app.module.ts
git commit -m "feat: add versioned template api"
```
