# @restmodel/mock

装饰公开 Transport 的 HTTP 调试扩展，peer 为 @restmodel/restmodel ^0.0.0。本扩展面向公共发布，尚未发布，采用 [MIT License](LICENSE)；仓库根执行 `pnpm install`、`pnpm build`。


## 安装

正式发布后，可从 npm 安装（当前尚未发布）：

```sh
pnpm add @restmodel/restmodel @restmodel/mock
```

发布前可在仓库根目录执行 `pnpm install`、`pnpm build`，再在 `extensions/mock` 执行 `pnpm pack --pack-destination /tmp/restmodel-pack`。在消费项目中用 `pnpm add /tmp/restmodel-pack/实际生成的文件名.tgz` 安装；扩展需同时安装主包 tarball 及上述第三方 peer 依赖。打包会先清理并重新构建本包的 dist。

## 使用

```ts
import { createClient, resource, fetchTransport } from '@restmodel/restmodel';
import { withMock } from '@restmodel/mock';
const api = createClient({
  baseURL: '/api',
  transport: withMock(fetchTransport(), [{
    match: request => request.method === 'GET' && request.url === '/api/users',
    respond: () => ({ status: 200, headers: {}, body: [{ id: 0 }] }),
    delay: 10,
  }]),
  resources: { users: resource({ operations: ['list'] }) },
});
const users = await api.users.list(); // ResourceList，首项 id 为 0
```

规则按顺序首次匹配，接收最终 method/url/headers/编码 body；鉴权准备和 scheme 不被绕过。respond 可异步，抛错表示模拟无响应网络失败；返回非 2xx 由 core 分类 HTTP 错误。delay 可取消，清理 timer 和监听。

未命中默认报错；第三参数 `{ unmatched: 'passthrough' }` 才转发到真实执行器，可能产生真实网络副作用。规则函数是受信任代码，不是安全沙箱。Mock 不能证明真实服务或浏览器网络性能。
