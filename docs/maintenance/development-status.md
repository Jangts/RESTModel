# 开发状态与维护事项

本文件是实施记录，不是公共 API 参考。

## 当前实施基线

- 主包为 @restmodel/restmodel，目录 packages/restmodel；三个扩展为 @restmodel/axios、@restmodel/mock、@restmodel/pinia，按公共包独立声明兼容范围。四包采用 MIT，包含 LICENSE，配置 public 访问级别；均未执行 npm 发布。根工作区和文档应用保持 private。
- createClient 默认通过内置 Fetch 执行真实 HTTP。transport 只在替换 HTTP 执行器时配置，低层 executeHttp 仍要求显式执行器。Axios、HTTP Mock、Pinia 只消费主包公开入口。
- 标准操作数组可混合操作名与 `{ operation, method?, scheme?, path?, queryKey? }`。单身份地址映射保留标准操作位置、scheme 与实体语义；多参数接口例外走 action。默认标准路径原有复合身份支持不变。
- action 仅按声明名直接调用，动作名与后端 path 独立。path 支持多个具名完整片段，从输入对象提取并逐片段编码；已消费字段不再进入 query/body。字面量路径推导必填字段，缺参、非法值和访问器在请求前拒绝。成员动作与集合动作按位置区分，名称冲突在配置时拒绝。
- scheme 使用 identity/envelope/success/map/pagination。资源引用、分页、raw HTTP、列表与实体关联的当前合同以[客户端参考](../client.md)及[操作声明](../operations.md)为准；设计草案不作为可执行接口依据。
- 请求生命周期统一 prepareRequest、processResponse、onError 与后台 observeResponse；每次请求的 RequestContext.state 使用应用 Symbol 关联快照，结束后清空，不传给 Transport。成功前台处理被等待，失败分类为 process；统一错误通知保留主错误。
- defaults/with/raw options 支持 credentials 三态策略；Axios 显式策略使用 Fetch，并逐请求清空实例 baseURL，避免重复地址前缀。可选 iteratePages 惰性遍历数据模式 page/offset 引用，有最大页数边界，不改变 list 单页语义。
- 模型泛型不执行响应校验。`resource(config).typed<Model>()` 保留模型与精确配置类型；精确 const 配置保留能力、位置、关系和动作输入输出；动态配置、宽泛型及分页模式仍需运行时校验。预设类型展开深度上限为 12 层。
- 双语文档沿用 /zh/、/en/ 对等路径及语言偏好入口，托管在自建 Pages。站点维护与部署证据见[维护说明](../../apps/docs/README.md)及[部署记录](../../apps/docs/docs/deployment.md)。

## 最近一次代码验证

2026-11-17 库侧接入优化的最终 pnpm check 通过：88 项行为测试（79 主包、4 Axios、2 Mock、3 Pinia）、源码与独立消费者类型检查、四包真实 tarball ESM/运行消费、格式检查及 Chrome 157 的 23 项 HTTP 检查。覆盖同一用户换 Token、更换用户、401 迟到响应、前台处理与异常、取消、分页上限/非首页/204，以及 Axios URL、超时和凭据三态。

双语 docs:check/build 通过，30 段文档代码在真实 tarball 消费者中按明确章节上下文独立编译通过。使用既有自建 Pages 部署入口同步公共参考，部署证据见部署记录。临时完整日志为 /tmp/restmodel-iteration-check.log，独立消费者与浏览器产物由检查命令打印临时目录。未执行 Cafe 接入、Cafe 构建/测试、远端 CI 或 npm 发布；未查询登录或组织权限。

## 工程与验证

根 package.json 提供 build/typecheck/test/format/format:check。test 包含类型用例、离线行为，以及仅监听本机的 Fetch/Axios HTTP 集成测试。受限环境需允许本机监听，不应通过跳过集成测试制造通过。

Prettier 使用固定版本和统一配置，检查生产源码、测试及 development 长期脚本；生成物排除。配置仅接受已知自有数据字段，拒绝访问器和自定义原型，继承使用迭代。Proxy 的反射陷阱不在无副作用保证范围内。

pnpm check 统一执行全部检查；pnpm check:packages 和 pnpm check:browser 可独立运行。长期脚本及夹具放 development，CI 已配置 Node 22/24 矩阵，未宣称远端工作流已经执行。

执行证据和边界见[首版闭环验收记录](runtime-verification.md)，阶段顺序见[实施计划](implementation-plan.md)。本地 HTTP 与 Mock 证据不替代浏览器、外部真实服务、压力测试或公开发布验证。

## 真实开放平台验证

终端入口为 pnpm demo:gitee、pnpm demo:github；独立真实测试入口为 pnpm test:live。两个平台各四个真实接口子项已通过，覆盖分页、实体身份、成员后续调用与多路径参数 action。测试只请求公开 GET，不加入默认 test/check；详细事实与边界见[开放平台验证](open-platform-validation.md)。

## 后续边界

后续按真实接入需要验证 Cafe 代表性链路、更多浏览器/平台和公开发布准备。缓存、自动重试、刷新鉴权队列不属于当前实现。没有独立 HTTP 消费证据之前不拆新包；已有 HTTP 公开函数可以独立于资源调用使用，但拆包仍需单独评估兼容成本。
