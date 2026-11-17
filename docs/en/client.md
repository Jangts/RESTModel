# Client and HTTP execution

This reference describes the current implementation. See [operation declarations](operations.md) for capabilities and presets. Import all core entries from `@restmodel/restmodel`. Model types do not establish runtime response validity.

## Minimal usage

```ts
import { createClient, resource } from '@restmodel/restmodel';
interface User { id: number; name: string }
const api = createClient({
  baseURL: 'https://example.test/api/v1',
  resources: { users: resource({ operations: ['list', 'get', 'post', 'patch'] }).typed<User>() },
});
const users = await api.users.list();
const user = await api.users(0).get();
await api.users.post({ name: 'Ivan' });
await api.users(0).patch({ name: 'New name' });
```

Supply an accessible REST service. Node requires version 22 or later; browsers need modern Fetch, AbortController and FormData APIs. Browsers resolve relative `/api` addresses; use absolute HTTP(S) addresses for Node network execution.

list/post target collections; get/put/patch/delete target members or singletons. Unsupported operations and invalid positions are rejected before authentication preparation or Transport execution. Binding an identity returns a new reference; 0 is valid. Composite identities are ordered tuples, with each segment encoded separately, so `/` inside an identity does not create a path level. Empty strings, dot segments, empty or sparse tuples and invalid Unicode are rejected before requests to prevent URL normalization from changing the target. Identity arrays do not invoke custom map methods, iterators or element accessors. A singleton cannot bind another identity.

The client sends real HTTP through built-in Fetch by default; transport is optional. Set it explicitly to reuse an HTTP executor such as Axios. Custom transports receive final HTTP requests and do not derive resource operations. The lower-level executeHttp API still requires an explicit executor.

## Branches and request settings

```ts
const active = api.users.query({ active: true });
await Promise.all([active.page(1, 20).list(), active.page(2, 20).list()]);
const result = await api.users(0)
  .with({ headers: { 'X-Trace': 'example' }, timeout: 5000, result: 'response' })
  .get();
console.log(result.data, result.response.status);
```

query/page/cursor/with return new contexts. Later query keys replace earlier values. Arrays replace as a whole and encode as repeated keys; undefined deletes a key and null encodes as an empty string. URLSearchParams explicitly supports repeated keys. Numbers must be finite. Arrays must be dense and contain only own data elements; empty arrays remove the key, while accessors and holes cause configuration errors. Pages start at 1 and size must be a positive integer. The default fields are page/size, added only by explicit pagination calls. Generated pagination fields override matching query keys regardless of call order.

Header names become lowercase; undefined removes a header. Plain JSON bodies are encoded when execution starts. FormData, Blob and ArrayBuffer retain their instances and are not deeply frozen; keep them stable until completion. The platform supplies FormData boundaries.

with accepts only headers/signal/timeout/result/credentials, not arbitrary scheme changes. The default result mode is data. Missing or explicitly undefined result inherits the previous mode; explicit data switches back. When a broad RequestOptions variable cannot determine the mode statically, the return type is a union. Response mode returns `{ data, response }`, with data using the same adaptation and modeling pipeline.

credentials accepts omit/same-origin/include through client defaults, reference with, or raw HTTP options. Missing and undefined values inherit. Built-in Fetch otherwise retains the platform default, same-origin. omit excludes browser cookies and other implicit credentials; it does not remove an explicit Authorization header. Node has no automatic browser cookie store, and the policy does not bypass CORS. Custom Transports should honor HttpRequest.credentials. See the Axios reference for its mapping.

```ts
const external = createClient({
  baseURL: 'https://example.test/weather', resources: {},
  defaults: { credentials: 'omit', timeout: 5000 },
});
await external.$.request({ method: 'GET', path: 'forecast', query: { lat: 30, lon: 114 } });
```

## Service rules

```ts
import { defineScheme } from '@restmodel/restmodel';
const scheme = defineScheme({
  identity: 'userId',
  envelope: 'data',
  success: body => typeof body === 'object' && body !== null && 'code' in body && body.code === 0,
  pagination: { mode: 'page', parameter: 'pageIndex', size: 'pageSize', base: 1, items: 'content', total: 'totalCount' },
});
```

Precedence is defaults → client → ancestor resources → current resource → current operation. identity defaults to id; false disables inference. Missing or false envelope uses the bare body. success must synchronously return a boolean; false disables inherited checks. map synchronously transforms unwrapped data; false disables it. Pagination field paths are relative to unwrapped data. Other paths follow only own data fields and never execute getters.

Known fields override; undefined inherits. Functions replace earlier functions; pagination replaces as a whole; false disables a rule. Pagination supports page/offset/cursor, with default request parameters page/offset/cursor and size fields size/limit/limit. base applies only to page mode. Cursor mode requires `.cursor(token, size)`; page and offset modes use `.page(number, size)`. Missing total/next remains unknown; field names such as rows/content are not guessed.

Operation configuration can use `{ method: 'PUT', scheme: { envelope: false } }` to adapt an existing capability, not add an operation. Promises returned from synchronous adapters are rejected instead of being treated as business data.

## Iterating pages

```ts
import { iteratePages } from '@restmodel/restmodel';
const controller = new AbortController();
for await (const page of iteratePages(api.users.with({ signal: controller.signal }), {
  size: 100, maxPages: 200,
})) {
  console.log(page.items);
  // break does not prefetch; controller.abort() cancels the current or next request.
}
```

This excerpt uses api from above. iteratePages accepts a data-mode page/offset resource reference and retains its query and request settings. Cursor and response modes are unsupported. The lazy async iterator neither collects, caches nor prefetches data; ordinary list calls are unaffected. size/start/maxPages default to 100/1/1000 and must be positive safe integers. Each received ResourceList is yielded, including the last empty page; status 204 or no content ends iteration directly.

An empty page ends iteration. When starting at page one, reaching the currently known total also ends it. Unknown totals or start greater than one require an empty page. Short pages do not imply completion because servers may cap page size. Exhausting maxPages before completion throws ResourceConfigurationError rather than silently truncating results. Request failures propagate. Changing datasets have no snapshot consistency or deduplication guarantee.

## Exceptions to standard operation routes

Choose the configuration by the operation semantics and its identity mapping:

| Scenario | Configuration | Call |
| --- | --- | --- |
| Standard RESTful endpoint | Standard operation names | `api.users(id).get()` |
| Standard operation with one identity-route exception | Operation override with queryKey or one `:id` | `api.users(id).get()` |
| Multiple business inputs or additional behavior | actions/memberActions with an independent path | `api.users.lookup(input)` or `api.users(id).approve(input)` |

The single-identity rule concerns operation-route overrides; it does not limit ordinary list filters or model body fields. For multi-parameter exceptions, use an action rather than adding more standard-operation placeholders.

If only one operation uses a different HTTP address, keep it a standard operation rather than turning it into an action:

```ts
import { createClient, resource, action } from '@restmodel/restmodel';
const api = createClient({
  baseURL: '/api',
  resources: {
    users: resource({
      operations: [
        'list', 'put', 'post',
        { operation: 'get', path: 'getById', queryKey: 'id' },
      ],
      actions: { search: action({ method: 'GET', path: 'get' }) },
    }),
  },
});
await api.users(123).get();              // GET /api/users/getById?id=123
await api.users.search({ name: 'Ivan' }); // GET /api/users/get?name=Ivan
```

Replacing the get entry with `{ operation: 'get', path: 'getById/:id' }` makes the same call request `/api/users/getById/123`. list, put and post retain standard RESTful paths. Identity 0 is valid. Identities are encoded as path segments or query values, never interpolated as raw URL text. get retains scheme adaptation and entity wrapping; later entity operations use logical resource identity. See [operation declarations](operations.md#operation-paths-and-identity-mapping).

## Relations, lists and entities

Resource children declare child resources of the current collection or singleton. members declare child resources of collection members. Singletons reject members/memberActions. Resource keys provide default paths; a relative path overrides them. All relations must be declared explicitly.

```ts
import { resourceOf, dataOf } from '@restmodel/restmodel';
const related = createClient({
  baseURL: 'https://example.test/api',
  resources: {
    users: resource({ operations: '*', members: {
      profile: resource({ kind: 'singleton', operations: ['get'] }).typed<User>(),
    } }).typed<User>(),
  },
});
const user = await related.users(0).get();
if (user) {
  await resourceOf(user).$.child('profile').get();
  console.log(dataOf(user));
}
```

list returns ResourceList: items is a normal array, the result is iterable, total is a number or undefined, and page contains only known request and next-page information. A bare array's length is not presented as total. Non-array list data or invalid metadata raises response-shape.

Object results are local snapshot proxies. Object.keys, spread and JSON reflect the data; metadata lives in a WeakMap. Data fields take precedence. Declared, nonconflicting relations can be accessed as properties at runtime. Use `$.child(name)` or `resourceOf(entity)` as stable TypeScript entries. Inferred const declarations retain named relations and action input/output while filtering terminal methods by capabilities, preset patches and collection/member/singleton position. Dynamic configuration is still validated at runtime. Use `resource(config).typed<TModel>()` to retain both model and exact configuration types. typed returns the same frozen declaration without copying it or sending requests. `resource<TModel>(config)` remains supported, but capabilities and relations use dynamic types because of TypeScript partial generic inference limits; supplying the second type parameter is another option. Pagination modes remain runtime-validated; dynamic relation models are unknown. Generics do not make backend data trustworthy.

For get, identity in the requested address takes precedence. Collection records and post results infer identity using the scheme. Data without identity stays readable, but later identity-dependent operations raise identity instead of creating an undefined path. Entity references clear the original query/page/cursor and restore data result mode while keeping headers/signal/timeout/credentials and resource rules. Add queries again when needed. Binding an identity or accessing children on explicit references preserves explicit chain state; children also inherit result mode. Editing local fields does not send requests; entities are not globally merged. Arrays and non-plain objects such as Date, Map and Blob are returned unchanged without entity metadata; resourceOf raises response-shape for them. Scalars/null are not disguised as objects. Status 204/205 and empty bodies return undefined without an extra GET.

## Actions and raw HTTP

```ts
import { action } from '@restmodel/restmodel';
const service = createClient({
  baseURL: 'https://example.test/api', resources: {},
  actions: { login: action<{ name: string }, { token: string }>({ method: 'POST', path: '/auth/login' }) },
});
const token = await service.login({ name: 'Ivan' });
const response = await service.$.request({ method: 'GET', path: '/health' });
```

actions belong to the current collection or singleton; memberActions belong to collection members. Call them directly by declaration name: `api.users.search(input)`, `api.users(id).approve(input)`, or `api.login(input)` for service-root actions. There is no second action entry. method is required; path defaults to the declaration name. GET/DELETE/HEAD/OPTIONS place input in the query by default; other methods use the body. Override this with input. Actions share success checks and envelope rules but do not wrap lists or entities by default and are never part of the standard wildcard. Declaration names are call names; path is the independent backend path, so search may use a get path. Call names cannot shadow standard operations, query/page/cursor/with, JavaScript reserved properties or relations at the same position. Conflicts are rejected during configuration; rename the action without changing the backend path.

Raw HTTP shares preparation, encoding and execution but returns HttpResponse without resource envelope adaptation. A leading `/` resolves from the service baseURL path root, preserving /api. Cross-service absolute URLs, protocol-relative URLs, dot segments and path escapes are prohibited. Resources and actions reserve `$`, then, __proto__, prototype and constructor. Use `$.child(name)` for declared relations conflicting with control names and `api.$.resource(name)` for dynamic root resources.

## Action path parameters

Actions can extract multiple named path parameters from their input object using `:name`. Remaining fields follow the method's default query/body rule or the explicit input setting:

```ts
import { createClient, resource, action } from '@restmodel/restmodel';
const api = createClient({
  baseURL: '/api',
  resources: {
    users: resource({
      actions: {
        lookup: action({ method: 'GET', path: 'getById/:tenantId/:id' }),
        approve: action({ method: 'POST', path: ':id/approve' }),
      },
    }),
  },
});
await api.users.lookup({ tenantId: 7, id: 123, detail: true });
// GET /api/users/getById/7/123?detail=true
await api.users.approve({ id: 123, reason: 'Approved' });
// POST /api/users/123/approve, JSON body: { reason: 'Approved' }
```

Placeholders must occupy complete path segments. Names start with a letter or underscore, followed by letters, digits or underscores. A field may appear more than once in a path. Values must be nonempty strings or finite numbers; 0 is valid. Values are encoded as individual segments, so `a/b` becomes `a%2Fb` instead of extra path levels. Missing values, null, arrays, objects, empty strings, dot segments and invalid Unicode are rejected before prepareRequest or Transport runs.

Templated actions read only own data fields of a plain input object, never inherited fields or getters, and do not mutate the object. Consumed fields are removed from the action input and are not repeated in query/body. Explicit fields from a chained query remain intact. When all input fields are consumed, no empty body is added. Actions without placeholders retain existing input contracts, including URLSearchParams for query and FormData/Blob bodies.

Paths are relative to the current reference. A leading `/` resolves from the service baseURL path root. Member actions still include their bound member identity; that identity does not automatically supply input placeholders. Placeholder fields always come from the current action input. There is no input: 'path' mode, because a request may contain path parameters and query/body fields together.

Without explicit input generics, literal paths infer required parameter fields. If declaring input generics explicitly, include both path fields and remaining business fields in the input type. Dynamic string paths are checked at runtime. Standard operation `:id`/queryKey overrides still map only one bound identity; use actions for multiple business parameters.

## Execution, errors and extensions

Transport receives an encoded HttpRequest and returns HttpResponse containing status/headers/body. Non-2xx responses are returned normally; the core classifies them as http errors. Network, cancellation and timeout failures have distinct kinds. Custom transports must listen to signal, release their resources and avoid automatic redirects. Fetch/Axios transports do not follow redirects. Callers remain responsible for other host SSRF rules.

Standard resource operations, actions, raw HTTP and executeHttp share this order: preparation → Transport → HTTP status validation → foreground response processing → business adaptation and modeling (skipped for raw HTTP) → successful background observation. Failures enter onError and still reject the original request; there is no automatic recovery or retry.

| Setting | Arguments and waiting behavior |
| --- | --- |
| prepareRequest | `(request, context)`, once per request; may asynchronously return a prepared request. Inject headers before the final snapshot, preserving URL/method. The core controls the effective signal. |
| processResponse | `(response, context)`, only for 2xx; awaited before data delivery. Use for foreground work such as registering file URLs. Its return value is ignored; transform data with scheme.map. |
| onError | `(error, context)`, once for execution, HTTP, foreground processing or business adaptation failure. Normally awaited; handler failures are isolated and retain the primary error without recursive notification. |
| observeResponse | `(response)`, after all adaptation succeeds, in the background; not awaited, failures isolated, no repeated requests. Suitable for telemetry. |

Existing one-argument prepareRequest functions remain valid. processResponse failures use kind process and retain cause. onError cannot turn a failure into success. Invalid declarations, missing path parameters, encoding failures and unsupported operations happen before an execution context exists and do not enter these hooks.

A fresh RequestContext is shared by the three foreground hooks for each execution. request points to the current prepared value or final snapshot; signal is the effective cancellation signal; state is a `Map<symbol, unknown>`. Store request-time application snapshots under application-owned Symbols instead of attaching them to requests. The context is never sent to Transport. Default JSON/Node inspection hides its fields and state is cleared on completion. The application owns any additional references and must avoid explicitly logging credentials.

This excerpt receives session readers, cleanup and file registration from the application; the library does not choose authentication policy:

```ts
import { createClient, resource, RequestError } from '@restmodel/restmodel';
type Session = { userId: string | null; token: string | null };
function createService(
  readSession: () => Session,
  clearSession: () => void,
  acceptFiles: (body: unknown, signal: AbortSignal) => Promise<void>,
) {
  const sessionKey = Symbol('request-session');
  return createClient({
    baseURL: '/api', resources: { users: resource({ operations: ['list', 'get'] }) },
    prepareRequest(request, context) {
      const snapshot = { ...readSession() };
      context.state.set(sessionKey, snapshot);
      return { ...request, headers: {
        ...request.headers,
        ...(snapshot.token ? { authorization: `Bearer ${snapshot.token}` } : {}),
      } };
    },
    processResponse: (response, context) => acceptFiles(response.body, context.signal),
    onError(error, context) {
      if (!(error instanceof RequestError) || error.response?.status !== 401) return;
      const snapshot = context.state.get(sessionKey);
      const current = readSession();
      if (snapshot && typeof snapshot === 'object' && 'userId' in snapshot && 'token' in snapshot
        && snapshot.userId === current.userId && snapshot.token === current.token) clearSession();
    },
  });
}
```

Authentication-route exclusions, token updates, authRevision, messages and redirects belong to the application. Async foreground work should honor context.signal. After timeout/cancellation, the library skips late responses and subsequent success hooks, but cannot forcibly stop application callbacks already running. onError is still notified once on cancellation, without awaiting its async result. Cancellation while awaiting an error handler ends that wait and preserves the original primary error.

executeHttp accepts both HttpRequest.signal and RequestOptions.signal. Either signal cancels; identical signals are deduplicated and all external listeners are released afterward. Timeout/cancellation stops waiting and aborts the Transport signal; the core cleans up its timers/listeners. This cannot guarantee termination of an uncooperative transport or undo server effects. Writes are not retried automatically.

Configuration errors use ResourceConfigurationError. RequestError.kind is unsupported-operation/identity/prepare/process/network/timeout/cancel/http/business/response-shape. cause and original request/response are explicitly accessible when available. JSON and Node inspection omit sensitive raw context by default; do not manually log request/response/cause.

Extension entries are axiosTransport from `@restmodel/axios`, withMock from `@restmodel/mock` and defineResourceStore from `@restmodel/pinia`. They depend only on the core public entry and are not core runtime dependencies. Caching, retries, authentication refresh queues and cross-data-source protocols are outside current capabilities.
