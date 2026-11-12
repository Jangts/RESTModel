# @restmodel/mock

装饰公开 Transport 的 HTTP 调试扩展，peer 为 @restmodel/core ^0.0.0。当前 private 开发包，尚未发布或指定公开分发许可；仓库根执行 `pnpm install`、`pnpm build`。

```ts
import { createClient, resource, fetchTransport } from '@restmodel/core';
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
