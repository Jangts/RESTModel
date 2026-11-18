/** Transport 可复用的 HTTP 正文解码，避免不同适配器出现 JSON 行为分叉。 */
import { RequestError } from './errors.js';
import type { TransportSettings } from './types.js';
import { transportSettings } from './options.js';
/**
 * 按 Content-Type 解码文本，不将错误 JSON 归为无响应网络失败。
 * @param text HTTP 正文文本。
 * @param status HTTP 状态码。
 * @param headers 已归一为小写名称的真实响应头。
 * @param responseType 解码策略，缺省 auto；json 显式解析，text 保留文本，none 只忽略成功正文。
 * @returns JSON 值、普通文本或无正文的 undefined；错误状态的无效 JSON 保留文本。
 * @throws RequestError 成功状态声明 JSON 但正文无效时抛 response-shape。
 */
export function decodeHttpBody(
  text: string,
  status: number,
  headers: Readonly<Record<string, string>>,
  responseType: TransportSettings['responseType'] = 'auto',
): unknown {
  transportSettings({ responseType });
  if (
    status === 204 ||
    status === 205 ||
    text === '' ||
    (responseType === 'none' && status >= 200 && status < 300)
  )
    return undefined;
  if (responseType === 'text') return text;
  if (
    responseType !== 'json' &&
    !/^(?:application|text)\/(?:[\w.+-]*\+)?json(?:\s*;|$)/iu.test(headers['content-type'] ?? '')
  )
    return text;
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    if (status < 200 || status >= 300) return text;
    throw new RequestError('response-shape', { response: { status, headers, body: text }, cause });
  }
}
