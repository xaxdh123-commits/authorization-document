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

