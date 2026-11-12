/** Client 装配与不可变引用运行时，连接声明、编码、HTTP 和返回适配。 */
import { configurationFields, ResourceConfigurationError } from './configuration.js';
import type { ActionFunctions } from './action.js';
import { action } from './action.js';
import type { ActionTree, ResourceDefinition, ResourceTree } from './resource.js';
import { isResourceDefinition } from './resource.js';
import { standardOperations, isHttpMethod } from './operations.js';
import type { HttpMethod, StandardOperation } from './operations.js';
import { executeHttp } from './http/execute.js';
import { RequestError } from './http/errors.js';
import type { HttpOptions, HttpResponse, RequestOptions } from './http/types.js';
import { buildRequest, identitySegments, mergeQuery, pathSegments } from './request.js';
import type { Identity, Query } from './request.js';
import { fieldAt, mergeSchemes } from './scheme.js';
import type { Scheme } from './scheme.js';
import { modelResponse, unwrapResponse } from './response.js';
import type { PageIntent } from './response.js';
import type { ResourceReference, DefinitionReference } from './reference.js';
/** 一个服务的设置，Transport 必须显式传入。 */
export interface ClientConfig<
  TResources extends ResourceTree = ResourceTree,
  TActions extends ActionTree = ActionTree,
> extends HttpOptions {
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
export type Client<TResources extends ResourceTree, TActions extends ActionTree = ActionTree> = {
  readonly [TKey in keyof TResources]: DefinitionReference<TResources[TKey]>;
} & {
  readonly $: {
    /** @param name 已声明资源名。 @returns 动态入口，不猜模型类型。 */
    resource(name: string): ResourceReference;
    /** 服务根特殊接口。 */
    readonly actions: ActionFunctions<TActions>;
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
  readonly member: boolean;
  readonly missingIdentity: boolean;
  readonly scheme: Scheme;
  readonly query: URLSearchParams;
  readonly settings: RequestOptions;
  readonly page?: PageIntent | undefined;
}
const reserved = new Set(['$', 'then', '__proto__', 'prototype', 'constructor']);
const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
function settingsMerge(previous: RequestOptions, next: RequestOptions): RequestOptions {
  const fields = configurationFields(next, 'request options');
  // 缺省设置也只从自有字段继承，不能让原型字段决定模式或注入请求头。
  previous = Object.assign(Object.create(null) as RequestOptions, previous);
  next = Object.assign(Object.create(null) as RequestOptions, Object.fromEntries(fields));
  for (const key of fields.keys())
    if (!['headers', 'signal', 'timeout', 'result'].includes(key))
      throw new ResourceConfigurationError(`request options.${key}: unknown field`);
  if (next.result !== undefined && next.result !== 'data' && next.result !== 'response')
    throw new ResourceConfigurationError('request options.result: invalid mode');
  if (next.timeout !== undefined && (!Number.isFinite(next.timeout) || next.timeout <= 0))
    throw new ResourceConfigurationError('request options.timeout: invalid budget');
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
 * @param config 服务地址、执行器、资源树和公共规则。
 * @returns 命名资源入口及 $ 控制面。
 * @throws ResourceConfigurationError 声明、服务地址或保留名无效。
 */
export function createClient<
  const TResources extends ResourceTree,
  const TActions extends ActionTree = ActionTree,
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
      ].includes(key)
    )
      throw new ResourceConfigurationError(`client.${key}: unknown field`);
  const http = Object.freeze({
    transport: config.transport,
    prepareRequest: config.prepareRequest,
    observeResponse: config.observeResponse,
  });
  if (typeof config.transport !== 'function' || typeof config.baseURL !== 'string')
    throw new ResourceConfigurationError('client: baseURL and transport required');
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
  const send = (
    method: HttpMethod,
    segments: readonly string[],
    query: URLSearchParams,
    body: unknown,
    settings: RequestOptions,
  ) => {
    if (!isHttpMethod(method))
      throw new ResourceConfigurationError('request.method: invalid HTTP method');
    return executeHttp(http, buildRequest(method, url(segments, query), body, settings), settings);
  };
  function actions(
    tree: ActionTree | undefined,
    context?: Context,
  ): Readonly<Record<string, (input?: unknown) => Promise<unknown>>> {
    const entries = configurationFields(tree ?? {}, 'actions');
    return Object.freeze(
      Object.fromEntries(
        [...entries].map(([name, inputDefinition]) => {
          assertName(name);
          const definition = action(inputDefinition as Parameters<typeof action>[0]);
          return [
            name,
            async (input?: unknown) => {
              if (context?.missingIdentity) throw new RequestError('identity');
              const path = definition.path ?? name;
              const segments = [
                ...(path.startsWith('/') ? [] : (context?.segments ?? [])),
                ...pathSegments(path),
              ];
              const settings = context?.settings ?? defaults;
              const queryInput =
                definition.input === 'query' ||
                (definition.input === undefined &&
                  ['GET', 'DELETE', 'HEAD', 'OPTIONS'].includes(definition.method));
              const query =
                queryInput && input !== undefined
                  ? mergeQuery(context?.query ?? new URLSearchParams(), input as Query)
                  : (context?.query ?? new URLSearchParams());
              const response = await send(
                definition.method,
                segments,
                query,
                queryInput ? undefined : input,
                settings,
              );
              const data = unwrapResponse(
                response,
                mergeSchemes(context?.scheme ?? scheme, definition.scheme),
              );
              return settings.result === 'response' ? { data, response } : data;
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
      return derive({
        segments: [...context.segments, ...identitySegments(identity)],
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
      return reference({
        ...clean,
        segments: [...context.segments, ...identitySegments(identity as Identity)],
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
      const pending = send(operation.method, context.segments, query, input, context.settings);
      const response = await pending;
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
          actions: actions(
            context.member
              ? context.definition.config?.memberActions
              : context.definition.config?.actions,
            context,
          ),
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
    actions: actions(config.actions),
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
      ),
  });
  // 动态装配仅使用已验证资源键；公共映射类型由输入资源树提供。
  return Object.freeze({ ...output, $: control }) as Client<TResources, TActions>;
}
