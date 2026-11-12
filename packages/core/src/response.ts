/** HTTP 响应到业务数据/列表的共同适配，不执行额外请求。 */
import { RequestError } from './http/errors.js';
import type { HttpResponse } from './http/types.js';
import { fieldAt } from './scheme.js';
import type { Scheme } from './scheme.js';
import { ResourceList, modelEntity } from './results.js';
import type { ResourceReference } from './reference.js';
/** 分页意图只在终端执行时编码。 */
export type PageIntent =
  | { readonly number: number; readonly size: number }
  | { readonly cursor: string; readonly size: number };
/**
 * 应用业务判定、信封与同步映射，标量保持原形。
 * @param response HTTP 成功响应。
 * @param scheme 已解析规则。
 * @returns 解包值，无正文返回 undefined。
 * @throws RequestError 业务失败或异步映射伪装同步时。
 */
export function unwrapResponse(response: HttpResponse, scheme: Scheme): unknown {
  if (response.status === 204 || response.status === 205 || response.body === undefined)
    return undefined;
  if (scheme.success) {
    let success: unknown;
    try {
      success = scheme.success(response.body);
    } catch (cause) {
      throw new RequestError('business', { response, cause });
    }
    if (success instanceof Promise) void success.catch(() => {});
    if (typeof success !== 'boolean') throw new RequestError('response-shape', { response });
    if (!success) throw new RequestError('business', { response });
  }
  let value = scheme.envelope ? fieldAt(response.body, scheme.envelope) : response.body;
  if (scheme.map) {
    try {
      value = scheme.map(value);
    } catch (cause) {
      throw new RequestError('response-shape', { response, cause });
    }
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof Object.getOwnPropertyDescriptor(value, 'then')?.value === 'function'
  )
    throw new RequestError('response-shape', { response });
  if (value instanceof Promise) {
    void value.catch(() => {});
    throw new RequestError('response-shape', { response });
  }
  return value;
}
/**
 * 包装实体或列表，身份/关系从本次资源上下文取得。
 * @param value 已解包数据。
 * @param list 是否列表操作。
 * @param scheme 当前规则。
 * @param reference 根据对象绑定身份的工厂。
 * @param page 可选分页意图。
 * @returns 实体、列表或标量。
 * @throws RequestError 列表、总数或 cursor 形态错误。
 */
export function modelResponse(
  value: unknown,
  list: boolean,
  scheme: Scheme,
  reference: (data: unknown) => ResourceReference,
  page?: PageIntent,
): unknown {
  const entity = (data: unknown) => modelEntity(data, () => reference(data));
  if (!list || value === undefined) return entity(value);
  const pagination = scheme.pagination || undefined;
  const items = pagination?.items ? fieldAt(value, pagination.items) : value;
  if (!Array.isArray(items)) throw new RequestError('response-shape');
  const total = pagination?.total ? fieldAt(value, pagination.total) : undefined;
  const next = pagination?.next ? fieldAt(value, pagination.next) : undefined;
  if (
    (total !== undefined && (typeof total !== 'number' || !Number.isFinite(total) || total < 0)) ||
    (next !== undefined && typeof next !== 'string')
  )
    throw new RequestError('response-shape');
  return new ResourceList(items.map(entity), total as number | undefined, {
    ...page,
    ...(next === undefined ? {} : { next: next as string }),
  });
}
