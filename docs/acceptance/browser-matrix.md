# 浏览器兼容矩阵

当前状态：`NOT_RUN`。未提供真实设备/安装包版本，未伪造 PASS。

自动测试定义：`tests/e2e/browser-matrix.config.ts`，包含：

- desktop-chrome-current
- desktop-chrome-previous
- android-chrome-current
- android-chrome-previous

人工执行还必须覆盖 iOS Safari 最新主版本、前一主版本及目标微信内置浏览器。每条记录必须包含实际版本、设备、执行时间、结果与可解析证据路径；缺任一字段即不得通过。
