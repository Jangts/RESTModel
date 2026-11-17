# Cafe 以 RESTModel 为主要 HTTP 访问方案的评估

评估日期：2026-11-17。状态：接入评估及库侧迭代结果，不是 Cafe 迁移实施或已接入声明。对象为 `jangts/apps/cafe` 与 RESTModel 当前工作区，包含 Cafe 未提交的 Bearer JWT 鉴权改动。源码工作区位于 `/Users/ivan/Codes/jangts` 和 `/Users/ivan/Codes/RESTModel`。参考 HEAD 分别为 `d1c3ffda1` 和 `960e161`；提交号不包含上述未提交改动，结论以实际读取的工作区源码为准。

## 结论与评估口径

Cafe 适合将 RESTModel 作为普通 HTTP API 的主要访问方案。标准 RESTful 接口采用默认推导，接口例外通过 operation 覆盖或 action 配置。非 RESTful、多参数、特殊方法、第三方服务都属于正常接入场景，不因需要额外配置而排除，也不直接记为库能力缺口。

“全面”指以同一方案组织普通 HTTP 数据访问，不要求所有网络通道采用相同执行方式。聊天 SSE 不在本次覆盖目标内，保留既有通道即可。媒体播放、图片预载等也不属于资源 API 访问层。

本评估不迁移 Cafe，不改造后端，不发布 RESTModel；评估后的通用库优化已在 RESTModel 工作区实现。采用可行性与接入质量分别评估：功能可通过现有配置或应用适配实现，也可能需要在库侧优化通用边界。下文的资源与动作均为候选建模方向，不是 Cafe 已存在的客户端配置。

判断采用价值的标准是：能否保留现有业务行为，同时减少重复的路径、参数编码、接口规则和错误接入代码。仅将 `request(config)` 换成 raw HTTP 调用，不能说明资源建模带来了收益。

## 当前源码基线

- Cafe 使用 React 与 Zustand。RESTModel 的 Pinia 扩展不适用，也不需要为采用主包更换状态库。
- 本站普通 API 集中通过 `services/http/index.ts` 的 Axios 实例调用；本次核对了 11 个使用共享 request 的 JSON API 模块。
- 普通 API 当前通过 Authorization 头发送 Bearer JWT，Axios 配置为 withCredentials: false。登录与快速注册返回 LoginResponse，认证服务拆出 Token 后再更新用户状态。Cookie 不应作为这份评估的接入前提。
- 401 清理同时比较请求发起时的用户与 Token；认证服务另用 authRevision 防止旧响应覆盖新身份。两类保护都需要保留。
- 现有 request 在返回业务数据前执行 acceptResourceFileUrls。资源 DTO 还需经过展示模型转换、文件地址解析和缓存登记。
- 返回形态包括裸数组、普通对象、`{ items, page, pageSize, total }` 分页，以及 `{ track }` 等局部包装；不存在所有接口统一套一层 data 的前提。
- 天气、天气报告和位置名称适配器直接读取外部 JSON 服务，使用独立地址、超时、解析与 credentials: omit；聊天另外使用 Fetch 读取 SSE。

## 接口配置清单

| 现有入口 | 已观察到的接口形态 | RESTModel 候选表达 | 接入时保留的业务行为 |
| --- | --- | --- | --- |
| resources.ts 与 resources/loaders.ts | slides、galleries、works 下的声音、文字、影像及成员/子资源读取 | 静态资源路径、标准 list/get、成员关系；`works/videos/play/:id` 可配置为 get 的单身份路径例外 | DTO 类型、资源映射、详情并发加载、缓存与播放资料复用 |
| resources.ts 的搜索 | GET works/search、clicks/search，带 q、type、taxonomy、page、pageSize | 各作用域的 search action，输入进入 query | 空条件不发请求；taxonomy 序列化；保留搜索 Page 返回合同 |
| favorites.ts | 分页列表、tags、成员 star | favorites.list、tags 独立读取、成员 star action | 标签按重复 query 发送，关键字 trim，页长 20，star 的实际 PUT 与空 JSON 体 |
| drops.ts | featured、成员读取、replies、thread、发表评论、删除回复、like | 资源关系加显式动作；同一个 like 路径可分别声明 like/unlike，使用 PUT/DELETE | 全量分页、讨论树组装、commentCount/rootReplyCount 更新、点赞结果与取消链 |
| auth.ts | auth/me 的 GET/PATCH，以及登录、退出、注册、改密等 POST | me 单体资源；认证 action 保留各自方法、路径和输入类型 | JWT 保存与清除、响应 Token 与用户字段分离、authRevision、会话恢复去重、logout 空 JSON 体 |
| resourceClasses.ts、resourceAttributes.ts | 列表、POST 新建、成员 PATCH | 标准 list/post/patch | 有无 id 决定新建/修改的应用编排，筛选条件与 DTO |
| resourceTags.ts、keywords.ts | 带筛选条件的数组列表 | 标准 list 与 query | 重复参数、可选字段及取消信号 |
| resourceTaxonomy.ts | 目录读取；按 type/unit/id 更新分类 | 目录读取加多具名路径参数 action | 分类数据结构与返回中的 type/unit/id，不把多个业务标识硬塞进标准 get 映射 |
| siteMessages.ts | POST site-messages | 标准 post | 提交校验与返回的 id/receivedAt |
| about.ts | GET about | about 单体 get | AboutData 与启动加载合同 |
| weather/adapters 下的三个适配器 | 外部天气与位置名称 JSON 查询 | 按实际服务源建立独立客户端，使用 action 或单体读取表达接口 | 坐标检查、天气结果解析、请求窗口、超时与取消；不附带本站 JWT |

这张清单不是要求每个旧函数都删除。已有业务语义明确的 API 函数可以继续作为应用服务入口，其内部复用资源声明；是否进一步让调用方直接持有资源引用，应根据实际收益决定。

## 标准操作与 action 的边界

1. 标准 RESTful 请求使用标准操作，不重复写 URL 与 HTTP 方法。
2. 标准操作只有单身份地址例外时，配置 path 与 queryKey 或单个 `:id`，保留原来的标准调用及实体语义。
3. 接口例外需要多个业务入参、多个路径参数或额外业务行为时，使用 action。这里不限制普通列表筛选条件或 post/put 的模型字段。
4. 动作按声明名直接调用。声明名可自由选取，后端路径即使叫 get、put 也不构成冲突；只检查调用名是否占用标准方法、链式方法、保留属性或同位置关系。
5. action 的具名路径字段从输入对象提取并逐片段编码，剩余字段进入 query/body；不再增加第二套调用入口或自定义参数 DSL。

Cafe 的搜索、分类更新、点赞等无需因为“不够 RESTful”而另建一套 HTTP 基础设施。配置是否足够集中、局部覆盖是否可复用，是需要衡量的工作量；声明无法表达时属于能力缺口；能表达但要在应用中反复包装、依赖内部细节或牺牲类型精度时，也应纳入库侧优化，而不只是归为配置工作量。

## 返回值与分页接入

分页资源可集中配置 pageSize 请求字段、items 列表字段与 total 总数字段。裸数组接口采用对应资源的裸列表规则，不能把分页信封设置成所有资源的全局缺省。`{ track }` 等包装也应局部适配，不能影响其他接口。

RESTModel 的 ResourceList 与 Cafe 的 Page 不是同一个结构：前者的 page 是分页元信息对象，后者的 page/pageSize 是独立字段。资源 API 转用 ResourceList 后，必须明确由原 API 函数保留 Page 形状，还是让对应业务消费者接受新的返回合同；不能只改请求语法后宣称兼容。

`readResourcePages` 逐页读完全部条目、空页终止、持续传递取消信号，是 Cafe 的业务消费策略。RESTModel 保持默认单页请求，可用独立 iteratePages 辅助逐页读取；应用仍需决定 Page 形状转换、起止条件与业务组装。搜索返回 Page、收藏 tags 返回 `{ items: string[] }` 等接口也可由 action 保留原始业务形状，无需全部强行包装为资源实体。

## 必须保留的应用行为

### 鉴权、请求身份与错误

JWT 可在应用级 prepareRequest 中按请求时刻读取并添加到本站 API 头，不应在客户端创建时永久捕获旧 Token，也不能复用到第三方服务客户端。请求的用户与 Token 快照、认证操作路径排除条件、401 失效清理，以及认证服务的 authRevision 属于 Cafe 行为。

直接复用现有 Axios 实例不是零适配方案：RESTModel 的 Axios 扩展设置 validateStatus 为始终接受响应，当前依赖失败分支的 Axios 401 拦截器不能假定照常触发。扩展还请求文本、关闭默认响应转换，再由公共 HTTP 层解码；同一实例上的其他响应拦截器也要核对所接收的形状。

RESTModel 的 HTTP、取消、超时等错误使用 RequestError。Cafe 的 getHttpErrorMessage、会话恢复和 launchFailure 仍检查 AxiosError，必须有统一的应用错误接入，保持原有前端文案、状态码语义和诊断信息，不能直接透传后端 message。

observeResponse 只观察成功响应，失败被隔离，不用于 401 清理。库侧已增加 RequestContext 与 onError：prepareRequest 记录应用快照，onError 比较请求发起时和当前用户/Token；JWT 清理规则仍由 Cafe 决定。资源、action、raw HTTP 共用该边界，不依赖准备前后对象相等。

### 文件 URL 与结果进入业务的时序

acceptResourceFileUrls 必须在 loader 或页面使用相关地址前完成。异步后台观测和吞掉处理失败的成功 hook，不能直接视作现有同步返回边界的等价替代。

库侧已提供 processResponse(response, context)，在交付数据前等待成功响应处理，失败分类为 process，并进入统一 onError。该边界覆盖资源操作、action 与 raw HTTP。具体文件 URL 规则由 Cafe 提供，不写入 RESTModel。

### 状态、映射与缓存

保留 Zustand、DTO 转展示模型、相册缓存、播放资料复用、讨论树组装、认证状态与用户交互规则。RESTModel 的实体关联不等于全局缓存或业务 Store，不应把带关联的对象直接推广为 Cafe 全站状态模型。

如果既有应用边界需要普通 DTO，可在那里显式取出数据；如果某个 loader 能直接利用实体关系，则局部保留资源引用。模型泛型仍不代替运行时响应校验。

## 库能力与接入验证的分类

| 事项 | 当前归类 | 评估结论 |
| --- | --- | --- |
| 非标准方法/路径、多参数 action、重复 query | 已有能力与声明配置 | 不算接入障碍，不需要为这些接口绕开 RESTModel |
| Page/ResourceList 转换、全量翻页、DTO 映射、缓存与 Zustand | 应用合同适配 | 保留业务所有权，比较引入前后的实际代码与调用复杂度 |
| Bearer JWT 注入 | 已有请求准备机制可承载 | 按请求读 Token，并保持本站与第三方源隔离 |
| 401 用户/Token 竞态保护、AxiosError 到 RequestError 接入 | 通用生命周期已实现，业务规则保留 | RequestContext.state 与 onError 承载请求快照；Cafe 仍需适配错误文案和会话策略 |
| Axios 实例的 baseURL 与 RESTModel 请求地址 | 已修正并回归 | 扩展逐请求清空实例 baseURL，最终 URL 由 RESTModel 唯一组装，不修改实例 defaults |
| 文件 URL 登记的同步返回边界 | 通用响应处理已实现 | processResponse 被等待，处理失败分类为 process；Cafe 提供登记行为 |
| Fetch 的 credentials 配置 | 通用执行策略已实现 | defaults/with/raw options 支持 omit/same-origin/include，Axios 通过 Fetch 精确映射 |
| 显式模型泛型与具名资源关系 | 精确模型绑定已实现 | resource(config).typed<Model>() 同时保留模型、能力、关系和 action 推导 |
| SSE | 明确保留的特殊通道 | 不纳入采用门槛，不为本次目标扩展流式 HTTP 模型 |

截至本次源码评估，没有发现必须因为非 RESTful 路径或参数形态而放弃普通接口主方案的理由。但“现有配置能够覆盖”不能推出“不需要库迭代”。针对生命周期、响应处理、Axios 地址、类型推导与 Fetch 执行策略的实现与取舍见[库侧迭代](cafe-library-iteration-proposal.md)，公共合同见客户端参考；这些是库侧实现，尚未进行 Cafe 真实接入。

## 预期收益与代价

预期收益是资源关系、允许操作、身份、分页及特殊接口映射形成集中声明；业务不再各处手工拼接同一类 URL、编码参数、重复维护标准方法。多服务客户端也可共用同一访问方式，而不是把第三方接口排除在方案之外。

迁移代价主要是声明整理、返回形状适配和应用 HTTP 行为接入。业务算法、页面状态、全量分页及缓存不会自动消失。若最终仍在每个调用点重新描述方法、URL 和参数，或全站只通过 raw HTTP 转发，收益会显著下降；不能预先给出未经实际接入证明的代码缩减比例。

## 后续验证范围

库侧通用 HTTP 合同已有独立用例，执行事实见开发状态；不等于 Cafe 行为已经验证。后续若开展 Cafe 接入验证，再选三条代表性链路：

1. 相册详情与 items：并发请求、分页/全量读取、取消、文件 URL 登记、DTO 映射及缓存。
2. 认证：动态 JWT、旧请求 401 不清理新身份/新 Token、会话恢复去重、错误文案、Token 与用户字段分离。
3. 动态讨论：多层关系、分页、回复增删、同路径不同方法的点赞动作及计数返回。

第三方天气作为服务源隔离的补充验证，重点看普通 JSON action、超时、取消和凭据策略，不需要改天气业务解析。是否迁移其他调用方，应依据这些链路的可读性、配置复用、行为等价和实际收益决定。

初始源码评估未改程序；随后已按本评估优化 RESTModel 并增加库侧验证。没有修改 Cafe，也没有执行 Cafe 构建、测试、真实鉴权、浏览器预览或服务操作。

## 源码依据

Cafe 路径均相对 Jangts 仓库，RESTModel 路径相对本仓库；行号不作为永久引用。

| 对象 | 路径与核对内容 |
| --- | --- |
| Cafe HTTP | `apps/cafe/src/services/http/index.ts`：baseURL、超时、JWT、用户/Token 快照、401、文件 URL 登记、错误文案 |
| Cafe 认证 | `apps/cafe/src/services/access-token.ts`、`apps/cafe/src/services/auth.ts`、`apps/cafe/src/services/api/auth.ts`：Token 读写、authRevision、LoginResponse 与 User 分离 |
| Cafe 资源 | `apps/cafe/src/services/api/resources.ts`、`apps/cafe/src/services/resources/loaders.ts`：Page、全量翻页、搜索、资源组装与缓存 |
| Cafe 动作与分类 | `apps/cafe/src/services/api/drops.ts`、`apps/cafe/src/services/api/favorites.ts`、`apps/cafe/src/services/api/resourceTaxonomy.ts`：方法、路径、多业务参数与结果 |
| Cafe 启动与状态 | `apps/cafe/src/services/http/launchFailure.ts`、`apps/cafe/src/stores/account/authStore.ts`：Axios 错误依赖与 Zustand |
| Cafe 第三方与流式通道 | `apps/cafe/src/services/weather/adapters/`、`apps/cafe/src/services/api/chat.ts`：独立服务、显式凭据策略与 SSE |
| RESTModel 核心 | `packages/restmodel/src/client.ts`、`packages/restmodel/src/action-path.ts`、`packages/restmodel/src/operation-route.ts`、`packages/restmodel/src/response.ts`、`packages/restmodel/src/http/types.ts`、`packages/restmodel/src/http/execute.ts`、`packages/restmodel/src/http/fetch.ts` |
| RESTModel 扩展 | `extensions/axios/src/index.ts`、`extensions/pinia/src/index.ts`：Axios 执行设置与 Pinia 适用范围 |
