/** 凭据策略的唯一目录，同时约束公共类型与动态输入。 */
import { ResourceConfigurationError } from '../configuration.js';
export const credentialsModes = ['omit', 'same-origin', 'include'] as const;
export function assertCredentials(
  value: unknown,
): asserts value is (typeof credentialsModes)[number] | undefined {
  if (value !== undefined && !credentialsModes.some((mode) => mode === value))
    throw new ResourceConfigurationError('request.credentials: invalid credential policy');
}
