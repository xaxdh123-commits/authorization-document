# Task Plan: 委托生产授权平台实施计划

## Goal
基于已批准的需求设计，产出一份文件级、测试优先、可逐步提交的完整实施计划，不编写业务代码。

## Current Phase
Phase 4

## Phases

### Phase 1: 范围与结构映射
- [x] 确认已批准的需求设计
- [x] 映射仓库目录、模块边界与计划分块
- **Status:** complete

### Phase 2: 编写计划
- [x] 编写基础设施与后端核心计划
- [x] 编写后台、H5、模板与 PDF 计划
- [x] 编写安全、测试、部署与验收计划
- **Status:** complete

### Phase 3: 分块审查
- [x] 独立审查每个计划分块
- [x] 修正所有阻塞问题并重新审查
- **Status:** complete

### Phase 4: 验证与交付
- [x] 验证计划格式、路径、命令和需求覆盖
- [x] 提交计划文档并交付用户
- **Status:** complete

## Key Questions
1. 单一实施计划能否保持各模块独立可测试？答案：采用三个逻辑分块、按纵向可运行增量实施。
2. 如何避免 Redis 等未要求基础设施？答案：后台任务使用 PostgreSQL 上的 pg-boss。

## Decisions Made
| Decision | Rationale |
|---|---|
| 单仓库 pnpm workspace | 后台、H5、API 和共享包协同发布，减少重复类型 |
| 三个计划分块 | 每块不超过 1000 行，便于独立审查和执行 |
| TDD、小步提交 | 满足 writing-plans 流程并降低跨模块风险 |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| session-catchup.py 在 Windows 项目路径上生成非法 Claude 项目路径 | 1 | 已确认无旧的 task_plan.md；直接初始化本项目规划文件并记录错误 |
# Task11 Quality Re-review (2026-08-06)

- [x] Q1 generation-aware transactional outbox and queue reconciliation
- [x] Q2 crash-safe PDF storage journal and recovery without re-render
- [x] Q3 transactionally enforce 200MB retained evidence cap
- [x] Q4 worker-thread PDF parser with hard timeout/termination
- [x] Q5 verify/update existing pg-boss singleton queue policy
- [x] Q6 full tests, Chrome, Prisma and diff verification

# Production Deployment to 192.168.22.191 (2026-08-07)

- [x] D1 inspect local Git/deploy state and identify GitHub publication gap
- [ ] D2 sanitize deployable tree, create deployment branch, verify and push to GitHub
- [ ] D3 inspect target Linux host and provision required runtime under /opt
- [ ] D4 clone exact Git revision, configure environment/storage/database, migrate and build
- [ ] D5 start API/worker with PM2 and serve Admin/H5 through Nginx
- [ ] D6 run remote health/smoke checks and record exact deployed revision/endpoints

Deployment safety decisions:
- Preserve the existing dirty working tree; do not reset or discard user work.
- Never commit supplied server credentials or generated production secrets.
- Deploy an exact pushed branch/revision by Git clone as requested.
- Do not claim release readiness unless remote runtime and health checks pass.

Deployment errors:
- Commit attempt 1 stopped before commit because `git diff --cached --check` found two Markdown trailing spaces and one extra EOF blank line; fix formatting and rerun the staged gate.

# Task12 Spec Re-review Fixes (2026-08-07)

- [x] T12.1 complete lifecycle E2E test body
- [x] T12.2 abilities matrix and three quota attack levels
- [x] T12.3 mandatory AuditWriter structure, migrate direct writes, download success/failure audit
- [x] T12.4 SafeLogger allowlist and content-level redaction
- [x] T12.5 real PDF visual baseline wiring with blocked-without-approved-baseline semantics
- [x] T12.6 injectable recovery verifier and temporary mock coverage
- [x] T12.7 acceptance gate tools, create timing spec, and eight-item acceptance index
- [x] Full safe verification without non-test databases or real external systems
