# 委托生产授权平台 MVP 发布验收索引

执行日期：2026-08-07（Asia/Shanghai）
执行环境：Windows 本地工作区
结论：代码级门禁与 dry-run 可执行；真实数据库全链路和真实设备矩阵因缺少专用环境未运行，不能作为生产放行证据。

| 验收项 | 自动命令/人工步骤 | 固定数据与阈值 | 证据 | 执行人 | 执行时间 | 当前结论 | 签字结论 |
|---|---|---|---|---|---|---|---|
| 中文主语言与页面路由 | `pnpm --filter @auth/admin test`、`pnpm --filter @auth/h5 test` | Admin 页面测试；H5 精确免责声明 | `docs/acceptance/evidence/release-summary.json` | 本地自动化代理 | 2026-08-07T01:00:00+08:00 | 已自动验证 | LOCAL_CODE_PASS |
| 模板、业务单、客户链接 | `pnpm test:e2e` | 连续5次创建小于180秒；完成后1秒内失效 | `tests/e2e/create-case-timing.spec.ts` | E2E 环境负责人 | 2026-08-07T01:00:00+08:00 | 未运行：缺专用环境 | NOT_RUN / RELEASE_BLOCKED |
| 填写、上传与普通签署 | `pnpm test:e2e` | 3文件、固定预签 PDF、完整签署命令 | `tests/e2e/lifecycle-history.e2e.spec.ts` | E2E 环境负责人 | 2026-08-07T01:00:00+08:00 | 测试体完整，真实链路未运行 | NOT_RUN / RELEASE_BLOCKED |
| 驳回补件与复审 | `pnpm test:e2e` | 单资料项 REJECT→仅补件项可改→重新签署→APPROVE | `tests/e2e/lifecycle-history.e2e.spec.ts` | E2E 环境负责人 | 2026-08-07T01:00:00+08:00 | 测试体完整，真实链路未运行 | NOT_RUN / RELEASE_BLOCKED |
| 最终 PDF | Worker视觉门禁、API/Worker集成 | 批准基线差异≤0.5%；最终 SHA-256 64位 | `apps/worker/test/pdf-visual-baseline.manifest.json` | 发布负责人 | 2026-08-07T01:00:00+08:00 | 无批准基线 | NOT_RUN / RELEASE_BLOCKED |
| 跨应用安全 | `pnpm test:e2e` | 六类能力允许/拒绝；三层上传配额 | `tests/e2e/api-attacks.e2e.spec.ts` | 安全测试负责人 | 2026-08-07T01:00:00+08:00 | 测试体完整，真实链路未运行 | NOT_RUN / RELEASE_BLOCKED |
| 浏览器兼容 | `pnpm test:browser-matrix` + iOS/微信人工矩阵 | 两代桌面/Android Chrome、两代 iOS Safari、微信 | `tests/e2e/browser-matrix.manifest.json` | 兼容性测试负责人 | 2026-08-07T01:00:00+08:00 | 缺真实版本/设备 | NOT_RUN / RELEASE_BLOCKED |
| 部署与恢复 | 部署临时 mock、目标服务器冒烟、隔离恢复 | TLS1.2/1.3、20MB、RPO≤24h、RTO≤8h | `docs/acceptance/evidence/recovery-drill-summary.json` | 运维负责人 | 2026-08-07T01:00:00+08:00 | 本地mock通过；真实恢复未运行 | NOT_RUN / RELEASE_BLOCKED |

## 发布前仍需补齐的外部证据

1. 提供独立数据库名以 `_test` 结尾的 `TEST_DATABASE_URL`、专用 `E2E_API_URL`、`E2E_ADMIN_TOKEN` 与 H5 URL，执行完整生命周期。
2. 提供两代真实桌面/Android Chrome 和两代 iOS Safari、目标微信内置浏览器，记录真实版本、设备、时间与截图/trace。
3. 在目标服务器变更窗口内由运维执行 Nginx `-t`、PM2 online、NAS 挂载健康检查和隔离恢复演练。

以上三项未补齐前，不得把本地结果描述为“生产发布已通过”。
