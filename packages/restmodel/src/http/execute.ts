/** 统一 HTTP 生命周期：独立请求上下文、取消、响应处理、错误通知与后台观测。 */
import { ResourceConfigurationError } from '../configuration.js';
import { assertCredentials } from './credentials.js';
import { normalizeHeaders } from './headers.js';
import { RequestError } from './errors.js';
import type {
  HttpOptions,
  HttpRequest,
  HttpResponse,
  RequestOptions,
  RequestContext,
} from './types.js';

/**
 * 执行已编码请求，共享生命周期并清理 timer、监听与请求关联状态。
 * @param options 执行器及准备、前台处理、错误通知与后台观测钩子。
 * @param input 编码后的 HTTP 请求。
 * @param settings 超时、凭据与 signal；外部信号与 input.signal 任一取消均生效。
 * @returns 通过 2xx 状态检查和前台处理的 HTTP 响应，不执行资源解包。
 * @throws RequestError 准备、执行、状态或前台处理失败；无效设置抛 ResourceConfigurationError。
 */
export function executeHttp(
  options: HttpOptions,
  input: HttpRequest,
  settings: RequestOptions = {},
): Promise<HttpResponse> {
  return executeRequest(options, input, settings, (response) => response);
}

/** 内部共同入口：将业务适配也包含在错误与请求上下文的生命周期内。 */
export async function executeRequest<TResult>(
  options: HttpOptions,
  input: HttpRequest,
  settings: RequestOptions,
  consume: (response: HttpResponse) => TResult,
): Promise<TResult> {
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
  const state = new Map<symbol, unknown>();
  let request = input;
  let response: HttpResponse | undefined;
  let finished = false;
  let closed = false;
  let consuming = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reason: 'timeout' | 'cancel' = 'cancel';
  let rejectAbort: (error: RequestError) => void = () => {};
  const context: RequestContext = Object.freeze(
    Object.defineProperties(Object.create(null), {
      request: Object.assign(Object.create(null), { get: () => request }),
      signal: Object.assign(Object.create(null), { value: controller.signal }),
      state: Object.assign(Object.create(null), { value: state }),
    }),
  );
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    if (closed || controller.signal.aborted) return;
    controller.abort();
    rejectAbort(new RequestError(reason, { request }));
  };
  const active = () => {
    if (finished || controller.signal.aborted) throw new RequestError(reason, { request });
  };
  const run = async () => {
    active();
    request = {
      ...input,
      ...(settings.credentials === undefined ? {} : { credentials: settings.credentials }),
      signal: controller.signal,
    };
    if (options.prepareRequest) {
      try {
        request = await options.prepareRequest(request, context);
      } catch (cause) {
        throw new RequestError('prepare', { request, cause });
      }
    }
    active();
    if (!request || request.url !== input.url || request.method !== input.method)
      throw new ResourceConfigurationError('prepareRequest: URL and method cannot change');
    assertCredentials(request.credentials);
    request = Object.freeze({
      ...request,
      headers: Object.freeze({ ...normalizeHeaders(request.headers) }),
      signal: controller.signal,
    });
    response = await options.transport(request);
    active();
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
    if (options.processResponse) {
      try {
        await options.processResponse(response, context);
      } catch (cause) {
        throw new RequestError('process', { request, response, cause });
      }
    }
    active();
    consuming = true;
    const result = consume(response);
    active();
    if (options.observeResponse) {
      try {
        void Promise.resolve(options.observeResponse(response)).catch(() => {});
      } catch {
        /* 后台遥测不改变业务结果。 */
      }
    }
    return result;
  };
  try {
    for (const signal of signals) signal.addEventListener('abort', abort, { once: true });
    if (signals.some((signal) => signal.aborted)) abort();
    if (settings.timeout !== undefined)
      timer = setTimeout(() => {
        reason = 'timeout';
        abort();
      }, settings.timeout);
    try {
      return await Promise.race([aborted, run()]);
    } catch (cause) {
      finished = true;
      const error =
        cause instanceof RequestError || cause instanceof ResourceConfigurationError
          ? cause
          : new RequestError(
              controller.signal.aborted ? reason : consuming ? 'response-shape' : 'network',
              {
                request,
                ...(response ? { response } : {}),
                cause,
              },
            );
      if (options.onError) {
        // 错误处理不得替换主错误或递归触发自己；取消时也不等待不合作的异步处理器。
        try {
          const notification = Promise.resolve(options.onError(error, context));
          void notification.catch(() => {});
          if (!controller.signal.aborted)
            await Promise.race([notification.catch(() => {}), aborted.catch(() => {})]);
        } catch {
          /* 保留原始请求失败。 */
        }
      }
      throw error;
    }
  } finally {
    finished = true;
    closed = true;
    if (timer !== undefined) clearTimeout(timer);
    for (const signal of signals) signal.removeEventListener('abort', abort);
    state.clear();
  }
}
