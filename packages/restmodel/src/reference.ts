/** 资源引用类型：从声明能力、位置、关系和返回模式推导合法链。 */
import type { Identity, Query } from './request.js';
import type { RequestOptions, HttpResponse } from './http/types.js';
import type { ResourceList } from './results.js';
import type { ActionFunctions } from './action.js';
import type {
  ResourceConfig,
  ResourceInputs,
  ResourceDefinition,
  ResourcePresetDefinition,
  ResourceTree,
  ActionTree,
} from './resource.js';
import type { StandardOperation, OperationEntry } from './operations.js';
import type { standardOperations } from './operations.js';
/** response 模式下的共同结果形态；动态模式返回联合类型。 */
export type OperationResult<TValue, TResponse extends boolean> = TResponse extends true
  ? { data: TValue; response: HttpResponse }
  : TValue;
/** 引用的资源位置；动态入口由运行时决定。 */
export type ReferencePosition = 'collection' | 'member' | 'singleton' | 'dynamic';
/** 只携带声明类型，不成为运行时实体字段。 */
export declare const entityReferenceType: unique symbol;
/** 普通模型对象的关联类型标记；标量与 unknown 保持原类型。 */
export type ResourceEntity<
  TModel,
  TConfig extends ResourceConfig,
  TInputs extends ResourceInputs = {},
> = TModel extends
  | readonly unknown[]
  | Date
  | RegExp
  | Error
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | Blob
  | ArrayBuffer
  ? TModel
  : TModel extends object
    ? TModel &
        EntityRelations<TModel, TConfig> & {
          readonly [entityReferenceType]?: {
            readonly model: TModel;
            readonly config: TConfig;
            readonly inputs: TInputs;
          };
        }
    : TModel;
/** 根据实体类型取得成员或单体引用；普通对象保持动态引用兼容。 */
export type EntityReference<TEntity extends object> =
  typeof entityReferenceType extends keyof TEntity
    ? NonNullable<TEntity[typeof entityReferenceType]> extends {
        model: infer TModel;
        config: infer TConfig extends ResourceConfig;
        inputs: infer TInputs extends ResourceInputs;
      }
      ? ResourceReference<
          TModel,
          false,
          TConfig,
          TConfig extends { kind: 'singleton' } ? 'singleton' : 'member',
          TInputs
        >
      : ResourceReference<TEntity>
    : ResourceReference<TEntity>;
/** 去除仅用于类型推导的实体标记。 */
export type EntityData<TEntity> = TEntity extends object
  ? typeof entityReferenceType extends keyof TEntity
    ? NonNullable<TEntity[typeof entityReferenceType]> extends { model: infer TModel }
      ? TModel
      : TEntity
    : TEntity
  : TEntity;

type Enabled<TMap> = { [TKey in keyof TMap]: TMap[TKey] extends false ? never : TKey }[keyof TMap] &
  StandardOperation;
type Disabled<TMap> = {
  [TKey in keyof TMap]: TMap[TKey] extends false ? TKey : never;
}[keyof TMap] &
  StandardOperation;
type LayerNames<TBase extends StandardOperation, TLayer> = TLayer extends '*'
  ? StandardOperation
  : TLayer extends readonly OperationEntry[]
    ?
        | TBase
        | (TLayer[number] extends infer TEntry
            ? TEntry extends StandardOperation
              ? TEntry
              : TEntry extends { operation: infer TName extends StandardOperation }
                ? TName
                : never
            : never)
    : TLayer extends object
      ? Exclude<
          | TBase
          | ('*' extends keyof TLayer
              ? TLayer['*'] extends true
                ? StandardOperation
                : never
              : never)
          | Enabled<TLayer>,
          Disabled<TLayer>
        >
      : TBase;
// 编译期继承展开最多 12 层，之后回退动态能力，避免深链耗尽类型实例化预算。
type DeclaredNames<TConfig, TDepth extends readonly unknown[] = []> = TDepth['length'] extends 12
  ? StandardOperation
  : TConfig extends ResourcePresetDefinition<infer TOriginal>
    ? DeclaredNames<TOriginal, [...TDepth, 0]>
    : LayerNames<
        TConfig extends { extends: infer TParent } ? DeclaredNames<TParent, [...TDepth, 0]> : never,
        'operations' extends keyof TConfig ? TConfig['operations'] : undefined
      >;
type PositionNames<TPosition extends ReferencePosition> = {
  [TName in StandardOperation]: TPosition extends 'dynamic'
    ? TName
    : TPosition extends 'collection'
      ? (typeof standardOperations)[TName]['target'] extends 'collection'
        ? TName
        : never
      : (typeof standardOperations)[TName]['target'] extends 'member'
        ? TName
        : never;
}[StandardOperation];
type Tree<TConfig, TKey extends PropertyKey, TBase> = TKey extends keyof TConfig
  ? NonNullable<TConfig[TKey]> extends TBase
    ? NonNullable<TConfig[TKey]>
    : never
  : {};
type Relations<TConfig, TPosition> = Tree<
  TConfig,
  TPosition extends 'member' ? 'members' : 'children',
  ResourceTree
>;
type Actions<TConfig, TPosition> = Tree<
  TConfig,
  TPosition extends 'member' ? 'memberActions' : 'actions',
  ActionTree
>;
type EntityRelations<TModel, TConfig extends ResourceConfig> = string extends keyof Relations<
  TConfig,
  TConfig extends { kind: 'singleton' } ? 'singleton' : 'member'
>
  ? {}
  : {
      readonly [TName in keyof Relations<
        TConfig,
        TConfig extends { kind: 'singleton' } ? 'singleton' : 'member'
      > as TName extends keyof TModel | keyof Object ? never : TName]: DefinitionReference<
        Relations<TConfig, TConfig extends { kind: 'singleton' } ? 'singleton' : 'member'>[TName]
      >;
    };
/** 将声明保留的模型与配置映射为根引用。 */
export type DefinitionReference<TDefinition, TResponse extends boolean = false> =
  TDefinition extends ResourceDefinition<infer TModel, infer TConfig, infer TInputs>
    ? ResourceReference<
        TModel,
        TResponse,
        TConfig,
        'kind' extends keyof TConfig
          ? TConfig['kind'] extends 'singleton'
            ? 'singleton'
            : TConfig['kind'] extends 'collection' | undefined
              ? 'collection'
              : 'dynamic'
          : 'collection',
        TInputs
      >
    : ResourceReference;
/** with 的 undefined 表示继承；宽 RequestOptions 必须保留两种可能返回形态。 */
type NextResponse<
  TOptions extends RequestOptions,
  TPrevious extends boolean,
> = 'result' extends keyof TOptions
  ? Exclude<TOptions['result'], undefined> extends never
    ? TPrevious
    :
        | ('response' extends TOptions['result'] ? true : never)
        | ('data' extends TOptions['result'] ? false : never)
        | (undefined extends TOptions['result'] ? TPrevious : never)
  : TPrevious;
type WriteInput<
  TInputs,
  TOperation extends keyof ResourceInputs,
  TDefault,
> = TOperation extends keyof TInputs ? TInputs[TOperation] : TDefault;
interface ReferenceOperations<
  TModel,
  TResponse extends boolean,
  TConfig extends ResourceConfig,
  TInputs extends ResourceInputs,
> {
  /** @returns 集合列表；无正文时 undefined。 */
  list(): Promise<
    OperationResult<ResourceList<ResourceEntity<TModel, TConfig, TInputs>> | undefined, TResponse>
  >;
  /** @returns 成员/单体数据；无正文时 undefined。 */
  get(): Promise<OperationResult<ResourceEntity<TModel, TConfig, TInputs> | undefined, TResponse>>;
  /** @param input 创建数据，不强制 id。 @returns 已适配数据。 */
  post(
    input: WriteInput<TInputs, 'post', Partial<TModel>> | FormData | Blob | ArrayBuffer,
  ): Promise<OperationResult<ResourceEntity<TModel, TConfig, TInputs> | undefined, TResponse>>;
  /** @param input 替换数据。 @returns 已适配数据。 */
  put(
    input: WriteInput<TInputs, 'put', TModel> | FormData | Blob | ArrayBuffer,
  ): Promise<OperationResult<ResourceEntity<TModel, TConfig, TInputs> | undefined, TResponse>>;
  /** @param input 局部字段。 @returns 已适配数据。 */
  patch(
    input: WriteInput<TInputs, 'patch', Partial<TModel>> | FormData | Blob | ArrayBuffer,
  ): Promise<OperationResult<ResourceEntity<TModel, TConfig, TInputs> | undefined, TResponse>>;
  /** @returns 原始业务返回值；无正文时 undefined。 */
  delete(): Promise<OperationResult<unknown, TResponse>>;
}
interface ReferenceControls<
  TModel,
  TResponse extends boolean,
  TConfig extends ResourceConfig,
  TPosition extends ReferencePosition,
  TInputs extends ResourceInputs,
> {
  /** 无冲突的显式关系入口；动作按声明名直接调用。 */
  readonly $: {
    /** @param name 已声明关系名。 @returns 对应模型与能力的子资源引用。 */
    child<TName extends keyof Relations<TConfig, TPosition> & string>(
      name: TName,
    ): DefinitionReference<Relations<TConfig, TPosition>[TName], TResponse>;
    /** @param name 待查询关系名。 @returns 是否存在已声明关系。 */
    hasChild(name: string): boolean;
  };
  /** @param query 查询补丁。 @returns 新引用。 */
  query(query: Query): ResourceReference<TModel, TResponse, TConfig, TPosition, TInputs>;
  /** @param number 从 1 起的页码。 @param size 正整数大小。 @returns 新引用。 */
  page(
    number: number,
    size: number,
  ): ResourceReference<TModel, TResponse, TConfig, TPosition, TInputs>;
  /** @param token 不透明 cursor。 @param size 正整数大小。 @returns 新引用。 */
  cursor(
    token: string,
    size: number,
  ): ResourceReference<TModel, TResponse, TConfig, TPosition, TInputs>;
  /** @param options 请求设置；result 为 undefined 时继承。 @returns 模式推导后的新引用。 */
  with<const TOptions extends RequestOptions>(
    options: TOptions & Record<Exclude<keyof TOptions, keyof RequestOptions>, never>,
  ): ResourceReference<TModel, NextResponse<TOptions, TResponse>, TConfig, TPosition, TInputs>;
}
/** 不可变引用；可推导声明在编译期裁剪能力，动态配置仍需运行时校验。 */
export type ResourceReference<
  TModel = unknown,
  TResponse extends boolean = false,
  TConfig extends ResourceConfig = ResourceConfig,
  TPosition extends ReferencePosition = 'dynamic',
  TInputs extends ResourceInputs = {},
> = ReferenceControls<TModel, TResponse, TConfig, TPosition, TInputs> &
  ActionFunctions<Actions<TConfig, TPosition>, TResponse> &
  Pick<
    ReferenceOperations<TModel, TResponse, TConfig, TInputs>,
    Extract<DeclaredNames<TConfig>, PositionNames<TPosition>>
  > &
  (TPosition extends 'collection' | 'dynamic'
    ? { (identity: Identity): ResourceReference<TModel, TResponse, TConfig, 'member', TInputs> }
    : {}) &
  (string extends keyof Relations<TConfig, TPosition>
    ? {}
    : {
        readonly [TName in keyof Relations<TConfig, TPosition> as TName extends
          | keyof ReferenceControls<TModel, TResponse, TConfig, TPosition, TInputs>
          | StandardOperation
          | keyof Function
          | keyof Object
          ? never
          : TName]: DefinitionReference<Relations<TConfig, TPosition>[TName], TResponse>;
      });
