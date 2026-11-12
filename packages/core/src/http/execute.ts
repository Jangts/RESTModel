/** 公共 HTTP 执行：预算、取消、状态检查及隔离观测，保持一次实际请求。 */
import { ResourceConfigurationError } from '../configuration.js';
import { normalizeHeaders } from './headers.js';
import { RequestError } from './errors.js';
import type { HttpOptions, HttpRequest, HttpResponse, RequestOptions } from './types.js';

/**
 * 执行已编码请求，始终清理 timer 和调用方 signal 监听。
 * @param options 执行器及准备/观测钩子。
 * @param input 编码后的请求。
 * @param settings 单次超时与 signal；与 input.signal 组合，不替换原信号。
 * @returns 通过 2xx 检查的 HTTP 响应。
 * @throws RequestError 取消、超时、网络或 HTTP 失败。
 */
export async function executeHttp(
  options: HttpOptions,
  input: HttpRequest,
  settings: RequestOptions = {},
): Promise<HttpResponse> {
  if (
    settings.timeout !== undefined &&
    (!Number.isFinite(settings.timeout) || settings.timeout <= 0)
  )
    throw new ResourceConfigurationError('request.timeout: expected a positive finite number');
  const signals = [
    ...new Set(
      [input.signal, settings.signal].filter(
        (signal): signal is AbortSignal => signal !== undefined,
      ),
    ),
  ];
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reason: 'timeout' | 'cancel' = 'cancel';
  let rejectAbort: (error: RequestError) => void = () => {};
  let request = input;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    controller.abort();
    rejectAbort(new RequestError(reason, { request }));
  };
  const run = async () => {
    if (controller.signal.aborted) throw new RequestError(reason, { request });
    request = { ...input, signal: controller.signal };
    if (options.prepareRequest) {
      try {
        request = await options.prepareRequest(request);
      } catch (cause) {
        throw new RequestError('prepare', { request, cause });
      }
    }
    if (controller.signal.aborted) throw new RequestError(reason, { request });
    // 准备器可改头和 body，不能绕过服务 URL 约束或取消信号。
    if (request.url !== input.url || request.method !== input.method)
      throw new ResourceConfigurationError('prepareRequest: URL and method cannot change');
    request = Object.freeze({
      ...request,
      headers: Object.freeze({ ...normalizeHeaders(request.headers) }),
      signal: controller.signal,
    });
    const response = await options.transport(request);
    if (
      !response ||
      !Number.isInteger(response.status) ||
      response.status < 100 ||
      response.status > 599 ||
      !response.headers ||
      typeof response.headers !== 'object'
    )
      throw new RequestError('response-shape', { request });
    if (response.status < 200 || response.status >= 300)
      throw new RequestError('http', { request, response });
    if (options.observeResponse) {
      try {
        void Promise.resolve(options.observeResponse(response)).catch(() => {});
      } catch {
        /* 观测失败不改变已完成的业务结果。 */
      }
    }
    return response;
  };
  try {
    for (const signal of signals) signal.addEventListener('abort', abort, { once: true });
    if (signals.some((signal) => signal.aborted)) abort();
    if (settings.timeout !== undefined)
      timer = setTimeout(() => {
        reason = 'timeout';
        abort();
      }, settings.timeout);
    return await Promise.race([aborted, run()]);
  } catch (cause) {
    if (cause instanceof RequestError || cause instanceof ResourceConfigurationError) throw cause;
    throw new RequestError(controller.signal.aborted ? reason : 'network', { request, cause });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    for (const signal of signals) signal.removeEventListener('abort', abort);
  }
}
