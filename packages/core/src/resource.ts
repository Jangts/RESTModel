/** 资源声明入口：解析预设继承并归一化能力，导出资源定义和预设类型。 */
import { resolveOperations, snapshotOperations } from './operations.js';
import { configurationFields, ResourceConfigurationError } from './configuration.js';
import { defineScheme } from './scheme.js';
import type { Scheme } from './scheme.js';
import { action } from './action.js';
import type { ActionDefinition } from './action.js';
import type { Operations, ResourceKind, ResolvedOperations } from './operations.js';

declare const modelType: unique symbol;
declare const configType: unique symbol;
declare const presetType: unique symbol;
/** 可复用的能力声明，不提前绑定资源形态。 */
export interface ResourcePreset {
  /** 本层能力补丁；缺省或 undefined 沿用父预设，不接受 null。 */
  readonly operations?: Operations | undefined;
  /** 单一父预设；缺省或 undefined 无继承，不接受 null 或循环。 */
  readonly extends?: ResourcePreset | undefined;
}
/** 预设快照保留原声明类型，以便推导继承能力。 */
export type ResourcePresetDefinition<TConfig extends ResourcePreset> = ResourcePreset & {
  readonly [presetType]: TConfig;
};
/** 命名资源声明树。 */
export type ResourceTree = Readonly<Record<string, ResourceDefinition>>;
/** 命名特殊接口声明。 */
export type ActionTree = Readonly<Record<string, ActionDefinition>>;
/** 资源自身的声明。 */
export interface ResourceConfig extends ResourcePreset {
  /** 资源形态；缺省或 undefined 为 collection，不接受 null。 */
  readonly kind?: ResourceKind | undefined;
  /** 相对资源路径；默认使用声明键，不允许绝对路径。 */
  readonly path?: string;
  /** 服务规则局部覆盖。 */
  readonly scheme?: Scheme;
  /** 当前集合或单体的子资源。 */
  readonly children?: ResourceTree;
  /** 集合成员的子资源；单体不支持。 */
  readonly members?: ResourceTree;
  /** 当前路径上的特殊动作。 */
  readonly actions?: ActionTree;
  /** 集合成员动作；单体不支持。 */
  readonly memberActions?: ActionTree;
}
/** 冻结的声明结果，不是可发送请求的客户端。 */
export interface ResourceDefinition<
  TModel = unknown,
  TConfig extends ResourceConfig = ResourceConfig,
> {
  /** 已确定的资源形态。 */
  readonly kind: ResourceKind;
  /** 已归一化的只读能力映射。 */
  readonly operations: ResolvedOperations;
  /** 仅携带模型类型，不产生运行时字段。 */
  readonly [modelType]?: TModel;
  /** 仅携带原配置类型，不产生运行时字段。 */
  readonly [configType]?: TConfig;
  /** 已快照的资源局部配置，供客户端装配。 */
  readonly config?: Readonly<Omit<ResourceConfig, 'extends' | 'operations' | 'kind'>>;
}

const declarationFields = {
  resource: new Set([
    'kind',
    'operations',
    'extends',
    'path',
    'scheme',
    'children',
    'members',
    'actions',
    'memberActions',
  ]),
  preset: new Set(['operations', 'extends']),
} as const;

function collect(
  config: ResourcePreset,
  mode: keyof typeof declarationFields,
): { layers: Operations[]; kind: unknown } {
  const layers: Operations[] = [];
  const seen = new Set<object>();
  let current: unknown = config;
  let kind: unknown;
  // 使用迭代与一次反转，避免合法长继承链耗尽栈或反复复制层列表。
  do {
    const label = seen.size === 0 ? mode : `${mode}.extends(depth=${seen.size})`;
    const fields = configurationFields(current, label);
    const allowed = seen.size === 0 ? declarationFields[mode] : declarationFields.preset;
    for (const key of fields.keys()) {
      if (!allowed.has(key)) throw new ResourceConfigurationError(`${label}.${key}: unknown field`);
    }
    // configurationFields 已确认 current 为对象；只在身份集合边界断言。
    const identity = current as object;
    if (seen.has(identity))
      throw new ResourceConfigurationError(`${label}: circular preset inheritance`);
    if (seen.size === 0) kind = fields.get('kind');
    seen.add(identity);
    const operations = fields.get('operations');
    if (operations !== undefined)
      layers.push(snapshotOperations(operations, `${label}.operations`));
    current = fields.get('extends');
  } while (current !== undefined);
  return { layers: layers.reverse(), kind };
}

/**
 * 快照并冻结可复用预设，不绑定资源形态、不执行请求。
 * @param config 能力补丁与可选父预设，仅接受普通对象的自有数据字段。
 * @returns 与原声明隔离的不可变预设。
 * @throws ResourceConfigurationError 配置无效或继承循环时抛出。
 */
export function defineResourcePreset<const TConfig extends ResourcePreset>(
  config: TConfig,
): ResourcePresetDefinition<TConfig> {
  const { layers } = collect(config, 'preset');
  let preset: ResourcePreset = Object.freeze({});
  for (const operations of layers) preset = Object.freeze({ extends: preset, operations });
  // 冻结快照与声明语义等价，标记仅用于类型推导。
  return preset as ResourcePresetDefinition<TConfig>;
}

/**
 * 创建资源能力定义，不执行 HTTP 请求。
 * @param config 资源形态、预设与能力；缺省为空能力的集合资源。
 * @returns 已冻结的资源定义；模型泛型仅携带类型。
 * @throws ResourceConfigurationError 配置无效、继承循环或操作不适用时抛出。
 */
export function resource<const TConfig extends ResourceConfig>(
  config: TConfig,
): ResourceDefinition<unknown, TConfig>;
export function resource<TModel = unknown>(): ResourceDefinition<
  TModel,
  { operations: readonly [] }
>;
export function resource<TModel = unknown>(
  config: ResourceConfig & { kind: 'singleton' },
): ResourceDefinition<TModel, ResourceConfig & { kind: 'singleton' }>;
export function resource<TModel = unknown>(
  config: ResourceConfig & { kind?: 'collection' | undefined },
): ResourceDefinition<TModel, ResourceConfig & { kind: 'collection' }>;
export function resource<TModel = unknown, const TConfig extends ResourceConfig = ResourceConfig>(
  config: TConfig,
): ResourceDefinition<TModel, TConfig>;
export function resource<TModel = unknown>(
  config: ResourceConfig = {},
): ResourceDefinition<TModel> {
  const { layers, kind: inputKind } = collect(config, 'resource');
  const kind = inputKind === undefined ? 'collection' : inputKind;
  if (kind !== 'collection' && kind !== 'singleton') {
    throw new ResourceConfigurationError('resource.kind: expected collection or singleton');
  }
  const fields = configurationFields(config, 'resource');
  const extras: Record<string, unknown> = Object.create(null);
  for (const key of ['path', 'scheme', 'children', 'members', 'actions', 'memberActions']) {
    if (!fields.has(key)) continue;
    const value = fields.get(key);
    if (key === 'path') {
      if (
        typeof value !== 'string' ||
        value.length === 0 ||
        value.startsWith('/') ||
        value.split('/').some((segment) => segment === '..' || segment === '.')
      )
        throw new ResourceConfigurationError('resource.path: expected a relative path');
      extras[key] = value;
    } else if (key === 'scheme') extras[key] = defineScheme(value as Scheme);
    else {
      if (kind === 'singleton' && (key === 'members' || key === 'memberActions'))
        throw new ResourceConfigurationError(`resource.${key}: singleton has no members`);
      const entries = configurationFields(value, `resource.${key}`);
      for (const name of entries.keys())
        if (['$', 'then', '__proto__', 'prototype', 'constructor'].includes(name))
          throw new ResourceConfigurationError(`resource.${key}: reserved name`);
      if (key === 'actions' || key === 'memberActions')
        extras[key] = Object.freeze(
          Object.fromEntries(
            [...entries].map(([name, item]) => [name, action(item as ActionDefinition)]),
          ),
        );
      else {
        for (const item of entries.values())
          if (!isResourceDefinition(item))
            throw new ResourceConfigurationError(`resource.${key}: expected resource definitions`);
        extras[key] = Object.freeze(Object.fromEntries(entries));
      }
    }
  }
  const definition = Object.freeze({
    kind,
    operations: resolveOperations(kind, layers),
    ...(Object.keys(extras).length ? { config: Object.freeze(extras) } : {}),
  });
  definitions.add(definition);
  return definition as ResourceDefinition<TModel>;
}

const definitions = new WeakSet<object>();
/**
 * 确认声明由本运行时创建，拒绝伪造能力对象。
 * @param value 未知声明。
 * @returns 是否为真实资源定义。
 */
export function isResourceDefinition(value: unknown): value is ResourceDefinition {
  return typeof value === 'object' && value !== null && definitions.has(value);
}
