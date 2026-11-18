/** 标准 Fetch 执行器：绑定可替换 Fetch，执行共享传输策略并保留真实 HTTP 元数据。 */
import { decodeHttpBody } from './decode.js';
import { configurationFields, ResourceConfigurationError } from '../configuration.js';
import { transportOptionKeys, transportSettings } from './options.js';
import { RequestError } from './errors.js';
import type { Transport, TransportSettings } from './types.js';

/** Fetch 执行器设置；不允许默认值覆盖最终 URL、方法、正文或取消信号。 */
export interface FetchTransportOptions extends TransportSettings {
  /** 可注入带应用会话或监测的 Fetch；省略时在每次执行时读取全局 Fetch。 */
  readonly fetch?: typeof globalThis.fetch | undefined;
}

/**
 * 创建不自动重试、不跟随重定向的 Fetch 执行器。
 * @param options 可选 Fetch 与传输缺省；请求中显式字段优先，undefined 继承。
 * @returns 完整读取响应或主动取消未使用正文的 Transport；非 2xx 仍返回正常 HTTP 响应。
 * @throws ResourceConfigurationError 配置无效；执行或解码失败保留原因和真实响应头。
 */
export function fetchTransport(options: FetchTransportOptions = {}): Transport {
  const fields = configurationFields(options, 'fetchTransport');
  const snapshot = Object.fromEntries(fields) as FetchTransportOptions;
  for (const key of fields.keys()) {
    if (key !== 'fetch' && !(transportOptionKeys as readonly string[]).includes(key))
      throw new ResourceConfigurationError(`fetchTransport.${key}: unknown field`);
  }
  if (snapshot.fetch !== undefined && typeof snapshot.fetch !== 'function')
    throw new ResourceConfigurationError('fetchTransport.fetch: expected a function');
  const defaults = transportSettings(snapshot);
  return async (request) => {
    try {
      const settings = { ...defaults, ...transportSettings(request) };
      const response = await (snapshot.fetch ?? globalThis.fetch)(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        ...(request.signal ? { signal: request.signal } : {}),
        ...(settings.credentials === undefined ? {} : { credentials: settings.credentials }),
        ...(settings.cache === undefined ? {} : { cache: settings.cache }),
        ...(settings.keepalive === undefined ? {} : { keepalive: settings.keepalive }),
        ...(settings.cache === 'only-if-cached' ? { mode: 'same-origin' as const } : {}),
        redirect: 'manual',
      });
      const headers = Object.fromEntries(response.headers);
      if (response.ok && settings.responseType === 'none') {
        void response.body?.cancel().catch(() => {});
        return { status: response.status, headers };
      }
      const text = response.status === 204 || response.status === 205 ? '' : await response.text();
      return {
        status: response.status,
        headers,
        body: decodeHttpBody(text, response.status, headers, settings.responseType),
      };
    } catch (cause) {
      if (cause instanceof RequestError) throw cause;
      const name = cause instanceof Error ? cause.name : undefined;
      if (name === 'TimeoutError' || name === 'AbortError')
        throw new RequestError(name === 'TimeoutError' ? 'timeout' : 'cancel', { request, cause });
      throw cause;
    }
  };
}
