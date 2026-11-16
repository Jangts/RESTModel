# @restmodel/axios

将 Axios 接到 RESTModel 的公开 HTTP 契约。Node.js 22+；peer 为 @restmodel/restmodel ^0.0.0 与 axios ^1.21.1。本扩展面向公共发布，尚未公开发布，采用 [MIT License](LICENSE)。仓库执行 `pnpm install`、`pnpm build`；本地 tarball 消费时同时安装 @restmodel/restmodel 和 Axios。


## 安装

正式发布后，可从 npm 安装（当前尚未发布）：

```sh
pnpm add @restmodel/restmodel @restmodel/axios axios
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

已有 Axios 实例的 defaults/interceptors 属于调用方信任边界；它们可能改写请求，应由调用方核对最终网络行为。本扩展不使用其内部配置作为 core 公共类型。浏览器分支强制使用 Axios Fetch 适配器并设置 manual redirect；实际验收覆盖 Node HTTP 适配器及隔离 Chrome 157 的浏览器 Fetch 适配器，不代表所有浏览器或调用方自定义拦截器均已验证。
