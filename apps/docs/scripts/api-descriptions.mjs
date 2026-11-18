/** English API descriptions; signatures are always generated from the public source entry. */
export const apiDescriptions = {
  resource:
    'Declare and freeze a resource, including its kind, capabilities, relations and actions. Does not send HTTP requests.',
  defineResourcePreset:
    'Create an immutable capability preset with optional inheritance. Wildcards expand for the concrete resource kind; cycles are rejected.',
  ResourcePreset: 'Input contract for reusable capability presets.',
  ResourcePresetDefinition: 'Immutable resource preset retaining its declaration layers.',
  ResourceConfig:
    'Resource configuration including capabilities, paths, schemes, relations and actions.',
  ResourceInputs:
    'Optional JSON input contracts keyed by post, put and patch. Missing keys retain model-derived inputs without granting operations.',
  ResourceDefinition:
    'Immutable resource declaration carrying model and configuration types. Call `typed<Model>()` to bind a model while preserving inferred capabilities, relations and actions.',
  standardOperations:
    'The shared catalog of standard operations, default HTTP methods and supported target positions.',
  ResourceConfigurationError:
    'Public error class for invalid declarations and configuration. Field paths aid diagnosis without exposing field values.',
  StandardOperation: 'Name of a standard resource operation.',
  HttpMethod: 'Supported HTTP request methods.',
  ResourceKind: 'Resource shape: collection or singleton.',
  Operations:
    'Capability declaration supporting mixed name/override arrays, maps and wildcards; arrays add to inherited capabilities.',
  OperationMap: 'Per-operation enablement and overrides, optionally including a wildcard.',
  OperationDeclaration:
    'A named standard operation with optional local method, scheme, path and identity-query mapping, usable inside operation arrays.',
  OperationEntry: 'A standard operation name or a named operation override in an operation array.',
  OperationOverride:
    'Local HTTP method, scheme, resource-relative path and identity query-key mapping for a standard operation.',
  ResolvedOperation:
    'Normalized operation containing its method and target, with any configured scheme, path and queryKey.',
  ResolvedOperations: 'Readonly map of enabled, normalized operations.',
  createClient:
    'Assemble resource and action declarations into a fluent client with default Fetch, optional HTTP executor replacement and service rules.',
  Client: 'Client type retaining declared resources and control entries.',
  ClientConfig:
    'Client settings: service base URL, resources, actions, schemes and lifecycle hooks. Transport is optional and defaults to built-in Fetch.',
  defineScheme:
    'Validate and snapshot service rules. Rejects unknown fields and invalid pagination combinations; functions retain their identity.',
  Scheme:
    'Inheritable identity, envelope, success, mapping and pagination rules. These rules do not grant capabilities.',
  PaginationScheme:
    'Explicit request and response pagination fields. Pagination configuration replaces as a whole.',
  action:
    'Declare an HTTP action for additional behavior or multi-parameter exceptions. Named path fields are consumed from input; remaining fields use query/body. Requires an explicit method and does not send a request.',
  ActionConfig:
    'Action method, optional path with named :parameter segments, remaining-input query/body location and optional scheme.',
  ActionDefinition: 'Immutable declaration retaining action input/output types and its path type.',
  ActionFunctions:
    'Direct callable actions with typed business inputs and required parameters inferred from literal paths; backend paths remain independent.',
  ResourceList:
    'Iterable normalized list with an ordinary items array and known pagination metadata. Unknown total remains undefined.',
  iteratePages:
    'Lazily iterate data-mode page/offset resources without prefetching. Stops at an empty page, no content, or the known total when starting from page one; throws if maxPages is exhausted.',
  PageSource: 'Structural data-mode resource contract accepted by iteratePages.',
  PageIterationOptions:
    'Positive integer size, start and maxPages limits; defaults are 100, 1 and 1000.',
  resourceOf:
    'Get the resource reference associated with an entity. Rejects values without entity metadata.',
  dataOf:
    'Get the local data associated with an entity without exposing relation controls as data fields.',
  ResourceReference: 'Fluent resource reference carrying model, position and result-mode types.',
  OperationResult: 'Result type for an operation, including optional response wrapping.',
  ResourceEntity:
    'Model data associated with resource metadata; editing local fields does not send requests.',
  EntityReference: 'Resource reference associated with a returned entity.',
  EntityData: 'Underlying data type of a resource entity.',
  DefinitionReference:
    'Resource reference inferred from an exact resource declaration, including capabilities and relations.',
  Identity: 'Scalar or composite identity. Composite segments are encoded separately.',
  Query: 'Supported query input, including explicit repeated keys through URLSearchParams.',
  QueryValue:
    'Supported query field value. Undefined removes a key; null encodes as an empty string.',
  executeHttp:
    'Prepare, encode and execute HTTP with shared cancellation, timeout and error classification. Returns an HttpResponse.',
  FetchTransportOptions:
    'Injected Fetch and snapshotted transport defaults, with explicit per-request overrides.',
  ResponseType: 'Response reading policy: auto, json, text or none.',
  CacheMode: 'Standard HTTP cache modes, derived from the same catalog as runtime validation.',
  TransportSettings:
    'Response decoding, HTTP cache, keepalive and credentials policies shared by requests and executors.',
  fetchTransport:
    'Create a Fetch-backed Transport with injectable Fetch and transport defaults. It preserves real response metadata, cancels ignored success bodies and never automatically follows redirects.',
  RequestError:
    'Execution error with a stable kind. Raw request, response and cause are explicitly accessible but omitted from default diagnostics.',
  RequestErrorKind:
    'Public execution error categories covering capabilities, identity, preparation, foreground processing, network, cancellation, HTTP and response adaptation.',
  RequestContext:
    'Per-request context shared by preparation, foreground response processing and error notification. Its private symbol-keyed state is cleared on completion and never sent to the Transport.',
  CredentialsMode:
    'Fetch-compatible omit, same-origin or include credentials policy; explicit Authorization headers are independent.',
  HttpRequest: 'Final HTTP request contract received by a Transport.',
  HttpResponse: 'HTTP response containing status, headers and decoded body.',
  Transport:
    'Executor receiving a prepared request and returning a response. Implementations must support cancellation and avoid automatic redirects.',
  HttpOptions:
    'Shared HTTP preparation, awaited successful response processing, error notification, background observation and execution settings.',
  RequestOptions:
    'Per-call headers, credentials, cancellation, timeout, result wrapping, response decoding, HTTP cache and keepalive.',
  ResourceTree: 'Named resource declarations used to assemble clients and relations.',
  ActionTree: 'Named action declarations used to assemble action call entries.',
  decodeHttpBody:
    'Decode response text according to explicit auto/json/text/none policy while retaining actual response headers and failure details.',
  axiosTransport:
    'Execute final HTTP requests through an optional Axios instance. Returns non-2xx responses normally and disables redirects; instance interceptors remain caller-controlled.',
  withMock:
    'Decorate a Transport with ordered HTTP matching rules. Unmatched requests fail unless passthrough is explicit; cancellation remains supported.',
  MockRule:
    'First-match HTTP rule with a predicate, response producer and optional cancellable delay.',
  MockOptions: 'Unmatched-request policy; only explicit passthrough invokes the real Transport.',
  defineResourceStore:
    'Create a shared Pinia request store using a caller-provided loader. Pass its signal to the resource call. Exposes data/error/pending/run/cancel/subscribe; the latest run wins.',
};
