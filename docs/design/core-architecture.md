# 主包架构与对外 API 设计草案

状态：历史设计草案，部分方向已实现，具体接口以[客户端参考](../client.md)和[操作声明](../operations.md)为准。下列示例保留设计比较用途，不能作为当前签名依据。本文不修改现有包边界、不提前承诺完整兼容旧接口。

## 1. 设计目标与成功标准

RESTModel 服务 RESTful HTTP API 及其变体。保留资源模型、链式操作、返回资源继续访问关联能力。标准接口由约定推导，scheme 描述服务的共性差异，特殊接口显式声明。主包与 Axios 解耦，不与 HTTP 解耦。

配置成本应随协议差异和例外数量增长，不随标准接口数量线性增长。

验收标准：

- 增加一个标准资源，只需要资源名和可选模型类型，不再逐一声明 CRUD。
- 增加一个标准子资源，只描述集合/单体和所属关系，不重复写路径与方法。
- 同一后端的响应、身份、分页差异只配置一次。
- 一个特殊接口只覆盖自身，不要求整个资源退出链式模型。
- 更换 Axios 等请求实现不改变资源调用、scheme 或返回模型。
- Mock 接收经过完整推导的 HTTP 请求，不直接处理资源操作。
- 未配置的特性不靠猜测启用：不猜复数、不猜分页、不猜业务成功码、不自动探测服务器能力。

## 2. 参考项目与取舍

旧项目 packages/http 的 ResourceProvider、ApiHub、DataPool、HttpPackagedResource 提供了资源树、动作、数据视图和关联调用。保留前两者和关联调用价值；DataPool 的映射不作为核心首版前置条件；分页由统一结果适配承接。

不沿用对外 Stateless/Stateful/Identified/Feature Provider 分类。它们是实现方式，不是使用者必须学习的概念。修正硬编码 id、content、totalCount，方法与配置不一致、Mock 旁路、原型代理破坏序列化等问题。

reactive-mp/packages 的 shared → reactivity → runtime/store → 聚合入口说明：逐级依赖可行的前提，是每层都有真实独立用途与稳定契约。RESTModel 不照搬其包数，也不为通用工具再建 shared。

## 3. 对外概念

| 概念 | 含义 | 是否需要日常理解 |
| --- | --- | --- |
| Client 客户端 | 一个服务的基础地址、资源集合和公共规则 | 是 |
| Resource 资源 | 一个集合或单体，可绑定身份并访问子资源 | 是 |
| Operation 操作 | list/get/post/put/patch/delete 或显式特殊动作 | 是 |
| Scheme 方案 | 一组把资源操作适配成 HTTP 请求及结果的服务约定 | 接入时一次 |
| Transport 请求执行器 | 执行已经形成的 HTTP 请求 | 接入时一次 |

运行时内部使用不可变 ResourceContext、OperationContext、ResolvedScheme、HttpRequest；不要求普通用户构造它们。

模型类型仅描述数据与可推导类型，不要求继承模型基类、实例化模型类或引入校验库；运行时校验必须显式配置。

## 4. 最小接入与资源树

```ts
import { createClient, resource } from '@restmodel/core'
import { axiosTransport } from '@restmodel/axios'

interface User { id: number; name: string }

const api = createClient({
  baseURL: '/api/v1',
  transport: axiosTransport(),
  resources: {
    users: resource<User>({ operations: ['list', 'get', 'post', 'patch'] }),
  },
})

const users = await api.users.list()             // GET /api/v1/users
const user = await api.users(123).get()          // GET /api/v1/users/123
await api.users.post({ name: 'Ivan' })           // POST /api/v1/users
await api.users(123).patch({ name: 'New name' })  // PATCH /api/v1/users/123
```

资源声明是名字/类型入口，不是逐接口配置。未声明 operations 且无继承时不开放操作；通过白名单或显式星号开放标准能力。空声明允许 JS 用户使用，不要求填写 model 字段；默认数据为 unknown，而非无条件 any。Create、Replace、Patch 输入可以单独指定，默认按模型推导，不能硬编码所有后端创建时必须提供 id。

先使用少量显式资源声明取得类型，不把任意属性都当资源的无限 Proxy 作为默认。对动态名字提供 `api.$.resource(name)`，它返回通用资源入口，数据类型为 unknown。

### 集合与单体

```ts
resources: {
  users: resource<User>({
    children: {
      searchIndex: resource<SearchIndex>({ kind: 'singleton' }),
    },
    members: {
      profile: resource<Profile>({ kind: 'singleton' }),
      orders: resource<Order>(),
    },
  }),
  settings: resource<Settings>({ kind: 'singleton' }),
}

api.users.searchIndex.get()       // /users/searchIndex
api.users(123).profile.get()      // /users/123/profile
api.users(123).orders.list()      // /users/123/orders
api.users(123).orders(456).get()  // /users/123/orders/456
api.settings.get()               // /settings
```

`children` 属于当前集合路径；`members` 属于集合的每个成员。singleton 的子资源使用 children；singleton 不允许 members。资源默认 kind=collection，资源键直接作为路径片段；路径重命名只需 `path: 'people'`。不推测英文单复数，也不凭属性名判断 profile 是单体还是集合。

身份可为 string/number（0 有效），复合身份用有序元组；逐片段编码，不把身份中的 / 当层级。对象身份映射只通过显式 identity 编码规则启用。undefined/null 身份在发请求前报错。

## 5. 操作与不可变链

| 资源位置 | 操作 | 默认 HTTP |
| --- | --- | --- |
| 集合 | list() | GET 集合路径 |
| 集合 | post(payload) | POST 集合路径 |
| 成员/单体 | get() | GET 当前路径 |
| 成员/单体 | put(payload) | PUT 当前路径 |
| 成员/单体 | patch(payload) | PATCH 当前路径 |
| 成员/单体 | delete() | DELETE 当前路径 |

主入口采用明确 HTTP 方法名，保留 list/get 的业务差别。不把 PUT/PATCH 合为带 boolean 的 set。旧 set/drop 不默认引入新别名；迁移确有需要时再评估，不制造两套同义 API。UPLOAD 是 body 编码而非另一个资源方法，使用 post(FormData) 或明确 body 格式。

```ts
const active = api.users.query({ active: true })
const first = active.page(1, 20)
const second = active.page(2, 20)
await Promise.all([first.list(), second.list()])

await api.users(123)
  .query({ locale: 'zh-CN' })
  .with({ headers: { 'X-Trace': 'demo' }, signal })
  .get()
```

query/page/with/绑定身份均返回新上下文；不发请求，执行方法才发请求。query 只接受对象，使用 URLSearchParams 表达重复键作为显式入口；不同时维护两套字符串查询解析规则。

同一链的 query 按键后写覆盖；undefined 删除已有键，数组整体替换；null 的编码由 query scheme 定义。page 保存规范化分页意图，执行时转换。公共请求设置在终端请求开始时快照；并发调用不得共享可变 request。

page 与原始分页 query 同时出现时，page 生成的字段覆盖同名 query，不受链式方法先后影响；文档必须说明。重建分页条件可通过新链完成。

控制方法名（get/list/query 等）与资源名冲突时，显式 `ref.$.child(name)`/`ref.$.member(name)` 访问；Client 控制面统一在 `$`，例如 api.$.request/api.$.resource/api.$.actions，避免与 users 等资源键冲突。then 禁止被动态解释为资源，避免 Promise 同化。

## 6. 统一返回值与关联能力

get/post/put/patch 默认返回规范化资源数据，list 返回 ResourceList<T>；特殊动作默认返回适配后的普通值。未设置 envelope 时，HTTP body 就是业务数据，不固定要求 { data, code, message }。

```ts
const result = await api.users.page(1, 20).list()
result.items       // Entity<User>[]，普通数组
result.total       // number | undefined；不知道总数就不填，不能用 0 冒充
result.page        // 请求页、大小、cursor/next 等已知信息
for (const user of result) {
  console.log(user.name)
  await user.profile.get() // 声明了关系且数据字段不冲突时的便捷入口
}
```

ResourceList 是可迭代结果对象，不伪装成 Array；items 承担 map/filter 等数组操作，避免 Array 子类 species/构造行为。裸数组响应也转成 ResourceList；count 可由 items.length 得到，不能将其当 total。

Entity 保留“数据带关联能力”。拟使用以真实数据对象为目标的代理，元信息放 WeakMap；禁止把数据挂到 __proto__。JSON.stringify、Object.keys、展开应反映真实数据，关联方法不成为数据字段。

公共辅助函数 `resourceOf(entity)` 返回绑定的资源引用，`dataOf(entity)` 取得原数据，作为稳定无冲突入口：

```ts
const user = await api.users(123).get()
await resourceOf(user).profile.get()
await resourceOf(user).patch({ name: 'New name' })
JSON.stringify(user) // 用户数据，不是 {}
```

数据字段优先。若 User 自带 profile 字段，user.profile 就是该字段，关联通过 resourceOf(user).profile 访问。类型同样采用数据优先合并，不用互相冲突的交叉类型假装两者同时成立。scalar/null/undefined 不包装成假对象，原样返回；关联能力只对符合资源数据形态的对象提供。

get 的地址身份优先；post 的身份取 scheme.identity 配置，缺失时不构造 undefined URL。无身份记录可以读取，但绑定身份所需操作报 IdentityUnavailableError。无身份集合项仍可按声明的集合上下文访问不需要身份的能力。

对象字段赋值仅修改本地快照，不隐式发送请求、不自动写缓存。不同请求的实体不强行合并为全局唯一实例。状态共享由扩展处理。

204/205 或确实无 body 的成功响应返回 undefined；不会自动补发 GET。需要同时取得原始 HTTP 元信息时，使用 `ref.with({ result: 'response' }).get()`，返回 `{ data, response }`，其中 data 仍经过相同适配与建模。不是给每个方法增加另一套 response 版本。

## 7. Scheme 的职责与结构

scheme 是 RESTful 约定的策略集合，不是逐接口清单，更不是动作执行器。

建议提供 defineScheme，以类型推导定义；未指定时使用 restScheme。配置域收敛为：

| 域 | 职责 |
| --- | --- |
| identity | 从资源数据取身份、复合身份编码 |
| request | RESTful 路径/方法约定及参数布局变体 |
| query | 查询值与数组等编码规则 |
| pagination | 页码/偏移/cursor 的请求和响应归一化 |
| response | envelope 提取、业务错误判定 |

```ts
const serviceScheme = defineScheme({
  identity: { field: 'userId' },
  response: { data: 'data', business: { code: 'code', success: [0] } },
  pagination: {
    mode: 'page',
    request: { page: 'pageIndex', size: 'pageSize', base: 1 },
    response: { items: 'content', total: 'totalCount' },
  },
})

const api = createClient({
  baseURL: '/api/v1', transport, scheme: serviceScheme,
  resources: { users: resource<User>(), orders: resource<Order>() },
})
```

以上 data 路径基于 HTTP body，分页 items/total 路径基于提取后的 data。身份规则可在 orders 覆盖为 id，不能因为 users 用 userId 就逐个操作重配。

### 默认值与内置方案

默认：原样资源名路径、id 身份字段、标准 HTTP 方法、裸 body、裸数组列表、2xx HTTP 成功；list 不偷偷附加分页条件。显式 `.page(n,size)` 时，默认映射 page/size、1 起始；默认不猜响应总数。普通对象不是自动可接受的列表，形态错误要给出明确适配错误。

首版提供纯数据配置组合：裸数组 + page/size、envelope + items/total、offset/limit、cursor/limit；不为每种组合新建类。不自动试 content/list/rows 等字段。cursor 与页码模式类型和运行时互斥：cursor 模式用 `.cursor(token, size)`，不能把 page 数字偷偷转成 cursor。

内置方案不宣称某个框架固定使用某协议，除非有版本化验证。方案继承仍只是一份明确规则。

### 继承、覆盖与例外

规则优先级：内置默认 → 客户端 scheme → 祖先资源 scheme → 当前资源 scheme → 当前操作覆盖。query/headers/signal 等单次设置另走允许字段列表，不能用 with 任意重写 scheme。

资源 identity 默认继承；scheme 可局部覆盖。结构字段按已知 schema 合并，数组替换、函数替换、undefined 表示继承；显式 false 表示关闭可关闭能力。禁止用 lodash.merge 对整份配置无限深合并；跨分页模式覆盖时整段替换并校验，不遗留旧模式字段。

```ts
users: resource<User>({
  scheme: { identity: { field: 'userId' } },
  operations: {
    patch: { method: 'PUT' }, // PATCH 语义操作，但这个服务用 PUT 接收局部字段
  },
})
```

标准操作注册表统一驱动请求默认值、允许位置、输入/结果种类、校验与分发；不可在各层各写一份 switch 或另一份 prompt 式清单。

最小声明优先；复杂差异通过 request.map/response.map 等明确函数出口处理。函数得到只读 context 和已有结果，返回新结果；不隐式触发另一次执行，不允许多个匿名钩子彼此争夺同一阶段。

## 8. 少量特殊接口

特殊接口必须配置 method；path 默认为声明名且相对所属路径，提供绝对服务内路径覆盖。GET/DELETE 默认将输入放 query，POST/PUT/PATCH 放 body；参数布局例外再显式 map。不是自动识别任意 RPC。

```ts
const api = createClient({
  baseURL: '/api/v1', transport,
  actions: {
    login: action<LoginInput, Token>({ method: 'POST', path: '/auth/login' }),
  },
  resources: {
    users: resource<User>({
      memberActions: {
        disable: action<{ reason: string }, void>({ method: 'POST' }),
      },
    }),
  },
})

await api.$.actions.login({ username: 'ivan', password })
await api.users(123).$.actions.disable({ reason: 'requested' })
// POST /api/v1/users/123/disable
```

resource.actions 对集合/单体当前路径，memberActions 对集合成员路径；不混入普通资源字段，统一从 $.actions 调用。动作默认继承响应 envelope 和错误规则，不套分页或实体身份推导；返回资源模型需显式指定。

path 的 / 从服务 baseURL 的路径根算起（保留 /api/v1）；不允许借绝对 URL 默认跳出当前服务，跨服务用另一个客户端。子资源 path 不允许 ../。根级 path 与 HTTP URL 的 origin 语义必须区别，不直接套浏览器 URL 相对路径规则。

原始 HTTP 例外通过 api.$.request({ method, path, ... }) 进入相同 HTTP 执行管线，返回 HTTP response，默认不套资源 scheme。保持它与 action 的语义差别，避免 raw 也被隐藏解包。

## 9. 执行流程与扩展契约

```text
资源入口 → 不可变上下文 → 操作注册表 + resolved scheme
→ HTTP 请求生成 → 公共请求准备（鉴权等）→ URL/body 编码与冻结快照
→ Transport（可由 HTTP Mock 包装）
→ HttpResponse → HTTP 状态校验 → 业务状态校验
→ envelope 提取 → 列表/单条归一化 → 实体与关联包装
```

请求执行器只认识 HTTP，不读取资源树；scheme 不直接调用 Axios。Transport 的 HTTP 非 2xx 也返回 HttpResponse，再由公共层判错；Axios 适配器必须转换其默认非 2xx rejection。只有网络/超时/取消等无正常响应的失败进入 transport error。保留 cause，不能把没有 response 的错误伪装成 400。

HttpRequest 包括 method、完整 URL（已含编码 query）、规范化 headers、编码后的 body、responseType、timeout/signal。HttpResponse 包括 status、headers、解码 body 以及可选底层 native 元信息；核心逻辑不依赖 native 类型。JSON 编码在公共层，FormData 由执行器/平台设置 multipart boundary，不手工写死。

公共请求层提供 prepareRequest 与 response/error 观察点，语义明确：前者在最终快照前异步执行，可注入 token；后者不能用 boolean 表示“吞掉但仍拒绝”。恢复必须显式返回成功结果或由上层处理。首版不自动重试写操作、不实现 token 刷新队列。

Mock 如 `withMock(realTransport, rules)`，匹配最终 method/URL/headers/body；未命中可配置报错或透传，禁止默认静默伪造数据。鉴权和 scheme 不能因 mock 绕过。缓存由扩展按本库结构管理 HTTP 请求结果，不接任意 Store。Pinia 消费公开资源调用及结果，不改变请求管线。

错误类别至少区分 Configuration、UnsupportedOperation、IdentityUnavailable、Transport（network/timeout/cancel）、Http、Business、ResponseShape；统一保留 request、可选 response、cause。错误中的请求敏感字段展示需脱敏，不能默认打印 token。

## 10. 类型与公共入口

- defineScheme/resource/action 均模块导出，禁止依赖全局 .d.ts。
- 资源树由声明递归推导，集合/单体、子关系、标准操作与特殊动作的类型边界同步运行时。
- 编译期模型类型不证明后端响应合法；可选校验回调显式启用。
- 不把 AxiosRequestConfig 作为主包配置，不用 any 绕过所有请求约束。
- 深层类型可设置合理递归界限并提供显式 resource 入口；不追求无限动态树的虚假强类型。
- `$` 是控制面保留名，资源/动作定义冲突时初始化报错；危险键 __proto__/prototype/constructor 禁止用于动态挂载。
- 扩展只从 exports 公共入口导入，不导入 src 内部文件。

## 11. 底层独立包的建议

建议的候选依赖关系（仅设计，暂不创建包）：

```text
@restmodel/http ← @restmodel/core
       ↑                  ↑
 axios/mock 扩展       pinia 扩展
```

`@restmodel/http`：中立 HTTP request/response/error 契约、URL/query/body 规范化、执行管线、取消/超时契约。可独立作为普通 HTTP 客户端使用，不需要资源树和 scheme；只定义 Transport 接口，具体实现仍由扩展提供。axios/mock 只需依赖 http；core 重导出必需 HTTP 公共类型，普通用户不用额外学习一个包。

`@restmodel/core`：资源模型与链、操作注册表、RESTful 推导、scheme、特殊动作、返回建模。它是完整模型化客户端入口。

http 与 core 都属于主包体系内逐级依赖的基础能力，由同项目承担兼容与发布验证；这不意味着 axios/mock/pinia 也成为随主包迭代的配套。基础包可独立版本但核心发布必须声明并验证依赖范围。

目前不建议再拆独立 resource/scheme/model/shared 包：资源上下文、身份、关系、操作和返回包装联系紧密，缺乏脱离 HTTP 核心的独立消费者；拆分会增加包契约而不会降低使用门槛。query/path 小工具优先内部实现或成熟依赖，不专门发布工具包。

拆 http 的前置证据：写出一个只用普通 HTTP request 的独立示例，以及 axios/mock 不引用 core 的适配示例；二者共用同一运行时和类型，不复制实现。若实现后 http 只是接口空壳、没有独立可用执行层，则先留在 core/http 子路径，不为了分层发布空包。

## 12. 首轮评审重点与落地顺序

先评审：children/members 命名、HTTP 方法式终端 API、ResourceList 结果形态、dataOf/resourceOf 与便捷关联入口、scheme 配置域和继承规则、http 基础包是否有独立价值。这些是提案，不当作用户已批准。

随后按顺序实现：

1. 用请求录制 Transport 验证标准 REST、嵌套集合/单体、0/复合身份、不可变查询、204 等关键行为。
2. 验证裸数组、信封分页、offset、cursor 的服务级一次适配及局部覆盖。
3. 验证声明驱动类型、实体序列化/冲突语义、特殊动作。
4. 验证 HTTP 契约独立消费者，决定是否实际拆 http 包。
5. 接 Axios 扩展并使用真实请求或本地 HTTP 服务验证；再接基于最终 HTTP 的 Mock，最后接 Pinia。

测试只应验证真实行为和边界，不用对占位骨架的同形测试充数。不在本轮设计工作中加入缓存、重试、跨数据源或通用 RPC 功能。

## 操作声明已落地的修订

能力白名单与显式星号规则以 [操作声明](../operations.md) 为准。本文其他示例仍为架构提案；未写 operations 的资源实际不开放操作。主包已实现声明及客户端执行闭环；当前 scheme 字段、关系类型边界和扩展入口以正式参考为准。
