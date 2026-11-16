# @restmodel/axios

Connect Axios to the public RESTModel HTTP contract. Requires Node.js 22+, @restmodel/restmodel ^0.0.0 and axios ^1.21.1. This extension targets public distribution but has not been published yet. It uses the [MIT License](../../../extensions/axios/LICENSE).

## Installation

After publication, install from npm (the packages are not published yet):

```sh
pnpm add @restmodel/restmodel @restmodel/axios axios
```

Before publication, run `pnpm install` and `pnpm build` at the repository root, then run `pnpm pack --pack-destination /tmp/restmodel-pack` in `extensions/axios`. In the consuming project, install the actual generated tarball with `pnpm add /tmp/restmodel-pack/<filename>.tgz`, together with the main package tarball and the third-party peers listed above. Packing cleans and rebuilds the current package's dist directory.

## Usage

```ts
import axios from 'axios';
import { createClient, resource } from '@restmodel/restmodel';
import { axiosTransport } from '@restmodel/axios';
const api = createClient({
  baseURL: 'https://example.test/api',
  transport: axiosTransport(axios.create()),
  resources: { users: resource({ operations: ['list'] }) },
});
const result = await api.users.list();
```

The example needs a real backend returning an array; the response becomes a ResourceList. The Axios instance is optional: omitting it creates an isolated instance. Non-2xx responses remain HttpResponse values for core classification. Network errors retain cause. Envelopes, authentication preparation, cancellation budgets and resource derivation stay in the core. Automatic redirects are disabled to prevent forwarding credentials across origins by default.

Existing instance defaults/interceptors are a caller-controlled trust boundary and can rewrite requests. Review actual network behavior. Axios types are not used as the core's public types. Browsers use Axios's Fetch adapter with manual redirects. Validation covers Node's HTTP adapter and the browser Fetch branch in isolated Chrome 157, not every browser or caller-defined interceptor.
