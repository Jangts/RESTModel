# 首版运行闭环验收记录

日期：2026-11-12。目标为实施计划 P1—P7 的本地运行与包消费闭环，包含隔离 Chrome 157 的最小浏览器闭环，不包含 registry 发布、外部生产服务、压测或所有浏览器/平台组合验收。

## 基线与范围

工作区 `/Users/ivan/Codes/RESTModel`；现有源码为未跟踪基线，没有通过 reset、clean 或提交操作覆盖用户文件。Node v24.9.0、pnpm 8.10.5、TypeScript 5.9.3；验收时 core 与三个扩展为 0.0.0/private（2026-11-16 已移除发布包的 private，按公共库目标配置）。

覆盖 core 全部生产模块、三个扩展入口、行为/类型用例、manifest/锁、编译产物和实际 tarball。core 无第三方运行依赖；Axios 1.21.1、Pinia 4.1.0、Vue 3.5.45 由对应扩展声明为 peer，工作区提供开发依赖。没有创建独立 http/shared 包。

实际合同来源为项目边界、操作声明、客户端参考；架构草案保留设计对照用途。为落实首版，scheme 收敛为 identity/envelope/success/map/pagination，关系采用 children/members，特殊接口采用 action 与 $ 控制面。

## 实际验证

| 对象 | 方法与结果 | 证据来源 |
| --- | --- | --- |
| 工作区编译 | pnpm build 通过；最终 pnpm test 也重新编译全部四包 | 各包 tsc 脚本和 dist |
| 类型 | pnpm typecheck 通过；核心测试中 tsc -p tests/tsconfig.json 通过 | operations.types.ts、client.types.ts |
| 核心行为 | 53 项通过，无失败/跳过 | packages/restmodel/tests/*.test.mjs |
| Axios | 1 项本地真实 HTTP 集成通过，涵盖 body、鉴权、422、302、取消与超时 | extensions/axios/tests/transport.test.mjs |
| HTTP Mock | 2 项通过，最终请求匹配、业务适配、透传与失败分类 | extensions/mock/tests/mock.test.mjs |
| Pinia | 3 项通过，迟到结果隔离、订阅取消、销毁和错误恢复 | extensions/pinia/tests/store.test.mjs |
| 格式 | pnpm format:check 通过 | 根 Prettier 配置与检查 glob |
| 依赖公告 | pnpm audit --registry https://registry.npmjs.org --json 返回 0 条命中 | 当次官方 npm audit 响应；不代表永久无漏洞 |
| 浏览器 | Chrome 157.0.8103.51 无头运行 9 项检查通过，含重定向目标请求计数为 0 | development/check-browser.mjs 与 development/fixtures/browser.html |
| 包消费 | 四个实际 tarball 离线安装成功；ESM、严格类型和闭环调用通过 | 临时消费者及打包目录，见下文 |

测试总数 59（53 + 1 + 2 + 3）。计数只代表已有用例，不代表所有分支或覆盖率达标。未启用覆盖率门槛，不给出覆盖率百分比。

本地 HTTP 只监听 127.0.0.1 动态端口，结束时关闭连接和服务。初次受限沙箱监听失败，随后在允许本机监听的执行环境重跑通过；没有跳过 HTTP 用例。未访问外部业务服务，没有写入外部业务数据。

## 审查条目与证据映射

| 视角 | 当前结论及依据 |
| --- | --- |
| L0 G01—G05 | 当前交付范围通过：区分草案/合同/产物、保留原工作区，验证对象和副作用有界。 |
| L1 I01—I07 | 当前首版范围通过：资源能力驱动标准路径，无逐接口 CRUD 清单；方法覆盖、预设、单体、scheme、模型正反类型用例与 Transport 公共契约均有证据。动态关系和能力/位置静态裁剪限制见下文。 |
| L2 A01—A06、C01—C04 | 当前范围通过：声明→引用→编码→执行→解包→建模可追踪；标准操作及 HTTP 方法集中目录，扩展只走公共入口；格式、类型及必要源码注释已核对。 |
| L3 B01—B07 | 当前范围通过：星号优先级、0/复合身份/Unicode/斜杠、分页覆盖、HTTP 分类、204/标量/信封、实体键枚举与冻结输入等已回归。 |
| L4 D01/D02/D05/D06 | 当前范围通过：查询/头/身份分支隔离、取消准备阶段与 Transport 信号、监听释放、Mock 共用准备、Pinia 迟到结果/订阅/销毁。D03/D04 不适用：未提供重试/缓存。 |
| L5 S01—S05 | 已实现边界通过，保证有明确范围：普通配置数据自有字段/访问器、保留名、路径逃逸、原型字段、敏感诊断、Mock 鉴权准备和实际锁文件公告核对。Proxy 反射陷阱及受信任拦截器不属于无副作用保证；Chrome 重定向目标计数已验证，其他浏览器未验证。 |
| L6 R01—R05 | 迭代继承、分支不复制整棵资源树、timer/listener 清理、观测失败不重发及核心依赖闭包已有证据；没有缓存或无界全局实体表。R04 性能结论不适用：没有进行性能/容量测量。 |
| L7 V01—V06 | V01/V03/V04/V05 的当前本地范围通过；V02 未要求覆盖率，未声称全分支通过；V06 不适用：没有发布授权或实际发布。该历史验收不覆盖 registry 发布及所有浏览器。 |

## 包体与独立消费者

打包命令（在仓库根使用受支持 Node 环境执行）：

```sh
pnpm -r exec pnpm pack --pack-destination /private/tmp/restmodel-package-check/tarballs
pnpm --dir /private/tmp/restmodel-package-check/consumer-final install --offline --ignore-scripts --store-dir /Users/ivan/Library/pnpm/store/v3
node /private/tmp/restmodel-package-check/consumer-final/smoke.mjs
node node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck /private/tmp/restmodel-package-check/consumer-final/consumer.mts
```

四包直接从 tgz 安装，未以 workspace 链接或源码别名冒充包消费。消费者同时显式安装满足 peer 的 core/Axios/Pinia/Vue。安装使用离线缓存并禁止安装脚本；支持的 Node 运行时从仓库根调用，避免临时目录 shell 默认的旧 Node。

smoke 验证公共 ESM 导出、Mock 最终请求→核心列表→Pinia 状态、实体引用、Axios 工厂，以及非公开 src 路径被 exports 拒绝。类型消费者验证模型输入输出和各扩展签名。包内包含 dist、src（用于 source/declaration map）及自包含 README，没有依赖不存在的仓库相对 Markdown 链接。版本、ESM、types、peer 和核心依赖闭包按实际 manifest/产物核对。

临时产物位于 `/private/tmp/restmodel-package-check/`，可由系统清理，不作为长期文档链接。首版测试原始输出为 `tests-final.log`；本次优化的统一检查输出为 `optimization-check.log`；长期证据以本文结论、源码用例及可复现命令为准。

## 未验证与明确限制

- 浏览器连接工具两次超时后，改用独立临时配置目录的 Chrome 157.0.8103.51 无头模式，实际加载 core ESM 和 Axios 浏览器模块（仅映射包导入 URL），验证 Fetch/查询列表/实体身份/JSON 写入及 Axios Fetch 分支；两个重定向用例结束后服务端目标请求计数为 0。原始结果与测试服务保留在临时目录，服务已停止。未覆盖 Safari/Firefox/其他 Chromium 版本、完整应用集成或浏览器性能。已有实例的拦截器/defaults 仍为调用方信任边界。
- 未对外部真实服务、代理环境、所有 FormData/Blob 平台组合做集成验证；没有压测和容量结论。
- const 声明按操作目录推导能力、继承补丁和资源位置，保留关系与成员动作类型，实体引用保留原声明并恢复 data 模式。resource<TModel>(config) 的单模型泛型无法再自动推导剩余配置参数，因此能力/关系仍是动态配置；可选第二泛型支持精确配置。动态声明、静态预设展开超过 12 层及分页模式保留运行时校验，不宣称无限类型推断。
- 泛型不校验后端数据；普通数据对象只复制本地顶层数据字段，不承诺对第三方实例或任意响应树深冻结。对象访问器响应拒绝；配置 Proxy 陷阱不被沙箱化。
- 不合作 Transport 可能在取消等待后继续工作；服务端已发生副作用无法由客户端取消撤销。后台观测由调用方管理自身资源，不阻塞已完成业务结果。
- 本次历史验收只完成本地包消费验证，没有 registry 写操作。2026-11-16 已移除主包与扩展的 private，配置 public 发布访问级别，采用 MIT License，并在仓库及四个发布包中提供 LICENSE 文件；这些修正不代表已执行 registry 发布。

API 依据分别参考 Axios 官方请求配置文档和 Pinia 官方 Setup Store 文档；本仓库行为以自身契约及实际测试为准：[Axios 请求配置](https://github.com/axios/axios-docs/blob/master/posts/en/req_config.md)、[Pinia Store](https://pinia.vuejs.org/core-concepts.html)。

## 正确性与工程优化复查（2026-11-12）

修复原始 HttpRequest.signal 被忽略、result 为 undefined 时返回模式与类型不符、实体后续请求携带已完成查询/分页，以及 Date 等实例被改成空对象的问题。显式链状态继续继承，响应实体仅保留资源/身份/请求设置并恢复 data 模式；直接子资源链继承当前返回模式。引用终端方法不可被赋值替换；请求设置只从自有字段继承，原型 result/headers 不得改变返回模式或注入请求头。

补充能力/位置、预设 false、具名关系、成员动作、动态返回模式、实体关联及实际 tarball 类型正反例。模型类型仍不是后端验证。

统一验收命令为 pnpm check：工作区类型检查、59 项行为测试（53 核心 + 6 扩展）、格式检查、四个实际 tarball 离线消费、Chrome 9 项实际检查。单项 pnpm check:packages / pnpm check:browser 自行先构建；长期脚本和夹具位于 development，命令失败不会自动跳过项目。脚本在临时目录记录产物，结束时关闭本机 HTTP 服务并释放所拥有进程/计时器。

.github/workflows/check.yml 配置 Ubuntu 24.04、Node 22/24 矩阵执行 pnpm check；当前记录只证明本机 Node 24.9.0 的结果，未执行远端 GitHub Actions。Chrome 可用 CHROME_BIN 指定；CI 运行镜像的工具依据来自 [GitHub 官方镜像清单](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)，实际环境缺少 Chrome 时检查明确失败。

2026-11-12 最终 pnpm check 已通过：59 项行为测试、源码及包消费类型用例、格式检查、4 个实际 tarball 消费及 Chrome 9 项检查。完整本地输出位于 `/private/tmp/restmodel-package-check/optimization-check.log`。远端 CI 仍只完成配置，不计作已运行证据。

## 身份与数组边界复查（2026-11-13）

身份空字符串及点段 . / ..（含复合元组中的点段）在执行前拒绝，防止 URL 归一化改变资源目标；无效 Unicode 返回配置错误。身份与查询数组按自有数据描述符读取，不调用输入 map/迭代器，拒绝空洞或元素访问器；查询数值仅接受有限数字。服务根 baseURL=/ 已修复，非字符串 raw path 保留配置错误分类。数组模型类型保持数组，不附加运行时不存在的实体关联。

原触发条件及相邻消费者均已复查，pnpm check 退出码 0：62 项行为测试（56 core + 6 扩展）、类型与格式检查、4 个实际 tarball 消费及 Chrome 9 项检查通过。原始输出为 `/private/tmp/restmodel-package-check/boundary-check-2026-11-13.log`。未执行发布或远端 CI。
