/** 特殊接口声明，沿用公共 HTTP 执行，不属于标准操作星号。 */
import { compileActionPath } from './action-path.js';
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
  /** 相对所属路径，支持 :name 具名输入参数；/ 开头表示服务路径根，禁止跨 origin。 */
  readonly path?: string;
  /** 路径参数提取后，剩余输入默认 GET/DELETE/HEAD/OPTIONS 用 query，其他用 body。 */
  readonly input?: 'query' | 'body';
  /** 单项服务适配覆盖。 */
  readonly scheme?: Scheme;
}
declare const actionTypes: unique symbol;
/** 不可变动作声明；泛型仅携带类型，不校验响应。 */
export interface ActionDefinition<
  TInput = unknown,
  TOutput = unknown,
  TPath extends string = string,
> extends ActionConfig {
  readonly path?: TPath;
  /** 编译期输入输出标记。 */
  readonly [actionTypes]?: { input: TInput; output: TOutput; path: TPath };
}
/**
 * 校验并冻结特殊接口声明。
 * @param config 显式方法、可选路径、参数位置和规则。
 * @returns 不可变动作。
 * @throws ResourceConfigurationError 配置无效。
 */
export function action<TInput = unknown, TOutput = unknown, const TPath extends string = string>(
  config: ActionConfig & { readonly path?: TPath },
): ActionDefinition<TInput, TOutput, TPath> {
  const fields = configurationFields(config, 'action');
  const allowed = new Set(['method', 'path', 'input', 'scheme']);
  for (const key of fields.keys())
    if (!allowed.has(key)) throw new ResourceConfigurationError(`action.${key}: unknown field`);
  const method = fields.get('method');
  if (!isHttpMethod(method)) throw new ResourceConfigurationError('action.method: invalid method');
  if (fields.has('path') && typeof fields.get('path') !== 'string')
    throw new ResourceConfigurationError('action.path: expected string');
  if (fields.has('path')) compileActionPath(fields.get('path') as string);
  if (fields.has('input') && fields.get('input') !== 'query' && fields.get('input') !== 'body')
    throw new ResourceConfigurationError('action.input: expected query or body');
  return Object.freeze({
    ...Object.fromEntries(fields),
    method,
    ...(fields.has('scheme') ? { scheme: defineScheme(fields.get('scheme') as Scheme) } : {}),
  }) as ActionDefinition<TInput, TOutput, TPath>;
}

type ParameterKeys<TPath extends string> = TPath extends `${infer Head}/${infer Tail}`
  ? ParameterKeys<Head> | ParameterKeys<Tail>
  : TPath extends `:${infer Name}`
    ? Name
    : never;
type CallInput<TInput, TPath extends string> = string extends TPath
  ? TInput
  : [ParameterKeys<TPath>] extends [never]
    ? TInput
    : (unknown extends TInput ? Readonly<Record<string, unknown>> : TInput) &
        Readonly<Record<ParameterKeys<TPath>, string | number>>;

/** 按声明推导直接动作调用；字面量路径推导必填输入字段，保留业务输入输出类型。 */
export type ActionFunctions<
  TActions extends Readonly<Record<string, ActionDefinition>>,
  TResponse extends boolean = false,
> = {
  readonly [TKey in keyof TActions]: TActions[TKey] extends ActionDefinition<
    infer TInput,
    infer TOutput,
    infer TPath
  >
    ? unknown extends CallInput<TInput, TPath>
      ? (input?: CallInput<TInput, TPath>) => Promise<OperationResult<TOutput, TResponse>>
      : (input: CallInput<TInput, TPath>) => Promise<OperationResult<TOutput, TResponse>>
    : never;
};
