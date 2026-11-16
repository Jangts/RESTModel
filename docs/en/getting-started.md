# Getting started

RESTModel is a model-based client for HTTP RESTful APIs. Resource declarations derive real HTTP paths and methods for collections, members and operations. Built-in Fetch is the default; no executor configuration is required.

## Environment and installation

Use Node.js 22+ and pnpm 8.10.5. Browsers need Fetch, AbortController and FormData. The main package and three extensions target public distribution but have not been published yet. For now, run these commands at the repository root:

```sh
pnpm install
pnpm build
```

Workspace packages reference `@restmodel/restmodel` through `workspace:*`. Outside the repository, run `pnpm pack --pack-destination /tmp/restmodel-pack` in `packages/restmodel`, then install the actual generated tarball using `pnpm add /tmp/restmodel-pack/<filename>.tgz` in the consuming project. Extensions also need the main package tarball and their peers. pnpm converts workspace dependency ranges and cleans and rebuilds the current package's dist directory before packing.

## Connect a REST service

Suppose your service exposes the `/api/users` collection and `/api/users/:id` members. Replace baseURL below with your actual service address. Browsers can use `/api` for a same-origin service; Node requires an absolute HTTP(S) address. Cross-origin services must configure CORS.

```ts
import { createClient, resource } from '@restmodel/restmodel';

interface User { id: number; name: string }

const api = createClient({
  baseURL: 'https://example.test/api',
  resources: {
    users: resource<User>({ operations: ['list', 'get', 'post', 'patch'] }),
  },
});

const users = await api.users.list();          // GET /api/users
const user = await api.users(0).get();         // GET /api/users/0
await api.users.post({ name: 'Ivan' });        // POST /api/users with a JSON body
await api.users(0).patch({ name: 'Updated' }); // PATCH /api/users/0 with a JSON body
```

These calls send real HTTP requests through Fetch and require corresponding backend endpoints. The client does not create a server, generate data or implement server-side business logic.

## Response data and service conventions

By default, list endpoints return a JSON array such as `[{ "id": 0, "name": "Ivan" }]`; member endpoints return a record such as `{ "id": 0, "name": "Ivan" }`. list returns a ResourceList with records in `users.items`. total is known only when the service explicitly provides it; the current array length is not treated as the total count.

The default identity field is id, and 0 is valid. Model generics provide TypeScript hints without validating response data. If a service uses response envelopes, another identity field or different pagination conventions, adapt them once with [service schemes](client.md#service-rules) instead of reimplementing request execution.

## Queries and pagination

```ts
await api.users.query({ active: true }).page(1, 20).list();
// GET /api/users?active=true&page=1&size=20
```

query/page/cursor/with return new references without changing existing branches. Editing local entity fields never sends a request automatically. RESTModel does not retry writes automatically or provide built-in caching.

## Next steps

- [Operation declarations](operations.md): allowlists, wildcards, presets and overrides. Undeclared operations cannot be called.
- [Client reference](client.md): service rules, relations, actions, cancellation, timeouts and errors.
- [Action path parameters](client.md#action-path-parameters): multiple business inputs and path placeholders, with remaining query/body fields.
- [Extensions](extensions.md): optional Axios integration, HTTP debugging and mocking, and Pinia request state.

Ordinary RESTful APIs can use default Fetch directly. Configure transport only to replace the HTTP executor. Custom Transports and mocks are extension features, not prerequisites for creating a client.
