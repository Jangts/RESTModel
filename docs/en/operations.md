# Operation declarations

`resource` and `defineResourcePreset` build capability declarations without making HTTP requests. This page defines declaration, inheritance and normalization rules.

```ts
import { resource, defineResourcePreset } from '@restmodel/restmodel'
const organization = resource()
const logs = resource({ operations: ['list', 'get'] })
const users = resource({ operations: '*' })
const settings = resource({ kind: 'singleton', operations: '*' })
const editable = resource({
  operations: {
    '*': true,
    delete: false,
    patch: { method: 'PUT' },
  },
})
```

## Exact rules

- kind defaults to collection. list/post target the collection; get/put/patch/delete target its members.
- singleton supports only get/put/patch/delete. Wildcards exclude list/post; explicitly enabling an inapplicable operation throws ResourceConfigurationError during declaration.
- Without operations or a preset, capabilities are empty. With a preset, omitted operations inherit. CRUD is never enabled implicitly.
- Arrays accept standard operation names and override objects with an operation field, enabling only the listed operations. In maps, true enables, false disables and configuration objects enable while overriding the method. Unspecified entries inherit.
- `'*'` or `'*': true` enables all standard operations for the current kind. Expand the wildcard first, then apply specific entries, regardless of key order.
- Wildcards follow future standard operation additions. Use explicit lists for a fixed set. Actions never belong to the wildcard.
- Inheritance applies patches layer by layer. Arrays add capabilities instead of replacing inherited ones. Empty arrays/maps do not clear inheritance; disable an operation explicitly with false.
- A descendant wildcard re-enables standard operations disabled by ancestors while preserving inherited HTTP method overrides. Local false wins. true does not reset method overrides; specify the default method explicitly to restore it.
- Schemes adapt HTTP but never grant capabilities.
- Unknown operations, invalid methods and unknown override fields cause errors. Overrides accept method, scheme, path and queryKey.
- Resource configuration accepts kind, operations, extends, path, scheme, children, members, actions and memberActions; see the [client reference](client.md). Presets and extends targets accept only operations and extends. Unknown own fields, including non-enumerable ones, are rejected during declaration.
- Missing or undefined kind means collection. Missing or undefined operations inherits. Missing or undefined extends means no parent. None accepts null. A missing override method inherits, but explicitly undefined/null methods are invalid.
- Declarations and normalized results are snapshotted and frozen without mutating presets or original configuration.
- Configuration, presets, operation maps and overrides accept only own data properties of plain objects, including null-prototype objects. Custom prototypes, symbol keys and accessors are rejected. Operation arrays must be dense own data elements with no holes or element accessors. Supply plain declaration data, not Proxies; Proxy reflection traps are outside the side-effect guarantee.
- Inheritance resolves iteratively, so valid long chains are not limited by JavaScript call stack depth. Cycles still throw ResourceConfigurationError.

```ts
const readonly = defineResourcePreset({ operations: ['list', 'get'] })
const articles = resource({
  extends: readonly,
  operations: { post: true, get: false },
})
const singletonPreset = defineResourcePreset({ operations: '*' })
const profile = resource({ kind: 'singleton', extends: singletonPreset })
```

The articles example enables only list and post and leaves readonly unchanged. The singleton preset enables only get, put, patch and delete.

## Public exports

`resource<T>(config?)` returns `ResourceDefinition<T>` with kind and readonly operations. Each normalized operation contains method and target, retaining configured scheme, path and queryKey fields. target is collection/member/singleton. Model generics carry types without creating runtime model classes.

`defineResourcePreset(config)` returns a reusable immutable preset, supports a single extends chain and checks cycles. Presets retain declaration layers and expand wildcards only after the concrete resource kind is known.

`standardOperations` is the single catalog driving default methods, supported positions and wildcard expansion. ResourceConfigurationError is the public error class. Other public types are exported from the package entry.

TypeScript checks operation names, HTTP methods and configuration shape. Runtime normalization checks singleton applicability and inherited effective capabilities. ResourceDefinition is a declaration result, not a client with callable get/list methods. Assemble it with createClient before using runtime resource references.

## Locating configuration errors

Invalid declarations synchronously throw ResourceConfigurationError. Errors identify field positions such as `resource.operations[0]` and `preset.operations.get.method`. `resource.extends(depth=2)` identifies the second preset level from the root declaration. Errors neither invoke custom string conversion on unknown values nor print field values. Paths aid diagnosis and are not stable error codes; branch on the public error class instead.

## Operation paths and identity mapping

```ts
import { createClient, resource } from '@restmodel/restmodel';
const api = createClient({
  baseURL: '/api',
  resources: {
    users: resource({
      operations: ['list', 'put', 'post', { operation: 'get', path: 'getById', queryKey: 'id' }],
    }),
  },
});
await api.users(123).get(); // GET /api/users/getById?id=123
```

Replace the get override with `{ operation: 'get', path: 'getById/:id' }` to request `/api/users/getById/123` using the same `api.users(123).get()` call.

Array objects require operation, accepting only standard names. Duplicate operations in the same array are errors. Map syntax also accepts `{ get: { path: 'getById', queryKey: 'id' } }`. Strings, array objects and map entries share normalization, and presets can supply inherited capabilities and overrides.

path is relative to the logical resource and replaces its default member address without appending identity again. `:id` is a complete path segment representing the bound identity, independent of the service's identity field name; it may occur once. queryKey writes identity to the named query field, overriding the caller's same-named query parameter without changing other query or pagination fields. A queryKey without path uses the resource root.

queryKey and `:id` are mutually exclusive and apply only to collection-member operations. Custom identity mappings support one identity segment; composite identities are rejected before sending instead of implicitly combining them into one query value or placeholder. Unmodified standard paths still support ordered composite identities. Singletons and collection operations may override a static relative path but cannot map member identity.

Member path overrides must explicitly send identity through queryKey or `:id`. Absolute URLs, service-root paths, dot segments, unknown placeholders and path escapes are rejected. A layer providing either path or queryKey replaces the entire operation route mapping; omitting both inherits it unchanged. method and scheme retain their existing inheritance rules. Other operations are unaffected.

These fields change HTTP mapping only, preserving operation position, input/output, service adaptation and entity association. Custom actions describe additional behavior; their declaration names and backend paths are independent of the standard operation catalog.

These overrides consume only one bound identity. Use an [action with named path parameters](client.md#action-path-parameters) when an exceptional endpoint needs multiple business inputs or path parameters; consumed path fields are removed from remaining query/body input. This does not limit ordinary list filters or model body fields.
