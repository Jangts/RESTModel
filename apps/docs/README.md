# RESTModel 文档站

基于 VitePress 的静态双语文档站，面向库使用者。沿用 Agent Core、Router Plus 的独立应用、公共文档生成、本地搜索、双语路由与自建 Pages 托管方式。

## 开发与内容来源

在仓库根目录执行 `pnpm install`，随后使用 `pnpm docs:dev`、`pnpm docs:check`、`pnpm docs:build`、`pnpm docs:preview`。

中文正文来自 `docs/` 与扩展 README，英文正文来自 `docs/en/`，两种语言的首页分别为 `content/index.md`、`content/index.en.md`。API 英文说明位于 `scripts/api-descriptions.mjs`，两种语言的类型签名均从相同的公开源码入口生成。`scripts/pages.mjs` 统一注册来源、路由和导航。生成器只替换被忽略的 `.generated/`，不修改来源；新增正式页面必须提供中英文来源。

`docs/design`、`docs/maintenance` 和开发规范不进入站点。检查拒绝缺失的翻译、未注册的相对链接或遗漏的公开导出，VitePress 构建检查内部链接。开发命令监听两种语言的正文、首页、logo 和包源码。不得直接修改生成页。

## 语言与路径

中文与英文位于同级 `/zh/`、`/en/` 目录。根路径按浏览器语言进入对应首页，点击语言切换会记住选择。导航、侧边栏、全文搜索和 canonical/hreflang 均按语言生成。构建输出位于 `apps/docs/dist/`。

## 部署

线上入口：[RESTModel Docs](https://restmodel-docs.pages.jangts.cafe/)。复用 Agent Core、Router Plus 的武汉自建 Pages，站点目录为 `/opt/stacks/nginx-proxy-manager/data/pages/restmodel-docs/`。连接和共享静态服务合同以 Jangts 仓库 `deploy/README.md`、`deploy/pages/README.md` 为准。

```sh
pnpm docs:deploy
```

部署目标及 SSH 身份文件路径由 `scripts/deploy.config.json` 指定，不保存密钥内容。脚本检查文档，以生产域名和根路径构建，打包并通过 scp 上传。远端核对压缩包与所有静态文件的 SHA-256 后，仅替换本站目录，失败恢复原站。不修改共享代理、DNS、证书或其他站点，不发布 npm 包，不提交源码。构建本身不执行部署。

域名与基础路径分别通过 `DOCS_ORIGIN`、`DOCS_BASE` 配置；生产为 `https://restmodel-docs.pages.jangts.cafe` 和 `/`。缺失页面由现有 Pages 返回统一的真实 HTTP 404。

Logo 来源为 `docs/assets/branding`，不修改用户原图。`.generated/`、缓存和产物均被忽略。依赖安装在本项目，不借用其他仓库的 node_modules。
