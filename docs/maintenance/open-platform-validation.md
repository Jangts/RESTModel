# 开放平台 Demo 与测试验证

日期：2026-11-16。实现终端 Demo 和独立的真实平台测试，目标为 Gitee mindspore/mindspore Releases 与 GitHub octocat/Hello-World Issues。仅通过默认 Fetch 请求公开 GET 接口，未使用 Token、未读取账号状态或组织权限、未执行外部写操作。

- `pnpm demo:gitee`：真实列表、实体继续 get、第二页与多参数仓库查询 action 均成功。
- `pnpm demo:github`：相同四步均成功，列表实体后续请求使用仓库内 number 而非全局 id。服务返回的 Pull Request 保留其原始 Issues API 语义。
- `pnpm test:live`：两个平台的 8 个接口子项通过；Node 报告 10 项通过（含两个父项），0 失败、0 跳过。
- 覆盖列表与原始 body 对齐、page/per_page 映射、实体身份与后续请求清理、多参数 action 路径及输入字段消耗。

配置、源码、命令和验证边界见[运行说明](../../development/open-platforms/README.md)。测试不加入默认 test/check，网络错误或限流不伪装成跳过或成功。本次只验证终端和公开接口，不涉及浏览器 CORS、平台写操作或 npm 发布。
