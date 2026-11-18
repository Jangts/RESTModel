# @restmodel/pinia

Pinia state management for public resource calls. Requires @restmodel/restmodel ^0.1.0, pinia ^4.1.0 and vue ^3.5.45. Version 0.1.0 uses the [MIT License](../../../extensions/pinia/LICENSE).

## Installation

Install 0.1.0 from npm once the registry release is available:

```sh
pnpm add @restmodel/restmodel@0.1.0 @restmodel/pinia@0.1.0 pinia vue
```

Before publication, run `pnpm install` and `pnpm build` at the repository root, then run `pnpm pack --pack-destination /tmp/restmodel-pack` in `extensions/pinia`. In the consuming project, install the actual generated tarball with `pnpm add /tmp/restmodel-pack/<filename>.tgz`, together with the main package tarball and the third-party peers listed above. Packing cleans and rebuilds the current package's dist directory.

## Usage

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

Requests need a real REST service. data is ResourceList or undefined. Applications normally use the Pinia instance installed in Vue. Public state is data/error/pending, with run/cancel/subscribe actions.

The latest run wins: a prior signal is cancelled and late results or errors cannot overwrite new state, even if the loader ignores cancellation. Callers still await or catch each run Promise. Each call gets its own result. cancel clears current state without discarding previous data.

subscribe returns an idempotent release function. Releasing one of several subscribers does not cancel the shared request; releasing the last one does. store.$dispose stops the scope and cancels requests. Later run/subscribe calls are rejected. Components should call their own release on unmount, not destroy a shared store when one component leaves.

This extension does not implement caching, automatic retries or arbitrary business-store access. It preserves the core's request and authorization boundaries.
