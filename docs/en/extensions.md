# Choosing extensions

Ordinary resource calls send real HTTP through built-in Fetch without executor configuration. Transport provides optional replacement of HTTP execution without coupling the core to a request library or state library. Extensions consume only the public `@restmodel/restmodel` entry.

| Need | Entry | Dependencies and boundaries |
| --- | --- | --- |
| Native Fetch | Default Fetch (fetchTransport is available for explicit reuse) | No configuration or extra runtime dependency |
| Reuse Axios | axiosTransport | Requires Axios; caller manages interceptors and defaults |
| Mock HTTP | withMock | Decorates Transport; matches final HTTP requests |
| Shared request state | defineResourceStore | Requires Pinia and Vue; lifecycle management, no caching |

The 0.1.0 extensions accept core ^0.1.0. Package READMEs describe npm installation once the registry release is available. Run `pnpm install` and `pnpm build` in the workspace. Outside it, install local tarballs and matching peers. See package READMEs and package.json for exact versions.

Native Fetch accepts an application Fetch. Both Fetch and Axios honor responseType/cache/keepalive and explicit credentials settings; see [Client and HTTP execution](client.md).

## Axios

Set transport to `axiosTransport(axios.create())`. The core classifies non-2xx responses as HTTP errors. Schemes still handle business envelopes and pagination. See [Axios usage](extensions/axios.md).

## HTTP Mock

`withMock(realTransport, rules)` matches final method, URL, headers and encoded body in declaration order. Unmatched requests fail by default; real network access requires explicit passthrough. Mocks do not verify actual services or CORS. See [HTTP Mock usage](extensions/mock.md).

## Pinia

Connect a resource call through a loader and pass signal to `.with({ signal })`. Stores expose data/error/pending. The latest run wins. Each component releases its own subscription; only the last release cancels the shared request. There is no automatic retry or caching. See [Pinia usage](extensions/pinia.md).

## Custom transports

Transport receives a prepared, encoded HttpRequest and returns status, headers and body, including for non-2xx responses so the core can classify them. Listen to signal, release resources and do not follow redirects automatically. See [client and HTTP execution](client.md).
