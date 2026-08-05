## Chunk 3: 纵向验收、安全、部署与发布

### Task 37: 补齐可构建入口与 E2E workspace 清单

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `apps/worker/package.json`
- Modify: `apps/worker/tsconfig.json`
- Modify: `apps/worker/tsconfig.build.json`
- Modify: `apps/admin/package.json`
- Modify: `apps/admin/tsconfig.json`
- Modify: `apps/admin/vite.config.ts`
- Modify: `apps/admin/index.html`
- Create: `apps/admin/src/main.tsx`
- Modify: `apps/h5/package.json`
- Modify: `apps/h5/tsconfig.json`
- Modify: `apps/h5/vite.config.ts`
- Modify: `apps/h5/index.html`
- Create: `apps/h5/src/main.tsx`
- Create: `tests/e2e/package.json`
- Create: `tests/e2e/tsconfig.json`

- [ ] **Step 1: 完善 Chunk 2 应用清单并建立入口**

复用 Chunk 2 Task 6A 已创建的 Worker、Admin 和 H5 清单与构建配置，只补齐实际源码需要但尚未声明的依赖和入口。Worker 包名保持 `@auth/worker`；Admin 保持 `@auth/admin`；H5 保持 `@auth/h5`。E2E 新建为 `@auth/e2e`。Worker 保持 `start`、`build`、`test`、`test:integration` 和 `typecheck`；两个 React 应用保持 `dev`、`build`、`test` 和 `typecheck`；E2E 定义 `test` 与 `test:e2e`。Admin/H5 入口只挂载 Chunk 2 已建立的应用路由，不复制页面逻辑。

每个清单必须显式声明源码已使用的依赖，不依赖幽灵 hoist：Worker 至少声明 NestJS、Prisma Client、pg-boss、Playwright、Sharp、RxJS、reflect-metadata 及所用 workspace 包；Admin 至少声明 React、React DOM、React Router、Ant Design、Tiptap 及 Vite/Vitest 测试工具；H5 至少声明 React、React DOM、React Router、Ant Design Mobile 及 Vite/Vitest 测试工具；E2E 至少声明 Playwright Test、Vitest、tsx、TypeScript 及所用 workspace 包。版本写入清单并由 `pnpm-lock.yaml` 锁定。

- [ ] **Step 2: 扩展 workspace 与根命令**

`pnpm-workspace.yaml` 保留 `apps/*`、`packages/*` 并增加 `tests/*`。根 `package.json` 增加 `"test:e2e": "pnpm --filter @auth/e2e test:e2e"`；根 `build` 继续使用 `pnpm -r build`，从而包含 Worker、Admin 和 H5。

- [ ] **Step 3: 安装并验证包发现**

Run: `pnpm install`  
Expected: exit code 0；`pnpm-lock.yaml` 包含 Worker、Admin、H5 和 `tests/e2e` 四个 importer。

Run: `pnpm --filter @auth/worker exec node -p "require('./package.json').name"`  
Expected: 输出 `@auth/worker`。

Run: `pnpm --filter @auth/admin exec node -p "require('./package.json').name"`  
Expected: 输出 `@auth/admin`。

Run: `pnpm --filter @auth/h5 exec node -p "require('./package.json').name"`  
Expected: 输出 `@auth/h5`。

Run: `pnpm --filter @auth/e2e exec node -p "require('./package.json').name"`  
Expected: 输出 `@auth/e2e`。

- [ ] **Step 4: 验证三个应用构建入口**

Run: `pnpm --filter @auth/worker build`  
Expected: exit code 0；生成 Worker 生产入口。

Run: `pnpm --filter @auth/admin build`  
Expected: exit code 0；生成 `apps/admin/dist/index.html`。

Run: `pnpm --filter @auth/h5 build`  
Expected: exit code 0；生成 `apps/h5/dist/index.html`。

- [ ] **Step 5: 提交**

```powershell
git add package.json pnpm-workspace.yaml pnpm-lock.yaml apps/worker/package.json apps/worker/tsconfig.json apps/worker/tsconfig.build.json apps/admin/package.json apps/admin/tsconfig.json apps/admin/vite.config.ts apps/admin/index.html apps/admin/src/main.tsx apps/h5/package.json apps/h5/tsconfig.json apps/h5/vite.config.ts apps/h5/index.html apps/h5/src/main.tsx tests/e2e/package.json tests/e2e/tsconfig.json
git commit -m "chore: add runnable application package scaffolding"
```

Expected: 创建一个仅包含应用入口、清单补充和 E2E workspace 的提交。

### Task 38: 实现统一业务授权策略

**Files:**
- Create: `scripts/run-and-capture.ps1`
- Create: `docs/acceptance/evidence/.gitkeep`
- Modify: `apps/api/src/auth/ability.service.ts`
- Modify: `apps/api/src/auth/ability.service.spec.ts`
- Modify: `apps/api/src/auth/auth.guard.ts`
- Modify: `apps/api/src/auth/auth.guard.spec.ts`
- Modify: `apps/api/src/auth/sensitive-file-policy.ts`
- Modify: `apps/api/src/auth/sensitive-file-policy.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/authorization-matrix.integration-spec.ts`
- Modify: `apps/api/src/cases/cases.controller.ts`
- Modify: `apps/api/src/templates/templates.controller.ts`
- Modify: `apps/api/src/requirements/requirements.controller.ts`
- Generate: `docs/acceptance/evidence/authorization-policy.txt`

- [ ] **Step 1: 建立保留退出码的证据捕获工具**

`scripts/run-and-capture.ps1` 接收 `OutputPath`、`Executable` 和 JSON 字符串数组 `ArgumentsJson`，预先创建证据目录，对参数中的 `%NAME%` 执行环境变量展开，流式记录 stdout/stderr，并以被执行程序的原始退出码退出。缺失或展开后为空的环境变量必须在启动子进程前报错。

Run: `powershell -File scripts/run-and-capture.ps1 -OutputPath "${env:TEMP}\authorization-capture-success.txt" -Executable powershell -ArgumentsJson '["-NoProfile","-Command","Write-Output PASS; exit 0"]'`  
Expected: exit code 0；临时证据文件包含 `PASS`。

Run: `powershell -File scripts/run-and-capture.ps1 -OutputPath "${env:TEMP}\authorization-capture-failure.txt" -Executable powershell -ArgumentsJson '["-NoProfile","-Command","Write-Output EXPECTED_FAILURE; exit 7"]'`  
Expected: exit code 7；临时证据文件包含 `EXPECTED_FAILURE`，证明失败不会被证据捕获掩盖。

- [ ] **Step 2: 编写数据范围失败测试**

覆盖：

- `SELF`：客服只能访问本人创建或负责的业务单；审核员只能访问本人已领取的业务单。
- `DEPT`：按负责部门或审核部门过滤。
- `ALL`：可访问全部业务单。
- 多角色取能力和数据范围并集。
- 未映射角色拒绝访问。
- 查看、审核、关闭、发布模板和查看审计日志均由后端授权。

Run: `pnpm --filter @auth/api test -- ability.service.spec.ts auth.guard.spec.ts sensitive-file-policy.spec.ts`  
Expected: FAIL，新增的跨控制器能力、数据范围或敏感资料边界断言尚未满足。

- [ ] **Step 3: 扩展既有授权服务**

只扩展 Chunk 1 的 `AbilityService`、`AuthGuard` 和 `sensitive-file-policy.ts`。`AbilityService` 继续作为能力与 `SELF/DEPT/ALL` 的唯一来源；敏感文件规则继续由 `sensitive-file-policy.ts` 在通用能力和数据范围之后收窄。扩展 Chunk 1 已有的全局 `AuthModule`，在保留 getInfo 客户端与缓存 provider 的同时注册并导出既有 `AbilityService` 与 `AuthGuard`，由 `app.module.ts` 导入一次；不得创建第二套授权服务或数据范围查询器。

- [ ] **Step 4: 接入业务单、资料项和模板控制器**

使用既有 `RequireCapability` 装饰器和 `AuthGuard` 为业务单、资料项与模板的查看、编辑、关闭和发布入口增加后端强制检查；审核、文件和审计入口分别由其既有模块调用同一 `AbilityService`。`authorization-matrix.integration-spec.ts` 通过真实控制器断言拒绝结果为 403。

- [ ] **Step 5: 运行授权策略测试并保存证据**

Run: `pnpm --filter @auth/api test -- ability.service.spec.ts auth.guard.spec.ts sensitive-file-policy.spec.ts`  
Expected: exit code 0；既有授权单元测试及新增边界测试全部 PASS。

Run: `powershell -File scripts/run-and-capture.ps1 -OutputPath docs/acceptance/evidence/authorization-policy.txt -Executable pnpm -ArgumentsJson '["--filter","@auth/api","test:integration","--","authorization-matrix.integration-spec.ts"]'`  
Expected: exit code 0；`SELF`、`DEPT`、`ALL`、多角色并集和所有能力拒绝用例全部 PASS。

- [ ] **Step 6: 提交**

```powershell
git add scripts/run-and-capture.ps1 docs/acceptance/evidence/.gitkeep apps/api/src/auth/auth.module.ts apps/api/src/auth/ability.service.ts apps/api/src/auth/ability.service.spec.ts apps/api/src/auth/auth.guard.ts apps/api/src/auth/auth.guard.spec.ts apps/api/src/auth/sensitive-file-policy.ts apps/api/src/auth/sensitive-file-policy.spec.ts apps/api/src/app.module.ts apps/api/test/authorization-matrix.integration-spec.ts apps/api/src/cases/cases.controller.ts apps/api/src/templates/templates.controller.ts apps/api/src/requirements/requirements.controller.ts docs/acceptance/evidence/authorization-policy.txt
git commit -m "feat: enforce backend authorization policy"
```

Expected: 创建一个仅包含授权策略的提交。

### Task 39: 实现受控文件下载

**Files:**
- Create: `apps/api/src/files/file-access.policy.ts`
- Create: `apps/api/src/files/file-download.service.ts`
- Create: `apps/api/src/files/file-download.controller.ts`
- Create: `apps/api/src/files/file-access.policy.spec.ts`
- Create: `apps/api/src/files/file-download.controller.spec.ts`
- Modify: `apps/api/src/files/files.module.ts`
- Generate: `docs/acceptance/evidence/file-download-security.txt`

- [ ] **Step 1: 编写敏感文件访问矩阵失败测试**

覆盖：

- 管理员可查看普通及敏感文件。
- 客服对敏感文件默认无权，仅显式配置能力后可访问其数据范围内文件。
- 审核员仅可查看已领取或已分配给本人，且状态为 `待审核`、`需补件` 或 `待复审` 的敏感文件。
- 普通文件仍受 `SELF`、`DEPT`、`ALL` 数据范围限制。
- 跨业务单文件 ID 和不属于目标资料版本的文件 ID 返回 403。

Run: `pnpm --filter @auth/api test -- file-access.policy.spec.ts`  
Expected: FAIL，提示文件访问策略尚未实现。

- [ ] **Step 2: 实现文件访问策略**

`file-access.policy.ts` 只把文件归属、业务单上下文和资料敏感级别适配到既有 `AbilityService` 与 `sensitive-file-policy.ts`；不得复制角色矩阵、接触磁盘或构造 HTTP 响应。

- [ ] **Step 3: 编写并实现流式下载测试**

覆盖授权成功时的流式响应、受控文件名、正确 MIME、无绝对路径暴露，以及读取失败时不返回堆栈。

Run: `pnpm --filter @auth/api test -- file-download.controller.spec.ts`  
Expected before implementation: FAIL，提示下载服务或控制器不存在。

实现 `file-download.service.ts` 与 `file-download.controller.ts`，只使用存储键读取文件，不公开磁盘目录。

- [ ] **Step 4: 运行下载安全测试并保存证据**

Run: `powershell -File scripts/run-and-capture.ps1 -OutputPath docs/acceptance/evidence/file-download-security.txt -Executable pnpm -ArgumentsJson '["--filter","@auth/api","test","--","file-access.policy.spec.ts","file-download.controller.spec.ts"]'`  
Expected: exit code 0；所有允许请求成功，所有越权请求返回 403，响应不包含绝对路径或堆栈。

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/files docs/acceptance/evidence/file-download-security.txt
git commit -m "feat: add authorized file streaming"
```

Expected: 创建一个仅包含下载策略与流式下载的提交。

### Task 40: 完成结构化审计事件

**Files:**
- Create: `apps/api/src/audit/audit.module.ts`
- Modify: `apps/api/src/audit/audit-writer.service.ts`
- Create: `apps/api/src/audit/audit-writer.service.spec.ts`
- Modify: `apps/api/src/audit/audit-query.controller.ts`
- Modify: `apps/api/src/audit/audit-query.service.ts`
- Modify: `apps/api/src/audit/audit-query.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/audit-case-actions.integration-spec.ts`
- Create: `apps/api/test/audit-link-review-actions.integration-spec.ts`
- Create: `apps/api/test/audit-catalog-file-pdf-actions.integration-spec.ts`
- Modify: `apps/api/src/cases/case-command.service.ts`
- Modify: `apps/api/src/cases/case-draft.service.ts`
- Modify: `apps/api/src/cases/case-assignment.service.ts`
- Modify: `apps/api/src/public-links/public-links.service.ts`
- Modify: `apps/api/src/reviews/reviews.service.ts`
- Modify: `apps/api/src/templates/templates.service.ts`
- Modify: `apps/api/src/requirements/requirements.service.ts`
- Modify: `apps/api/src/files/file-download.service.ts`
- Modify: `apps/api/src/pdf/pdf-finalization.service.ts`
- Modify: `apps/api/src/pdf/pdf-retry.service.ts`
- Generate: `docs/acceptance/evidence/audit-events.txt`

- [ ] **Step 1: 编写审计事件结构失败测试**

每个事件必须包含：

- `actorUserId`
- `source`
- `action`
- `entityType`
- `entityId`
- `occurredAt`
- `requestId`
- 必要时的 `beforeState`、`afterState` 和 `note`

Run: `pnpm --filter @auth/api test -- audit-writer.service.spec.ts audit-query.service.spec.ts`  
Expected: FAIL，Chunk 1 的 `AuditWriterService` 尚未满足完整事件结构或 Chunk 2 的查询尚未覆盖新增字段。

- [ ] **Step 2: 实现审计写入与管理员查询**

审计写入必须与对应业务变更处于同一数据库事务。扩展 Chunk 1 已有的 `AuditWriterService`，不得创建第二个写入服务。将 `audit.module.ts` 声明为全局模块，提供并导出该 writer，同时注册 Chunk 2 已有的 `AuditQueryService` 与 `AuditQueryController`；`app.module.ts` 导入该模块一次，使各业务模块可注入同一 writer。不得创建第二个查询 controller。既有查询继续仅允许管理员访问，并支持按操作者、动作、业务单和日期筛选。

- [ ] **Step 3: 接入业务单与分配审计**

在既有 `case-command.service.ts`、`case-draft.service.ts` 和 `case-assignment.service.ts` 中接入创建、编辑、状态变化、关闭、分配、领取和改派事件。

Run: `pnpm --filter @auth/api test:integration -- audit-case-actions.integration-spec.ts`  
Expected: PASS；每个动作产生一个事件，事务回滚时事件同时回滚，0 failed。

- [ ] **Step 4: 接入链接与审核审计**

在 `public-links.service.ts` 和 `reviews.service.ts` 中接入链接生成、续期、停用、重新生成、资料项通过、驳回、复审和最终确认事件。

Run: `pnpm --filter @auth/api test:integration -- audit-link-review-actions.integration-spec.ts`  
Expected: PASS；动作、前后状态、操作者和备注断言全部通过，0 failed。

- [ ] **Step 5: 接入目录、文件与 PDF 审计**

在资料项、模板、文件下载、`pdf-finalization.service.ts` 和 `pdf-retry.service.ts` 中接入发布、复制、停用、敏感下载、重试、失败及最终完成事件；审计查看或导出由既有 `audit-query.controller.ts` 记录。

Run: `pnpm --filter @auth/api test:integration -- audit-catalog-file-pdf-actions.integration-spec.ts`  
Expected: PASS；所有列明动作均有事件，非管理员读取审计返回 403，0 failed。

- [ ] **Step 6: 运行完整审计测试并保存证据**

Run: `powershell -File scripts/run-and-capture.ps1 -OutputPath docs/acceptance/evidence/audit-events.txt -Executable pnpm -ArgumentsJson '["--filter","@auth/api","test:integration","--","audit-case-actions.integration-spec.ts","audit-link-review-actions.integration-spec.ts","audit-catalog-file-pdf-actions.integration-spec.ts"]'`  
Expected: exit code 0；所有动作均产生完整事件，业务事务回滚时不留下孤立审计记录，非管理员查询返回 403。

- [ ] **Step 7: 提交**

```powershell
git add apps/api/src/audit apps/api/src/app.module.ts apps/api/test/audit-case-actions.integration-spec.ts apps/api/test/audit-link-review-actions.integration-spec.ts apps/api/test/audit-catalog-file-pdf-actions.integration-spec.ts apps/api/src/cases/case-command.service.ts apps/api/src/cases/case-draft.service.ts apps/api/src/cases/case-assignment.service.ts apps/api/src/public-links/public-links.service.ts apps/api/src/reviews/reviews.service.ts apps/api/src/templates/templates.service.ts apps/api/src/requirements/requirements.service.ts apps/api/src/files/file-download.service.ts apps/api/src/pdf/pdf-finalization.service.ts apps/api/src/pdf/pdf-retry.service.ts docs/acceptance/evidence/audit-events.txt
git commit -m "feat: complete authorization audit trail"
```

Expected: 创建一个仅包含审计事件及其业务接入的提交。

### Task 41: 实现日志脱敏与安全错误响应

**Files:**
- Create: `apps/api/src/logging/redaction.ts`
- Create: `apps/api/src/logging/structured-logger.service.ts`
- Create: `apps/api/src/logging/logging.module.ts`
- Create: `apps/api/src/logging/redaction.spec.ts`
- Create: `apps/api/src/http/safe-exception.filter.ts`
- Create: `apps/api/src/http/safe-exception.filter.spec.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/app.module.ts`
- Generate: `docs/acceptance/evidence/log-redaction.txt`

- [ ] **Step 1: 编写日志脱敏失败测试**

覆盖原 Token、Authorization/Cookie 请求头、密码、第三方凭据、完整证件号、文件内容、绝对路径和内部堆栈。

Run: `pnpm --filter @auth/api test -- redaction.spec.ts safe-exception.filter.spec.ts`  
Expected: FAIL，提示脱敏器或安全异常过滤器尚未实现。

- [ ] **Step 2: 实现结构化日志脱敏**

日志仅保留允许字段；Token 仅允许记录不可逆摘要；证件号最多保留业务批准的掩码形式；不得记录上传内容。将 `LoggingModule` 导入 `app.module.ts`，由 Nest 容器提供 `StructuredLoggerService`。

- [ ] **Step 3: 实现安全异常响应**

数据库、文件目录、`getInfo` 或 Chromium 错误返回可理解的错误码和提示，不返回磁盘路径、堆栈或内部连接信息。

- [ ] **Step 4: 运行脱敏测试并保存证据**

Run: `powershell -File scripts/run-and-capture.ps1 -OutputPath docs/acceptance/evidence/log-redaction.txt -Executable pnpm -ArgumentsJson '["--filter","@auth/api","test","--","redaction.spec.ts","safe-exception.filter.spec.ts"]'`  
Expected: exit code 0；测试日志和 HTTP 响应均不包含注入的敏感标记。

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/logging apps/api/src/http apps/api/src/main.ts apps/api/src/app.module.ts docs/acceptance/evidence/log-redaction.txt
git commit -m "feat: redact logs and sanitize errors"
```

Expected: 创建一个仅包含日志及错误响应安全处理的提交。

### Task 42: 编写完整生命周期端到端测试

**Files:**
- Modify: `tests/e2e/package.json`
- Create: `tests/e2e/playwright.config.ts`
- Create: `tests/e2e/fixtures/case-lifecycle.fixture.ts`
- Create: `tests/e2e/case-lifecycle.spec.ts`
- Create: `tests/e2e/history-access.spec.ts`
- Generate: `docs/acceptance/evidence/case-lifecycle.txt`

- [ ] **Step 1: 验证 E2E workspace 包与 Playwright**

复用 Task 37 已创建并由 `tests/*` workspace 发现的 `@auth/e2e`；补齐生命周期测试所需 workspace 依赖，不创建第二个包清单。

Run: `pnpm --filter @auth/e2e exec playwright --version`  
Expected: exit code 0；输出锁定的 Playwright 版本。

- [ ] **Step 2: 建立确定性测试数据**

Fixture 固定创建 1 个模板、3 条物料、3 个资料项、10 个问卷字段和3个允许类型文件；每次运行使用独立业务单编号并在结束后清理。

- [ ] **Step 3: 编写主生命周期失败测试**

覆盖：

- 客服创建业务单并复制链接。
- 客户填写、自动保存、刷新、退出并重新打开。
- 上传3个文件、预览、签署并提交。
- 审核员领取、逐项审核并驳回1项。
- 客户只能编辑被驳回项，另外2项只读。
- 授权书被驳回后必须重新预览、签署并确认声明。
- 复审通过后进入 `待生成最终文件`。
- PDF 校验成功后进入 `已完成`，链接在1秒内失效。

Run: `pnpm --filter @auth/e2e exec playwright test --config playwright.config.ts case-lifecycle.spec.ts`  
Expected: FAIL，明确指出第一个未接通的生命周期断点。

- [ ] **Step 4: 编写版本历史失败测试**

验证补件前后的回答、文件、签署和审核记录均按时间显示，并可由有权用户下载。

Run: `pnpm --filter @auth/e2e exec playwright test --config playwright.config.ts history-access.spec.ts`  
Expected: FAIL，明确指出缺失的历史版本或下载入口。

- [ ] **Step 5: 运行生命周期测试并保存证据**

若测试暴露产品缺陷，停止本任务并为具体文件新增独立修复任务；不得使用“补齐接线”作为无边界实现步骤。

Run: `powershell -File scripts/run-and-capture.ps1 -OutputPath docs/acceptance/evidence/case-lifecycle.txt -Executable pnpm -ArgumentsJson '["--filter","@auth/e2e","exec","playwright","test","--config","playwright.config.ts","case-lifecycle.spec.ts","history-access.spec.ts"]'`  
Expected: exit code 0；两个 spec 全部 PASS，链接失效测量值小于或等于1秒。

- [ ] **Step 6: 提交**

```powershell
git add tests/e2e/package.json tests/e2e/playwright.config.ts tests/e2e/fixtures/case-lifecycle.fixture.ts tests/e2e/case-lifecycle.spec.ts tests/e2e/history-access.spec.ts docs/acceptance/evidence/case-lifecycle.txt
git commit -m "test: cover authorization lifecycle end to end"
```

Expected: 创建一个仅包含生命周期测试及证据的提交。

### Task 43: 编写跨应用安全端到端测试

**Files:**
- Create: `tests/e2e/fixtures/security.fixture.ts`
- Create: `tests/e2e/authorization-matrix.spec.ts`
- Create: `tests/e2e/token-security.spec.ts`
- Create: `tests/e2e/upload-security.spec.ts`
- Create: `tests/e2e/response-leakage.spec.ts`
- Generate: `docs/acceptance/evidence/security-e2e.txt`

- [ ] **Step 1: 编写三组账号权限矩阵测试**

使用 `SELF`、`DEPT`、`ALL` 账号覆盖查看、下载、审核、关闭、模板发布和审计日志。每项同时包含允许请求和越权请求。

- [ ] **Step 2: 编写令牌与文件攻击测试**

覆盖：

- 过期、伪造和已撤销客户令牌。
- 跨业务单文件 ID。
- 路径穿越及恶意文件名。
- 扩展名与真实 MIME 不一致。
- 单文件、单资料项数量和业务单总量超限。

- [ ] **Step 3: 编写响应泄漏测试**

向 Token、证件号、路径和错误消息注入唯一标记，断言响应及捕获日志不包含原 Token、完整证件号、磁盘路径或堆栈。

- [ ] **Step 4: 运行安全套件并保存证据**

Run: `powershell -File scripts/run-and-capture.ps1 -OutputPath docs/acceptance/evidence/security-e2e.txt -Executable pnpm -ArgumentsJson '["--filter","@auth/e2e","exec","playwright","test","--config","playwright.config.ts","authorization-matrix.spec.ts","token-security.spec.ts","upload-security.spec.ts","response-leakage.spec.ts"]'`  
Expected: exit code 0；所有越权请求返回 403，所有非法输入被拒绝，所有允许请求成功，敏感标记匹配数为0。

- [ ] **Step 5: 提交**

```powershell
git add tests/e2e/fixtures/security.fixture.ts tests/e2e/authorization-matrix.spec.ts tests/e2e/token-security.spec.ts tests/e2e/upload-security.spec.ts tests/e2e/response-leakage.spec.ts docs/acceptance/evidence/security-e2e.txt
git commit -m "test: add end-to-end security coverage"
```

Expected: 创建一个仅包含安全端到端测试及证据的提交。

### Task 44: 建立可复现的 PDF 视觉回归

**Files:**
- Modify: `package.json`
- Modify: `tests/e2e/package.json`
- Create: `tests/e2e/pdf-environment.lock.json`
- Create: `tests/e2e/fixtures/pdf-cases.json`
- Create: `tests/e2e/helpers/pdf-rasterizer.ts`
- Create: `tests/e2e/helpers/pdf-comparator.ts`
- Create: `tests/e2e/helpers/pdf-comparator.spec.ts`
- Create: `tests/e2e/helpers/update-pdf-baselines.ts`
- Create: `tests/e2e/pdf-visual.spec.ts`
- Create: `tests/e2e/baselines/manifest.json`
- Create: `tests/e2e/baselines/README.md`
- Create: `tests/e2e/baselines/single-page/page-1.png`
- Create: `tests/e2e/baselines/multi-page/page-1.png`
- Create: `tests/e2e/baselines/multi-page/page-2.png`
- Create: `tests/e2e/baselines/three-materials/page-1.png`
- Create: `tests/e2e/baselines/twenty-materials/page-1.png`
- Create: `tests/e2e/baselines/twenty-materials/page-2.png`
- Create: `tests/e2e/baselines/pagination-table/page-1.png`
- Create: `tests/e2e/baselines/pagination-table/page-2.png`
- Create: `tests/e2e/baselines/long-text/page-1.png`
- Create: `tests/e2e/baselines/long-text/page-2.png`
- Create: `tests/e2e/baselines/signature-placement/page-1.png`
- Generate: `docs/acceptance/evidence/pdf-visual.txt`
- Generate: `docs/acceptance/evidence/pdf-diff-summary.json`

- [ ] **Step 1: 扩展 E2E 包与根脚本**

在 Task 42 使用的 `tests/e2e/package.json` 中保留 `test`、`test:e2e`，并增加：

```json
{
  "scripts": {
    "update:pdf-baselines": "tsx helpers/update-pdf-baselines.ts",
    "test:browser-matrix": "playwright test --config browser-matrix.config.ts",
    "validate:manual-matrix": "vitest run manual-matrix.validator.spec.ts"
  }
}
```

根 `package.json` 增加：

```json
{
  "scripts": {
    "test:update-pdf-baselines": "pnpm --filter @auth/e2e update:pdf-baselines",
    "test:browser-matrix": "pnpm --filter @auth/e2e test:browser-matrix",
    "validate:manual-matrix": "pnpm --filter @auth/e2e validate:manual-matrix"
  }
}
```

Run: `pnpm install`  
Expected: exit code 0；`pnpm-lock.yaml` 包含 `tests/e2e` importer。

Run: `pnpm --filter @auth/e2e exec vitest run --passWithNoTests`  
Expected: exit code 0；workspace 能解析 `@auth/e2e`，`test:e2e` 及新增的三个根脚本均可解析到该包。

- [ ] **Step 2: 固定视觉环境**

`pdf-environment.lock.json` 记录并校验 Playwright Chromium 主版本、字体包哈希、A4 纸张、边距、缩放和144 DPI。环境不一致时测试必须失败。

- [ ] **Step 3: 编写像素比较器失败测试**

规则：

- 单通道差值不超过8的像素忽略。
- 其余差异像素占比不得超过0.5%。
- 页数不同、缺失物料行、必填变量为空或签章外接矩形越界立即失败。

Run: `pnpm --filter @auth/e2e exec vitest run helpers/pdf-comparator.spec.ts`  
Expected: FAIL，提示比较器尚未实现。

- [ ] **Step 4: 实现比较器并生成初始批准基线**

用例固定为单页、多页、3条物料、20条物料、分页表格、长文本和签章位置。

Run: `pnpm test:update-pdf-baselines -- --reason "initial design-spec baseline"`  
Expected: exit code 0；生成的单页及全部多页文件与 `tests/e2e/baselines/manifest.json` 完全一致，manifest 拒绝缺页或额外页，并记录环境哈希和批准原因。

- [ ] **Step 5: 运行视觉回归并保存证据**

Run: `powershell -File scripts/run-and-capture.ps1 -OutputPath docs/acceptance/evidence/pdf-visual.txt -Executable pnpm -ArgumentsJson '["--filter","@auth/e2e","exec","playwright","test","--config","playwright.config.ts","pdf-visual.spec.ts"]'`  
Expected: exit code 0；所有用例差异比例不超过0.5%，环境锁匹配，摘要写入 `docs/acceptance/evidence/pdf-diff-summary.json`。

- [ ] **Step 6: 提交**

```powershell
git add package.json pnpm-lock.yaml tests/e2e/package.json tests/e2e/pdf-environment.lock.json tests/e2e/fixtures/pdf-cases.json tests/e2e/helpers tests/e2e/pdf-visual.spec.ts tests/e2e/baselines docs/acceptance/evidence/pdf-visual.txt docs/acceptance/evidence/pdf-diff-summary.json
git commit -m "test: add deterministic pdf visual regression"
```

Expected: 创建一个包含批准基线、比较器、测试和证据的提交。

### Task 45: 配置生产构建、PM2 与静态应用发布

**Files:**
- Create: `ecosystem.config.cjs`
- Create: `deploy/nginx.example.conf`
- Create: `deploy/install-static.ps1`
- Create: `deploy/install-nginx.ps1`
- Create: `deploy/configure-pm2-logrotate.ps1`
- Create: `deploy/smoke.ps1`
- Create: `apps/api/src/health.service.ts`
- Create: `apps/api/src/health.service.spec.ts`
- Modify: `apps/api/src/health.controller.ts`
- Modify: `apps/api/src/health.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/worker/src/health/heartbeat.ts`
- Modify: `apps/worker/src/main.ts`
- Modify: `apps/worker/package.json`
- Modify: `.env.example`
- Modify: `packages/config/src/env.ts`
- Modify: `packages/config/src/env.test.ts`
- Generate: `docs/acceptance/evidence/deployment-smoke.txt`

- [ ] **Step 1: 编写配置及健康检查失败测试**

生产配置必须包含数据库连接、鉴权 URL、Token 请求头、文件根目录、API/Admin/H5 公开地址、TLS 证书与私钥路径、链接默认截止策略和日志级别。健康检查覆盖 API、Worker 心跳、PostgreSQL、文件目录和 Chromium。

Run: `pnpm --filter @auth/config test`  
Expected: FAIL，提示缺少链接默认截止策略或日志级别配置。

Run: `pnpm --filter @auth/api test -- health.service.spec.ts health.controller.spec.ts`  
Expected: FAIL，提示健康服务或新增依赖检查尚未实现。

- [ ] **Step 2: 实现配置与健康检查**

复用 Chunk 1 的 `health.controller.ts`，在 `app.module.ts` 注册 `HealthService`。API 健康端点不得返回连接串、绝对路径或内部异常。在 Chunk 2 已有的 `apps/worker/src/main.ts` 启动流程中增加心跳，不替换其 pg-boss 消费者和优雅关闭逻辑；Task 37 创建的 `apps/worker/package.json` 继续以该入口执行 `start` 和 `build`。

- [ ] **Step 3: 配置 PM2 与反向代理**

`ecosystem.config.cjs` 明确定义 `authorization-api` 和 `authorization-pdf-worker`、自动重启和优雅关闭。`nginx.example.conf` 发布 Admin 与 H5 静态构建，启用 HTTPS 反代并设置上传限制。`install-static.ps1` 原子复制两个静态构建；`install-nginx.ps1` 渲染实际路径、运行 `nginx -t` 并仅在成功后 reload；`configure-pm2-logrotate.ps1` 安装并配置 `pm2-logrotate` 的最大文件大小、保留数量和压缩选项，然后读取配置验证。

- [ ] **Step 4: 构建、启动并运行部署冒烟**

Run: `pnpm build`  
Expected: exit code 0；API、Worker、Admin 和 H5 均生成生产构建。

Run: `powershell -File deploy/install-static.ps1 -AdminSource apps/admin/dist -H5Source apps/h5/dist -TargetRoot C:\authorization\www`  
Expected: exit code 0；`C:\authorization\www\admin` 与 `C:\authorization\www\h5` 包含本次构建并通过文件清单校验。

Run: `powershell -File deploy/install-nginx.ps1 -Template deploy/nginx.example.conf -NginxRoot C:\nginx -StaticRoot C:\authorization\www -CertificatePath $env:TLS_CERTIFICATE_PATH -CertificateKeyPath $env:TLS_CERTIFICATE_KEY_PATH`  
Expected: exit code 0；证书文件可读，`nginx -t` 成功且新 HTTPS 配置已 reload，失败时保留旧配置。

Run: `pm2 startOrReload ecosystem.config.cjs --update-env`  
Expected: `authorization-api` 与 `authorization-pdf-worker` 均为 `online`。

Run: `powershell -File deploy/configure-pm2-logrotate.ps1 -MaxSize 10M -Retain 30 -Compress`  
Expected: exit code 0；`pm2-logrotate` 为 `online`，读取配置得到 `max_size=10M`、`retain=30` 和 `compress=true`。

Run: `powershell -File scripts/run-and-capture.ps1 -OutputPath docs/acceptance/evidence/deployment-smoke.txt -Executable powershell -ArgumentsJson '["-NoProfile","-File","deploy/smoke.ps1","-ApiUrl","%API_PUBLIC_URL%","-AdminUrl","%ADMIN_PUBLIC_URL%","-H5Url","%PUBLIC_H5_URL%"]'`  
Expected: exit code 0；API、Worker、PostgreSQL、文件目录、Chromium、Admin 静态入口和 H5 静态入口全部报告 `PASS`。

- [ ] **Step 5: 提交**

```powershell
git add ecosystem.config.cjs deploy/nginx.example.conf deploy/install-static.ps1 deploy/install-nginx.ps1 deploy/configure-pm2-logrotate.ps1 deploy/smoke.ps1 apps/api/src/health.service.ts apps/api/src/health.service.spec.ts apps/api/src/health.controller.ts apps/api/src/health.controller.spec.ts apps/api/src/app.module.ts apps/worker/src/health/heartbeat.ts apps/worker/src/main.ts apps/worker/package.json .env.example packages/config/src/env.ts packages/config/src/env.test.ts docs/acceptance/evidence/deployment-smoke.txt
git commit -m "ops: add production process and serving configuration"
```

Expected: 创建一个仅包含生产运行配置和冒烟检查的提交。

### Task 46: 实现备份与隔离恢复演练

**Files:**
- Create: `deploy/backup.ps1`
- Create: `deploy/restore.ps1`
- Create: `deploy/recovery-drill.ps1`
- Create: `deploy/install-backup-schedule.ps1`
- Create: `deploy/backup.md`
- Create: `deploy/runbook.md`
- Create: `deploy/backup-schedule.md`
- Generate: `docs/acceptance/evidence/recovery-drill.txt`
- Generate: `docs/acceptance/evidence/recovery-drill-summary.json`

- [ ] **Step 1: 编写失败的恢复演练入口**

演练必须拒绝生产数据库名和生产文件目录，只允许显式命名的隔离数据库及临时文件根目录。数据库名必须以 `_recovery_drill` 结尾；`DRILL_FILE_ROOT` 与 `DRILL_BACKUP_ROOT` 必须解析为不同目录，且都位于专用 `RECOVERY_DRILL_ROOT` 下。

Run: `powershell -File deploy/recovery-drill.ps1 -ValidateOnly -DrillDatabaseUrl $env:DRILL_DATABASE_URL -DrillFileRoot $env:DRILL_FILE_ROOT -BackupRoot $env:DRILL_BACKUP_ROOT -AllowedRoot $env:RECOVERY_DRILL_ROOT`  
Expected before implementation: exit code non-zero，并报告缺少备份、恢复或安全目标校验。

- [ ] **Step 2: 实现数据库与文件备份**

`backup.ps1` 使用独立凭据，执行 PostgreSQL 备份与文件增量备份，生成 SHA-256 清单。

Run: `powershell -File deploy/backup.ps1 -DatabaseUrl $env:DATABASE_URL -FileRoot $env:FILE_ROOT -BackupRoot $env:DRILL_BACKUP_ROOT`  
Expected: exit code 0；数据库转储、文件增量和 SHA-256 清单均存在且校验通过。

- [ ] **Step 3: 安装每日备份与季度演练计划**

`install-backup-schedule.ps1` 安装每日备份、失败告警和每季度恢复演练提醒；`backup-schedule.md` 记录任务名称、运行身份和核验方法。

Run: `powershell -File deploy/install-backup-schedule.ps1 -BackupAt 02:00 -RecoveryMonths "1,4,7,10"`  
Expected: exit code 0；每日备份任务使用独立凭据运行，失败告警已启用，并存在1月、4月、7月和10月的恢复演练提醒。

- [ ] **Step 4: 实现隔离恢复**

`restore.ps1` 只能恢复到显式隔离目标；恢复后校验数据库记录、文件哈希、最终 PDF、审计记录和历史版本。

- [ ] **Step 5: 执行 API/Worker 重启及恢复演练**

Run: `powershell -File scripts/run-and-capture.ps1 -OutputPath docs/acceptance/evidence/recovery-drill.txt -Executable powershell -ArgumentsJson '["-NoProfile","-File","deploy/recovery-drill.ps1","-DrillDatabaseUrl","%DRILL_DATABASE_URL%","-DrillFileRoot","%DRILL_FILE_ROOT%","-BackupRoot","%DRILL_BACKUP_ROOT%","-AllowedRoot","%RECOVERY_DRILL_ROOT%"]'`  
Expected: exit code 0；已提交数据及文件零丢失，未完成 PDF 任务在60秒内恢复，不生成重复最终记录，摘要记录实际恢复时长、最近备份年龄、`RPO <= 24h` 和 `RTO <= 8h`。

- [ ] **Step 6: 提交**

```powershell
git add deploy/backup.ps1 deploy/restore.ps1 deploy/recovery-drill.ps1 deploy/install-backup-schedule.ps1 deploy/backup.md deploy/runbook.md deploy/backup-schedule.md docs/acceptance/evidence/recovery-drill.txt docs/acceptance/evidence/recovery-drill-summary.json
git commit -m "ops: add backup and verified recovery drill"
```

Expected: 创建一个仅包含备份、恢复和演练证据的提交。

### Task 47: 完成八项验收与发布门禁

**Files:**
- Create: `scripts/run-acceptance.ps1`
- Create: `tests/e2e/create-case-timing.spec.ts`
- Create: `tests/e2e/browser-persistence.spec.ts`
- Create: `tests/e2e/browser-matrix.config.ts`
- Generate: `tests/e2e/browser-matrix.manifest.json`
- Create: `tests/e2e/manual-matrix.validator.ts`
- Create: `tests/e2e/manual-matrix.validator.spec.ts`
- Create: `docs/acceptance/authorization-mvp.md`
- Create: `docs/acceptance/browser-matrix.md`
- Create: `docs/acceptance/security-risk-register.md`
- Generate: `docs/acceptance/evidence/create-case-timing.json`
- Generate: `docs/acceptance/evidence/browser-automated.txt`
- Generate: `docs/acceptance/evidence/browser-matrix.json`
- Generate: `docs/acceptance/evidence/full-gate.txt`
- Generate: `docs/acceptance/evidence/release-summary.json`
- Modify: `README.md`

- [ ] **Step 1: 建立八项验收索引**

`authorization-mvp.md` 将规格第14节每项标准映射到：

- 测试命令或人工步骤。
- 固定测试数据。
- 通过阈值。
- 证据文件路径。
- 执行人和执行时间。
- 最终签字结论。

不得使用“待补充”“稍后确认”或空白证据路径。

- [ ] **Step 2: 验证创建时长**

Run: `pnpm --filter @auth/e2e exec playwright test --config playwright.config.ts create-case-timing.spec.ts`  
Expected: 连续5次使用预置模板、3条物料和3个资料项，在不上传客户文件的前提下创建业务单并复制链接；每次均小于180秒；原始计时写入 `docs/acceptance/evidence/create-case-timing.json`。

- [ ] **Step 3: 完成兼容性矩阵**

自动化部分：

`browser-matrix.config.ts` 必须定义四个实际浏览器项目：`desktop-chrome-current`、`desktop-chrome-previous`、`android-chrome-current` 和 `android-chrome-previous`。桌面项目分别使用 `CHROME_CURRENT_EXECUTABLE` 与 `CHROME_PREVIOUS_EXECUTABLE`；Android 项目分别连接 `ANDROID_CHROME_CURRENT_WS_ENDPOINT` 与 `ANDROID_CHROME_PREVIOUS_WS_ENDPOINT`。测试启动时读取真实浏览器版本；`browser-matrix.manifest.json` 同时记录 stable 渠道来源、安装包或设备构建哈希和检测时间，并断言每个平台两个稳定主版本不同且连续。

Run: `powershell -File scripts/run-and-capture.ps1 -OutputPath docs/acceptance/evidence/browser-automated.txt -Executable pnpm -ArgumentsJson '["test:browser-matrix"]'`  
Expected: exit code 0；四个项目均填写10个字段、上传3个文件、刷新并重新进入后已确认数据100%恢复；manifest 记录两个桌面 Chrome 和两个 Android Chrome 的实际稳定主版本。

人工设备部分按 `docs/acceptance/browser-matrix.md` 在 iOS 最新及前一主要版本 Safari、生产目标微信内置浏览器中执行同一流程。  
Expected: 每个条目记录实际浏览器版本、设备、时间、结果和证据引用；全部为 PASS。汇总写入 `docs/acceptance/evidence/browser-matrix.json`。

Run: `pnpm validate:manual-matrix`  
Expected: exit code 0；JSON 同时包含 iOS 最新版 Safari、iOS 前一主要版本 Safari 和目标微信内置浏览器，版本、设备、执行时间、PASS 结果及可解析证据路径均非空；任何缺项或非 PASS 结果均使命令失败。

- [ ] **Step 4: 运行完整发布门禁**

Run: `powershell -File scripts/run-and-capture.ps1 -OutputPath docs/acceptance/evidence/full-gate.txt -Executable powershell -ArgumentsJson '["-NoProfile","-File","scripts/run-acceptance.ps1"]'`  
脚本必须依次执行：

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:browser-matrix
pnpm validate:manual-matrix
pnpm build
powershell -File deploy/smoke.ps1 -ApiUrl $env:API_PUBLIC_URL -AdminUrl $env:ADMIN_PUBLIC_URL -H5Url $env:PUBLIC_H5_URL
powershell -File deploy/recovery-drill.ps1 -DrillDatabaseUrl $env:DRILL_DATABASE_URL -DrillFileRoot $env:DRILL_FILE_ROOT -BackupRoot $env:DRILL_BACKUP_ROOT -AllowedRoot $env:RECOVERY_DRILL_ROOT
```

Expected: exit code 0；每个命令退出码均为0；PDF 基线全部通过；浏览器矩阵完整；风险清单明确记录恶意文件扫描状态；P0/P1 未解决缺陷均为0。汇总写入 `docs/acceptance/evidence/release-summary.json`。

- [ ] **Step 5: 执行完成前复核**

按 `superpowers:verification-before-completion` 检查 Git diff、环境变量、数据库迁移、备份恢复、部署冒烟和全部证据文件。  
Expected: 没有未记录的变更、空白验收项或缺失证据。

- [ ] **Step 6: 提交并请求最终代码审查**

```powershell
git add scripts/run-acceptance.ps1 tests/e2e/create-case-timing.spec.ts tests/e2e/browser-persistence.spec.ts tests/e2e/browser-matrix.config.ts tests/e2e/browser-matrix.manifest.json tests/e2e/manual-matrix.validator.ts tests/e2e/manual-matrix.validator.spec.ts docs/acceptance README.md
git commit -m "docs: add authorization mvp acceptance evidence"
```

Expected: 提交成功且工作区无本计划产生的未提交文件。

随后按 `superpowers:requesting-code-review` 发起最终代码审查。  
Expected: 审查范围包含 Chunk 1–3 的全部提交，以及 `docs/acceptance/evidence/release-summary.json`。
