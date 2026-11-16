# 客户端与 HTTP 执行

本参考描述当前实现。资源能力声明及预设语义见[操作声明](operations.md)。所有入口均从 `@restmodel/restmodel` 导入，模型类型不证明响应已经运行时校验。

## 最小调用

```ts
import { createClient, resource } from '@restmodel/restmodel';

interface User { id: number; name: string }
const api = createClient({
  baseURL: 'https://example.test/api/v1',
  resources: { users: resource<User>({ operations: ['list', 'get', 'post', 'patch'] }) },
});
const users = await api.users.list();
const user = await api.users(0).get();
await api.users.post({ name: 'Ivan' });
await api.users(0).patch({ name: 'New name' });
```

示例需要调用方提供可访问的 REST 服务。Node 使用 22 或以上；浏览器需要现代 Fetch、AbortController、FormData 等 Web API。相对 `/api` 服务地址由浏览器解析，Node 网络执行请使用绝对 HTTP(S) 地址。

list/post 作用集合，get/put/patch/delete 作用成员或单体。不支持的能力与错误位置在鉴权准备和实际 Transport 前拒绝。绑定身份返回新引用，0 有效；复合身份使用有序元组，各片段分别编码，身份中的 `/` 不变成层级。空字符串、点段 . / ..、空或稀疏身份元组和无效 Unicode 会在请求前拒绝，避免 URL 归一化改变目标。身份数组不会调用调用方自定义的 map/迭代器或元素访问器。单体不能再次绑定身份。

默认通过内置 Fetch 执行真实 HTTP 请求，不必传入 transport。需要复用 Axios 等 HTTP 执行器时，可显式设置 transport；自定义执行器接收最终 HTTP 请求，不负责资源操作推导。底层 executeHttp 接口仍要求显式执行器。

## 分支与请求设置

```ts
const active = api.users.query({ active: true });
await Promise.all([active.page(1, 20).list(), active.page(2, 20).list()]);
const result = await api.users(0)
  .with({ headers: { 'X-Trace': 'example' }, timeout: 5000, result: 'response' })
  .get();
console.log(result.data, result.response.status);
```

query/page/cursor/with 都返回新上下文。query 按键后写覆盖，数组整体替换并编码为重复键，undefined 删除，null 编码为空字符串；URLSearchParams 是显式重复键入口。查询数字必须有限，数组必须连续且仅包含自有数据元素；空数组删除该查询键，访问器或空洞会报配置错误。page 从 1 起，size 为正整数；默认映射 page/size，只有显式调用才附加分页条件。分页生成字段覆盖同名 query，与链式方法先后无关。

headers 名称归一为小写；undefined 删除头。普通 JSON body 在执行开始时编码，FormData/Blob/ArrayBuffer 保持原实例，不深冻结，调用方应在请求完成前保持稳定。FormData boundary 交由平台处理。

with 仅接受 headers/signal/timeout/result，不能任意修改 scheme。result 默认 data；with 中缺失或显式 undefined 表示继承已有模式，显式 data 才切回数据模式。宽 RequestOptions 变量无法静态确定模式时，返回类型为两种形态的联合。response 模式返回 `{ data, response }`，data 使用同一适配和建模流程。

## 服务规则

```ts
import { defineScheme } from '@restmodel/restmodel';
const scheme = defineScheme({
  identity: 'userId',
  envelope: 'data',
  success: body => typeof body === 'object' && body !== null && 'code' in body && body.code === 0,
  pagination: { mode: 'page', parameter: 'pageIndex', size: 'pageSize', base: 1, items: 'content', total: 'totalCount' },
});
```

规则优先级为默认 → 客户端 → 祖先资源 → 当前资源 → 当前操作。identity 默认为 id，false 关闭身份推导；envelope 缺省或 false 使用裸 body；success 显式返回 boolean，false 关闭继承判定；map 同步变换解包后的数据，false 关闭。分页字段路径相对解包后的数据；其他路径只沿自有数据字段读取，不执行 getter。

已知字段覆盖，undefined 继承；函数替换，分页整段替换，false 关闭。分页配置支持 page/offset/cursor：缺省参数分别 page/offset/cursor，大小字段分别 size/limit/limit；base 仅 page 适用。cursor 模式必须 `.cursor(token, size)`；page/offset 使用 `.page(number, size)`。total/next 未提供时保持未知，不猜 rows/content 等字段。

当前操作配置可声明 `{ method: 'PUT', scheme: { envelope: false } }`，只适配该能力，不新增操作。同步适配函数误返回 Promise 时拒绝，避免把 Promise 当作业务值。

## 标准操作的接口例外

按操作语义与身份映射选择配置：

| 场景 | 配置 | 调用 |
| --- | --- | --- |
| 标准 RESTful 接口 | 标准操作名 | `api.users(id).get()` |
| 标准操作只有单身份地址例外 | 操作覆盖，配置 queryKey 或一个 `:id` | `api.users(id).get()` |
| 多业务入参或额外行为 | actions/memberActions，独立配置 path | `api.users.lookup(input)` 或 `api.users(id).approve(input)` |

单身份规则针对标准操作的局部地址映射，不限制普通 list 的筛选条件或模型请求体字段。多参数接口例外使用 action，不继续增加标准操作占位符。

同一资源只有某项操作的 HTTP 地址不同，仍配置为该标准操作，不必改成 action：

```ts
import { createClient, resource, action } from '@restmodel/restmodel';
const api = createClient({
  baseURL: '/api',
  resources: {
    users: resource({
      operations: [
        'list', 'put', 'post',
        { operation: 'get', path: 'getById', queryKey: 'id' },
      ],
      actions: {
        search: action({ method: 'GET', path: 'get' }),
      },
    }),
  },
});
await api.users(123).get();             // GET /api/users/getById?id=123
await api.users.search({ name: 'Ivan' }); // GET /api/users/get?name=Ivan
```

将 get 配置换成 `{ operation: 'get', path: 'getById/:id' }`，同样调用会请求 `/api/users/getById/123`。list、put、post 继续使用标准 RESTful 路径。身份 0 有效；身份按 URL 片段或查询值编码，不直接拼接。get 仍执行 scheme 和实体包装，后续实体操作使用逻辑资源身份。完整规则见[操作声明](operations.md#操作路径与身份映射)。

## 关系、列表与实体

resource 的 children 声明当前集合或单体的子资源，members 声明集合成员的子资源；单体不接受 members/memberActions。资源键默认对应路径，可用相对 path 覆盖。所有关系都必须显式声明。

```ts
import { resourceOf, dataOf } from '@restmodel/restmodel';
const related = createClient({
  baseURL: 'https://example.test/api',
  resources: {
    users: resource<User>({ operations: '*', members: {
      profile: resource({ kind: 'singleton', operations: ['get'] }),
    } }),
  },
});
const user = await related.users(0).get();
if (user) {
  await resourceOf(user).$.child('profile').get();
  console.log(dataOf(user));
}
```

list 返回 ResourceList：items 为普通数组，结果对象可迭代，total 为 number 或 undefined，page 只包含已知请求及 next 信息。裸数组不以数组长度冒充 total；非数组列表或错误元信息抛 response-shape。

对象返回本地数据快照代理，Object.keys、展开和 JSON 反映数据；元信息存 WeakMap。数据字段优先，已声明且不冲突的关联可在运行时以属性读取；TypeScript 使用 `$.child(name)` 或 `resourceOf(entity)` 作为稳定入口。可推导的 const 声明按能力白名单、预设补丁和集合/成员/单体位置裁剪终端方法，保留具名关系及动作输入输出；动态配置仍执行运行时校验。只写 `resource<TModel>(config)` 时因 TypeScript 无法同时推导剩余类型参数，保留位置与模型类型，但配置能力和关系仍采用动态类型；需要同时保留精确配置时可用 `resource<TModel, typeof config>(config)`。分页模式仍在运行时校验，动态关系模型为 unknown，不凭泛型信任后端数据。

get 的地址身份优先；集合返回记录与 post 结果按 identity 推导身份。缺失身份仍可读数据，需要身份的后续操作抛 identity，不构造 undefined 路径。实体后续引用清除原请求的 query/page/cursor，并恢复 data 返回模式，保留 headers/signal/timeout 和资源规则；调用者可重新追加查询。直接在显式引用上绑定身份或访问子资源，仍继承显式链状态，子资源也继承 result 模式。本地字段修改不会自动请求，不全局合并实体。数组和 Date、Map、Blob 等非普通对象原样返回，不附加实体元信息；resourceOf 对这些实例报 response-shape。标量/null 不伪装对象；204/205/无正文返回 undefined，不补发 GET。

## 特殊动作与 raw HTTP

```ts
import { action } from '@restmodel/restmodel';
const service = createClient({
  baseURL: 'https://example.test/api', resources: {},
  actions: { login: action<{ name: string }, { token: string }>({ method: 'POST', path: '/auth/login' }) },
});
const token = await service.login({ name: 'Ivan' });
const response = await service.$.request({ method: 'GET', path: '/health' });
```

actions 属于当前集合或单体，memberActions 属于集合成员，按声明名直接调用，例如 `api.users.search(input)`、`api.users(id).approve(input)`；服务根动作使用 `api.login(input)`。不提供第二套动作入口。method 必填；path 缺省声明名，GET/DELETE/HEAD/OPTIONS 默认输入在 query，其他在 body，可用 input 指定。动作共享业务判定和 envelope，默认不做列表或实体包装，不进入标准星号。声明名是调用名，path 是后端路径，两者独立：search 可映射到 get 路径。调用名不能占用标准操作、query/page/cursor/with、JavaScript 保留属性或同位置关系名；冲突在配置时拒绝，重新命名动作即可，不限制后端路径。

raw HTTP 共用准备、编码与执行，但返回原始 HttpResponse，不套资源信封。`/` 开头 path 从服务 baseURL 路径根计算，保留 /api；禁止跨服务绝对 URL、协议相对 URL、点段和路径逃逸。资源或动作保留 `$`、then、__proto__、prototype、constructor。控制名冲突的已声明关系通过 `$.child(name)` 访问；动态根资源通过 `api.$.resource(name)` 访问。

## 动作路径参数

动作可通过 `:name` 从输入对象提取多个具名路径参数，剩余字段再按 method 的默认规则或显式 input 进入 query/body：

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

占位符必须是完整路径片段，名称由字母或下划线开头，后接字母、数字或下划线。同一字段可在路径中重复使用。参数必须是非空字符串或有限数字，0 有效；按单个片段编码，`a/b` 编码为 `a%2Fb`，不会变成多层路径。缺参、null、数组、对象、空字符串、点段及无效 Unicode 均在请求前拒绝，不执行 prepareRequest 或 Transport。

带占位符的动作接收普通对象的自有数据字段，不读取原型字段，不调用 getter，不修改输入对象。已消费字段仅从动作输入中移除，不重复进入 query/body；链式 query 中显式设置的字段仍保留。全部字段都用于路径时，不额外发送空 body。没有占位符的动作保持原有输入契约，包括 query 的 URLSearchParams 和 body 的 FormData/Blob 等。

path 相对于当前引用路径；`/` 开头从服务 baseURL 的路径根计算。成员动作仍包含已绑定成员身份，不会自动用成员身份填补输入占位符；占位字段始终来自此次动作输入。不增加 input: 'path'，因为同一次请求可同时包含路径与 query/body。

未显式指定输入泛型时，字面量 path 可推导必填路径字段。显式声明输入泛型时，应将路径字段和剩余业务字段一起写入输入类型；动态字符串路径始终由运行时检查。标准操作的 `:id`/queryKey 仍只映射一个绑定身份，多业务参数使用 action。

## 执行、错误和扩展

Transport 只接收编码完成的 HttpRequest，返回包含 status/headers/body 的 HttpResponse。非 2xx 也返回正常响应，core 统一抛 http 错误；网络、取消、超时分别分类。自定义执行器必须监听 signal、释放自己的资源，并遵守不自动重定向的契约。Fetch/Axios 执行器不跟随重定向；其他宿主 SSRF 规则仍由调用方负责。

prepareRequest 在最终快照前执行一次，可异步注入鉴权；不得修改 URL/method 或替换有效取消信号。observeResponse 是独立后台观测，成功结果不等待它完成，失败被隔离，不重发请求。观察器应自行拥有外部资源的生命周期。

executeHttp 同时接收 HttpRequest.signal 和 RequestOptions.signal，任一取消都生效；同一信号去重，结束时释放所有外部监听。timeout/取消会停止等待并 abort Transport 信号，core 清理自己的 timer/listener；不能保证不合作的第三方执行器终止，更不代表服务端副作用撤销。不自动重试写操作。

配置错误使用 ResourceConfigurationError。执行错误 RequestError.kind 为 unsupported-operation/identity/prepare/network/timeout/cancel/http/business/response-shape，cause 和原始 request/response 在存在时可显式访问。JSON 和 Node 检查器默认不输出原始敏感上下文；不要手动打印 request/response/cause。

扩展入口为 `@restmodel/axios` 的 axiosTransport、`@restmodel/mock` 的 withMock、`@restmodel/pinia` 的 defineResourceStore。具体扩展只依赖 core 公共入口，不进入核心运行依赖。缓存、重试、刷新鉴权队列与跨数据源协议不属于当前能力。
