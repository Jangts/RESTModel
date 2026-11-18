# @restmodel/mock

An HTTP debugging extension decorating public Transports. Requires @restmodel/restmodel ^0.1.0. Version 0.1.0 uses the [MIT License](../../../extensions/mock/LICENSE).

## Installation

Install 0.1.0 from npm once the registry release is available:

```sh
pnpm add @restmodel/restmodel@0.1.0 @restmodel/mock@0.1.0
```

Before publication, run `pnpm install` and `pnpm build` at the repository root, then run `pnpm pack --pack-destination /tmp/restmodel-pack` in `extensions/mock`. In the consuming project, install the actual generated tarball with `pnpm add /tmp/restmodel-pack/<filename>.tgz`, together with the main package tarball. This extension has no third-party peers. Packing cleans and rebuilds the current package's dist directory.

## Usage

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
const users = await api.users.list();
```

Rules are checked in order, with the first match winning. They receive final method/url/headers/encoded body; authentication preparation and scheme handling are not bypassed. respond may be asynchronous. Throwing simulates a network failure with no response; non-2xx responses become core HTTP errors. Delays support cancellation and clean up listeners/timers.

Unmatched requests throw by default. Only `{ unmatched: 'passthrough' }` as the third argument forwards to the real transport and may cause real network effects. Rule functions are trusted code, not a security sandbox. Mocks do not establish real service behavior or browser network performance.
