---
layout: home
hero:
  name: RESTModel
  text: 把接口，组织成资源。
  tagline: 以声明约束能力，以资源连接关系，以链式调用表达请求。
  image:
    src: /branding/restmodel-logo.svg
    alt: RESTModel
  actions:
    - theme: brand
      text: 开始使用
      link: /guide/getting-started
    - theme: alt
      text: 浏览 API
      link: /api/restmodel
features:
  - title: 从资源出发
    details: 显式声明集合、成员、单体和关系，沿着业务结构调用接口。
  - title: 能力由你声明
    details: 操作白名单、可复用预设和特殊动作，将允许的调用写进契约。
  - title: 适配服务约定
    details: 用 scheme 统一身份、响应信封和分页规则，跨资源复用。
  - title: 执行器自由组合
    details: 内置 Fetch，按需接入 Axios、HTTP Mock 和 Pinia，核心保持独立。
---

## 一次声明，自然调用

```ts
import { createClient, resource } from '@restmodel/restmodel';

const api = createClient({
  baseURL: 'https://example.test/api',
  resources: { users: resource({ operations: ['list', 'get', 'patch'] }) },
});

const users = await api.users.page(1, 20).list();
const user = await api.users(0).get();
await api.users(0).patch({ name: 'Ivan' });
```

示例需实际 REST 服务。主包与扩展面向公共发布，目前使用工作区或本地 tarball；[快速上手](/guide/getting-started)说明如何连接真实 REST 服务。
