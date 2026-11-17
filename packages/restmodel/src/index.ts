/** 主包公共入口：资源声明与客户端、HTTP 执行契约、服务适配及结果类型。 */
export { resource, defineResourcePreset } from './resource.js';
export type {
  ResourcePreset,
  ResourcePresetDefinition,
  ResourceConfig,
  ResourceDefinition,
} from './resource.js';
export { standardOperations, ResourceConfigurationError } from './operations.js';
export type {
  StandardOperation,
  HttpMethod,
  ResourceKind,
  Operations,
  OperationMap,
  OperationOverride,
  OperationDeclaration,
  OperationEntry,
  ResolvedOperation,
  ResolvedOperations,
} from './operations.js';
export { createClient } from './client.js';
export type { Client, ClientConfig } from './client.js';
export { defineScheme } from './scheme.js';
export type { Scheme, PaginationScheme } from './scheme.js';
export { action } from './action.js';
export type { ActionConfig, ActionDefinition, ActionFunctions } from './action.js';
export { ResourceList, resourceOf, dataOf } from './results.js';
export type {
  ResourceReference,
  OperationResult,
  ResourceEntity,
  EntityReference,
  EntityData,
  DefinitionReference,
} from './reference.js';
export type { Identity, Query, QueryValue } from './request.js';
export { executeHttp } from './http/execute.js';
export { fetchTransport } from './http/fetch.js';
export { RequestError } from './http/errors.js';
export type { RequestErrorKind } from './http/errors.js';
export type {
  HttpRequest,
  HttpResponse,
  Transport,
  HttpOptions,
  RequestOptions,
  RequestContext,
  CredentialsMode,
} from './http/types.js';
export type { ResourceTree, ActionTree } from './resource.js';
export { decodeHttpBody } from './http/decode.js';

export { iteratePages } from './pagination.js';
export type { PageSource, PageIterationOptions } from './pagination.js';
