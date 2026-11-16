# RESTModel Docs 部署记录

2026-11-16，沿用 Agent Core 与 Router Plus 的自建 Pages 合同，将站点部署到武汉 `restmodel-docs.pages.jangts.cafe`，对应 `/opt/stacks/nginx-proxy-manager/data/pages/restmodel-docs/`。执行入口为仓库根目录的 `pnpm docs:deploy`，连接配置来源为 `apps/docs/scripts/deploy.config.json`，部署方法见 [文档站维护说明](../README.md)。

- 中英文分别位于 `/zh/` 与 `/en/`，包括首页、指南、参考、扩展及四包 API 索引，共 26 个内容页，另有根路径语言入口。
- 根路径依据浏览器语言和已记住的用户选择进入对应语言首页；5 组语言与偏好组合、两种页面语言切换、canonical/hreflang 检查通过。
- 文档生成、双语页面与 API 符号覆盖、完整构建、格式和差异检查通过。
- 远端部署校验 110 个文件；公网 HTTPS 逐文件读取后与本地 SHA-256 一致，缺失页面返回 404。现场回执保存在 `/tmp/restmodel-pages-verification.json`。
- 仅替换本站静态目录，未修改共享代理、DNS、证书或其他站点，未发布 npm 包。未进行浏览器视觉验收。

最初误将 Pages 理解为 GitHub Pages，已改用原定自建 Pages；GitHub 不是本站托管方案。GitHub API 拒绝停用该仓库 Pages（422），故将本轮误上传的文档替换为指向自建站点的跳转页，不继续维护第二份文档。

## 默认 HTTP 执行与入门修正（2026-11-16）

createClient 缺省使用内置 Fetch，transport 仅用于显式替换 HTTP 执行器；低层 executeHttp 的契约保持显式执行器。中英文入门、首页、客户端参考、主包 README、Pinia 示例及 API 索引均同步。入门直接说明真实 REST 服务的集合与成员路径、GET/POST/PATCH、JSON 请求体与服务返回约定，移除手写模拟 HTTP 响应。

pnpm check 通过：63 项行为测试、类型与格式、四包真实 tarball 消费及 Chrome 9 项检查。文档检查与构建通过，使用同一 pnpm docs:deploy 入口仅更新本站静态成品。公网逐文件校验回执为 `/tmp/restmodel-default-fetch-docs-verification.json`；未发布 npm 包。

## 标准操作例外与直接动作（2026-11-16）

标准操作数组可混合字符串与 `{ operation, method?, scheme?, path?, queryKey? }`。get 的路径或身份 query 例外保留标准调用与实体包装。自定义动作仅按声明名直接调用，移除旧嵌套入口；调用名与后端 path 独立，冲突只针对调用槽位与同位置关系。两种语言的合同、示例、API 索引及主包 README 同步。

pnpm check 通过：69 项行为测试、源码及独立 tarball 类型检查、四包实际消费与 Chrome 14 项 HTTP 检查。文档检查及完整构建通过，同一部署入口仅替换本站 110 个静态文件。公网逐文件校验回执为 `/tmp/restmodel-operation-actions-verification.json`。未发布 npm 包。

## Action 具名路径参数（2026-11-16）

动作 path 支持多个 `:name` 完整片段，从输入对象的自有数据字段提取并逐片段编码。已消费字段从剩余 query/body 输入中移除，全部消费时不添加空 body；静态动作保留原有输入契约。字面量路径推导必填参数，显式输入泛型保留业务输入输出约束。缺参、非法标量、路径逃逸及访问器在请求前拒绝。

pnpm check 通过：73 项行为测试、类型与格式、四包真实 tarball 消费、Chrome 16 项 HTTP 检查。双语参考、主包 README 和 API 索引同步，文档检查及构建通过。使用既有入口仅替换本站 110 个静态文件，公网逐文件校验回执为 `/tmp/restmodel-action-path-verification.json`。未发布 npm 包。

## 文档合同对齐（2026-11-16）

本次整理仓库与主包 README、中英文快速上手／项目边界／操作声明／客户端参考、文档索引、API 描述和当前维护状态。统一单身份标准操作覆盖与多参数 action 的选用边界、直接动作调用、路径字段提取及剩余 query/body 规则。修正归一化结果字段说明、缺少导入或装配的完整示例，以及主包 README 的线上参考链接。历史设计草案保留设计对照身份，当前状态不再堆叠不同阶段的测试数量。

14 个独立文档示例已通过 TypeScript 检查；双语页面、导出覆盖、完整构建、格式与差异检查通过。未重复运行全套代码行为测试，不执行 npm 发布。通过既有部署入口更新本站静态成品，公网逐文件 SHA-256 校验回执为 `/tmp/restmodel-doc-alignment-verification.json`。
