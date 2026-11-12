# @restmodel/core

RESTful 资源声明与链式 HTTP 客户端。要求 Node.js 22+，或提供现代 Fetch/AbortController/FormData 的浏览器。当前为 private 开发包，使用工作区构建或本地 tarball；尚未公开发布，也未指定公开分发许可。

仓库根目录执行 `pnpm install`、`pnpm build`。本包无运行依赖，默认不自动配置 Transport。

```ts
import { createClient, resource, fetchTransport } from '@restmodel/core';
interface User { id: number; name: string }
const api = createClient({
  baseURL: 'https://example.test/api',
  transport: fetchTransport(),
  resources: { users: resource<User>({ operations: ['list', 'get', 'post', 'patch'] }) },
});
const users = await api.users.list(); // GET /api/users，ResourceList<User>
const user = await api.users(0).get(); // GET /api/users/0
await api.users.post({ name: 'Ivan' });
```

以上需要实际后端服务。纯本地可传 `transport: async () => ({ status: 200, headers: {}, body: [] })`，此时只验证声明及结果适配，不代表真实网络。

未声明 operations 时没有操作能力；预设显式继承。`'*'` 开启资源形态适用的标准操作，`{ '*': true, delete: false }` 显式关闭某项。singleton 仅允许 get/put/patch/delete，集合 list/post，成员 get/put/patch/delete；错误调用在请求前拒绝。

query/page/cursor/with 返回隔离的新引用。with 接受 headers/signal/timeout/result；result 的 undefined 继承前层。executeHttp 的请求 signal 与单次设置 signal 组合，任一取消均生效；response 模式返回 `{ data, response }`。取消和超时停止等待并通知 Transport，不代表服务端副作用撤销。不会自动重试写操作。

scheme 使用 identity/envelope/success/map/pagination；false 关闭相应继承规则，分页配置整段替换。pagination 支持 page/offset/cursor；未知 total 为 undefined。默认裸 body、id 身份、裸数组列表；不猜后端字段。

resource 支持 children/members 及 actions/memberActions，关系通过 `ref.$.child(name)` 访问；可推导关系保留模型类型，动态关系为 unknown。实体用 resourceOf/dataOf 取得无冲突引用及本地数据。JSON/键枚举保留真实数据，修改本地字段不自动发送请求。const 配置可推导能力与关系，位置类型区分集合/成员/单体；resource<TModel>(config) 保留模型和位置，精确配置可额外指定第二泛型。动态配置及分页模式仍在运行时校验。实体后续引用清除已完成请求的查询/分页/响应包装模式；Date 等非普通实例原样返回。

ResourceConfigurationError 表示配置阶段错误；RequestError.kind 区分 unsupported-operation/identity/prepare/network/timeout/cancel/http/business/response-shape。默认诊断不输出原始上下文；显式访问 request/response/cause 时调用方负责脱敏。

完整使用与限制在源码仓库 `docs/client.md`、`docs/operations.md`。tarball 内公开入口为本包根，不从 src 导入。
