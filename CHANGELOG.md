# 更新记录

## 0.1.0（待发布）

首个公共版本提供四个独立 ESM 包，要求 Node.js 22+ 或支持现代 Web API 的浏览器，采用 MIT License。

- `@restmodel/restmodel`：资源与预设声明、能力白名单、集合/成员/单体引用、查询与分页、scheme 适配、实体关系及直接 action。
- 标准操作支持单身份路径或查询映射；action 支持多个具名路径参数，剩余字段进入 query/body。
- 内置 Fetch 支持注入应用 Fetch、响应读取策略、缓存、keepalive 和凭据策略；生命周期覆盖准备、前台处理、错误通知与后台观测。
- 精确资源配置保留能力、位置、关系与动作类型；`typed<Model, Inputs>()` 分离读取模型和标准写入输入。
- `@restmodel/axios` 提供公共 Transport；`@restmodel/mock` 匹配最终 HTTP；`@restmodel/pinia` 管理共享请求状态、取消与迟到结果。
- 取消保留调用方原因，非法 Unicode 路径统一归为配置错误；成功正文可主动丢弃，HTTP 失败保留诊断。

安装、兼容范围和环境说明见[快速上手](docs/getting-started.md)；验收结果和发包步骤见 [0.1.0 发布准备](docs/maintenance/release-0.1.0.md)。
