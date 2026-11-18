# @restmodel/axios

将 Axios 接到 RESTModel 的公开 HTTP 契约。Node.js 22+；peer 为 @restmodel/restmodel ^0.1.0 与 axios ^1.21.1。本扩展 0.1.0 采用 [MIT License](LICENSE)。仓库执行 `pnpm install`、`pnpm build`；本地 tarball 消费时同时安装 @restmodel/restmodel 和 Axios。

## 安装

从 npm 安装 0.1.0（registry 发布状态见仓库发布记录）：

```sh
pnpm add @restmodel/restmodel@0.1.0 @restmodel/axios@0.1.0 axios
```

发布前可在仓库根目录执行 `pnpm install`、`pnpm build`，再在 `extensions/axios` 执行 `pnpm pack --pack-destination /tmp/restmodel-pack`。在消费项目中用 `pnpm add /tmp/restmodel-pack/实际生成的文件名.tgz` 安装；扩展需同时安装主包 tarball 及上述第三方 peer 依赖。打包会先清理并重新构建本包的 dist。

## 使用

```ts
import axios from 'axios';
import { createClient, resource } from '@restmodel/restmodel';
import { axiosTransport } from '@restmodel/axios';
const api = createClient({
  baseURL: 'https://example.test/api',
  transport: axiosTransport(axios.create()),
  resources: { users: resource({ operations: ['list'] }) },
});
const result = await api.users.list(); // 实际后端数组响应转成 ResourceList
```

可省略实例，由扩展创建隔离实例。非 2xx 返回正常 HttpResponse，由 core 统一分类；网络错误保留 cause。信封、鉴权准备、取消预算和资源推导仍归 core。执行器禁用自动重定向，避免默认跨 origin 转发凭据。

## 执行与实例复用合同

RESTModel 负责最终 URL。扩展逐请求设置 baseURL 为空，避免实例默认 `/api` 与最终 `/api/users` 叠加；不修改 instance.defaults。绝对地址和浏览器根相对地址都沿用主包已组装结果，Node 网络调用仍需绝对 HTTP(S) 地址。

扩展设置 validateStatus 接受所有状态、普通响应以文本读取、transformResponse 为空，再用主包解码器按 HttpRequest.responseType 处理 JSON/文本并保留真实响应头。responseType 为 auto/json/text 时，Axios 成功响应拦截器先看到文本；none 使用 Fetch 的流式响应，成功时取消未使用正文，失败时继续读取诊断。cache、keepalive 与显式凭据策略通过 Fetch adapter 传递，only-if-cached 限定同源；非 2xx 不进入 Axios 失败拦截器，而由 core 分类为 http。鉴权清理等统一错误接入使用 createClient.onError。实例网络/超时/取消失败仍经过 Axios 失败分支；ECONNABORTED/ETIMEDOUT 归为 timeout，Axios 取消归为 cancel。

Node 在未指定 credentials/cache/keepalive 且 responseType 非 none 时沿用实例适配器，默认 HTTP 适配器通过 maxRedirects: 0 禁用跳转。浏览器始终使用 Fetch 适配器；显式指定 omit/same-origin/include 时 Node 也使用 Fetch，精确映射到 Request.credentials，并设置 manual redirect。显式策略覆盖实例 withCredentials，未指定则沿用实例默认。Node 不会因此获得浏览器 Cookie 仓库。

实例 defaults/interceptors 属于调用方信任边界，请求拦截器仍可改写设置，响应拦截器也可能改变返回形状；复用实例不代表任意既有拦截器都兼容。主包不泄漏 Axios 配置类型，不复制拦截器内部列表。
