# Scope and boundaries

## Purpose

Serve RESTful APIs and their variants through models and fluent operations. Standard endpoints should need little configuration. Service-level schemes adapt common conventions once, with resources and operations inheriting those rules. Configuration should mainly describe exceptions. Unusual endpoints require explicit, concise declarations. General RPC and arbitrary data-source access are outside the goal.

The main package sends real HTTP through built-in Fetch by default. Ordinary calls need no executor configuration. Transport is an extension contract for replacing HTTP execution, not bypassing RESTful derivation or service rules, and is not an introductory prerequisite. The main package does not depend on Axios or expose Axios types. It defines resource models, fluent contexts, HTTP request and result contracts, default derivation, schemes and extension points. Standard endpoints should not require repeated URL, method and parameter conversion declarations.

## Standard operation exceptions and actions

Standard RESTful endpoints use default method and path derivation. For a standard operation with one identity-route exception, override its path and queryKey or single `:id`, while retaining calls such as `api.users(id).get()` and normal entity results. An exceptional interface with multiple business inputs or additional behavior uses an action. Action declaration names are independent of backend paths and are called directly; multiple named path parameters come from the input object, with remaining fields sent as query/body. These rules do not limit ordinary list filters or model body fields. See [operation declarations](operations.md) and [action path parameters](client.md#action-path-parameters).

## Extensions

Concrete request executors, mocks, caching and Pinia integrations belong in extensions. Each package's public entry and maintenance documentation define its actual implementation and delivered scope.

Extensions may be official companions or independently maintained third parties. Even packages maintained by the same author in the same repository can act as third parties: use only public contracts, declare compatibility independently and release independently. Packages do not share a fixed version group or promise synchronized upgrades.

Extensions reference the core through workspace peer dependencies. Release-time compatibility ranges must be explicit; development versions are not published compatibility promises.

## Mock

Mock is an HTTP debugging extension and must obey the HTTP pipeline. It matches final requests after resource derivation and scheme adaptation using method, URL, parameters and body, then returns status, headers and body. It may simulate delays and network errors. It must not bypass HTTP to return business results directly from resource operations.

## Caching and state management

Caching is an optional extension direction: the library defines data structures, keys, expiry and invalidation, while storage can be replaced. It does not adapt arbitrary business stores. Integrations such as Pinia add state management without changing core data-access boundaries. Built-in caching is not part of the current implementation.

## Maintenance principles

Prioritize ease of use and learning. Internal complexity is acceptable when public concepts and behavior stay clear and stable. Preserve models and fluent calls while simplifying concepts; do not sacrifice the caller's experience merely to reduce implementation code. Evaluate established dependencies for general capabilities instead of adding coupling to legacy utility packages.
