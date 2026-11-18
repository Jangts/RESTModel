# @restmodel/restmodel

RESTful 资源声明与链式 HTTP 客户端。要求 Node.js 22+，或提供现代 Fetch/AbortController/FormData 的浏览器。0.1.0 为首个公共版本，采用 [MIT License](LICENSE)。

仓库根目录执行 `pnpm install`、`pnpm build`。本包无第三方运行依赖，默认使用内置 Fetch 发送真实 HTTP 请求；只有替换执行器时才需配置 transport。

## 安装

从 npm 安装 0.1.0（registry 发布状态见仓库发布记录）：

```sh
pnpm add @restmodel/restmodel@0.1.0
```

发布前可在仓库根目录执行 `pnpm install`、`pnpm build`，再在 `packages/restmodel` 执行 `pnpm pack --pack-destination /tmp/restmodel-pack`。在消费项目中用 `pnpm add /tmp/restmodel-pack/实际生成的文件名.tgz` 安装。打包会先清理并重新构建本包的 dist。

## 使用

```ts
import { createClient, resource } from '@restmodel/restmodel';
interface User { id: number; name: string }
const api = createClient({
  baseURL: 'https://example.test/api',
  resources: { users: resource({ operations: ['list', 'get', 'post', 'patch'] }).typed<User>() },
});
const users = await api.users.list(); // GET /api/users，ResourceList<User>
const user = await api.users(0).get(); // GET /api/users/0
await api.users.post({ name: 'Ivan' });
```

以上调用默认通过 Fetch 请求实际后端。自定义 HTTP 执行器与 Mock 属于可选扩展，不是入门前提。

未声明 operations 时没有操作能力；预设显式继承。`'*'` 开启资源形态适用的标准操作，`{ '*': true, delete: false }` 显式关闭某项。singleton 仅允许 get/put/patch/delete，集合 list/post，成员 get/put/patch/delete；错误调用在请求前拒绝。

query/page/cursor/with 返回隔离的新引用。with 接受 headers/signal/timeout/result/credentials/responseType/cache/keepalive；result 的 undefined 继承前层。executeHttp 的请求 signal 与单次设置 signal 组合，任一取消均生效；response 模式返回 `{ data, response }`。取消和超时停止等待并通知 Transport，不代表服务端副作用撤销。不会自动重试写操作。

scheme 使用 identity/envelope/success/map/pagination；false 关闭相应继承规则，分页配置整段替换。pagination 支持 page/offset/cursor；未知 total 为 undefined。默认裸 body、id 身份、裸数组列表；不猜后端字段。

resource 支持 children/members 及 actions/memberActions，关系通过 `ref.$.child(name)` 访问；可推导关系保留模型类型，动态关系为 unknown。实体用 resourceOf/dataOf 取得无冲突引用及本地数据。JSON/键枚举保留真实数据，修改本地字段不自动发送请求。const 配置可推导能力与关系，位置类型区分集合/成员/单体；`resource(config).typed<TModel>()` 同时保留模型、精确能力、关系和动作推导，返回同一冻结声明；`resource<TModel>(config)` 仍支持，但能力和关系采用动态类型。动态配置及分页模式仍在运行时校验。实体后续引用清除已完成请求的查询/分页/响应包装模式；Date 等非普通实例原样返回。

统一生命周期支持 prepareRequest(request, context)、等待成功前台处理的 processResponse(response, context)、失败通知 onError(error, context) 与后台 observeResponse(response)。请求级 state 用应用 Symbol 关联快照，请求结束清空，不发送给 Transport；前台处理失败分类为 process，错误通知不替换主错误。credentials 接受 omit/same-origin/include；缺省沿用执行器行为，omit 不删除显式 Authorization。可选 iteratePages 惰性遍历数据模式的 page/offset 资源，默认 size/start/maxPages 为 100/1/1000，未完成而达到上限会报错。完整时序、取消与终止规则见客户端参考。

ResourceConfigurationError 表示配置阶段错误；RequestError.kind 区分 unsupported-operation/identity/prepare/process/network/timeout/cancel/http/business/response-shape。默认诊断不输出原始上下文；显式访问 request/response/cause 时调用方负责脱敏。

完整使用与限制见[客户端参考](https://restmodel-docs.pages.jangts.cafe/zh/reference/client.html)和[操作声明](https://restmodel-docs.pages.jangts.cafe/zh/reference/operations.html)。tarball 内公开入口为本包根，不从 src 导入。

内置 `fetchTransport({ fetch, cache, keepalive, responseType })` 可复用应用 Fetch，不必重写执行器；传输策略可由 with 逐请求覆盖。responseType 为 auto/json/text/none，none 成功时立即释放正文，失败仍保留诊断。原始响应头不因显式 JSON 解码而改变。`typed<Model, { put: SaveInput; post: CreateInput }>()` 可独立声明标准写入参数，不改变模型返回类型或能力白名单。完整继承和取消规则见[客户端参考](https://restmodel-docs.pages.jangts.cafe/zh/reference/client.html)。

## 单身份接口例外

标准 get 只有地址不同，仍保留 `api.users(id).get()`：

```ts
import { createClient, resource } from '@restmodel/restmodel';
const api = createClient({
  baseURL: '/api',
  resources: {
    users: resource({
      operations: ['list', 'put', 'post', { operation: 'get', path: 'getById', queryKey: 'id' }],
    }),
  },
});
await api.users(123).get(); // GET /api/users/getById?id=123
```

另一种写法为 `{ operation: 'get', path: 'getById/:id' }`，同样调用请求 `/api/users/getById/123`。path 相对于逻辑资源根路径，不再追加默认成员身份。queryKey 与 `:id` 互斥，只映射一个绑定身份；0 有效，按查询值或单个路径片段编码。其他标准操作、scheme 与实体包装保留原有行为。

## 多参数接口与额外动作

接口需要多个业务入参或额外行为时，使用 action。声明名是调用名，path 是独立的后端路径；动作名可以避开标准操作和链式控制方法名，不必改动后端接口。

```ts
import { createClient, resource, action } from '@restmodel/restmodel';
const api = createClient({
  baseURL: '/api',
  resources: {
    users: resource({
      actions: {
        lookup: action({ method: 'GET', path: 'getById/:tenantId/:id' }),
        approve: action({ method: 'POST', path: ':id/approve' }),
      },
    }),
  },
});
await api.users.lookup({ tenantId: 7, id: 123, detail: true });
// GET /api/users/getById/7/123?detail=true
await api.users.approve({ id: 123, reason: '通过' });
// POST /api/users/123/approve，JSON body: { reason: '通过' }
```

动作只按声明名直接调用，不提供另一套带 `$` 的动作入口。actions 属于集合或单体，memberActions 属于已绑定成员；成员动作示例为 `api.users(id).approve(input)`。同位置动作名不能与标准操作、链式方法、保留属性或关系名冲突；后端 path 不参与调用名冲突检查。

路径占位符从此次输入对象读取，按单个片段编码；已消费字段从剩余输入中移除。剩余字段在 GET/DELETE/HEAD/OPTIONS 默认进入 query，其他方法默认进入 body，也可用 input 显式选择。缺参、非法路径值在请求前报错；只有路径字段时不添加空 body。动作共享 HTTP 执行、scheme 与错误处理，不默认做列表或实体包装。完整边界见[动作路径参数](https://restmodel-docs.pages.jangts.cafe/zh/reference/client.html#动作路径参数)。
