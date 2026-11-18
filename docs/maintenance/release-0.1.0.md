# 0.1.0 发布准备

日期：2026-11-18。范围为主包及三个发布扩展的生产代码、公开类型、测试、API/使用文档和本地包交付；保留任务开始时已有的暂存与未暂存修改。准备过程不执行 npm 发布、Git 提交/标签或文档站部署。

## 版本与产物

| 包 | 版本 | 主包 peer | 其他 peer |
| --- | --- | --- | --- |
| @restmodel/restmodel | 0.1.0 | 无 | 无 |
| @restmodel/axios | 0.1.0 | ^0.1.0 | axios ^1.21.1 |
| @restmodel/mock | 0.1.0 | ^0.1.0 | 无 |
| @restmodel/pinia | 0.1.0 | ^0.1.0 | pinia ^4.1.0、vue ^3.5.45 |

四包均为 ESM、public、MIT，支持 Node.js 22+；浏览器要求现代 Web API。根工作区及文档应用保持 private。扩展保留 workspace peer 声明，由 pnpm 打包转换为上述范围；本次首版版本相同不构成以后同步版本的约定。

`pnpm release:prepare` 依次执行发布包的类型、行为、格式、真实 Chrome、tarball 安装消费检查；文档站的构建和开发依赖审计独立于发包验收。通过后将验收过的相同包字节复制到 `artifacts/release/0.1.0/`，附带 `SHA256SUMS`；目录已忽略，不进入源码仓库。打包前清理的对象仅为各包生成的 dist。

## 审查范围与修正

依据[审查规范](../code-review-standard.md) L0—L7，逐模块检查主包的声明/能力目录/路径与请求编码/客户端/响应与实体/分页/HTTP 生命周期及三个扩展，并核对构建、工作流、公开导出、文档来源和包白名单。

| 问题 | 触发与影响 | 修正与复查 |
| --- | --- | --- |
| 取消丢失原因 | 外部 signal.abort(reason) 被替换为无原因的内部 abort，错误无法保留调用方 cause | executeRequest 同步转发 reason；预算超时使用 TimeoutError；验证运行中取消、预取消、超时和实际 Transport.signal.reason |
| 非法 Unicode 路径分类错误 | 未配对代理字符在 encodeURIComponent 抛 URIError，而非 ResourceConfigurationError | 路径编码边界转换错误；验证 raw、资源和 action 路径均在 HTTP 前拒绝 |
| 包 README 断链 | 主包 tarball 不包含 ../../docs/client.md | 改为公共文档地址；四包真实包体链接检查 |
| 双语说明格式 | 正文中的泛型未使用代码标记 | 将两种语言中的 `Partial<Model>` 标为代码，保留准确类型说明 |
| 文档与包版本/策略不一致 | 扩展 README 保留 ^0.0.0，英文 Axios 缺少响应读取和 Fetch 选择规则 | 同步 0.1.0 安装、peer、Fetch 与写入输入合同；刷新生成 API 页 |

请求并发隔离、操作能力/位置、访问器拒绝、路径逃逸、身份编码、凭据、错误脱敏、取消清理、观测不重发，以及 Mock 与 Pinia 的生命周期均纳入现有及新增用例。性能只审查算法和资源清理，不作压测或容量结论；缓存、重试和覆盖率指标未纳入实现或本次任务要求。

## 本地验证

环境：macOS、Node v24.9.0、pnpm 8.10.5、TypeScript 5.9.3、Google Chrome 157.0.8103.79。

- 类型与行为：95 项通过（主包 85、Axios 5、Mock 2、Pinia 3），包含本机真实 HTTP 和类型正反例。
- 浏览器：30 项真实 Chrome HTTP 检查通过，新增应用 Fetch 注入、显式 JSON 与真实响应头、cache/keepalive、未结束正文的 none 取消、HTTP 失败诊断。
- 四个 0.1.0 实际 tarball 的元数据、版本、入口、许可、README 链接与 peer 转换检查通过；独立目录离线安装、ESM 运行和严格 TypeScript 消费通过，包含独立写入输入类型。
- 格式检查通过。API、示例、README、版本和 peer 说明与发布包对齐；文档站构建、运行与工具链维护不作为发包门槛。

最终 `pnpm release:prepare` 退出码为 0，完整日志为 `/tmp/restmodel-release-0.1.0-packages-only.log`；SHA256SUMS 的四项校验全部通过。独立消费目录为 `/var/folders/1m/f9hk1b0n5l12gr130rkjg1dc0000gn/T/restmodel-packages-afmdiL`，Chrome 结果目录为 `/var/folders/1m/f9hk1b0n5l12gr130rkjg1dc0000gn/T/restmodel-browser-uKgLPv`。其他原始日志位于 `/tmp/restmodel-release-0.1.0*.log`。临时文件会被系统清理，长期结论以本记录为准。

## 发布包依赖

主包没有第三方运行依赖；三个扩展按表中 peer 范围通过公开入口接入。四个实际 tarball 的 manifest 与运行时导入已检查。文档站工具链由独立工程负责，不计入主包发布结论。

## 发布步骤与未验证边界

2026-11-18 匿名读取 npm 官方 registry，四个包名均返回 404，尚无可公开读取的包；这不能证明组织权限或未来包名可用。

执行 registry 写操作之前，需要具备 npm `@restmodel` 组织/包写权限及相应认证；本次不读取或配置账号凭据，不宣称权限可用。实际发布前先审查并提交源码基线，保证 main 分支与远端同步、工作区通过 pnpm 的 Git 检查。本次准备未执行这些 Git 写操作。

发布按主包、Axios、Mock、Pinia 顺序进行，使用已验收 tarball，避免发布时重新构建出另一份包：

```sh
pnpm release:prepare
cd artifacts/release/0.1.0
shasum -a 256 -c SHA256SUMS
pnpm publish ./restmodel-restmodel-0.1.0.tgz --publish-branch main --access public --registry https://registry.npmjs.org --tag latest
pnpm publish ./restmodel-axios-0.1.0.tgz --publish-branch main --access public --registry https://registry.npmjs.org --tag latest
pnpm publish ./restmodel-mock-0.1.0.tgz --publish-branch main --access public --registry https://registry.npmjs.org --tag latest
pnpm publish ./restmodel-pinia-0.1.0.tgz --publish-branch main --access public --registry https://registry.npmjs.org --tag latest
```

发布后逐包核对 registry 版本、latest、dist.integrity/shasum、README、peer，并在全新项目从 npm 安装四包验证。全部发布完成后更新 CHANGELOG 的待发布状态，再按仓库流程记录发布结果、标记版本与部署文档。

本次不替代远端 Node 22/24 CI、真实 Cafe 接入、外部平台 live 测试、其他浏览器、压测或 npm registry 消费验证。在线文档站未部署。
