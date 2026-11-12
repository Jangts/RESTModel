/** 服务级 HTTP 适配规则；不授予资源操作能力。 */
import { configurationFields, ResourceConfigurationError } from './configuration.js';
/** 显式分页请求和响应字段；模式切换整段替换。 */
export interface PaginationScheme {
  /** 分页模式。 */
  readonly mode: 'page' | 'offset' | 'cursor';
  /** 页码、偏移或 cursor 的查询字段，默认分别 page/offset/cursor。 */
  readonly parameter?: string;
  /** 大小字段；默认 page 为 size，其他为 limit。 */
  readonly size?: string;
  /** 页码基数，默认 1，仅 page 适用。 */
  readonly base?: 0 | 1;
  /** 列表字段路径，缺省要求数据本身为数组。 */
  readonly items?: string;
  /** 总数字段路径；缺省未知。 */
  readonly total?: string;
  /** 下一 cursor 字段路径。 */
  readonly next?: string;
}
/** 可继承的服务规则；只允许这些已知域，不做任意深合并。 */
export interface Scheme {
  /** 对象身份字段，默认 id；false 关闭推导。 */
  readonly identity?: string | false;
  /** 信封数据字段路径；false 使用整个 body。 */
  readonly envelope?: string | false;
  /** 显式业务成功判定；false 关闭继承判定。 */
  readonly success?: ((body: unknown) => boolean) | false;
  /** 响应转换；false 关闭，不允许异步回调伪装同步。 */
  readonly map?: ((data: unknown) => unknown) | false;
  /** 分页；false 关闭；缺省 page/size，仅显式 page 调用附加参数。 */
  readonly pagination?: PaginationScheme | false;
}
const keys = new Set(['identity', 'envelope', 'success', 'map', 'pagination']);
const paginationKeys = new Set(['mode', 'parameter', 'size', 'base', 'items', 'total', 'next']);
/**
 * 校验并快照服务规则，数组或未知字段被拒绝。
 * @param input 服务或资源规则。
 * @returns 冻结的规则，函数保持原身份。
 * @throws ResourceConfigurationError 字段或分页组合无效。
 */
export function defineScheme(input: Scheme): Scheme {
  const fields = configurationFields(input, 'scheme');
  const output: Record<string, unknown> = Object.create(null);
  for (const [key, value] of fields) {
    if (!keys.has(key)) throw new ResourceConfigurationError(`scheme.${key}: unknown field`);
    if (value === undefined) continue;
    if (key === 'pagination' && value !== false) {
      const pagination = configurationFields(value, 'scheme.pagination');
      for (const [name, field] of pagination) {
        if (!paginationKeys.has(name))
          throw new ResourceConfigurationError(`scheme.pagination.${name}: unknown field`);
        if (name !== 'mode' && name !== 'base' && (typeof field !== 'string' || field.length === 0))
          throw new ResourceConfigurationError(
            `scheme.pagination.${name}: expected nonempty string`,
          );
      }
      const mode = pagination.get('mode');
      if (mode !== 'page' && mode !== 'offset' && mode !== 'cursor')
        throw new ResourceConfigurationError('scheme.pagination.mode: invalid mode');
      if (
        pagination.has('base') &&
        (mode !== 'page' || ![0, 1].includes(pagination.get('base') as number))
      )
        throw new ResourceConfigurationError('scheme.pagination.base: only page supports 0 or 1');
      output[key] = Object.freeze(Object.fromEntries(pagination));
    } else if (key === 'identity' || key === 'envelope') {
      if (value !== false && (typeof value !== 'string' || value.length === 0))
        throw new ResourceConfigurationError(`scheme.${key}: expected field path or false`);
      output[key] = value;
    } else if (key === 'success' || key === 'map') {
      if (value !== false && typeof value !== 'function')
        throw new ResourceConfigurationError(`scheme.${key}: expected function or false`);
      output[key] = value;
    } else output[key] = value;
  }
  return Object.freeze(output) as Scheme;
}
/**
 * 合并已知规则；undefined 继承，分页整段替换，函数替换。
 * @param layers 从默认到最具体的规则。
 * @returns 新的不可变规则。
 */
export function mergeSchemes(...layers: readonly (Scheme | undefined)[]): Scheme {
  return Object.freeze(
    Object.assign(
      Object.create(null) as Scheme,
      ...layers.filter((layer) => layer !== undefined).map((layer) => defineScheme(layer)),
    ),
  );
}
/**
 * 仅沿自有数据字段读取路径，不执行响应 getter。
 * @param data 未知业务数据。
 * @param path 点分隔字段路径。
 * @returns 字段值或 undefined。
 */
export function fieldAt(data: unknown, path: string): unknown {
  let value = data;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return undefined;
    value = descriptor.value as unknown;
  }
  return value;
}
