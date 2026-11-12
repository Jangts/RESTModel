/** HTTP 头的共同归一化，编码阶段和鉴权准备后使用同一规则。 */
import { configurationFields, ResourceConfigurationError } from '../configuration.js';
/**
 * 创建小写头名快照，undefined 删除，拒绝控制字符和非法头名。
 * @param input 调用方或准备器的头对象。
 * @returns 自有头字段的新快照。
 * @throws ResourceConfigurationError 头名或值无效。
 */
export function normalizeHeaders(input: unknown): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const [name, value] of configurationFields(input, 'headers')) {
    if (
      !/^[!#$%&'*+.^_`|~\da-z-]+$/iu.test(name) ||
      (value !== undefined && (typeof value !== 'string' || /[\r\n\0]/u.test(value)))
    )
      throw new ResourceConfigurationError('headers: invalid name or value');
    if (value === undefined) delete result[name.toLowerCase()];
    else result[name.toLowerCase()] = value as string;
  }
  return result;
}
