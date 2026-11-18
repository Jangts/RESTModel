/** 可枚举传输策略及其运行时校验；客户端、原始请求与各执行器共同消费。 */
import { ResourceConfigurationError } from '../configuration.js';
import { credentialsModes } from './credentials.js';
import type { TransportSettings } from './types.js';

export const transportValues = {
  responseType: ['auto', 'json', 'text', 'none'],
  cache: ['default', 'no-store', 'reload', 'no-cache', 'force-cache', 'only-if-cached'],
} as const;

const transferRules = {
  credentials: (value: unknown) => credentialsModes.some((item) => item === value),
  responseType: (value: unknown) =>
    typeof value === 'string' && transportValues.responseType.some((item) => item === value),
  cache: (value: unknown) =>
    typeof value === 'string' && transportValues.cache.some((item) => item === value),
  keepalive: (value: unknown) => typeof value === 'boolean',
} satisfies Record<keyof TransportSettings, (value: unknown) => boolean>;
/** 客户端允许的设置字段；与传输策略目录同步展开。 */
export const transportOptionKeys = Object.keys(transferRules) as (keyof TransportSettings)[];
/** 单次请求设置的字段目录，传输字段从同一声明派生。 */
export const requestOptionKeys = ['headers', 'signal', 'timeout', 'result', ...transportOptionKeys];

/**
 * 校验并提取显式传输设置；undefined 表示继承，不擦除前层值。
 * @param input 请求或默认设置，未知业务字段不参与传输。
 * @returns 仅含显式有效传输字段的快照。
 * @throws ResourceConfigurationError 策略名称或类型无效。
 */
export function transportSettings(input: TransportSettings): TransportSettings {
  const output: Record<string, unknown> = {};
  for (const key of transportOptionKeys) {
    const value = input[key];
    if (value === undefined) continue;
    if (!transferRules[key](value))
      throw new ResourceConfigurationError(`request.${key}: invalid transport setting`);
    output[key] = value;
  }
  return output as TransportSettings;
}
