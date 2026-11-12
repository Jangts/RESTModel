/** 结果列表与实体关联元信息；不修改对象原型，不全局合并实体。 */
import { RequestError } from './http/errors.js';
import type { ResourceReference, EntityReference, EntityData } from './reference.js';
/** 列表归一化结果，不伪装 Array。 */
export class ResourceList<TModel> implements Iterable<TModel> {
  /** 本次结果的普通数组快照。 */
  readonly items: TModel[];
  /** 未知总数为 undefined，不以 items.length 冒充。 */
  readonly total: number | undefined;
  /** 已知分页元信息。 */
  readonly page: Readonly<{ number?: number; size?: number; cursor?: string; next?: string }>;
  /**
   * 创建列表，不复制实体关联状态。
   * @param items 已适配的数据项。
   * @param total 可选总数。
   * @param page 已知分页信息。
   */
  constructor(items: readonly TModel[], total?: number, page: ResourceList<TModel>['page'] = {}) {
    this.items = [...items];
    this.total = total;
    this.page = Object.freeze({ ...page });
  }
  /** @returns 普通数组的迭代器。 */
  [Symbol.iterator](): Iterator<TModel> {
    return this.items[Symbol.iterator]();
  }
}
const entities = new WeakMap<object, { data: object; reference: ResourceReference }>();
/**
 * 关联普通数据对象，数据字段始终优先；标量、数组和其他原型实例原样保留。
 * @param data 响应对象。
 * @param reference 普通对象才调用的资源引用工厂。
 * @returns 数据快照代理，键枚举只反映数据。
 */
export function modelEntity<TModel>(data: TModel, reference: () => ResourceReference): TModel {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return data;
  const prototype: unknown = Object.getPrototypeOf(data);
  if (prototype !== Object.prototype && prototype !== null) return data;
  const target: Record<PropertyKey, unknown> = {};
  for (const key of Reflect.ownKeys(data)) {
    const descriptor = Object.getOwnPropertyDescriptor(data, key);
    if (!descriptor || !('value' in descriptor)) throw new RequestError('response-shape');
    // 保留可枚举性，转为本地可写快照，不修改冻结的源对象。
    Object.defineProperty(target, key, {
      value: descriptor.value as unknown,
      enumerable: descriptor.enumerable ?? false,
      writable: true,
      configurable: true,
    });
  }
  const bound = reference();
  const proxy = new Proxy(target, {
    get(object, key, receiver) {
      return Reflect.has(object, key)
        ? Reflect.get(object, key, receiver)
        : typeof key === 'string' && bound.$.hasChild(key)
          ? bound.$.child(key)
          : undefined;
    },
  });
  entities.set(proxy, { data: target, reference: bound });
  // 代理真实数据快照，不新增模型字段；泛型仅传递声明类型。
  return proxy as TModel;
}
/**
 * 获取实体的无冲突关联入口。
 * @param entity 本库返回的实体对象。
 * @returns 对应的资源引用。
 * @throws RequestError 不是实体时抛 response-shape。
 */
export function resourceOf<TModel extends object>(entity: TModel): EntityReference<TModel> {
  const metadata = entities.get(entity);
  if (!metadata) throw new RequestError('response-shape');
  return metadata.reference as EntityReference<TModel>;
}
/**
 * 获取实体本地数据快照，修改不会自动请求。
 * @param entity 本库实体或普通值。
 * @returns 实体的真实数据对象，其他值原样返回。
 */
export function dataOf<TModel>(entity: TModel): EntityData<TModel> {
  if (entity !== null && typeof entity === 'object')
    return (entities.get(entity)?.data ?? entity) as EntityData<TModel>;
  return entity as EntityData<TModel>;
}
