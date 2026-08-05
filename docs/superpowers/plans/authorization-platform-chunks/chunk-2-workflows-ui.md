## Chunk 2: 文件、问卷、模板、签署、PDF 与用户界面

> **Chunk 1 依赖：** 必须先完整完成并验证 `chunk-1-foundation-core.md` 的 Task 1-17，再执行本 Chunk。模板渲染任务直接复用 Chunk 1 Task 5 的 `TemplateAst`、`VariableDefinition`、`variable-catalog.ts` 和 `validateTemplateForPublish`，并扩展 Chunk 1 Task 17 已创建的 `templates.service.ts`；不得创建第二套变量目录、静态校验器、角色映射 API 或业务单核心服务。合并回主计划时，将原 Chunk 3 的任务顺延到本 Chunk 全部任务之后。

> **步骤粒度：** 带 `a/b/c` 后缀的步骤均为独立 checkbox；每个测试步骤只创建或运行一个测试文件，每个实现步骤只修改其 `Files` 列表中声明的单一职责文件。任何步骤预计超过 5 分钟时，执行者必须继续按测试文件或实现文件拆成子 checkbox，不能合并跳过。

### 共享实现契约

以下签名是各任务测试使用的最小公开接口，不得在实现时改为跨模块访问内部数据层：

```ts
export interface StorageAdapter {
  write(input: NodeJS.ReadableStream): Promise<{ storageKey: string; relativePath: string; sha256: string }>;
  read(storageKey: string): Promise<NodeJS.ReadableStream>;
  exists(storageKey: string): Promise<boolean>;
  remove(storageKey: string): Promise<void>;
}

export function validateTemplateForPublish(ast: TemplateAst, variables: VariableDefinition[]): ValidationIssue[];
export function renderTemplate(ast: TemplateAst, data: TemplateData): { html: string; signatureAnchors: SignatureAnchor[] };

export type PreSignPdfResult = {
  fileObjectId: string;
  businessVersion: number;
  sha256: string;
  generatedAt: string;
};

export type SignatureEvidence = {
  method: 'HANDWRITTEN' | 'STAMP';
  resourceVersionId: string;
  preSignPdfSha256: string;
  signedAt: string;
  ipAddress: string;
  userAgent: string;
};
```

### Task 6A: 建立 Chunk 2 workspace 包清单

**Files:**
- Create: `packages/storage/package.json`
- Create: `packages/storage/tsconfig.json`
- Create: `packages/storage/src/index.ts`
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/tsconfig.build.json`
- Create: `apps/worker/nest-cli.json`
- Create: `apps/worker/test/jest-integration.json`
- Create: `apps/admin/package.json`
- Create: `apps/admin/tsconfig.json`
- Create: `apps/admin/vite.config.ts`
- Create: `apps/admin/index.html`
- Create: `apps/h5/package.json`
- Create: `apps/h5/tsconfig.json`
- Create: `apps/h5/vite.config.ts`
- Create: `apps/h5/index.html`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1a: 验证缺少 storage 包。** Run: `node -e "const fs=require('node:fs'); process.exit(fs.existsSync('packages/storage/package.json') ? 0 : 1)"`。Expected: FAIL，退出码 1。
- [ ] **Step 1b: 验证缺少 Worker 包。** Run: `node -e "const fs=require('node:fs'); process.exit(fs.existsSync('apps/worker/package.json') ? 0 : 1)"`。Expected: FAIL，退出码 1。
- [ ] **Step 1c: 验证缺少前端包。** Run: `node -e "const fs=require('node:fs'); process.exit(fs.existsSync('apps/admin/package.json') && fs.existsSync('apps/h5/package.json') ? 0 : 1)"`。Expected: FAIL，退出码 1。
- [ ] **Step 2a: 创建 `@auth/storage` 清单**，脚本固定为 Vitest test、TypeScript typecheck/build，并依赖 Chunk 1 的 config/contracts 包。
- [ ] **Step 2b: 创建 `@auth/worker` 清单和 Nest/TypeScript 配置**，脚本包含 Jest unit/integration、typecheck 和 build；依赖 pg-boss、Playwright、Sharp、Prisma、storage、template-engine 和 config。
- [ ] **Step 2c: 创建 `@auth/admin` 清单和 Vite 配置**，脚本包含 Vitest/jsdom、typecheck 和 build；依赖 React、React Router、Ant Design 和 contracts。
- [ ] **Step 2d: 创建 `@auth/h5` 清单和 Vite 配置**，脚本包含 Vitest/jsdom、typecheck 和 build；依赖 React、React Router、Ant Design Mobile 和 contracts。
- [ ] **Step 3: 运行 `pnpm install`。** Expected: PASS，退出码 0，`pnpm-lock.yaml` 记录新增 workspace 依赖及锁定版本。
- [ ] **Step 4a: 运行 `pnpm --filter @auth/storage exec node -p "require('./package.json').name" && pnpm --filter @auth/worker exec node -p "require('./package.json').name"`。** Expected: PASS，依次输出 `@auth/storage` 和 `@auth/worker`。
- [ ] **Step 4b: 运行 `pnpm --filter @auth/admin exec node -p "require('./package.json').name" && pnpm --filter @auth/h5 exec node -p "require('./package.json').name"`。** Expected: PASS，依次输出 `@auth/admin` 和 `@auth/h5`。
- [ ] **Step 5: 提交。** Run: `git add packages/storage/package.json packages/storage/tsconfig.json packages/storage/src/index.ts apps/worker/package.json apps/worker/tsconfig.json apps/worker/tsconfig.build.json apps/worker/nest-cli.json apps/worker/test/jest-integration.json apps/admin/package.json apps/admin/tsconfig.json apps/admin/vite.config.ts apps/admin/index.html apps/h5/package.json apps/h5/tsconfig.json apps/h5/vite.config.ts apps/h5/index.html pnpm-lock.yaml && git commit -m "chore: scaffold workflow and ui packages"`

### Task 7: 实现文件校验策略

**Files:**
- Create: `packages/storage/src/file-policy.ts`
- Test: `packages/storage/src/file-policy.test.ts`

- [ ] **Step 1a: 写类型失败测试**：仅允许 PDF/PNG/JPEG，并校验扩展名与真实 MIME 一致。
- [ ] **Step 1b: 写配额失败测试**：单文件 20 MB、单资料项 10 个文件、业务单 200 MB。
- [ ] **Step 1c: 写路径失败测试**：路径穿越和恶意文件名必须返回稳定错误码。
- [ ] **Step 2: 运行 `pnpm --filter @auth/storage test -- src/file-policy.test.ts`。** Expected: FAIL，提示无法加载 `./file-policy`。
- [ ] **Step 3a: 实现扩展名、MIME 和允许类型纯函数。**
- [ ] **Step 3b: 实现文件、资料项和业务单配额纯函数。**
- [ ] **Step 3c: 实现文件名/路径拒绝规则；错误不得返回磁盘路径。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，全部测试通过，0 failed。
- [ ] **Step 5: 提交。** Run: `git add packages/storage/src/file-policy.ts packages/storage/src/file-policy.test.ts && git commit -m "feat: add file validation policy"`

### Task 8: 实现本地/NAS 文件存储适配器

**Files:**
- Create: `packages/storage/src/storage.ts`
- Create: `packages/storage/src/atomic-file-writer.ts`
- Create: `packages/storage/src/local-storage.ts`
- Modify: `packages/storage/src/index.ts`
- Test: `packages/storage/src/local-storage.integration.test.ts`

- [ ] **Step 1a: 写写入失败测试**：随机存储键、流式写入、原子重命名和 SHA-256。
- [ ] **Step 1b: 写路径失败测试**：仅返回相对路径，根目录约束生效，失败不留下半文件。
- [ ] **Step 1c: 写适配失败测试**：将 `FILE_ROOT` 切换到第二个临时挂载目录。
- [ ] **Step 2: 运行 `pnpm --filter @auth/storage test -- src/local-storage.integration.test.ts`。** Expected: FAIL，提示无法加载 `./local-storage`。
- [ ] **Step 3a: 在 `storage.ts` 定义保存、读取、存在性检查和删除接口。**
- [ ] **Step 3b: 在 `atomic-file-writer.ts` 实现临时文件、哈希和原子重命名。**
- [ ] **Step 3c: 在 `local-storage.ts` 实现根目录约束和相对存储键；返回值与异常不得包含绝对路径。**
- [ ] **Step 3d: 在 `index.ts` 导出文件策略、存储接口和本地适配器。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，两个根目录场景均通过，0 failed。
- [ ] **Step 5: 提交。** Run: `git add packages/storage/src/storage.ts packages/storage/src/atomic-file-writer.ts packages/storage/src/local-storage.ts packages/storage/src/index.ts packages/storage/src/local-storage.integration.test.ts && git commit -m "feat: add local nas storage adapter"`

### Task 9: 实现版本化文件上传 API

**Files:**
- Create: `apps/api/src/files/files.module.ts`
- Create: `apps/api/src/files/files.controller.ts`
- Create: `apps/api/src/files/files.service.ts`
- Create: `apps/api/src/files/file-version.service.ts`
- Test: `apps/api/src/files/files.service.spec.ts`
- Test: `apps/api/test/files.integration-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1a: 在单元测试中覆盖文件策略调用及事务内计数/总量校验。**
- [ ] **Step 1b: 在单元测试中覆盖停用当前版本、版本时间线及哈希查询。**
- [ ] **Step 1c: 在集成测试中覆盖存储失败时数据库事务回滚。**
- [ ] **Step 2a: 运行 `pnpm --filter @auth/api test -- src/files/files.service.spec.ts`。** Expected: FAIL，提示 `FilesService` 尚不存在。
- [ ] **Step 2b: 运行 `pnpm --filter @auth/api test:integration -- files.integration-spec.ts`。** Expected: FAIL，提示文件模块未注册。
- [ ] **Step 3a: 在 `file-version.service.ts` 实现只追加文件版本和当前版本切换。**
- [ ] **Step 3b: 在 `files.service.ts` 实现上传、替换、停用和版本查询事务；数据库只保存存储键及相对路径。**
- [ ] **Step 3c: 在 controller/module 注册端点，并将文件模块导入 `app.module.ts`。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，单元和 PostgreSQL 集成测试均为 0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/api/src/files/files.module.ts apps/api/src/files/files.controller.ts apps/api/src/files/files.service.ts apps/api/src/files/file-version.service.ts apps/api/src/files/files.service.spec.ts apps/api/src/app.module.ts apps/api/test/files.integration-spec.ts && git commit -m "feat: add versioned file upload api"`

### Task 10: 实现客户链接完整生命周期

**Files:**
- Create: `apps/api/src/public-links/public-links.module.ts`
- Create: `apps/api/src/public-links/public-links.controller.ts`
- Create: `apps/api/src/public-links/public-links.service.ts`
- Create: `apps/api/src/public-links/public-token.generator.ts`
- Create: `apps/api/src/public-links/public-token.guard.ts`
- Test: `apps/api/src/public-links/public-links.service.spec.ts`
- Test: `apps/api/test/public-links.integration-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1a: 写令牌失败测试**：至少 128 位随机熵且数据库只存摘要。
- [ ] **Step 1b: 写时间失败测试**：默认无固定天数、不得超过业务截止时间，并支持续期。
- [ ] **Step 1c: 写撤销失败测试**：停用和重新生成立即撤销旧令牌，终态禁止开放。
- [ ] **Step 1d: 写公开响应与审计失败测试**：所有无效原因返回同一结果，每个管理动作写审计事件。
- [ ] **Step 2a: 运行 `pnpm --filter @auth/api test -- src/public-links/public-links.service.spec.ts`。** Expected: FAIL，提示 `PublicLinksService` 尚不存在。
- [ ] **Step 2b: 运行 `pnpm --filter @auth/api test:integration -- public-links.integration-spec.ts`。** Expected: FAIL，提示公开链接路由未注册。
- [ ] **Step 3a: 在 token generator/guard 实现随机令牌、摘要解析和统一无效结果。**
- [ ] **Step 3b: 在 service/controller 实现生成、续期、停用和重新生成事务。**
- [ ] **Step 3c: 将公开链接模块导入 `app.module.ts`；任何响应不得暴露业务单是否存在。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，旧令牌与终态业务单断言全部通过，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/api/src/public-links/public-links.module.ts apps/api/src/public-links/public-links.controller.ts apps/api/src/public-links/public-links.service.ts apps/api/src/public-links/public-token.generator.ts apps/api/src/public-links/public-token.guard.ts apps/api/src/public-links/public-links.service.spec.ts apps/api/src/app.module.ts apps/api/test/public-links.integration-spec.ts && git commit -m "feat: add public link lifecycle"`

### Task 11: 实现问卷草稿、版本冲突与正式提交

**Files:**
- Create: `apps/api/src/questionnaires/questionnaires.module.ts`
- Create: `apps/api/src/questionnaires/questionnaires.controller.ts`
- Create: `apps/api/src/questionnaires/questionnaires.service.ts`
- Create: `apps/api/src/questionnaires/submission-validator.ts`
- Create: `apps/api/src/questionnaires/answer-version.service.ts`
- Test: `apps/api/src/questionnaires/questionnaires.service.spec.ts`
- Test: `apps/api/test/questionnaires.integration-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1a: 写草稿版本失败测试**：首次保存进入“客户填写中”，每次保存追加回答版本。
- [ ] **Step 1b: 写冲突失败测试**：版本不匹配返回 409 和服务端版本，不自动合并或覆盖。
- [ ] **Step 1c: 写提交门禁失败测试**：必填字段、文件、声明及有效签署缺一不可。
- [ ] **Step 1d: 写补件失败测试**：仅开放已驳回资料项并保留其他版本。
- [ ] **Step 2a: 运行 `pnpm --filter @auth/api test -- src/questionnaires/questionnaires.service.spec.ts`。** Expected: FAIL，提示 `QuestionnairesService` 尚不存在。
- [ ] **Step 2b: 运行 `pnpm --filter @auth/api test:integration -- questionnaires.integration-spec.ts`。** Expected: FAIL，提示问卷路由未注册。
- [ ] **Step 3a: 在 `answer-version.service.ts` 实现回答版本追加和乐观锁比较。**
- [ ] **Step 3b: 在 `submission-validator.ts` 实现逐项正式提交门禁。**
- [ ] **Step 3c: 在 service/controller 实现草稿读取、保存、正式提交和补件事务。**
- [ ] **Step 3d: 将问卷模块导入 `app.module.ts`，返回稳定版本号及逐项校验错误。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，409、补件锁定和版本历史测试均通过，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/api/src/questionnaires/questionnaires.module.ts apps/api/src/questionnaires/questionnaires.controller.ts apps/api/src/questionnaires/questionnaires.service.ts apps/api/src/questionnaires/submission-validator.ts apps/api/src/questionnaires/answer-version.service.ts apps/api/src/questionnaires/questionnaires.service.spec.ts apps/api/src/app.module.ts apps/api/test/questionnaires.integration-spec.ts && git commit -m "feat: add versioned questionnaire workflow"`

### Task 13: 实现确定性安全 HTML 渲染器

**Files:**
- Create: `packages/template-engine/src/renderer.ts`
- Create: `packages/template-engine/src/page.renderer.ts`
- Create: `packages/template-engine/src/text.renderer.ts`
- Create: `packages/template-engine/src/table.renderer.ts`
- Create: `packages/template-engine/src/pagination.ts`
- Test: `packages/template-engine/src/renderer.test.ts`
- Test: `packages/template-engine/src/renderer.snapshot.test.ts`
- Test: `packages/template-engine/fixtures/full-template.json`
- Modify: `packages/template-engine/src/index.ts`
- Modify: `apps/api/src/templates/templates.service.ts`
- Test: `apps/api/src/templates/templates.service.spec.ts`

- [ ] **Step 1a: 在 `renderer.test.ts` 写页面节点失败测试**：A4、标题、段落、字体、对齐、间距、页眉、页脚、分页、表格、图片和固定文本。
- [ ] **Step 1b: 在 `renderer.test.ts` 写数据节点失败测试**：五类变量、3/20 条物料循环、长文本和签章锚点。
- [ ] **Step 1c: 在 `renderer.snapshot.test.ts` 写安全与确定性失败测试**：文本转义、脚本拒绝、未批准 URL 拒绝及重复渲染字节一致。
- [ ] **Step 2: 运行 `pnpm --filter @auth/template-engine test -- src/renderer.test.ts src/renderer.snapshot.test.ts`。** Expected: FAIL，提示无法加载 `./renderer`。
- [ ] **Step 3a: 在 `page.renderer.ts` 和 `pagination.ts` 实现固定页面、页眉页脚及分页。**
- [ ] **Step 3b: 在 `text.renderer.ts` 实现固定文本、变量、转义和 URL 白名单。**
- [ ] **Step 3c: 在 `table.renderer.ts` 实现普通表格及物料循环。**
- [ ] **Step 3d: 在 `renderer.ts` 组合节点渲染器并输出稳定签章锚点，在 `index.ts` 导出渲染接口。**
- [ ] **Step 3e: 修改 Chunk 1 的 `templates.service.ts`，在发布事务中调用既有 `validateTemplateForPublish` 后渲染，并同时保存不可变 AST 与 HTML 快照。**
- [ ] **Step 4a: 运行 `pnpm --filter @auth/template-engine test -- src/renderer.test.ts src/renderer.snapshot.test.ts`。** Expected: PASS，3 条与 20 条物料快照稳定，0 failed。
- [ ] **Step 4b: 运行 `pnpm --filter @auth/api test -- src/templates/templates.service.spec.ts`。** Expected: PASS，发布记录同时包含 AST 与 HTML 快照，0 failed。
- [ ] **Step 5: 提交。** Run: `git add packages/template-engine/src/renderer.ts packages/template-engine/src/page.renderer.ts packages/template-engine/src/text.renderer.ts packages/template-engine/src/table.renderer.ts packages/template-engine/src/pagination.ts packages/template-engine/src/renderer.test.ts packages/template-engine/src/renderer.snapshot.test.ts packages/template-engine/fixtures/full-template.json packages/template-engine/src/index.ts apps/api/src/templates/templates.service.ts apps/api/src/templates/templates.service.spec.ts && git commit -m "feat: add deterministic template renderer"`

### Task 14: 实现印章图片透明化处理

**Files:**
- Create: `apps/worker/src/signatures/stamp.processor.ts`
- Create: `apps/worker/src/signatures/stamp-processing.types.ts`
- Test: `apps/worker/src/signatures/stamp.processor.spec.ts`
- Test: `apps/worker/test/fixtures/stamp-light-background.png`
- Test: `apps/worker/test/fixtures/stamp-transparent-edge.png`

- [ ] **Step 1a: 写像素失败测试**：浅色背景透明化和透明边缘裁剪。
- [ ] **Step 1b: 写资源失败测试**：尺寸上限、处理图哈希及原图不可覆盖。
- [ ] **Step 1c: 写处理失败测试**：保留原图并返回客户可确认、重新上传或切换手写的状态。
- [ ] **Step 2: 运行 `pnpm --filter @auth/worker test -- src/signatures/stamp.processor.spec.ts`。** Expected: FAIL，提示 `StampProcessor` 尚不存在。
- [ ] **Step 3a: 在类型文件定义成功、需确认和处理失败结果。**
- [ ] **Step 3b: 使用 Sharp 实现透明化、裁剪和尺寸限制。**
- [ ] **Step 3c: 实现处理图哈希及原图保留；失败不得删除原图。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，像素与哈希断言通过，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/worker/src/signatures/stamp.processor.ts apps/worker/src/signatures/stamp-processing.types.ts apps/worker/src/signatures/stamp.processor.spec.ts apps/worker/test/fixtures/stamp-light-background.png apps/worker/test/fixtures/stamp-transparent-edge.png && git commit -m "feat: process stamp images"`

### Task 15: 实现签章位约束与合成

**Files:**
- Create: `apps/worker/src/signatures/signature-placement.validator.ts`
- Create: `apps/worker/src/signatures/signature.compositor.ts`
- Test: `apps/worker/src/signatures/signature-placement.validator.spec.ts`
- Test: `apps/worker/src/signatures/signature.compositor.spec.ts`

- [ ] **Step 1a: 写签章位失败测试**：用途、页码/锚点、允许位置、尺寸、必填及外接矩形边界。
- [ ] **Step 1b: 写签署模式失败测试**：手写与印章互斥，并拒绝多人或混合模式。
- [ ] **Step 1c: 写合成失败测试**：同一资源必须应用到全部甲方必填签章位。
- [ ] **Step 2: 运行 `pnpm --filter @auth/worker test -- src/signatures/signature-placement.validator.spec.ts src/signatures/signature.compositor.spec.ts`。** Expected: FAIL，提示签章校验器尚不存在。
- [ ] **Step 3a: 在 validator 中实现签章位配置和矩形边界校验。**
- [ ] **Step 3b: 在 compositor 中实现单一签署资源到全部必填位置的合成。**
- [ ] **Step 3c: 合成前重新校验模板版本、签署模式和资源哈希。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，所有越界与混合模式用例被拒绝，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/worker/src/signatures/signature-placement.validator.ts apps/worker/src/signatures/signature.compositor.ts apps/worker/src/signatures/signature-placement.validator.spec.ts apps/worker/src/signatures/signature.compositor.spec.ts && git commit -m "feat: enforce signature placement"`

### Task 15A: 生成并存储签署前 PDF

**Files:**
- Create: `apps/worker/src/pdf/pdf.renderer.ts`
- Create: `apps/worker/src/pdf/pdf.renderer.spec.ts`
- Create: `apps/worker/src/pdf/pre-sign-pdf.handler.ts`
- Test: `apps/worker/src/pdf/pre-sign-pdf.handler.spec.ts`
- Create: `apps/worker/src/worker.module.ts`
- Create: `apps/worker/src/main.ts`
- Create: `apps/api/src/signing-previews/signing-previews.module.ts`
- Create: `apps/api/src/signing-previews/signing-previews.controller.ts`
- Create: `apps/api/src/signing-previews/signing-previews.service.ts`
- Test: `apps/api/src/signing-previews/signing-previews.service.spec.ts`
- Test: `apps/api/test/signing-previews.integration-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1a: 在 `pdf.renderer.spec.ts` 写失败测试**：固定 Chromium、字体、A4、边距，并输出可读取 PDF 和 SHA-256。
- [ ] **Step 1b: 在 `pre-sign-pdf.handler.spec.ts` 写失败测试**：相同业务版本幂等，任务结果包含存储键、摘要和业务版本。
- [ ] **Step 1c: 在 `signing-previews.service.spec.ts` 写失败测试**：创建任务、查询处理中状态，并且仅在 PDF 可读取且哈希匹配后返回预览。
- [ ] **Step 1d: 在 `signing-previews.integration-spec.ts` 写失败测试**：生成的 `FileObject` 类型为 `PRE_SIGN_PDF`，保存相对路径、哈希、生成时间和业务版本，公开令牌只能访问自己的预览。
- [ ] **Step 2a: 运行 `pnpm --filter @auth/worker test -- src/pdf/pdf.renderer.spec.ts src/pdf/pre-sign-pdf.handler.spec.ts`。** Expected: FAIL，提示 PDF renderer 和 pre-sign handler 尚不存在。
- [ ] **Step 2b: 运行 `pnpm --filter @auth/api test -- src/signing-previews/signing-previews.service.spec.ts`。** Expected: FAIL，提示 `SigningPreviewsService` 尚不存在。
- [ ] **Step 2c: 运行 `pnpm --filter @auth/api test:integration -- signing-previews.integration-spec.ts`。** Expected: FAIL，提示签署预览路由未注册。
- [ ] **Step 3a: 在 `pdf.renderer.ts` 实现 HTML 到 PDF 的确定性渲染与可读取性检查。**
- [ ] **Step 3b: 在 `pre-sign-pdf.handler.ts` 实现预览任务处理，并通过存储适配器原子保存 PDF。**
- [ ] **Step 3c: 在 `signing-previews.service.ts` 实现任务创建、状态查询、哈希校验和 `PRE_SIGN_PDF` 元数据事务。**
- [ ] **Step 3d: 在 signing-previews controller/module 注册受公开令牌 Guard 保护的预览创建、状态和流式读取端点，并导入 `app.module.ts`。**
- [ ] **Step 3e: 创建 Worker module/main，注册预览处理器及优雅启动入口。**
- [ ] **Step 4a: 运行 `pnpm --filter @auth/worker test -- src/pdf/pdf.renderer.spec.ts src/pdf/pre-sign-pdf.handler.spec.ts`。** Expected: PASS，预览 PDF 可读取且摘要稳定，0 failed。
- [ ] **Step 4b: 运行 `pnpm --filter @auth/api test -- src/signing-previews/signing-previews.service.spec.ts`。** Expected: PASS，任务状态和哈希门禁测试通过，0 failed。
- [ ] **Step 4c: 运行 `pnpm --filter @auth/api test:integration -- signing-previews.integration-spec.ts`。** Expected: PASS，预览文件元数据及令牌隔离测试通过，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/worker/src/pdf/pdf.renderer.ts apps/worker/src/pdf/pdf.renderer.spec.ts apps/worker/src/pdf/pre-sign-pdf.handler.ts apps/worker/src/pdf/pre-sign-pdf.handler.spec.ts apps/worker/src/worker.module.ts apps/worker/src/main.ts apps/api/src/signing-previews/signing-previews.module.ts apps/api/src/signing-previews/signing-previews.controller.ts apps/api/src/signing-previews/signing-previews.service.ts apps/api/src/signing-previews/signing-previews.service.spec.ts apps/api/src/app.module.ts apps/api/test/signing-previews.integration-spec.ts && git commit -m "feat: generate pre-sign pdf previews"`

### Task 16: 实现签署证据记录与失效规则

**Files:**
- Create: `apps/api/src/signatures/signatures.module.ts`
- Create: `apps/api/src/signatures/signatures.controller.ts`
- Create: `apps/api/src/signatures/signatures.service.ts`
- Create: `apps/api/src/signatures/signature-invalidation.service.ts`
- Create: `apps/api/src/signatures/signature-record.mapper.ts`
- Test: `apps/api/src/signatures/signatures.service.spec.ts`
- Test: `apps/api/test/signatures.integration-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/questionnaires/questionnaires.service.ts`
- Test: `apps/api/src/questionnaires/questionnaires.service.spec.ts`
- Modify: `apps/api/src/cases/case-draft.service.ts`
- Test: `apps/api/test/cases.integration-spec.ts`
- Modify: `apps/api/src/cases/case-command.service.ts`
- Test: `apps/api/src/cases/case-command.service.spec.ts`

- [ ] **Step 1a: 在 `signatures.service.spec.ts` 写证据失败测试**：签署前 PDF 与摘要必须存在，并记录方式、资源版本、PDF 哈希、时间、IP、User-Agent、业务版本、原图和处理图引用。
- [ ] **Step 1b: 在问卷、业务单草稿和命令测试中写失效失败测试**：内容变化保留旧记录但标记失效，并要求重新预览、签署和确认声明。
- [ ] **Step 2a: 运行 `pnpm --filter @auth/api test -- src/signatures/signatures.service.spec.ts`。** Expected: FAIL，提示 `SignaturesService` 尚不存在。
- [ ] **Step 2b: 运行 `pnpm --filter @auth/api test:integration -- signatures.integration-spec.ts`。** Expected: FAIL，提示签署路由未注册。
- [ ] **Step 3a: 在 `signature-record.mapper.ts` 映射并白名单化签署证据字段。**
- [ ] **Step 3b: 在 `signatures.service.ts` 实现签署记录事务，并校验 `PRE_SIGN_PDF` 哈希及业务版本；在 `app.module.ts` 导入签署模块。**
- [ ] **Step 3c: 在 `signature-invalidation.service.ts` 实现只追加失效记录。**
- [ ] **Step 3d: 修改问卷服务、Chunk 1 的 `case-draft.service.ts` 和 `case-command.service.ts`，在影响授权书内容的提交事务中调用失效服务。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，旧签署记录仍可查询且不能用于新版本提交，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/api/src/signatures/signatures.module.ts apps/api/src/signatures/signatures.controller.ts apps/api/src/signatures/signatures.service.ts apps/api/src/signatures/signature-invalidation.service.ts apps/api/src/signatures/signature-record.mapper.ts apps/api/src/signatures/signatures.service.spec.ts apps/api/src/questionnaires/questionnaires.service.ts apps/api/src/questionnaires/questionnaires.service.spec.ts apps/api/src/cases/case-draft.service.ts apps/api/src/cases/case-command.service.ts apps/api/src/cases/case-command.service.spec.ts apps/api/test/cases.integration-spec.ts apps/api/src/app.module.ts apps/api/test/signatures.integration-spec.ts && git commit -m "feat: record and invalidate signatures"`

### Task 17: 实现最终 PDF Worker

**Files:**
- Modify: `apps/worker/src/pdf/pdf.renderer.ts`
- Create: `apps/worker/src/pdf/pdf-job.handler.ts`
- Create: `apps/worker/src/pdf/pdf-job.repository.ts`
- Create: `apps/worker/src/pdf/pdf-finalization.publisher.ts`
- Modify: `apps/worker/src/pdf/pdf.renderer.spec.ts`
- Test: `apps/worker/src/pdf/pdf-job.handler.spec.ts`
- Test: `apps/worker/src/pdf/pdf-finalization.publisher.spec.ts`
- Test: `apps/worker/test/fixtures/readable-template.html`
- Modify: `apps/worker/src/worker.module.ts`

- [ ] **Step 1a: 扩展 `pdf.renderer.spec.ts`**：断言最终 PDF 与签署预览复用相同 Chromium、字体、A4、边距和 HTML 快照。
- [ ] **Step 1b: 在 `pdf-job.handler.spec.ts` 写任务失败测试**：保存最终 SHA-256、生成时间和业务版本，以业务版本为幂等键，有限重试并记录失败原因。
- [ ] **Step 1c: 在 `pdf-finalization.publisher.spec.ts` 写失败测试**：仅在最终文件持久化成功后向 pg-boss 发布 `authorization-pdf-finalized`，载荷包含 jobId、caseId、businessVersion、fileObjectId 和 sha256，重复发布使用 jobId 幂等键。
- [ ] **Step 2: 运行 `pnpm --filter @auth/worker test -- src/pdf/pdf.renderer.spec.ts src/pdf/pdf-job.handler.spec.ts src/pdf/pdf-finalization.publisher.spec.ts`。** Expected: FAIL，提示 `PdfJobHandler` 和 `PdfFinalizationPublisher` 尚不存在。
- [ ] **Step 3a: 扩展 `pdf.renderer.ts`，让预览和最终文件使用同一确定性渲染入口。**
- [ ] **Step 3b: 在 `pdf-job.repository.ts` 实现业务版本幂等创建和有限重试状态更新。**
- [ ] **Step 3c: 在 `pdf-finalization.publisher.ts` 实现带 jobId 幂等键的完成事件发布。**
- [ ] **Step 3d: 在 `pdf-job.handler.ts` 实现最终文件合成、可读取性检查和结果持久化，事务成功后调用 publisher。**
- [ ] **Step 3e: 修改 `worker.module.ts` 注册最终 PDF handler 和 publisher。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，可读取性、哈希、重试与幂等测试均通过，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/worker/src/pdf/pdf.renderer.ts apps/worker/src/pdf/pdf-job.handler.ts apps/worker/src/pdf/pdf-job.repository.ts apps/worker/src/pdf/pdf-finalization.publisher.ts apps/worker/src/pdf/pdf.renderer.spec.ts apps/worker/src/pdf/pdf-job.handler.spec.ts apps/worker/src/pdf/pdf-finalization.publisher.spec.ts apps/worker/test/fixtures/readable-template.html apps/worker/src/worker.module.ts && git commit -m "feat: generate authorization pdfs"`

### Task 18: 实现最终完成事务与人工重试 API

**Files:**
- Create: `apps/api/src/pdf/pdf.module.ts`
- Create: `apps/api/src/pdf/pdf.controller.ts`
- Create: `apps/api/src/pdf/pdf-finalization.service.ts`
- Create: `apps/api/src/pdf/pdf-finalization.consumer.ts`
- Create: `apps/api/src/pdf/pdf-retry.service.ts`
- Test: `apps/api/src/pdf/pdf-finalization.service.spec.ts`
- Test: `apps/api/src/pdf/pdf-finalization.consumer.spec.ts`
- Test: `apps/api/test/pdf-finalization.integration-spec.ts`
- Test: `apps/api/test/pdf-finalization-handoff.integration-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1a: 写最终化门禁失败测试**：资料项、声明、签署、签章位、PDF 可读取性和 SHA-256 全部满足才完成。
- [ ] **Step 1b: 写事务失败测试**：状态和链接关闭原子提交，完成后链接 1 秒内失效。
- [ ] **Step 1c: 写失败/重试测试**：耗尽重试进入失败态，只有管理员/审核员可重试。
- [ ] **Step 1d: 写幂等失败测试**：重复完成事件不产生第二最终记录。
- [ ] **Step 1e: 在 consumer 和 handoff 集成测试中写失败场景**：消费 `authorization-pdf-finalized` 后调用最终化事务；暂时性失败由 pg-boss 重试；成功后确认消息；重复消息仍只完成一次。
- [ ] **Step 2a: 运行 `pnpm --filter @auth/api test -- src/pdf/pdf-finalization.service.spec.ts`。** Expected: FAIL，提示 `PdfFinalizationService` 尚不存在。
- [ ] **Step 2b: 运行 `pnpm --filter @auth/api test:integration -- pdf-finalization.integration-spec.ts`。** Expected: FAIL，提示 PDF 最终化路由未注册。
- [ ] **Step 2c: 运行 `pnpm --filter @auth/api test -- src/pdf/pdf-finalization.consumer.spec.ts`。** Expected: FAIL，提示 `PdfFinalizationConsumer` 尚不存在。
- [ ] **Step 2d: 运行 `pnpm --filter @auth/api test:integration -- pdf-finalization-handoff.integration-spec.ts`。** Expected: FAIL，完成事件无人消费，业务单停留在 `PENDING_FINAL_FILE`。
- [ ] **Step 3a: 在 `pdf-finalization.service.ts` 实现全部完成门禁及单事务状态/链接更新。**
- [ ] **Step 3b: 在 `pdf-retry.service.ts` 实现失败态到待生成态的授权重试命令。**
- [ ] **Step 3c: 在 `pdf-finalization.consumer.ts` 订阅 `authorization-pdf-finalized`，调用最终化服务，并仅在事务成功后确认消息。**
- [ ] **Step 3d: 在 controller/module 注册状态查询、人工重试端点和完成事件 consumer，并将 PDF 模块导入 `app.module.ts`。**
- [ ] **Step 4a: 运行 `pnpm --filter @auth/api test -- src/pdf/pdf-finalization.service.spec.ts src/pdf/pdf-finalization.consumer.spec.ts`。** Expected: PASS，门禁、消费重试和幂等测试通过，0 failed。
- [ ] **Step 4b: 运行 `pnpm --filter @auth/api test:integration -- pdf-finalization.integration-spec.ts`。** Expected: PASS，原子性、403 和 1 秒链接失效断言通过，0 failed。
- [ ] **Step 4c: 运行 `pnpm --filter @auth/api test:integration -- pdf-finalization-handoff.integration-spec.ts`。** Expected: PASS，Worker 完成事件使业务单进入 `COMPLETED`，重复事件仍只有一个最终记录。
- [ ] **Step 5: 提交。** Run: `git add apps/api/src/pdf/pdf.module.ts apps/api/src/pdf/pdf.controller.ts apps/api/src/pdf/pdf-finalization.service.ts apps/api/src/pdf/pdf-finalization.consumer.ts apps/api/src/pdf/pdf-retry.service.ts apps/api/src/pdf/pdf-finalization.service.spec.ts apps/api/src/pdf/pdf-finalization.consumer.spec.ts apps/api/src/app.module.ts apps/api/test/pdf-finalization.integration-spec.ts apps/api/test/pdf-finalization-handoff.integration-spec.ts && git commit -m "feat: finalize and retry authorization pdfs"`

### Task 19: 验证 Worker 崩溃恢复

**Files:**
- Create: `apps/worker/test/pdf-recovery.integration-spec.ts`
- Create: `apps/worker/test/helpers/worker-process.ts`
- Create: `apps/worker/src/config/pg-boss.config.ts`
- Modify: `apps/worker/src/pdf/pdf-job.handler.ts`
- Modify: `apps/worker/src/worker.module.ts`
- Modify: `apps/worker/src/main.ts`

- [ ] **Step 1a: 在恢复测试中实现可控 Worker 子进程启动、终止和重启夹具。**
- [ ] **Step 1b: 写失败场景**：任务进入 active 后终止 Worker，再启动新 Worker，断言 60 秒内完成且最终记录只有一条。
- [ ] **Step 1c: 写数据完整性场景**：重启前后的业务版本、源文件、签署记录和任务行保持不变。
- [ ] **Step 1d: 写恢复交接场景**：恢复后的 Worker 仅发布一个完成事件，API consumer 最终只完成业务单一次。
- [ ] **Step 2: 运行 `pnpm --filter @auth/worker test:integration -- pdf-recovery.integration-spec.ts`。** Expected: FAIL with `Timed out waiting 60000ms for recovered pdf job`。
- [ ] **Step 3a: 在 `pg-boss.config.ts` 固定 retryLimit、retryDelay、expireInSeconds 和归档策略。**
- [ ] **Step 3b: 修改 `pdf-job.handler.ts`，让重复领取复用业务版本幂等记录。**
- [ ] **Step 3c: 修改 `worker.module.ts` 注册恢复配置，并在 `main.ts` 实现停止接单、等待当前事务和关闭连接的优雅关闭。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，恢复耗时小于或等于 60 秒，最终记录数为 1。
- [ ] **Step 5: 提交。** Run: `git add apps/worker/test/pdf-recovery.integration-spec.ts apps/worker/test/helpers/worker-process.ts apps/worker/src/config/pg-boss.config.ts apps/worker/src/pdf/pdf-job.handler.ts apps/worker/src/worker.module.ts apps/worker/src/main.ts && git commit -m "test: verify pdf worker recovery"`

### Task 20: 构建管理后台应用壳与权限路由

**Files:**
- Create: `apps/admin/src/app/App.tsx`
- Create: `apps/admin/src/app/router.tsx`
- Create: `apps/admin/src/auth/AuthProvider.tsx`
- Create: `apps/admin/src/auth/RouteGuard.tsx`
- Create: `apps/admin/src/errors/ForbiddenPage.tsx`
- Test: `apps/admin/src/app/App.test.tsx`
- Test: `apps/admin/src/auth/RouteGuard.test.tsx`

- [ ] **Step 1a: 在 `App.test.tsx` 写加载、无角色和能力菜单失败测试。**
- [ ] **Step 1b: 在 `RouteGuard.test.tsx` 写路由拒绝及后端 403 错误页失败测试。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/admin test -- src/app/App.test.tsx src/auth/RouteGuard.test.tsx`。** Expected: FAIL，提示 `App` 或 `RouteGuard` 尚不存在。
- [ ] **Step 3a: 实现 AuthProvider 的加载、成功和失败状态。**
- [ ] **Step 3b: 实现 RouteGuard 和 ForbiddenPage。**
- [ ] **Step 3c: 实现 App 布局及按能力生成的 router；前端隐藏按钮不替代后端权限。**
- [ ] **Step 4: 运行测试及 `pnpm --filter @auth/admin typecheck && pnpm --filter @auth/admin build`。** Expected: PASS，测试 0 failed，typecheck/build 退出码 0。
- [ ] **Step 5: 提交。** Run: `git add apps/admin/src/app/App.tsx apps/admin/src/app/router.tsx apps/admin/src/app/App.test.tsx apps/admin/src/auth/AuthProvider.tsx apps/admin/src/auth/RouteGuard.tsx apps/admin/src/auth/RouteGuard.test.tsx apps/admin/src/errors/ForbiddenPage.tsx && git commit -m "feat: add admin shell and guarded routes"`

### Task 21: 实现数据范围过滤的工作台 API

**Files:**
- Create: `apps/api/src/dashboard/dashboard.module.ts`
- Create: `apps/api/src/dashboard/dashboard.controller.ts`
- Create: `apps/api/src/dashboard/dashboard.service.ts`
- Test: `apps/api/src/dashboard/dashboard.service.spec.ts`
- Test: `apps/api/test/dashboard.integration-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1a: 写五类状态数量聚合失败测试。**
- [ ] **Step 1b: 写最近和超期业务单失败测试。**
- [ ] **Step 1c: 对两类查询分别写 SELF/DEPT/ALL 数据范围失败测试。**
- [ ] **Step 2a: 运行 `pnpm --filter @auth/api test -- src/dashboard/dashboard.service.spec.ts`。** Expected: FAIL，提示 `DashboardService` 尚不存在。
- [ ] **Step 2b: 运行 `pnpm --filter @auth/api test:integration -- dashboard.integration-spec.ts`。** Expected: FAIL，提示工作台路由未注册。
- [ ] **Step 3a: 在 service 实现五类状态聚合及最近/超期查询，并复用能力服务的数据范围条件。**
- [ ] **Step 3b: 在 controller/module 注册只读端点，并将工作台模块导入 `app.module.ts`。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，三个数据范围结果符合种子数据，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/api/src/dashboard/dashboard.module.ts apps/api/src/dashboard/dashboard.controller.ts apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/dashboard.service.spec.ts apps/api/src/app.module.ts apps/api/test/dashboard.integration-spec.ts && git commit -m "feat: add scoped dashboard api"`

### Task 22: 构建管理后台工作台页面

**Files:**
- Create: `apps/admin/src/features/dashboard/DashboardPage.tsx`
- Create: `apps/admin/src/features/dashboard/StatusCards.tsx`
- Create: `apps/admin/src/features/dashboard/RecentCases.tsx`
- Create: `apps/admin/src/features/dashboard/OverdueCases.tsx`
- Test: `apps/admin/src/features/dashboard/DashboardPage.test.tsx`
- Modify: `apps/admin/src/app/router.tsx`

- [ ] **Step 1a: 写五类状态卡、最近和超期列表失败测试。**
- [ ] **Step 1b: 写加载、空状态、请求失败和 403 失败测试。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/admin test -- src/features/dashboard/DashboardPage.test.tsx`。** Expected: FAIL，提示 `DashboardPage` 尚不存在。
- [ ] **Step 3a: 实现状态卡、最近列表和超期列表组件。**
- [ ] **Step 3b: 实现 DashboardPage 的加载、空状态和错误状态。**
- [ ] **Step 3c: 在 `router.tsx` 注册受保护路由；页面只消费服务端已过滤结果。**
- [ ] **Step 4: 运行测试及 `pnpm --filter @auth/admin typecheck`。** Expected: PASS，测试 0 failed，typecheck 退出码 0。
- [ ] **Step 5: 提交。** Run: `git add apps/admin/src/features/dashboard/DashboardPage.tsx apps/admin/src/features/dashboard/StatusCards.tsx apps/admin/src/features/dashboard/RecentCases.tsx apps/admin/src/features/dashboard/OverdueCases.tsx apps/admin/src/features/dashboard/DashboardPage.test.tsx apps/admin/src/app/router.tsx && git commit -m "feat: add admin dashboard"`

### Task 23: 扩展业务单查询与管理命令 API

**Files:**
- Modify: `apps/api/src/cases/case-query.service.ts`
- Modify: `apps/api/src/cases/case-command.service.ts`
- Modify: `apps/api/src/cases/cases.controller.ts`
- Test: `apps/api/src/cases/case-query.service.spec.ts`
- Test: `apps/api/src/cases/case-command.service.spec.ts`

- [ ] **Step 1a: 在 query 测试中逐项覆盖编号、客户、工厂/部门、客服、状态和日期筛选。**
- [ ] **Step 1b: 在 command 测试中覆盖续期、停用、重新生成、关闭原因和终态只读。**
- [ ] **Step 1c: 在 command 测试中覆盖 SELF 禁止改派及 DEPT 仅同部门改派。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/api test -- src/cases/case-query.service.spec.ts src/cases/case-command.service.spec.ts`。** Expected: FAIL，新增筛选或链接生命周期断言未满足；不得出现模块缺失错误。
- [ ] **Step 3a: 扩展 Chunk 1 的 query service，加入缺失的组合筛选并保留既有能力范围条件。**
- [ ] **Step 3b: 扩展 Chunk 1 的 command service，复用既有关闭/改派事务并接入链接续期、停用和重新生成命令。**
- [ ] **Step 3c: 修改 controller 暴露端点；每个命令写审计事件并调用既有状态机。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，筛选、403、关闭原因和改派矩阵均通过，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/api/src/cases/case-query.service.ts apps/api/src/cases/case-command.service.ts apps/api/src/cases/cases.controller.ts apps/api/src/cases/case-query.service.spec.ts apps/api/src/cases/case-command.service.spec.ts && git commit -m "feat: add case queries and commands"`

### Task 24: 构建业务单列表与链接操作页面

**Files:**
- Create: `apps/admin/src/features/cases/CaseListPage.tsx`
- Create: `apps/admin/src/features/cases/CaseFilters.tsx`
- Create: `apps/admin/src/features/cases/CaseLinkActions.tsx`
- Create: `apps/admin/src/features/cases/CaseAssignmentDialog.tsx`
- Test: `apps/admin/src/features/cases/CaseListPage.test.tsx`
- Test: `apps/admin/src/features/cases/CaseLinkActions.test.tsx`
- Modify: `apps/admin/src/app/router.tsx`

- [ ] **Step 1a: 在列表测试中覆盖筛选、加载和空状态。**
- [ ] **Step 1b: 在链接操作测试中覆盖复制、续期、停用、重新生成和关闭原因。**
- [ ] **Step 1c: 在列表测试中覆盖能力控制和改派限制。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/admin test -- src/features/cases/CaseListPage.test.tsx src/features/cases/CaseLinkActions.test.tsx`。** Expected: FAIL，提示业务单页面组件尚不存在。
- [ ] **Step 3a: 实现 CaseFilters 和 CaseListPage。**
- [ ] **Step 3b: 实现 CaseLinkActions。**
- [ ] **Step 3c: 实现 CaseAssignmentDialog 并在 `router.tsx` 注册路由。**
- [ ] **Step 4: 运行测试及 `pnpm --filter @auth/admin typecheck`。** Expected: PASS，测试 0 failed，typecheck 退出码 0。
- [ ] **Step 5: 提交。** Run: `git add apps/admin/src/features/cases/CaseListPage.tsx apps/admin/src/features/cases/CaseFilters.tsx apps/admin/src/features/cases/CaseLinkActions.tsx apps/admin/src/features/cases/CaseAssignmentDialog.tsx apps/admin/src/features/cases/CaseListPage.test.tsx apps/admin/src/features/cases/CaseLinkActions.test.tsx apps/admin/src/app/router.tsx && git commit -m "feat: add admin case management"`

### Task 25: 构建业务单创建与详情页

**Files:**
- Create: `apps/admin/src/features/cases/CaseCreatePage.tsx`
- Create: `apps/admin/src/features/cases/MaterialItemsEditor.tsx`
- Create: `apps/admin/src/features/cases/RequirementSelector.tsx`
- Create: `apps/admin/src/features/cases/CaseDetailPage.tsx`
- Create: `apps/admin/src/features/cases/CaseDetailTabs.tsx`
- Test: `apps/admin/src/features/cases/CaseCreatePage.test.tsx`
- Test: `apps/admin/src/features/cases/CaseDetailPage.test.tsx`
- Modify: `apps/admin/src/app/router.tsx`

- [ ] **Step 1a: 在创建页测试中覆盖多个物料、报价快照、必选授权书和资料项选择。**
- [ ] **Step 1b: 在详情页测试中覆盖基本信息、物料、问卷和文件页签。**
- [ ] **Step 1c: 在详情页测试中覆盖授权书、审核记录和操作日志页签。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/admin test -- src/features/cases/CaseCreatePage.test.tsx src/features/cases/CaseDetailPage.test.tsx`。** Expected: FAIL，提示创建或详情页尚不存在。
- [ ] **Step 3a: 实现物料编辑器、资料选择器和创建页。**
- [ ] **Step 3b: 实现详情页签容器及七个只读页签。**
- [ ] **Step 3c: 在 `router.tsx` 注册创建/详情路由；历史业务单仅展示保存的快照。**
- [ ] **Step 4: 运行测试及 `pnpm --filter @auth/admin build`。** Expected: PASS，测试 0 failed，build 退出码 0。
- [ ] **Step 5: 提交。** Run: `git add apps/admin/src/features/cases/CaseCreatePage.tsx apps/admin/src/features/cases/MaterialItemsEditor.tsx apps/admin/src/features/cases/RequirementSelector.tsx apps/admin/src/features/cases/CaseDetailPage.tsx apps/admin/src/features/cases/CaseDetailTabs.tsx apps/admin/src/features/cases/CaseCreatePage.test.tsx apps/admin/src/features/cases/CaseDetailPage.test.tsx apps/admin/src/app/router.tsx && git commit -m "feat: add case creation and details"`

### Task 26: 实现逐项审核与复审 API

**Files:**
- Create: `apps/api/src/reviews/reviews.module.ts`
- Create: `apps/api/src/reviews/reviews.controller.ts`
- Create: `apps/api/src/reviews/reviews.service.ts`
- Create: `apps/api/src/reviews/review-diff.service.ts`
- Test: `apps/api/src/reviews/reviews.service.spec.ts`
- Test: `apps/api/test/reviews.integration-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1a: 写部门队列原子领取失败测试。**
- [ ] **Step 1b: 写逐项通过/驳回失败测试，覆盖必填原因及字段/文件定位。**
- [ ] **Step 1c: 写复审失败测试，覆盖差异和其他已通过项只读。**
- [ ] **Step 1d: 写确认通过门禁及 PDF 人工重试权限失败测试。**
- [ ] **Step 2a: 运行 `pnpm --filter @auth/api test -- src/reviews/reviews.service.spec.ts`。** Expected: FAIL，提示 `ReviewsService` 尚不存在。
- [ ] **Step 2b: 运行 `pnpm --filter @auth/api test:integration -- reviews.integration-spec.ts`。** Expected: FAIL，提示审核路由未注册。
- [ ] **Step 3a: 在 `review-diff.service.ts` 实现回答、文件和签署版本差异。**
- [ ] **Step 3b: 在 `reviews.service.ts` 实现领取、通过、驳回、复审和确认通过事务。**
- [ ] **Step 3c: 在 controller/module 注册审核端点并导入 `app.module.ts`；每个动作写审计事件。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，原子领取、驳回锁定和复审差异均通过，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/api/src/reviews/reviews.module.ts apps/api/src/reviews/reviews.controller.ts apps/api/src/reviews/reviews.service.ts apps/api/src/reviews/review-diff.service.ts apps/api/src/reviews/reviews.service.spec.ts apps/api/src/app.module.ts apps/api/test/reviews.integration-spec.ts && git commit -m "feat: add item review workflow"`

### Task 27: 构建审核队列与复审页面

**Files:**
- Create: `apps/admin/src/features/reviews/ReviewQueuePage.tsx`
- Create: `apps/admin/src/features/reviews/ReviewDetailPage.tsx`
- Create: `apps/admin/src/features/reviews/RequirementReviewPanel.tsx`
- Create: `apps/admin/src/features/reviews/ReviewDiffPanel.tsx`
- Create: `apps/admin/src/features/reviews/PdfRetryButton.tsx`
- Test: `apps/admin/src/features/reviews/ReviewQueuePage.test.tsx`
- Test: `apps/admin/src/features/reviews/ReviewDetailPage.test.tsx`
- Modify: `apps/admin/src/app/router.tsx`

- [ ] **Step 1a: 在队列页测试中覆盖领取、并发失败和空状态。**
- [ ] **Step 1b: 在详情页测试中覆盖逐项通过、必填驳回原因及字段/文件定位。**
- [ ] **Step 1c: 在详情页测试中覆盖复审差异、确认通过和 PDF 重试权限。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/admin test -- src/features/reviews/ReviewQueuePage.test.tsx src/features/reviews/ReviewDetailPage.test.tsx`。** Expected: FAIL，提示审核页面组件尚不存在。
- [ ] **Step 3a: 实现 ReviewQueuePage。**
- [ ] **Step 3b: 实现 RequirementReviewPanel 和 ReviewDiffPanel。**
- [ ] **Step 3c: 实现 ReviewDetailPage 和 PdfRetryButton，并在 `router.tsx` 注册受保护路由。**
- [ ] **Step 4: 运行测试及 `pnpm --filter @auth/admin typecheck`。** Expected: PASS，测试 0 failed，typecheck 退出码 0。
- [ ] **Step 5: 提交。** Run: `git add apps/admin/src/features/reviews/ReviewQueuePage.tsx apps/admin/src/features/reviews/ReviewDetailPage.tsx apps/admin/src/features/reviews/RequirementReviewPanel.tsx apps/admin/src/features/reviews/ReviewDiffPanel.tsx apps/admin/src/features/reviews/PdfRetryButton.tsx apps/admin/src/features/reviews/ReviewQueuePage.test.tsx apps/admin/src/features/reviews/ReviewDetailPage.test.tsx apps/admin/src/app/router.tsx && git commit -m "feat: add admin review workflow"`

### Task 28: 构建资料项配置页面

**Files:**
- Create: `apps/admin/src/features/requirements/RequirementListPage.tsx`
- Create: `apps/admin/src/features/requirements/RequirementEditorPage.tsx`
- Create: `apps/admin/src/features/requirements/RequirementFieldEditor.tsx`
- Test: `apps/admin/src/features/requirements/RequirementEditorPage.test.tsx`
- Modify: `apps/admin/src/app/router.tsx`

- [ ] **Step 1a: 写八类资料字段创建与切换失败测试。**
- [ ] **Step 1b: 写标题、说明、示例、必填、默认值、格式、大小、数量和排序失败测试。**
- [ ] **Step 1c: 写草稿、发布、复制、停用及发布版本只读失败测试。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/admin test -- src/features/requirements/RequirementEditorPage.test.tsx`。** Expected: FAIL，提示资料项编辑器尚不存在。
- [ ] **Step 3a: 实现 RequirementFieldEditor。**
- [ ] **Step 3b: 实现 RequirementEditorPage 的校验和生命周期操作。**
- [ ] **Step 3c: 实现 RequirementListPage 并在 `router.tsx` 注册路由；内置授权书不可删除。**
- [ ] **Step 4: 运行测试及 `pnpm --filter @auth/admin build`。** Expected: PASS，测试 0 failed，build 退出码 0。
- [ ] **Step 5: 提交。** Run: `git add apps/admin/src/features/requirements/RequirementListPage.tsx apps/admin/src/features/requirements/RequirementEditorPage.tsx apps/admin/src/features/requirements/RequirementFieldEditor.tsx apps/admin/src/features/requirements/RequirementEditorPage.test.tsx apps/admin/src/app/router.tsx && git commit -m "feat: add requirement configuration ui"`

### Task 29: 构建模板基础排版编辑器

**Files:**
- Create: `apps/admin/src/features/templates/TemplateEditorPage.tsx`
- Create: `apps/admin/src/features/templates/PageSettingsPanel.tsx`
- Create: `apps/admin/src/features/templates/TextBlockEditor.tsx`
- Create: `apps/admin/src/features/templates/TableBlockEditor.tsx`
- Create: `apps/admin/src/features/templates/ImageBlockEditor.tsx`
- Test: `apps/admin/src/features/templates/TemplateEditorPage.test.tsx`

- [ ] **Step 1a: 写 A4、页眉、页脚和分页 AST 失败测试。**
- [ ] **Step 1b: 写标题、段落、字体、对齐和间距 AST 失败测试。**
- [ ] **Step 1c: 写表格、图片和固定文本 AST 失败测试。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/admin test -- src/features/templates/TemplateEditorPage.test.tsx`。** Expected: FAIL，提示 `TemplateEditorPage` 尚不存在。
- [ ] **Step 3a: 实现 PageSettingsPanel。**
- [ ] **Step 3b: 实现 TextBlockEditor。**
- [ ] **Step 3c: 实现 TableBlockEditor 和 ImageBlockEditor。**
- [ ] **Step 3d: 在 TemplateEditorPage 组合节点编辑器；每个组件仅修改其负责的 AST 节点。**
- [ ] **Step 4: 运行测试及 `pnpm --filter @auth/admin typecheck`。** Expected: PASS，AST 快照稳定，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/admin/src/features/templates/TemplateEditorPage.tsx apps/admin/src/features/templates/PageSettingsPanel.tsx apps/admin/src/features/templates/TextBlockEditor.tsx apps/admin/src/features/templates/TableBlockEditor.tsx apps/admin/src/features/templates/ImageBlockEditor.tsx apps/admin/src/features/templates/TemplateEditorPage.test.tsx && git commit -m "feat: add template layout editor"`

### Task 30: 构建模板变量、循环与签章位编辑器

**Files:**
- Create: `apps/admin/src/features/templates/VariablePicker.tsx`
- Create: `apps/admin/src/features/templates/MaterialLoopEditor.tsx`
- Create: `apps/admin/src/features/templates/SignatureZoneEditor.tsx`
- Test: `apps/admin/src/features/templates/VariablePicker.test.tsx`
- Test: `apps/admin/src/features/templates/SignatureZoneEditor.test.tsx`

- [ ] **Step 1a: 在变量测试中覆盖五类变量、循环限制和组件类型匹配。**
- [ ] **Step 1b: 在签章位测试中覆盖用途、页码/锚点、位置、尺寸和必填属性。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/admin test -- src/features/templates/VariablePicker.test.tsx src/features/templates/SignatureZoneEditor.test.tsx`。** Expected: FAIL，提示动态模板组件尚不存在。
- [ ] **Step 3a: 实现 VariablePicker。**
- [ ] **Step 3b: 实现 MaterialLoopEditor。**
- [ ] **Step 3c: 实现 SignatureZoneEditor，并复用共享模板静态校验器。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，非法变量及签章位不能保存，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/admin/src/features/templates/VariablePicker.tsx apps/admin/src/features/templates/MaterialLoopEditor.tsx apps/admin/src/features/templates/SignatureZoneEditor.tsx apps/admin/src/features/templates/VariablePicker.test.tsx apps/admin/src/features/templates/SignatureZoneEditor.test.tsx && git commit -m "feat: add dynamic template controls"`

### Task 31: 构建模板预览与生命周期页面

**Files:**
- Create: `apps/admin/src/features/templates/TemplateListPage.tsx`
- Create: `apps/admin/src/features/templates/TemplatePreviewPanel.tsx`
- Create: `apps/admin/src/features/templates/TemplateLifecycleActions.tsx`
- Test: `apps/admin/src/features/templates/TemplateLifecycleActions.test.tsx`
- Test: `apps/admin/src/features/templates/TemplatePreviewPanel.test.tsx`
- Modify: `apps/admin/src/app/router.tsx`

- [ ] **Step 1a: 写保存草稿、发布、复制、停用和发布版本只读失败测试。**
- [ ] **Step 1b: 写发布前完整静态错误展示失败测试。**
- [ ] **Step 1c: 写预览必须使用服务端 HTML 快照失败测试。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/admin test -- src/features/templates/TemplateLifecycleActions.test.tsx src/features/templates/TemplatePreviewPanel.test.tsx`。** Expected: FAIL，提示模板生命周期组件尚不存在。
- [ ] **Step 3a: 实现 TemplateListPage。**
- [ ] **Step 3b: 实现 TemplatePreviewPanel。**
- [ ] **Step 3c: 实现 TemplateLifecycleActions，并接入编辑器及 `router.tsx`。**
- [ ] **Step 4: 运行测试及 `pnpm --filter @auth/admin build`。** Expected: PASS，测试 0 failed，build 退出码 0。
- [ ] **Step 5: 提交。** Run: `git add apps/admin/src/features/templates/TemplateListPage.tsx apps/admin/src/features/templates/TemplatePreviewPanel.tsx apps/admin/src/features/templates/TemplateLifecycleActions.tsx apps/admin/src/features/templates/TemplateLifecycleActions.test.tsx apps/admin/src/features/templates/TemplatePreviewPanel.test.tsx apps/admin/src/app/router.tsx && git commit -m "feat: add template lifecycle ui"`

### Task 32: 构建角色映射配置页面

**Files:**
- Create: `apps/admin/src/features/role-mappings/RoleMappingPage.tsx`
- Create: `apps/admin/src/features/role-mappings/CapabilityMatrixEditor.tsx`
- Test: `apps/admin/src/features/role-mappings/RoleMappingPage.test.tsx`
- Modify: `apps/admin/src/app/router.tsx`

- [ ] **Step 1a: 写 roleKey 多能力及 SELF/DEPT/ALL 编辑失败测试。**
- [ ] **Step 1b: 写未配置角色、admin 默认能力及保存后重新加载失败测试。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/admin test -- src/features/role-mappings/RoleMappingPage.test.tsx`。** Expected: FAIL，提示角色映射页面尚不存在。
- [ ] **Step 3a: 在 `CapabilityMatrixEditor.tsx` 实现能力和数据范围编辑。**
- [ ] **Step 3b: 在 `RoleMappingPage.tsx` 接入 Chunk 1 Task 12 已交付的角色映射读取与 `PUT /admin/role-mappings/:roleKey` 更新接口，并在 `router.tsx` 注册仅管理员可访问的路由。**
- [ ] **Step 4: 运行测试及 `pnpm --filter @auth/admin typecheck`。** Expected: PASS，测试 0 failed，typecheck 退出码 0。
- [ ] **Step 5: 提交。** Run: `git add apps/admin/src/features/role-mappings/RoleMappingPage.tsx apps/admin/src/features/role-mappings/CapabilityMatrixEditor.tsx apps/admin/src/features/role-mappings/RoleMappingPage.test.tsx apps/admin/src/app/router.tsx && git commit -m "feat: add role mapping ui"`

### Task 33: 构建审计日志查询与页面

**Files:**
- Create: `apps/api/src/audit/audit-query.controller.ts`
- Create: `apps/api/src/audit/audit-query.service.ts`
- Create: `apps/admin/src/features/audit/AuditLogPage.tsx`
- Create: `apps/admin/src/features/audit/AuditFilters.tsx`
- Test: `apps/api/src/audit/audit-query.service.spec.ts`
- Test: `apps/admin/src/features/audit/AuditLogPage.test.tsx`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/admin/src/app/router.tsx`

- [ ] **Step 1a: 在 API 测试中覆盖业务单、操作者、动作、日期过滤和管理员全量权限。**
- [ ] **Step 1b: 在 API 测试中覆盖结构化结果脱敏。**
- [ ] **Step 1c: 在页面测试中覆盖操作者、时间、来源、前后状态和备注。**
- [ ] **Step 2a: 运行 `pnpm --filter @auth/api test -- src/audit/audit-query.service.spec.ts`。** Expected: FAIL，提示 `AuditQueryService` 尚不存在。
- [ ] **Step 2b: 运行 `pnpm --filter @auth/admin test -- src/features/audit/AuditLogPage.test.tsx`。** Expected: FAIL，提示 `AuditLogPage` 尚不存在。
- [ ] **Step 3a: 实现只读审计查询服务/controller，并在 `app.module.ts` 注册；结果不得包含原 Token、文件内容、完整证件号或内部路径。**
- [ ] **Step 3b: 实现审计过滤器和管理页面，并在 `router.tsx` 注册管理员路由。**
- [ ] **Step 4: 再运行相同命令。** Expected: PASS，权限与脱敏断言全部通过，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/api/src/audit/audit-query.controller.ts apps/api/src/audit/audit-query.service.ts apps/api/src/audit/audit-query.service.spec.ts apps/api/src/app.module.ts apps/admin/src/features/audit/AuditLogPage.tsx apps/admin/src/features/audit/AuditFilters.tsx apps/admin/src/features/audit/AuditLogPage.test.tsx apps/admin/src/app/router.tsx && git commit -m "feat: add audit log viewer"`

### Task 34: 构建 H5 信息确认与文件上传步骤

**Files:**
- Create: `apps/h5/src/features/case-wizard/CaseWizardPage.tsx`
- Create: `apps/h5/src/features/case-wizard/InformationStep.tsx`
- Create: `apps/h5/src/features/uploads/UploadStep.tsx`
- Create: `apps/h5/src/features/uploads/FileUploadItem.tsx`
- Create: `apps/h5/src/features/uploads/upload-retry.ts`
- Test: `apps/h5/src/features/case-wizard/InformationStep.test.tsx`
- Test: `apps/h5/src/features/uploads/UploadStep.test.tsx`
- Create: `apps/h5/src/app/router.tsx`

- [ ] **Step 1a: 在信息步骤测试中覆盖客户、联系人、多物料及至少 10 个动态字段。**
- [ ] **Step 1b: 在上传步骤测试中覆盖格式、大小、数量、示例和单文件进度。**
- [ ] **Step 1c: 在上传步骤测试中覆盖失败重试且成功文件不重复上传。**
- [ ] **Step 1d: 在信息步骤测试中覆盖刷新后从服务端草稿恢复。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/h5 test -- src/features/case-wizard/InformationStep.test.tsx src/features/uploads/UploadStep.test.tsx`。** Expected: FAIL，提示向导或上传组件尚不存在。
- [ ] **Step 3a: 实现 InformationStep、CaseWizardPage 前两步导航，并在 `apps/h5/src/app/router.tsx` 注册向导路由。**
- [ ] **Step 3b: 实现节流自动保存及服务端版本更新。**
- [ ] **Step 3c: 实现 FileUploadItem 和逐文件上传/重试状态机。**
- [ ] **Step 4: 运行测试及 `pnpm --filter @auth/h5 typecheck`。** Expected: PASS，恢复与重试测试均通过，0 failed。
- [ ] **Step 5: 提交。** Run: `git add apps/h5/src/features/case-wizard/CaseWizardPage.tsx apps/h5/src/features/case-wizard/InformationStep.tsx apps/h5/src/features/case-wizard/InformationStep.test.tsx apps/h5/src/features/uploads/UploadStep.tsx apps/h5/src/features/uploads/FileUploadItem.tsx apps/h5/src/features/uploads/upload-retry.ts apps/h5/src/features/uploads/UploadStep.test.tsx apps/h5/src/app/router.tsx && git commit -m "feat: add h5 questionnaire and uploads"`

### Task 35: 构建 H5 完整预览、签署与提交步骤

**Files:**
- Create: `apps/h5/src/features/signing/PdfPreviewStep.tsx`
- Create: `apps/h5/src/features/signing/PdfDigest.tsx`
- Create: `apps/h5/src/features/signing/SignatureModeSelector.tsx`
- Create: `apps/h5/src/features/signing/CanvasSignature.tsx`
- Create: `apps/h5/src/features/signing/StampUpload.tsx`
- Create: `apps/h5/src/features/signing/SignaturePlacementEditor.tsx`
- Create: `apps/h5/src/features/case-wizard/SubmitStep.tsx`
- Modify: `apps/h5/src/features/case-wizard/CaseWizardPage.tsx`
- Test: `apps/h5/src/features/signing/PdfPreviewStep.test.tsx`
- Test: `apps/h5/src/features/signing/SignaturePlacementEditor.test.tsx`
- Test: `apps/h5/src/features/case-wizard/SubmitStep.test.tsx`

- [ ] **Step 1a: 在预览测试中覆盖完整 `PRE_SIGN_PDF` 和摘要。**
- [ ] **Step 1b: 在签章测试中覆盖手写清除重签、印章结果确认和模式互斥。**
- [ ] **Step 1c: 在位置测试中覆盖边界及同一资源应用到全部必填签章位。**
- [ ] **Step 1d: 在提交测试中覆盖真实性和授权声明门禁。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/h5 test -- src/features/signing/PdfPreviewStep.test.tsx src/features/signing/SignaturePlacementEditor.test.tsx src/features/case-wizard/SubmitStep.test.tsx`。** Expected: FAIL，提示预览、签署或提交组件尚不存在。
- [ ] **Step 3a: 实现 PdfPreviewStep 和 PdfDigest。**
- [ ] **Step 3b: 实现 SignatureModeSelector、CanvasSignature 和 StampUpload。**
- [ ] **Step 3c: 实现 SignaturePlacementEditor。**
- [ ] **Step 3d: 实现 SubmitStep；印章失败允许重传或切换手写，提交后切换只读。**
- [ ] **Step 4: 运行测试及 `pnpm --filter @auth/h5 build`。** Expected: PASS，签署边界、互斥和声明测试均通过，build 退出码 0。
- [ ] **Step 5: 提交。** Run: `git add apps/h5/src/features/signing/PdfPreviewStep.tsx apps/h5/src/features/signing/PdfDigest.tsx apps/h5/src/features/signing/SignatureModeSelector.tsx apps/h5/src/features/signing/CanvasSignature.tsx apps/h5/src/features/signing/StampUpload.tsx apps/h5/src/features/signing/SignaturePlacementEditor.tsx apps/h5/src/features/signing/PdfPreviewStep.test.tsx apps/h5/src/features/signing/SignaturePlacementEditor.test.tsx apps/h5/src/features/case-wizard/CaseWizardPage.tsx apps/h5/src/features/case-wizard/SubmitStep.tsx apps/h5/src/features/case-wizard/SubmitStep.test.tsx && git commit -m "feat: add h5 preview signing and submission"`

### Task 36: 构建 H5 冲突恢复、补件与链接状态页面

**Files:**
- Create: `apps/h5/src/features/case-wizard/version-conflict.ts`
- Create: `apps/h5/src/features/case-wizard/ConflictDialog.tsx`
- Create: `apps/h5/src/features/supplement/SupplementPage.tsx`
- Create: `apps/h5/src/features/supplement/RejectionReasonPanel.tsx`
- Create: `apps/h5/src/features/case-wizard/InvalidLinkPage.tsx`
- Create: `apps/h5/src/features/case-wizard/CompletedLinkPage.tsx`
- Test: `apps/h5/src/features/case-wizard/ConflictDialog.test.tsx`
- Test: `apps/h5/src/features/supplement/SupplementPage.test.tsx`
- Test: `apps/h5/src/features/case-wizard/InvalidLinkPage.test.tsx`
- Modify: `apps/h5/src/app/router.tsx`

- [ ] **Step 1a: 在冲突测试中覆盖 409、本地内容保留、刷新要求及禁止自动合并/覆盖。**
- [ ] **Step 1b: 在补件测试中覆盖仅开放驳回项、原因展示及其他项只读。**
- [ ] **Step 1c: 在补件测试中覆盖内容变化后重新预览、签署和声明。**
- [ ] **Step 1d: 在链接测试中覆盖无效原因统一页面及完成只读页面。**
- [ ] **Step 2: 运行 `pnpm --filter @auth/h5 test -- src/features/case-wizard/ConflictDialog.test.tsx src/features/supplement/SupplementPage.test.tsx src/features/case-wizard/InvalidLinkPage.test.tsx`。** Expected: FAIL，提示冲突、补件或链接状态组件尚不存在。
- [ ] **Step 3a: 实现 version-conflict 和 ConflictDialog；本地冲突内容仅供复制。**
- [ ] **Step 3b: 实现 SupplementPage 和 RejectionReasonPanel。**
- [ ] **Step 3c: 实现 InvalidLinkPage 和 CompletedLinkPage，并在 `apps/h5/src/app/router.tsx` 注册统一状态路由。**
- [ ] **Step 4: 运行测试及 `pnpm --filter @auth/h5 typecheck && pnpm --filter @auth/h5 build`。** Expected: PASS，测试 0 failed，typecheck/build 退出码 0。
- [ ] **Step 5: 提交。** Run: `git add apps/h5/src/features/case-wizard/version-conflict.ts apps/h5/src/features/case-wizard/ConflictDialog.tsx apps/h5/src/features/case-wizard/InvalidLinkPage.tsx apps/h5/src/features/case-wizard/CompletedLinkPage.tsx apps/h5/src/features/case-wizard/ConflictDialog.test.tsx apps/h5/src/features/case-wizard/InvalidLinkPage.test.tsx apps/h5/src/features/supplement/SupplementPage.tsx apps/h5/src/features/supplement/RejectionReasonPanel.tsx apps/h5/src/features/supplement/SupplementPage.test.tsx apps/h5/src/app/router.tsx && git commit -m "feat: add h5 recovery and supplement flows"`

### Chunk 2 验证门禁

- [ ] 运行 `pnpm --filter @auth/storage test`。Expected: PASS，0 failed。
- [ ] 运行 `pnpm --filter @auth/template-engine test`。Expected: PASS，0 failed。
- [ ] 运行 `pnpm --filter @auth/api test && pnpm --filter @auth/api test:integration`。Expected: PASS，0 failed。
- [ ] 运行 `pnpm --filter @auth/worker test && pnpm --filter @auth/worker test:integration`。Expected: PASS，0 failed。
- [ ] 运行 `pnpm --filter @auth/admin test && pnpm --filter @auth/admin typecheck && pnpm --filter @auth/admin build`。Expected: PASS，测试 0 failed，其余命令退出码 0。
- [ ] 运行 `pnpm --filter @auth/h5 test && pnpm --filter @auth/h5 typecheck && pnpm --filter @auth/h5 build`。Expected: PASS，测试 0 failed，其余命令退出码 0。
- [ ] 运行 `pnpm typecheck`。Expected: PASS，退出码 0。
