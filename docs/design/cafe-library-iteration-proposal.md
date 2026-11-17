# 面向 Cafe 完整接入的 RESTModel 库侧迭代

日期：2026-11-17。状态：库侧实现已落地，公共 API 合同以[客户端参考](../client.md)与[Axios 扩展](../../extensions/axios/README.md)为准。接入事实与接口清单见 [Cafe 接入评估](cafe-adoption-assessment.md)。本文件记录通用机制的取舍，不代表 Cafe 已迁移，也不包含 npm 发布。

## 判断与范围

现有资源、operation 覆盖和 action 已能表达 Cafe 的普通 HTTP 形态。“能够配置出来”只说明覆盖范围，不等于接入体验完整。针对必须逐调用包装、依赖内部对象或丢失类型精度的问题，在公共边界补齐通用机制；Cafe 的业务规则保留在应用。

| 优先级 | 已采用的方案 | 目的 |
| --- | --- | --- |
| P0 | RequestContext、processResponse、onError；复用 prepareRequest/observeResponse | 为资源、action、raw HTTP 提供统一的请求关联、前台处理和失败接入 |
| P0 | Axios 逐请求清空实例 baseURL，明确文本响应与拦截器合同 | RESTModel 独占最终 URL，避免 /api/api/users；统一超时、取消和非 2xx 分类 |
| P1 | resource(config).typed<Model>() | 先推导配置，再绑定模型，保留能力、关系和 action 参数精度 |
| P1 | credentials: omit/same-origin/include | 在 defaults/with/raw options 中声明隐式凭据策略，默认 Fetch 与 Axios 执行 |
| P2 | iteratePages(source, options) | 可选的惰性 page/offset 迭代，保留默认单页行为，不新增资源方法 |

## 生命周期与请求上下文

标准资源、action、raw HTTP 和 executeHttp 使用共同执行入口：请求准备 → HTTP 执行 → 状态检查 → 成功前台响应处理 → 业务适配/建模 → 后台观测。raw HTTP 不执行业务解包。请求前的配置、身份、路径参数或编码失败不创建执行上下文。

- prepareRequest 增加第二参数 context；旧的一参数函数兼容，仍异步返回准备后的请求。
- processResponse(response, context) 只处理 2xx，等待完成后交付业务数据，失败分类为 process 并保留 cause；返回值忽略，数据转换由 scheme 承担。
- onError(error, context) 接收执行、状态、处理和适配错误，一次通知，不替换主错误、不吞掉请求失败、不递归触发自己。
- observeResponse 继续用于适配成功后的后台遥测，不等待、失败隔离，不重发请求。

每次实际执行有同一个 RequestContext；request 随准备与最终快照更新，signal 覆盖整个等待生命周期，state 用应用 Symbol 键关联用户/Token 等快照。上下文不附到网络请求、不交给 Transport，默认序列化和检查不显示字段，请求结束清空 state。不保存全局登录态，也不依赖请求对象的地址相等来关联响应。

超时与取消停止等待、abort 有效信号、清理 timer/listener/state。迟到响应不进入后续前台处理或成功观测。已运行的回调无法被强制终止，应自行监听 signal；取消后的 onError 仍通知一次，但不等待不合作的异步处理器。错误处理等待期间取消会结束等待，保留原始主错误。

Cafe 的用户/Token 比较、认证路径排除、authRevision、Token 刷新、跳转、错误文案和文件 URL 登记规则仍由 Cafe 实现。主包只提供承载通道。

## Axios 的最终地址与实例合同

RESTModel 组装最终 URL。扩展逐请求设置 baseURL 为空值，不修改实例 defaults；带 /api 的实例接收 /api/users 不会再叠加前缀。请求拦截器仍是调用方信任边界，可以改写设置，不能宣称任意已有实例都原样兼容。

扩展要求 validateStatus 接受所有状态、responseType 为 text、transformResponse 为空，由公共解码器解析响应。Axios 成功响应拦截器先收到文本；非 2xx 进入主包 http/onError，不能依赖既有 Axios rejection 分支清理登录。网络错误、Axios 超时和取消仍先经过实例失败拦截器；适配器将超时/取消归入稳定分类。

Node 未显式设置 credentials 时保留实例适配器，默认 HTTP 适配器禁用重定向；浏览器始终使用 Fetch，显式三态 credentials 在 Node 也选择 Fetch，映射到 Request.credentials 并使用 manual redirect。没有自动 Cookie 仓库，不提供任意 RequestInit 透传。

## 模型类型与精确配置

TypeScript 无法在显式提供第一个泛型时继续完整推导剩余配置参数。采用单一的后置模型绑定：resource(config).typed<Model>()。它返回同一冻结声明，不复制树或增加运行时模型类。旧 resource<Model>(config) 继续兼容；不提供另一套 builder 或重名入口。

精确操作白名单、collection/member/singleton 位置、具名 children/members、actions/memberActions 的输入输出，以及字面量路径参数推导都保留。错误输入和未声明操作在源码与真实 tarball 消费边界检查，模型类型仍不代替后端响应校验。

## 凭据策略

credentials 可在客户端 defaults、引用 with、raw options 和低层请求契约中声明；缺失/undefined 继承，显式值覆盖。默认 Fetch 不指定时沿用平台 same-origin。omit 不删除显式 Authorization；JWT 的按源隔离仍由应用负责。第三方天气服务可声明 omit，无需为常规选项自建 Transport。

Axios 的三态字符串映射使用其 Fetch 适配器，在最小适配边界解释公共类型与运行时差异。测试直接检查构造出的 Request.credentials，并在真实浏览器中验证 Cookie 携带；不把同源验证描述成跨源 CORS 验证。

## 分页遍历

iteratePages 是独立可选辅助，接收已有数据模式 page/offset 引用，复用查询、请求设置与 signal。不自动预取，不缓存，不增加 all/listAll 等资源终端方法，不改变 list 的一次请求行为，也不支持 cursor 或 response 模式。

size/start/maxPages 默认 100/1/1000，均须正安全整数。空页或无正文终止；从第一页起累计达到当前已知 total 也终止。短页不当作完成，以兼容服务端限长；未知总数或非第一页起步读到空页。达到最大页数仍未完成则报错，避免静默截断。服务端数据变化不提供快照或去重保证。

ResourceList 与 Cafe Page 的形状转换、搜索结果合同、缓存、DTO 映射和讨论树仍属 Cafe，不在主包加第二套返回结构。

## 验证与后续接入边界

长期用例位于 packages/restmodel/tests/lifecycle.test.mjs、pagination.test.mjs、client.types.ts 与 extensions/axios/tests/transport.test.mjs。它们覆盖用户/Token 竞态、前台处理时序、失败分类与回调异常、取消与迟到响应、分页上限，以及实例 URL、超时和凭据映射。development 的真实 tarball 消费与隔离 Chrome 用例覆盖公开类型、ESM 导出、实际同源 Cookie 和 HTTP 行为。

统一验证入口为 pnpm check；文档使用 pnpm docs:check/build。最近一次执行事实见[开发状态](../maintenance/development-status.md)。这些是 RESTModel 库侧证据，不代表真实 Cafe 已接入。未修改 Cafe、未运行 Cafe 构建/测试、未发布 npm；SSE、Zustand、缓存、Token 刷新与实际迁移保持原边界。
