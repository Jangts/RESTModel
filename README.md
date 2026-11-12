# RESTModel

面向 RESTful API 的模型化 HTTP 客户端，以约定推导资源关系，提供自然的链式操作。核心与 Axios、HTTP Mock、Pinia 扩展均已有可运行 API；当前包保持 private，未公开发布。

## 目录

```text
packages/core       @restmodel/core：主包
extensions/axios    @restmodel/axios：Axios 请求执行扩展
extensions/mock     @restmodel/mock：HTTP Mock 调试扩展
extensions/pinia    @restmodel/pinia：状态管理扩展
```

## 开发

使用 Node.js 22 或以上、pnpm 8.10.5。

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm format:check
pnpm build
pnpm clean
```

完整验收执行 `pnpm check`，包含类型、行为、本机 HTTP、tarball 消费和真实 Chrome 检查；需本机监听权限及 Chrome。单项使用 `pnpm check:packages`、`pnpm check:browser`，可用 CHROME_BIN 指定 Chrome 可执行文件。GitHub Actions 已配置 Node 22/24 矩阵，远端执行结果以实际工作流为准。

文档入口见 [文档索引](docs/README.md)。

- [客户端与 HTTP 执行](docs/client.md)
- [资源操作声明](docs/operations.md)
- [项目边界](docs/project-scope.md)
- [文档规范](docs/documentation-standard.md)
- [代码规范](docs/coding-standard.md)
- [代码审查规范](docs/code-review-standard.md)

设计提案和实施记录分别收录在文档索引的设计、维护分组中。
