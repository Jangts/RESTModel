/** 直接调用入口的名称合同；后端 URL 不参与名称冲突判断。 */
import { standardOperations } from './operations.js';
import { ResourceConfigurationError } from './configuration.js';
export const reservedResourceNames = new Set([
  '$',
  'then',
  '__proto__',
  'prototype',
  'constructor',
]);
const actionReserved = new Set([
  ...reservedResourceNames,
  ...Object.keys(standardOperations),
  'query',
  'page',
  'cursor',
  'with',
  ...Object.getOwnPropertyNames(Object.prototype),
  ...Object.getOwnPropertyNames(Function.prototype),
  ...Object.getOwnPropertyNames(function () {}),
]);
/** 调用名由声明者自由选择；只检查直接调用槽位和同位置关系。 */
export function validateActionNames(
  actions: Readonly<Record<string, unknown>> | undefined,
  relations: Readonly<Record<string, unknown>> | undefined,
  label: string,
): void {
  for (const name of Object.keys(actions ?? {})) {
    if (actionReserved.has(name) || Object.hasOwn(relations ?? {}, name))
      throw new ResourceConfigurationError(
        `${label}.${name}: conflicting direct action name; choose another declaration name`,
      );
  }
}
