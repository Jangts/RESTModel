# 扩展选型

普通资源调用默认通过内置 Fetch 发送真实 HTTP，无需配置执行器。需要更换 HTTP 实现时，核心通过 Transport 接口接入扩展，不依赖具体请求库或状态库。扩展只消费 `@restmodel/restmodel` 公共入口。

| 需求 | 入口 | 依赖与边界 |
| --- | --- | --- |
| 原生 Fetch | 默认 Fetch（fetchTransport 可显式复用） | 无需配置，无额外运行依赖 |
| 复用 Axios | axios 的 axiosTransport | 需要 Axios；拦截器与 defaults 由调用方管理 |
| 模拟 HTTP | mock 的 withMock | 装饰 Transport，按最终 HTTP 请求匹配 |
| 共享请求状态 | pinia 的 defineResourceStore | 需要 Pinia、Vue；管理请求生命周期，不提供缓存 |

各扩展均面向公共发布，目前尚未发布。工作区先执行 `pnpm install`、`pnpm build`；仓库外消费使用本地 tarball 并同时安装对应 peer，具体版本以各扩展 README 和 package.json 为准。

## Axios

将客户端的 transport 设为 `axiosTransport(axios.create())`。非 2xx 响应由核心统一分类为 HTTP 错误，业务信封和分页仍由 scheme 处理。[Axios 用法](../extensions/axios/README.md)。

## HTTP Mock

`withMock(realTransport, rules)` 根据最终 method、url、headers 和已编码 body 按顺序匹配。默认未命中报错；只有显式开启 passthrough 才访问真实网络。Mock 不验证实际服务或 CORS。[HTTP Mock 用法](../extensions/mock/README.md)。

## Pinia

通过 loader 连接资源调用，将 signal 传给 `.with({ signal })`。Store 暴露 data/error/pending；run 采用最后一次调用生效，组件释放自己的订阅，最后一个订阅释放才取消共享请求。没有自动重试或缓存。[Pinia 用法](../extensions/pinia/README.md)。

## 自定义执行器

Transport 接收准备和编码完成的 HttpRequest，返回 status、headers、body。非 2xx 也返回响应，让 core 分类。执行器应监听 signal 并释放自己的资源，不自动跟随重定向。更多约束见[客户端与 HTTP 执行](client.md)。
