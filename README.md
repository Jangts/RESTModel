<p align="center"><img src="docs/assets/branding/restmodel-logo.svg" alt="RESTModel" width="420"></p>

# RESTModel

**把接口，组织成资源。**

面向 RESTful API 的模型化 HTTP 客户端：声明资源与能力，通过自然的链式调用表达查询、分页、关系和操作。服务级 scheme 统一适配身份、响应信封和分页约定；核心独立于 Axios、Vue 和 Pinia。

[快速上手](docs/getting-started.md) · [客户端参考](docs/client.md) · [操作声明](docs/operations.md) · [扩展指南](docs/extensions.md) · [文档索引](docs/README.md)

## 使用

要求 Node.js 22+，或支持现代 Web API 的浏览器。主包与扩展均面向公共发布，尚未公开发布；目前使用工作区或本地 tarball；分发方式见[快速上手](docs/getting-started.md)。

```ts
import { createClient, resource } from '@restmodel/restmodel';

interface User { id: number; name: string }

const api = createClient({
  baseURL: 'https://example.test/api',
  resources: {
    users: resource({ operations: ['list', 'get', 'post', 'patch'] }).typed<User>(),
  },
});

const users = await api.users.page(1, 20).list(); // GET /api/users?page=1&size=20
const user = await api.users(0).get();           // GET /api/users/0
await api.users(0).patch({ name: 'Ivan' });      // PATCH /api/users/0
```

示例需要实际 REST 服务。默认 list 接收裸数组、身份字段为 id；未声明 operations 时没有操作能力。模型泛型不替代运行时校验。完整接入例子见[快速上手](docs/getting-started.md)。

## 包与职责

| 包 | 用途 |
| --- | --- |
| [@restmodel/restmodel](packages/restmodel/README.md) | 资源声明、链式客户端、服务适配、Fetch 与公共 HTTP 契约 |
| [@restmodel/axios](extensions/axios/README.md) | Axios 执行器 |
| [@restmodel/mock](extensions/mock/README.md) | HTTP 调试与模拟 |
| [@restmodel/pinia](extensions/pinia/README.md) | 共享请求状态与生命周期 |

query/page/cursor/with 返回隔离的新引用；集合、成员和单体各有明确的操作位置。扩展按需使用，核心不内置缓存或自动重试。

标准操作只有单身份地址例外时，在 operations 中配置 `{ operation: 'get', path: 'getById', queryKey: 'id' }` 或 `{ operation: 'get', path: 'getById/:id' }`，调用仍是 `api.users(id).get()`。需要多个业务入参或额外行为时使用 action，按声明名直接调用；动作名与后端路径独立。

action 支持多个具名路径参数，例如 `path: 'getById/:tenantId/:id'`：`api.users.lookup({ tenantId: 7, id: 123, detail: true })` 请求 `/api/users/getById/7/123?detail=true`。已用于路径的字段不重复进入 query/body，详见[客户端参考](docs/client.md#动作路径参数)。

## 真实平台 Demo 与集成测试

终端 Demo 直接读取 Gitee Releases 或 GitHub Issues，输出实际请求、分页列表、实体后续读取和多路径参数 action 的仓库查询结果：

```sh
pnpm demo:gitee
pnpm demo:github
pnpm test:live
```

三条命令均先构建主包，使用默认 Fetch 访问公开 API，不需要 Token。live 测试单独运行，不包含在默认 test/check 中；网络或平台错误会使测试失败。平台配置、覆盖范围与运行说明见 [开放平台 Demo 与测试](development/open-platforms/README.md)。

## 本地开发与文档站

使用 pnpm 8.10.5：

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm docs:dev
```

`pnpm docs:build` 构建静态文档站，`pnpm docs:preview` 预览，`pnpm docs:check` 检查页面和公开导出覆盖。站点使用提供的 SVG 标识，支持本地全文搜索、明暗主题和移动端阅读。在线文档见 [RESTModel Docs](https://restmodel-docs.pages.jangts.cafe/)，源码与维护说明见 [apps/docs](apps/docs/README.md)。

完整代码验收执行 `pnpm check`，包括类型、行为、本机 HTTP、tarball 消费和真实 Chrome 检查；需本机监听权限及 Chrome。单项使用 `pnpm check:packages`、`pnpm check:browser`，可用 CHROME_BIN 指定 Chrome。GitHub Actions 配置 Node 22/24 矩阵，远端结果以实际工作流为准。

项目规则、设计提案和维护记录分别收录在[文档索引](docs/README.md)中。项目采用 [MIT License](LICENSE)。
