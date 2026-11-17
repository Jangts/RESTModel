/** Axios Transport：只消费 core 的公共 HTTP 契约，不推导资源或处理业务信封。 */
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { RequestError, decodeHttpBody } from '@restmodel/restmodel';
import type { Transport } from '@restmodel/restmodel';
/**
 * 复用 Axios 实例执行最终请求；实例拦截器属于调用方信任边界。
 * @param instance 可选已有实例；缺省创建隔离实例。
 * @returns 非 2xx 也正常返回响应的 Transport，不跟随重定向。
 * @throws Error 网络、取消或响应解码失败交给 core 分类。
 */
export function axiosTransport(instance: AxiosInstance = axios.create()): Transport {
  return async (request) => {
    try {
      const response = await instance.request<string>({
        baseURL: '',
        method: request.method,
        url: request.url,
        headers: { ...request.headers },
        data: request.body,
        ...(request.signal ? { signal: request.signal } : {}),
        validateStatus: () => true,
        maxRedirects: 0,
        ...(typeof window === 'undefined' && request.credentials === undefined
          ? {}
          : { adapter: 'fetch' as const, fetchOptions: { redirect: 'manual' as const } }),
        // Axios Fetch 在运行时接受三态字符串，但其公共声明仍只标注 boolean。
        ...(request.credentials === undefined
          ? {}
          : { withCredentials: request.credentials as unknown as boolean }),
        responseType: 'text',
        transformResponse: [],
      });
      const headers = Object.fromEntries(
        Object.entries(response.headers)
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
          .map(([key, value]) => [key.toLowerCase(), value]),
      );
      const body = decodeHttpBody(response.data, response.status, headers);
      return { status: response.status, headers, body };
    } catch (cause) {
      if (axios.isAxiosError(cause) && ['ECONNABORTED', 'ETIMEDOUT'].includes(cause.code ?? ''))
        throw new RequestError('timeout', { request, cause });
      if (axios.isCancel(cause)) throw new RequestError('cancel', { request, cause });
      throw cause;
    }
  };
}
