# Findings & Decisions

## Requirements
- 已批准需求位于 `docs/superpowers/specs/2026-08-05-authorization-platform-design.md`。
- 只编写实施计划，不开始业务代码。
- 技术栈：React 后台、React H5、NestJS、PostgreSQL、Prisma、pg-boss、Playwright、Sharp、PM2。
- 复用外部 Token/getInfo 与 roleKey；文件首期本地存储，后续挂载 NAS。

## Technical Decisions
| Decision | Rationale |
|---|---|
| API 按业务模块组织，而非全局 controller/service 目录 | 保持边界清楚和可独立测试 |
| 共享契约放 `packages/contracts` | 避免后台、H5 与 API 重复定义状态和 DTO |
| 文件存储以接口 + local adapter 实现 | NAS 只需更换根目录或适配器 |
| PDF 工作放独立 worker app | 避免阻塞 API，支持 PM2 独立恢复 |

## Issues Encountered
| Issue | Resolution |
|---|---|
| 仓库当前只有设计文档，没有现有工程惯例 | 计划明确从零建立 workspace 和边界 |

## Resources
- `docs/superpowers/specs/2026-08-05-authorization-platform-design.md`

## Visual/Browser Findings
- 已确认 8 阶段业务流程、模块化单体架构、后台菜单、H5 四步向导、状态规则及技术方案。
# Task11 quality re-review findings (2026-08-06)

- Fixed seven-day singleton keys can suppress a legitimate manual retry; queue identity must include a persisted generation.
- DB state mutation followed by direct pg-boss send is not atomic; use a durable outbox marked published only after non-null send.
- Content-addressing alone cannot prevent two physical PDFs when Chromium output changes after a crash; recover a deterministic staging journal before rendering.
- `evidenceRetainedBytes` counts FINAL_PDF but completion does not enforce the cap under a per-case lock.
- Promise timeout around pdf-lib does not stop CPU work; use a terminable worker thread.
- `createQueue` does not prove the policy of a pre-existing queue.

# Task12 spec re-review findings (2026-08-07)

- Lifecycle E2E stops before a valid second signing/review/final-PDF/automatic-link-close sequence.
- Attack E2E only checks case listing and one file-size quota; operation abilities and item/case quotas are absent.
- Direct `auditEvent.create` calls bypass the shared writer; download audit happens before stream success and lacks failure outcome.
- SafeLogger is blacklist/key based and leaks sensitive values under benign keys.
- Worker visual script only runs Chromium smoke tests; approved baseline raster/manifest comparison is not wired.
- Recovery scripts verify dump/file copy only, not restored business invariants or PDF recovery.
- Local gate omits its own release tools/deploy mocks; create timing spec and complete eight-item ownership/timing/signoff index are absent.
# Deployment findings (2026-08-07)

- Git remote is `https://github.com/xaxdh123-commits/authorization-document.git`.
- Current implementation is largely modified/untracked locally; remote currently advertises no heads, so cloning before publishing would omit the implementation.
- PM2 config runs `authorization-api` and `authorization-pdf-worker` from built workspace output.
- Production static builds use `/admin/` and `/p/` base paths.
- Target requested by user: Linux root host `192.168.22.191`, deploy beneath `/opt`, GitHub clone workflow, PM2 process manager.
- Planning skill catch-up script cannot parse this Windows drive path; continue from existing planning files and log the error.
