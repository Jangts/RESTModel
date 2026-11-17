/** Client 装配与不可变引用运行时，连接声明、编码、HTTP 和返回适配。 */
import { configurationFields, ResourceConfigurationError } from './configuration.js';
import type { ActionFunctions } from './action.js';
import { compileActionPath, bindActionPath } from './action-path.js';
import { action } from './action.js';
import type { ActionTree, ResourceDefinition, ResourceTree } from './resource.js';
import { isResourceDefinition } from './resource.js';
import { standardOperations, isHttpMethod } from './operations.js';
import type { HttpMethod, StandardOperation } from './operations.js';
import { assertCredentials } from './http/credentials.js';
import { executeRequest } from './http/execute.js';
import { operationRoute } from './operation-route.js';
import { reservedResourceNames, validateActionNames } from './reference-names.js';
import { fetchTransport } from './http/fetch.js';
import { RequestError } from './http/errors.js';
import type { HttpOptions, HttpResponse, RequestOptions, Transport } from './http/types.js';
import { buildRequest, identitySegments, mergeQuery, pathSegments } from './request.js';
import type { Identity, Query } from './request.js';
import { fieldAt, mergeSchemes } from './scheme.js';
import type { Scheme } from './scheme.js';
import { modelResponse, unwrapResponse } from './response.js';
import type { PageIntent } from './response.js';
import type { ResourceReference, DefinitionReference } from './reference.js';
/** 一个服务的设置，默认通过 Fetch 执行真实 HTTP，可显式替换执行器。 */
export interface ClientConfig<
  TResources extends ResourceTree = ResourceTree,
  TActions extends ActionTree = {},
> extends Omit<HttpOptions, 'transport'> {
  /** 可选 HTTP 执行器；缺省使用内置 Fetch，不改变 RESTful 推导和服务规则。 */
  readonly transport?: Transport | undefined;
  /** 绝对 HTTP(S) 地址或浏览器服务根路径。 */
  readonly baseURL: string;
  /** 命名资源定义；不自动猜测任意属性。 */
  readonly resources: TResources;
  /** 服务规则；默认裸 body、id 身份、page/size。 */
  readonly scheme?: Scheme;
  /** 客户端默认请求设置。 */
  readonly defaults?: Omit<RequestOptions, 'result'>;
  /** 服务根级特殊接口。 */
  readonly actions?: TActions;
}
/** 客户端公共入口及控制面。 */
export type Client<TResources extends ResourceTree, TActions extends ActionTree = {}> = {
  readonly [TKey in keyof TResources]: DefinitionReference<TResources[TKey]>;
} & ActionFunctions<TActions> & {
    readonly $: {
      /** @param name 已声明资源名。 @returns 动态入口，不猜模型类型。 */
      resource(name: string): ResourceReference;
      /** @param request 服务内 raw HTTP 配置。 @returns 原始响应，不套信封。 */
      request(request: {
        readonly method: HttpMethod;
        readonly path: string;
        readonly query?: Query;
        readonly body?: unknown;
        readonly options?: RequestOptions;
      }): Promise<HttpResponse>;
    };
  };
interface Context {
  readonly definition: ResourceDefinition;
  readonly segments: readonly string[];
  readonly resourceSegments: readonly string[];
  readonly identity?: readonly string[] | undefined;
  readonly member: boolean;
  readonly missingIdentity: boolean;
  readonly scheme: Scheme;
  readonly query: URLSearchParams;
  readonly settings: RequestOptions;
  readonly page?: PageIntent | undefined;
}
const reserved = reservedResourceNames;
const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
function settingsMerge(previous: RequestOptions, next: RequestOptions): RequestOptions {
  const fields = configurationFields(next, 'request options');
  // 缺省设置也只从自有字段继承，不能让原型字段决定模式或注入请求头。
  previous = Object.assign(Object.create(null) as RequestOptions, previous);
  next = Object.assign(Object.create(null) as RequestOptions, Object.fromEntries(fields));
  for (const key of fields.keys())
    if (!['headers', 'signal', 'timeout', 'result', 'credentials'].includes(key))
      throw new ResourceConfigurationError(`request options.${key}: unknown field`);
  if (next.result !== undefined && next.result !== 'data' && next.result !== 'response')
    throw new ResourceConfigurationError('request options.result: invalid mode');
  if (next.timeout !== undefined && (!Number.isFinite(next.timeout) || next.timeout <= 0))
    throw new ResourceConfigurationError('request options.timeout: invalid budget');
  assertCredentials(next.credentials);
  const headers: Record<string, string | undefined> = { ...previous.headers };
  if (next.headers)
    for (const [key, value] of configurationFields(next.headers, 'headers')) {
      if (value !== undefined && typeof value !== 'string')
        throw new ResourceConfigurationError('headers: expected string or undefined');
      headers[key.toLowerCase()] = value as string | undefined;
    }
  return Object.freeze(
    Object.assign(Object.create(null) as RequestOptions, previous, next, {
      result: next.result ?? previous.result,
      credentials: next.credentials ?? previous.credentials,
      headers: Object.freeze(headers),
    }),
  );
}
function queryFor(context: Context): URLSearchParams {
  if (!context.page) return new URLSearchParams(context.query);
  const pagination = context.scheme.pagination;
  if (pagination === false) throw new ResourceConfigurationError('pagination: disabled');
  const mode = pagination?.mode ?? 'page';
  const intent = context.page;
  const sizeKey = pagination?.size ?? (mode === 'page' ? 'size' : 'limit');
  const key =
    pagination?.parameter ?? (mode === 'page' ? 'page' : mode === 'offset' ? 'offset' : 'cursor');
  if ((mode === 'cursor' && !('cursor' in intent)) || (mode !== 'cursor' && !('number' in intent)))
    throw new ResourceConfigurationError('pagination: incompatible intent');
  const value =
    'cursor' in intent
      ? intent.cursor
      : mode === 'offset'
        ? (intent.number - 1) * intent.size
        : intent.number - 1 + (pagination?.base ?? 1);
  return mergeQuery(context.query, { [key]: value, [sizeKey]: intent.size });
}
function assertName(name: string): void {
  if (reserved.has(name)) throw new ResourceConfigurationError('resource: reserved name');
}

/**
 * 将资源声明装配为服务客户端，不执行请求。
 * @param config 服务地址、资源树和公共规则；可选替换默认 Fetch 执行器。
 * @returns 命名资源入口及 $ 控制面。
 * @throws ResourceConfigurationError 声明、服务地址或保留名无效。
 */
export function createClient<
  const TResources extends ResourceTree,
  const TActions extends ActionTree = {},
>(config: ClientConfig<TResources, TActions>): Client<TResources, TActions> {
  const clientFields = configurationFields(config, 'client');
  // 已校验的数据字段复制到无原型配置，避免缺省字段再从原型链取得值。
  config = Object.assign(
    Object.create(null) as ClientConfig<TResources, TActions>,
    Object.fromEntries(clientFields),
  );
  for (const key of clientFields.keys())
    if (
      ![
        'baseURL',
        'transport',
        'resources',
        'scheme',
        'defaults',
        'actions',
        'prepareRequest',
        'observeResponse',
        'processResponse',
        'onError',
      ].includes(key)
    )
      throw new ResourceConfigurationError(`client.${key}: unknown field`);
  if (typeof config.baseURL !== 'string')
    throw new ResourceConfigurationError('client.baseURL: expected a string');
  if (config.transport !== undefined && typeof config.transport !== 'function')
    throw new ResourceConfigurationError('client.transport: expected an HTTP executor function');
  for (const key of ['prepareRequest', 'processResponse', 'onError', 'observeResponse'] as const)
    if (config[key] !== undefined && typeof config[key] !== 'function')
      throw new ResourceConfigurationError(`client.${key}: expected a function`);
  const http = Object.freeze({
    transport: config.transport ?? fetchTransport(),
    prepareRequest: config.prepareRequest,
    observeResponse: config.observeResponse,
    processResponse: config.processResponse,
    onError: config.onError,
  });
  const base = config.baseURL === '/' ? '' : config.baseURL.replace(/\/+$/u, '');
  if (
    (!base && config.baseURL !== '/') ||
    /[?#\\]/u.test(base) ||
    base.startsWith('//') ||
    (base !== '' && !base.startsWith('/') && !/^https?:\/\//u.test(base))
  )
    throw new ResourceConfigurationError(
      'client.baseURL: HTTP(S) URL or root-relative path required',
    );
  if (/^https?:/u.test(base)) {
    let parsed: URL;
    try {
      parsed = new URL(base);
    } catch {
      throw new ResourceConfigurationError('client.baseURL: invalid URL');
    }
    if (parsed.username || parsed.password)
      throw new ResourceConfigurationError('client.baseURL: credentials forbidden');
  }
  const scheme = mergeSchemes(config.scheme);
  if (config.defaults && configurationFields(config.defaults, 'client.defaults').has('result'))
    throw new ResourceConfigurationError('client.defaults.result: use reference.with instead');
  const defaults = settingsMerge({}, config.defaults ?? {});
  const resources = Object.fromEntries(configurationFields(config.resources, 'client.resources'));
  for (const [name, definition] of Object.entries(resources)) {
    assertName(name);
    if (!isResourceDefinition(definition))
      throw new ResourceConfigurationError('client.resources: expected resource definitions');
  }
  const url = (segments: readonly string[], query: URLSearchParams) =>
    `${base}/${segments.join('/')}${query.size ? `?${query}` : ''}`;
  const send = <TResult>(
    method: HttpMethod,
    segments: readonly string[],
    query: URLSearchParams,
    body: unknown,
    settings: RequestOptions,
    consume: (response: HttpResponse) => TResult,
  ) => {
    if (!isHttpMethod(method))
      throw new ResourceConfigurationError('request.method: invalid HTTP method');
    return executeRequest(
      http,
      buildRequest(method, url(segments, query), body, settings),
      settings,
      consume,
    );
  };
  function actions(
    tree: ActionTree | undefined,
    context?: Context,
  ): Readonly<Record<string, (input?: unknown) => Promise<unknown>>> {
    const entries = configurationFields(tree ?? {}, 'actions');
    validateActionNames(Object.fromEntries(entries), undefined, 'actions');
    return Object.freeze(
      Object.fromEntries(
        [...entries].map(([name, inputDefinition]) => {
          assertName(name);
          const definition = action(inputDefinition as Parameters<typeof action>[0]);
          const path = definition.path ?? name;
          const template = compileActionPath(path);
          return [
            name,
            async (input?: unknown) => {
              if (context?.missingIdentity) throw new RequestError('identity');
              const bound = bindActionPath(template, input);
              const segments = [
                ...(path.startsWith('/') ? [] : (context?.segments ?? [])),
                ...bound.segments,
              ];
              const settings = context?.settings ?? defaults;
              const queryInput =
                definition.input === 'query' ||
                (definition.input === undefined &&
                  ['GET', 'DELETE', 'HEAD', 'OPTIONS'].includes(definition.method));
              const query =
                queryInput && bound.input !== undefined
                  ? mergeQuery(context?.query ?? new URLSearchParams(), bound.input as Query)
                  : (context?.query ?? new URLSearchParams());
              return send(
                definition.method,
                segments,
                query,
                queryInput ? undefined : bound.input,
                settings,
                (response) => {
                  const data = unwrapResponse(
                    response,
                    mergeSchemes(context?.scheme ?? scheme, definition.scheme),
                  );
                  return settings.result === 'response' ? { data, response } : data;
                },
              );
            },
          ];
        }),
      ),
    );
  }
  function reference(context: Context): ResourceReference {
    const derive = (patch: Partial<Context>) => reference({ ...context, ...patch });
    const bind = (identity: Identity) => {
      if (context.member || context.definition.kind === 'singleton')
        throw new RequestError('unsupported-operation');
      const encodedIdentity = identitySegments(identity);
      return derive({
        identity: encodedIdentity,
        segments: [...context.segments, ...encodedIdentity],
        member: true,
      });
    };
    const children =
      (context.member ? context.definition.config?.members : context.definition.config?.children) ??
      {};
    const child = (name: string) => {
      if (!own(children, name))
        throw new ResourceConfigurationError('resource.child: unknown name');
      if (context.missingIdentity) throw new RequestError('identity');
      const definition = children[name];
      if (!definition) throw new ResourceConfigurationError('resource.child: missing definition');
      return reference({
        ...context,
        definition,
        member: false,
        missingIdentity: false,
        segments: [...context.segments, ...pathSegments(definition.config?.path ?? name)],
        resourceSegments: [...context.segments, ...pathSegments(definition.config?.path ?? name)],
        identity: undefined,
        scheme: mergeSchemes(context.scheme, definition.config?.scheme),
      });
    };
    const entityReference = (data: unknown, activeScheme: Scheme = context.scheme) => {
      // 响应实体仅保留资源身份、规则与请求设置；原查询/分页属于已完成请求。
      const clean = {
        ...context,
        query: new URLSearchParams(),
        page: undefined,
        settings: settingsMerge(context.settings, { result: 'data' }),
      };
      if (context.member || context.definition.kind === 'singleton') return reference(clean);
      const identity =
        activeScheme.identity === false ? undefined : fieldAt(data, activeScheme.identity ?? 'id');
      if (identity === undefined || identity === null)
        return reference({ ...clean, member: true, missingIdentity: true });
      const encodedIdentity = identitySegments(identity as Identity);
      return reference({
        ...clean,
        identity: encodedIdentity,
        segments: [...context.segments, ...encodedIdentity],
        member: true,
      });
    };
    const execute = async (name: StandardOperation, input?: unknown) => {
      const operation = own(context.definition.operations, name)
        ? context.definition.operations[name]
        : undefined;
      if (
        !operation ||
        operation.target !==
          (context.definition.kind === 'singleton'
            ? 'singleton'
            : context.member
              ? 'member'
              : 'collection')
      )
        throw new RequestError('unsupported-operation');
      if (context.missingIdentity) throw new RequestError('identity');
      const operationScheme = mergeSchemes(context.scheme, operation.scheme);
      const query = queryFor({ ...context, scheme: operationScheme });
      const route = operationRoute(
        operation,
        context.resourceSegments,
        context.segments,
        context.identity,
        query,
      );
      return send(
        operation.method,
        route.segments,
        route.query,
        input,
        context.settings,
        (response) => {
          const value = unwrapResponse(response, operationScheme);
          const data =
            name === 'delete'
              ? value
              : modelResponse(
                  value,
                  name === 'list',
                  operationScheme,
                  (data) => entityReference(data, operationScheme),
                  context.page,
                );
          return context.settings.result === 'response' ? { data, response } : data;
        },
      );
    };
    // 目录包含完整标准全集；这里只为动态装配标记已安装的方法名。
    const operations = Object.fromEntries(
      (Object.keys(standardOperations) as StandardOperation[]).map((name) => [
        name,
        (input?: unknown) => execute(name, input),
      ]),
    ) as Record<StandardOperation, (input?: unknown) => Promise<unknown>>;
    const target = Object.assign(
      bind,
      {
        $: Object.freeze({
          child,
          hasChild: (name: string) => own(children, name),
        }),
        query: (input: Query) => derive({ query: mergeQuery(context.query, input) }),
        with: (input: RequestOptions) =>
          derive({ settings: settingsMerge(context.settings, input) }),
        page: (number: number, size: number) => {
          if (
            !Number.isSafeInteger(number) ||
            number < 1 ||
            !Number.isSafeInteger(size) ||
            size < 1 ||
            (context.scheme.pagination && context.scheme.pagination.mode === 'cursor')
          )
            throw new ResourceConfigurationError('page: invalid page/size or pagination mode');
          return derive({ page: { number, size } });
        },
        cursor: (cursor: string, size: number) => {
          if (
            typeof cursor !== 'string' ||
            !Number.isSafeInteger(size) ||
            size < 1 ||
            !context.scheme.pagination ||
            context.scheme.pagination.mode !== 'cursor'
          )
            throw new ResourceConfigurationError('cursor: invalid token/size or pagination mode');
          return derive({ page: { cursor, size } });
        },
      },
      operations,
      actions(
        context.member
          ? context.definition.config?.memberActions
          : context.definition.config?.actions,
        context,
      ),
    );
    Object.freeze(target);
    return new Proxy(target, {
      get(object, key, receiver) {
        if (key === 'then') return undefined;
        return Reflect.has(object, key)
          ? Reflect.get(object, key, receiver)
          : typeof key === 'string' && own(children, key)
            ? child(key)
            : undefined;
      },
    }) as ResourceReference;
  }
  const resource = (name: string) => {
    if (!own(resources, name))
      throw new ResourceConfigurationError('client.resource: unknown name');
    const definition = resources[name];
    if (!isResourceDefinition(definition))
      throw new ResourceConfigurationError('client.resource: invalid definition');
    return reference({
      definition,
      segments: pathSegments(definition.config?.path ?? name),
      resourceSegments: pathSegments(definition.config?.path ?? name),
      member: false,
      missingIdentity: false,
      scheme: mergeSchemes(scheme, definition.config?.scheme),
      query: new URLSearchParams(),
      settings: defaults,
    });
  };
  const output = Object.fromEntries(Object.keys(resources).map((name) => [name, resource(name)]));
  const control = Object.freeze({
    resource,
    request: (input: {
      method: HttpMethod;
      path: string;
      query?: Query;
      body?: unknown;
      options?: RequestOptions;
    }) =>
      send(
        input.method,
        pathSegments(input.path),
        mergeQuery(new URLSearchParams(), input.query ?? {}),
        input.body,
        settingsMerge(defaults, input.options ?? {}),
        (response) => response,
      ),
  });
  // 动态装配仅使用已验证资源键；公共映射类型由输入资源树提供。
  const rootActions = actions(config.actions);
  validateActionNames(rootActions, resources, 'client.actions');
  return Object.freeze({ ...output, ...rootActions, $: control }) as Client<TResources, TActions>;
}
