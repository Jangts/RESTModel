/** 标准操作目录、声明快照和能力归一化；供资源声明阶段使用。 */
import { defineScheme, mergeSchemes } from './scheme.js';
import type { Scheme } from './scheme.js';
import { configurationFields, ResourceConfigurationError } from './configuration.js';
export { ResourceConfigurationError } from './configuration.js';

/** 标准操作默认方法及目标位置的唯一目录；同时驱动类型和星号展开。 */
export const standardOperations = Object.freeze({
  list: Object.freeze({ method: 'GET', target: 'collection' }),
  get: Object.freeze({ method: 'GET', target: 'member' }),
  post: Object.freeze({ method: 'POST', target: 'collection' }),
  put: Object.freeze({ method: 'PUT', target: 'member' }),
  patch: Object.freeze({ method: 'PATCH', target: 'member' }),
  delete: Object.freeze({ method: 'DELETE', target: 'member' }),
} as const);

/** 标准操作名，直接来自唯一操作目录。 */
export type StandardOperation = keyof typeof standardOperations;
/** 支持覆盖的 HTTP 方法；必须大写。 */
export type HttpMethod = (typeof httpMethods)[number];
/** 支持的 HTTP 方法目录，统一驱动动态方法校验和公共类型。 */
const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
/**
 * 检查未知方法是否属于支持的 HTTP 方法目录。
 * @param value 动态方法值。
 * @returns 是否可安全用作 HttpMethod。
 */
export function isHttpMethod(value: unknown): value is HttpMethod {
  return typeof value === 'string' && (httpMethods as readonly string[]).includes(value);
}
/** 集合（含成员）或单体资源。 */
export type ResourceKind = 'collection' | 'singleton';
/** 单项操作覆盖。 */
export interface OperationOverride {
  /** HTTP 方法；缺省保留继承值，否则使用目录默认值。 */
  readonly method?: HttpMethod;
  /** 仅适配当前已开放操作；不能授予能力。 */
  readonly scheme?: Scheme;
}
/** 逐项补丁；false 关闭，星号仅接受 true。 */
export type OperationMap = Readonly<
  Partial<Record<StandardOperation, boolean | OperationOverride>> & { '*'?: true }
>;
/** 能力声明的三种等价入口，数组采用追加语义。 */
export type Operations = '*' | readonly StandardOperation[] | OperationMap;
/** 单项能力的归一化结果。 */
export interface ResolvedOperation {
  /** 最终 HTTP 方法。 */
  readonly method: HttpMethod;
  /** 请求作用于集合、成员或单体。 */
  readonly target: 'collection' | 'member' | 'singleton';
  /** 当前操作的局部规则。 */
  readonly scheme?: Scheme;
}
/** 未出现的标准操作表示未开放。 */
export type ResolvedOperations = Readonly<Partial<Record<StandardOperation, ResolvedOperation>>>;

const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
const names = Object.keys(standardOperations) as StandardOperation[];
const fail = (message: string): never => {
  throw new ResourceConfigurationError(message);
};
function operationName(value: unknown, label: string): StandardOperation {
  if (typeof value !== 'string' || !own(standardOperations, value)) {
    fail(`${label}: unknown standard operation`);
  }
  return value as StandardOperation;
}

/**
 * 校验操作声明并创建冻结快照，不持有调用者的可变对象。
 * @param input 星号、标准操作数组或操作映射。
 * @param label 声明在配置中的位置，用于错误定位。
 * @returns 冻结的操作声明。
 * @throws ResourceConfigurationError 操作、方法或字段无效时抛出。
 */
export function snapshotOperations(input: unknown, label = 'operations'): Operations {
  if (input === '*') return input;
  if (Array.isArray(input)) {
    const result: StandardOperation[] = [];
    // 不调用可被覆盖的 map/迭代器，也不执行数组元素访问器。
    for (let index = 0; index < input.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !('value' in descriptor))
        throw new ResourceConfigurationError(`${label}[${index}]: expected a data element`);
      result.push(operationName(descriptor.value, `${label}[${index}]`));
    }
    return Object.freeze(result);
  }
  const fields = configurationFields(input, label);
  const result: Record<string, boolean | OperationOverride> = Object.create(null);
  for (const [name, value] of fields) {
    if (name === '*') {
      if (value !== true) fail(`${label}.*: expected true`);
      result[name] = true;
      continue;
    }
    operationName(name, `${label}.${name}`);
    if (typeof value === 'boolean') {
      result[name] = value;
      continue;
    }
    const override = configurationFields(value, `${label}.${name}`);
    if ([...override.keys()].some((key) => key !== 'method' && key !== 'scheme'))
      fail(`${label}.${name}: unknown override field`);
    const method = override.get('method');
    if (override.has('method') && !isHttpMethod(method)) {
      fail(`${label}.${name}.method: invalid HTTP method`);
    }
    // 已按有限方法目录校验；断言仅在写入类型化快照处使用。
    result[name] = Object.freeze({
      ...(override.has('method') ? { method: method as HttpMethod } : {}),
      ...(override.has('scheme') ? { scheme: defineScheme(override.get('scheme') as Scheme) } : {}),
    });
  }
  return Object.freeze({ ...result }) as OperationMap;
}

/**
 * 按祖先到后代的顺序归一化能力；先展开星号，再应用具体项。
 * @param kind 资源形态，决定星号及操作位置的适用性。
 * @param layers 已按继承顺序排列的声明。
 * @returns 冻结的最终能力映射，不执行请求。
 * @throws ResourceConfigurationError 声明无效或操作不适用时抛出。
 */
export function resolveOperations(
  kind: ResourceKind,
  layers: readonly Operations[],
): ResolvedOperations {
  const resolved: Partial<Record<StandardOperation, ResolvedOperation>> = Object.create(null);
  const applicable = (name: StandardOperation) =>
    kind === 'collection' || standardOperations[name].target === 'member';
  const enable = (name: StandardOperation, override: OperationOverride = {}) => {
    if (!applicable(name)) fail(`Operation ${name} is not applicable to a ${kind} resource`);
    resolved[name] = Object.freeze({
      method:
        (own(override, 'method') ? override.method : undefined) ??
        resolved[name]?.method ??
        standardOperations[name].method,
      target: kind === 'singleton' ? 'singleton' : standardOperations[name].target,
      ...(own(override, 'scheme') || resolved[name]?.scheme
        ? {
            scheme: mergeSchemes(
              resolved[name]?.scheme,
              own(override, 'scheme') ? override.scheme : undefined,
            ),
          }
        : {}),
    });
  };
  for (const declaration of layers) {
    const layer = snapshotOperations(declaration);
    if (
      layer === '*' ||
      (!Array.isArray(layer) && own(layer, '*') && (layer as OperationMap)['*'] === true)
    ) {
      for (const name of names) if (applicable(name)) enable(name);
    }
    if (layer === '*') continue;
    if (Array.isArray(layer)) {
      for (const name of layer) enable(name);
      continue;
    }
    for (const [key, value] of Object.entries(layer)) {
      if (key === '*') continue;
      const name = operationName(key, `operations.${key}`);
      if (value === false) delete resolved[name];
      else enable(name, value === true ? {} : (value as OperationOverride));
    }
  }
  return Object.freeze({ ...resolved });
}
