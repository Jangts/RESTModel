/** URL、query 和 body 的公共编码阶段，资源与 raw/action 共用。 */
import { transportSettings } from './http/options.js';
import { normalizeHeaders } from './http/headers.js';
import { ResourceConfigurationError, configurationFields } from './configuration.js';
import type { HttpRequest, RequestOptions } from './http/types.js';
import type { HttpMethod } from './operations.js';
/** 身份按片段编码，0 有效；复合身份使用有序元组。 */
export type Identity = string | number | readonly (string | number)[];
/** query 值，数组代表重复键；undefined 删除，null 编码为空字符串。 */
export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean | null)[];
/** 查询对象或显式重复键入口。 */
export type Query = Readonly<Record<string, QueryValue>> | URLSearchParams;
/**
 * 校验服务或动作路径，拒绝逃逸、绝对 URL 与编码点段。
 * @param path 相对或服务根路径。
 * @returns 路径片段。
 * @throws ResourceConfigurationError 路径非法。
 */
export function pathSegments(path: string): string[] {
  if (typeof path !== 'string') throw new ResourceConfigurationError('path: expected string');
  if (/[?#\\]/u.test(path) || path.startsWith('//') || /^[a-z][a-z\d+.-]*:/iu.test(path))
    throw new ResourceConfigurationError('path: service-relative path required');
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      let decoded: string;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        throw new ResourceConfigurationError('path: invalid encoding');
      }
      if (decoded === '.' || decoded === '..' || /[/\\]/u.test(decoded))
        throw new ResourceConfigurationError('path: invalid segment');
      try {
        return encodeURIComponent(decoded);
      } catch {
        throw new ResourceConfigurationError('path: invalid Unicode');
      }
    });
}
/**
 * 编码身份，不将斜杠当作层级。
 * @param identity 身份或有序元组。
 * @returns 编码后的片段。
 * @throws ResourceConfigurationError 空元组或非 string/finite number。
 */
export function identitySegments(identity: Identity): string[] {
  const values = Array.isArray(identity) ? arrayValues(identity, 'identity') : [identity];
  if (!values.length) throw new ResourceConfigurationError('identity: empty tuple');
  return values.map((value) => {
    if (
      (typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      throw new ResourceConfigurationError('identity: expected string or finite number');
    const text = String(value);
    // URL 实现会归一化点段，包括编码后的点段；空身份也会与集合路径混淆。
    if (text === '' || text === '.' || text === '..')
      throw new ResourceConfigurationError('identity: empty or dot segment is not addressable');
    try {
      return encodeURIComponent(text);
    } catch {
      throw new ResourceConfigurationError('identity: invalid Unicode');
    }
  });
}

/** 连续读取自有数据元素，不调用输入数组的 map、迭代器或访问器。 */
function arrayValues(input: readonly unknown[], label: string): unknown[] {
  const values: unknown[] = [];
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !('value' in descriptor))
      throw new ResourceConfigurationError(`${label}[${index}]: expected data element`);
    values.push(descriptor.value as unknown);
  }
  return values;
}
/**
 * 合并查询，后写覆盖同名键，保持重复键；不修改输入。
 * @param previous 已有查询。
 * @param input 新的查询补丁。
 * @returns 新的 URLSearchParams。
 * @throws ResourceConfigurationError 查询值或对象无效。
 */
export function mergeQuery(previous: URLSearchParams, input: Query): URLSearchParams {
  const output = new URLSearchParams(previous);
  if (input instanceof URLSearchParams) {
    for (const key of new Set(input.keys())) {
      output.delete(key);
      for (const value of input.getAll(key)) output.append(key, value);
    }
    return output;
  }
  for (const [key, value] of configurationFields(input, 'query')) {
    output.delete(key);
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? arrayValues(value, 'query') : [value]) {
      if (
        item !== null &&
        (!['string', 'number', 'boolean'].includes(typeof item) ||
          (typeof item === 'number' && !Number.isFinite(item)))
      )
        throw new ResourceConfigurationError('query: expected scalar or scalar array');
      output.append(key, item === null ? '' : String(item));
    }
  }
  return output;
}
/**
 * 生成最终 HTTP 请求，普通 JSON 输入在调用时编码快照。
 * @param method HTTP 方法。
 * @param url 已编码 URL。
 * @param body 可选原始输入。
 * @param settings 请求头和 signal。
 * @returns 请求快照。
 * @throws ResourceConfigurationError body 无法 JSON 编码。
 */
export function buildRequest(
  method: HttpMethod,
  url: string,
  body: unknown,
  settings: RequestOptions,
): HttpRequest {
  const headers = normalizeHeaders(settings.headers ?? {});
  let encoded: HttpRequest['body'];
  if (body === undefined) encoded = undefined;
  else if (
    typeof body === 'string' ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer
  )
    encoded = body;
  else {
    try {
      encoded = JSON.stringify(body);
    } catch {
      throw new ResourceConfigurationError('body: JSON encoding failed');
    }
    if (encoded === undefined) throw new ResourceConfigurationError('body: unsupported JSON value');
    headers['content-type'] ??= 'application/json';
  }
  return Object.freeze({
    method,
    url,
    headers: Object.freeze({ ...headers }),
    body: encoded,
    signal: settings.signal,
    ...transportSettings(settings),
  });
}
