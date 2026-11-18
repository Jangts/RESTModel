# @restmodel/axios

Connect Axios to the public RESTModel HTTP contract. Requires Node.js 22+, @restmodel/restmodel ^0.1.0 and axios ^1.21.1. Version 0.1.0 uses the [MIT License](../../../extensions/axios/LICENSE).

## Installation

Install 0.1.0 from npm once the registry release is available:

```sh
pnpm add @restmodel/restmodel@0.1.0 @restmodel/axios@0.1.0 axios
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

## Execution and instance reuse contract

RESTModel owns the final URL. The extension sets baseURL to an empty string per request so an instance default of `/api` cannot prefix `/api/users` again. instance.defaults is unchanged. Absolute URLs and browser root-relative paths retain the core's assembled result; Node network calls still require absolute HTTP(S) URLs.

The extension accepts every status through validateStatus, disables transformResponse and uses the core decoder according to HttpRequest.responseType while preserving actual response headers. Axios success interceptors initially receive text for auto/json/text; none uses Fetch streaming, cancels unused successful bodies and still reads error bodies for diagnostics. Explicit cache/keepalive/credentials policies select the Fetch adapter; only-if-cached also requires same-origin mode. Non-2xx responses do not enter Axios failure interceptors; the core classifies them as http. Use createClient.onError for shared failure handling such as authentication cleanup. Network/timeout/cancellation failures still pass through Axios failure interceptors. ECONNABORTED/ETIMEDOUT become timeout and Axios cancellation becomes cancel.

Without explicit credentials/cache/keepalive settings or responseType none, Node retains the instance adapter; the default HTTP adapter disables redirects with maxRedirects: 0. Browsers always use the Fetch adapter. Explicit omit/same-origin/include also selects Fetch in Node, maps exactly to Request.credentials and uses manual redirects. Explicit policies override instance withCredentials; an omitted policy retains instance defaults. This does not create a browser cookie store in Node.

Instance defaults/interceptors remain caller-controlled. Request interceptors may rewrite settings and response interceptors may change the response shape. Reusing an instance does not make arbitrary existing interceptors compatible. The core exposes no Axios configuration types and the extension does not copy internal interceptor lists.
