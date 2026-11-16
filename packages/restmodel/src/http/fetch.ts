/** 标准 Fetch Transport；供浏览器及具有 fetch 的运行时使用。 */
import { decodeHttpBody } from './decode.js';
import type { Transport } from './types.js';
/**
 * 创建不跟随重定向的 Fetch 执行器。
 * @returns Transport，非 2xx 保留正常响应，非 JSON 正文保留字符串。
 * @throws Error 底层 Fetch 或 JSON 解码失败时传播给公共执行层。
 */
export function fetchTransport(): Transport {
  return async (request) => {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      ...(request.signal ? { signal: request.signal } : {}),
      redirect: 'manual',
    });
    const text = response.status === 204 || response.status === 205 ? '' : await response.text();
    const headers = Object.fromEntries(response.headers);
    return {
      status: response.status,
      headers,
      body: decodeHttpBody(text, response.status, headers),
    };
  };
}
