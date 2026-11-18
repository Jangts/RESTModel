# @restmodel/pinia

公开资源调用的 Pinia 状态封装；peer 为 @restmodel/restmodel ^0.1.0、pinia ^4.1.0、vue ^3.5.45。本扩展 0.1.0 采用 [MIT License](LICENSE)；仓库执行 `pnpm install`、`pnpm build`。

## 安装

从 npm 安装 0.1.0（registry 发布状态见仓库发布记录）：

```sh
pnpm add @restmodel/restmodel@0.1.0 @restmodel/pinia@0.1.0 pinia vue
```

发布前可在仓库根目录执行 `pnpm install`、`pnpm build`，再在 `extensions/pinia` 执行 `pnpm pack --pack-destination /tmp/restmodel-pack`。在消费项目中用 `pnpm add /tmp/restmodel-pack/实际生成的文件名.tgz` 安装；扩展需同时安装主包 tarball 及上述第三方 peer 依赖。打包会先清理并重新构建本包的 dist。

## 使用

```ts
import { createPinia } from 'pinia';
import { createClient, resource } from '@restmodel/restmodel';
import { defineResourceStore } from '@restmodel/pinia';
const api = createClient({
  baseURL: 'https://example.test/api',
  resources: { users: resource({ operations: ['list'] }) },
});
const useUsers = defineResourceStore('users', (_: void, signal) => api.users.with({ signal }).list());
const store = useUsers(createPinia());
const release = store.subscribe();
try { await store.run(); console.log(store.data); } finally { release(); }
```

请求需要实际 REST 服务，data 是 ResourceList 或 undefined。应用内通常使用已安装到 Vue 的 Pinia 实例。公开状态为 data/error/pending，动作包括 run/cancel/subscribe。

run 采用最后一次调用生效：取消先前 signal，即使 loader 不合作，迟到结果/错误也不会覆盖新状态。run 的 Promise 仍由调用方等待或捕获，单次结果归对应调用方。cancel 清理当前状态但不清除既有 data。

subscribe 返回幂等 release；中间订阅者释放不取消共享请求，最后一个释放才取消。store.$dispose 停止作用域并取消请求，随后 run/subscribe 拒绝使用。组件卸载时应调用自己的 release，不因一个组件离开就销毁共享 Store。

不实现缓存、自动重试或任意业务 Store 访问，不改变 core 请求和授权边界。
