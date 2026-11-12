# 开发状态与维护事项

本文件是实施记录，不是公共 API 参考。

## 实施基线

- core 已实现资源声明、能力目录、预设快照、createClient、不可变引用、HTTP 编码与执行、scheme、分页、特殊动作、raw HTTP、列表及实体关联。
- Fetch Transport 属于 core 的可选工厂；Axios、HTTP Mock、Pinia 由各扩展独立提供，只使用公开 core 入口。
- scheme 当前使用 identity/envelope/success/map/pagination，具体签名和限制以[客户端参考](../client.md)为准。原架构文档保留为设计比较，不以旧草案字段作为当前合同。
- 模型输入输出、资源名、操作位置及可推导 const 声明的能力/关系/动作均有类型约束。动态配置、宽泛型与分页模式仍需运行时校验；深预设的静态能力展开限定 12 层，不宣称无限类型推断。
- 全部包仍为 private 开发包，license 标注 UNLICENSED；未指定公开分发许可，未执行 registry 发布。

## 工程与验证

根 package.json 提供 build/typecheck/test/format/format:check。test 包含类型用例、离线行为，以及仅监听本机的 Fetch/Axios HTTP 集成测试。受限环境需允许本机监听，不应通过跳过集成测试制造通过。

Prettier 使用固定版本和统一配置，检查生产源码、测试及 development 长期脚本；生成物排除。配置仅接受已知自有数据字段，拒绝访问器和自定义原型，继承使用迭代。Proxy 的反射陷阱不在无副作用保证范围内。

pnpm check 统一执行全部检查；pnpm check:packages 和 pnpm check:browser 可独立运行。长期脚本及夹具放 development，CI 已配置 Node 22/24 矩阵，未宣称远端工作流已经执行。

执行证据和边界见[首版闭环验收记录](runtime-verification.md)，阶段顺序见[实施计划](implementation-plan.md)。本地 HTTP 与 Mock 证据不替代浏览器、外部真实服务、压力测试或公开发布验证。

## 后续边界

后续按真实接入需要完善动态泛型体验、更多浏览器/平台验证和公开发布准备。缓存、自动重试、刷新鉴权队列不属于当前实现。没有独立 HTTP 消费证据之前不拆新包；已有 HTTP 公开函数可以独立于资源调用使用，但拆包仍需单独评估兼容成本。
