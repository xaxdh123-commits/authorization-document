# 委托生产授权平台 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可由 PM2 部署的委托生产授权平台 MVP，覆盖后台创建、客户 H5 填写签署、逐项审核补件、最终 PDF 与审计归档。

**Architecture:** 使用 pnpm 单仓库承载 NestJS API、PDF Worker、React 管理后台、React H5 和共享契约。业务后端采用模块化单体，PostgreSQL/Prisma 保存关系数据与 JSONB 快照，pg-boss 承载可恢复任务，文件通过可替换存储接口落到本地/NAS。

**Tech Stack:** Node.js 22 LTS、pnpm、TypeScript、NestJS、Prisma、PostgreSQL、pg-boss、React、Vite、Ant Design、Ant Design Mobile、Tiptap、Playwright、Sharp、Vitest、Jest、Supertest、Playwright Test、PM2。

---

## 执行顺序

实施计划拆成三个独立审查、顺序执行的分块。每个分块均低于 1000 行；必须完成当前分块的所有任务和门禁后才能进入下一分块。

1. [Chunk 1：工程基础、身份权限与业务核心](authorization-platform-chunks/chunk-1-foundation-core.md)
2. [Chunk 2：文件、问卷、模板、签署、PDF 与用户界面](authorization-platform-chunks/chunk-2-workflows-ui.md)
3. [Chunk 3：纵向验收、安全、部署与发布](authorization-platform-chunks/chunk-3-security-deployment.md)

## 全局执行纪律

- 每个任务使用 `superpowers:test-driven-development`：先观察目标测试失败，再写最小实现，再观察通过。
- 每个任务单独提交；不得把无关重构混入功能提交。
- 每完成一个 Chunk，运行该 Chunk 末尾列出的完整门禁。
- 任何完成声明前使用 `superpowers:verification-before-completion`。
- 发现规格缺口时暂停执行并更新设计与计划，不在实现中暗自引入需求。
- 本计划只定义实施步骤；开始执行时使用 `superpowers:subagent-driven-development`，每个任务由新的实现代理完成并接受两阶段复审。
