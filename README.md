# 委托生产资料与授权书平台

Node/NestJS API + PDF Worker + React 管理后台 + React H5。中文为主语言，支持动态资料项、可视化授权书模板、不可猜测且可过期的客户链接、资料上传、普通电子签署、逐项审核/驳回补件和最终 PDF。

## 本地查看

```powershell
pnpm install
pnpm --filter @auth/admin dev -- --host 127.0.0.1 --port 5175
pnpm --filter @auth/h5 dev -- --host 127.0.0.1 --port 5174
```

- Admin 演示：`http://127.0.0.1:5175/dashboard?demo=1`
- H5 演示：`http://127.0.0.1:5174/?demo=1`

真实 API 失败不会静默切换为演示数据；只有显式 `?demo=1` 才进入演示模式。

## 验证与发布

见 `docs/acceptance/authorization-mvp.md`。数据库集成只允许 `TEST_DATABASE_URL` 指向以 `_test` 结尾的数据库；没有该变量时会安全跳过并明确标记“未运行”，绝不触碰开发/生产数据库。

生产样例位于 `ecosystem.config.cjs` 和 `deploy/`。所有安装、备份、恢复及计划任务脚本默认 dry-run，本地验收不会真实变更服务器。

同主域路径发布时分别构建：Admin 设置 `VITE_PUBLIC_BASE=/admin/`，H5 设置 `VITE_PUBLIC_BASE=/p/`；`BrowserRouter` 会读取相同 base，避免静态资源和前端路由冲突。
