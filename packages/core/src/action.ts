/** 特殊接口声明，沿用公共 HTTP 执行，不属于标准操作星号。 */
import type { OperationResult } from './reference.js';
import { configurationFields, ResourceConfigurationError } from './configuration.js';
import { isHttpMethod } from './operations.js';
import type { HttpMethod } from './operations.js';
import { defineScheme } from './scheme.js';
import type { Scheme } from './scheme.js';
/** 特殊接口输入配置。 */
export interface ActionConfig {
  /** 必须显式给出 HTTP 方法。 */
  readonly method: HttpMethod;
  /** 相对所属路径；/ 开头表示服务路径根，禁止跨 origin。 */
  readonly path?: string;
  /** 默认 GET/DELETE/HEAD/OPTIONS 用 query，其他用 body。 */
  readonly input?: 'query' | 'body';
  /** 单项服务适配覆盖。 */
  readonly scheme?: Scheme;
}
declare const actionTypes: unique symbol;
/** 不可变动作声明；泛型仅携带类型，不校验响应。 */
export interface ActionDefinition<TInput = unknown, TOutput = unknown> extends ActionConfig {
  /** 编译期输入输出标记。 */
  readonly [actionTypes]?: { input: TInput; output: TOutput };
}
/**
 * 校验并冻结特殊接口声明。
 * @param config 显式方法、可选路径、参数位置和规则。
 * @returns 不可变动作。
 * @throws ResourceConfigurationError 配置无效。
 */
export function action<TInput = unknown, TOutput = unknown>(
  config: ActionConfig,
): ActionDefinition<TInput, TOutput> {
  const fields = configurationFields(config, 'action');
  const allowed = new Set(['method', 'path', 'input', 'scheme']);
  for (const key of fields.keys())
    if (!allowed.has(key)) throw new ResourceConfigurationError(`action.${key}: unknown field`);
  const method = fields.get('method');
  if (!isHttpMethod(method)) throw new ResourceConfigurationError('action.method: invalid method');
  if (fields.has('path') && typeof fields.get('path') !== 'string')
    throw new ResourceConfigurationError('action.path: expected string');
  if (fields.has('input') && fields.get('input') !== 'query' && fields.get('input') !== 'body')
    throw new ResourceConfigurationError('action.input: expected query or body');
  return Object.freeze({
    ...Object.fromEntries(fields),
    method,
    ...(fields.has('scheme') ? { scheme: defineScheme(fields.get('scheme') as Scheme) } : {}),
  });
}

/** 按动作声明推导输入与输出；默认 unknown 保持动态入口。 */
export type ActionFunctions<
  TActions extends Readonly<Record<string, ActionDefinition>>,
  TResponse extends boolean = false,
> = {
  readonly [TKey in keyof TActions]: TActions[TKey] extends ActionDefinition<
    infer TInput,
    infer TOutput
  >
    ? unknown extends TInput
      ? (input?: TInput) => Promise<OperationResult<TOutput, TResponse>>
      : (input: TInput) => Promise<OperationResult<TOutput, TResponse>>
    : never;
};
