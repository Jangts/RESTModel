# 快速上手

RESTModel 是面向 HTTP RESTful 接口的模型化客户端。声明资源后，集合、成员和操作会推导成真实的 HTTP 路径与方法。默认使用内置 Fetch，无需配置请求执行器。

## 环境与安装

运行时要求 Node.js 22+，或支持 Fetch、AbortController 和 FormData 的现代浏览器。项目开发使用 pnpm 8.10.5。

安装 0.1.0（registry 发布状态见仓库发布记录）：

```sh
pnpm add @restmodel/restmodel@0.1.0
```

源码开发或发布前使用本地包时，在仓库根目录执行：

```sh
pnpm install
pnpm build
```

工作区包通过 `workspace:*` 引用 `@restmodel/restmodel`。仓库外可在 `packages/restmodel` 执行 `pnpm pack --pack-destination /tmp/restmodel-pack`，然后在消费项目中用 `pnpm add /tmp/restmodel-pack/实际生成的文件名.tgz` 安装。扩展需同时安装主包 tarball 和各自 peer 依赖。pnpm 打包时会转换 workspace 版本范围，并清理、重新构建当前包的 dist。

## 连接 REST 服务

假设服务提供 `/api/users` 集合和 `/api/users/:id` 成员接口。将以下 baseURL 换成你的实际服务地址；浏览器中的同源服务可直接使用 `/api`，Node 需要绝对 HTTP(S) 地址。跨源服务需配置 CORS。

```ts
import { createClient, resource } from '@restmodel/restmodel';

interface User { id: number; name: string }

const api = createClient({
  baseURL: 'https://example.test/api',
  resources: {
    users: resource({ operations: ['list', 'get', 'post', 'patch'] }).typed<User>(),
  },
});

const users = await api.users.list();       // GET /api/users
const user = await api.users(0).get();      // GET /api/users/0
await api.users.post({ name: 'Ivan' });     // POST /api/users，JSON 请求体
await api.users(0).patch({ name: 'Updated' }); // PATCH /api/users/0，JSON 请求体
```

以上调用通过 Fetch 发送真实 HTTP 请求，需要对应的后端接口。客户端不创建服务、不生成数据，也不代替服务端实现业务。

## 返回数据与服务约定

默认列表接口返回 JSON 数组，例如 `[{ "id": 0, "name": "Ivan" }]`；成员接口返回记录对象，例如 `{ "id": 0, "name": "Ivan" }`。list 的结果为 ResourceList，通过 `users.items` 访问记录，total 只有服务明确提供时才有值，不用当前数组长度冒充总数。

默认身份字段为 id，0 是有效身份。模型泛型提供 TypeScript 提示，不执行响应数据校验。服务使用响应信封、其他身份字段或不同分页格式时，通过 [scheme 服务规则](client.md#服务规则) 一次适配，而不是重新实现请求过程。

## 查询和分页

```ts
await api.users.query({ active: true }).page(1, 20).list();
// GET /api/users?active=true&page=1&size=20
```

query/page/cursor/with 返回新引用，不修改已有分支。本地实体字段修改不会自动发送请求。RESTModel 不自动重试写操作，也不内置缓存。

## 接下来

- [资源操作声明](operations.md)：操作白名单、星号、预设与覆盖。未声明的操作不可调用。
- [客户端参考](client.md)：服务规则、关系、特殊动作、取消、超时及错误处理。
- [动作路径参数](client.md#动作路径参数)：多业务入参和多个路径占位符，剩余字段进入 query/body。
- [扩展选型](extensions.md)：已有 Axios 实例、HTTP 调试与模拟、Pinia 请求状态等可选接入。

普通 RESTful 接口使用默认 Fetch 即可。只有需要替换 HTTP 执行器时才配置 transport；自定义 Transport 和 Mock 属于扩展用法，不是创建客户端的前置步骤。
