/** 配置边界：校验声明对象并读取自有数据属性，不执行访问器。 */

/** 声明配置无效时抛出的稳定错误分类。 */
export class ResourceConfigurationError extends Error {
  /** 对外稳定的错误名称。 */
  override readonly name = 'ResourceConfigurationError';
}

/**
 * 获取普通配置对象的自有数据字段快照；不读取原型链或调用 getter。
 * @param input 待校验的未知配置。
 * @param label 错误中的配置位置。
 * @returns 只包含自有数据属性的字段映射，包括不可枚举字段。
 * @throws ResourceConfigurationError 输入非普通对象或含访问器时抛出。
 */
export function configurationFields(input: unknown, label: string): Map<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ResourceConfigurationError(`${label} must be a plain object`);
  }
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ResourceConfigurationError(`${label} must be a plain object`);
  }
  const fields = new Map<string, unknown>();
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string') {
      throw new ResourceConfigurationError(`${label} keys must be strings`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) {
      throw new ResourceConfigurationError(`${label}.${key} must be a data property`);
    }
    const value: unknown = descriptor.value;
    fields.set(key, value);
  }
  return fields;
}
