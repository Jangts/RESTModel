/** HTTP Mock 装饰 Transport，匹配经过共同准备和编码的最终请求。 */
import type { HttpRequest, HttpResponse, Transport } from '@restmodel/restmodel';
/** 单条 HTTP 规则，按声明顺序首次匹配。 */
export interface MockRule {
  /** 可按 method、url、headers、body 共同判定。 */
  readonly match: (request: HttpRequest) => boolean;
  /** 返回 HTTP 响应，业务信封仍由 core 处理。 */
  readonly respond: (request: HttpRequest) => HttpResponse | Promise<HttpResponse>;
  /** 可选模拟延迟，取消时清理监听和 timer。 */
  readonly delay?: number;
}
/** Mock 未命中策略，缺省报错而非伪造成功。 */
export interface MockOptions {
  /** passthrough 才调用真实执行器。 */
  readonly unmatched?: 'error' | 'passthrough';
}
function wait(delay: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new Error('Mock request aborted'));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
/**
 * 包装公开 Transport，无资源操作旁路。
 * @param realTransport 未命中透传时使用的执行器。
 * @param rules HTTP 规则快照。
 * @param options 未命中策略。
 * @returns 兼容公共取消契约的 Transport。
 * @throws Error 非法规则、未命中或模拟网络失败。
 */
export function withMock(
  realTransport: Transport,
  rules: readonly MockRule[],
  options: MockOptions = {},
): Transport {
  if (options.unmatched !== undefined && !['error', 'passthrough'].includes(options.unmatched))
    throw new Error('Invalid Mock unmatched policy');
  const snapshot = rules.map((rule) => {
    if (
      typeof rule.match !== 'function' ||
      typeof rule.respond !== 'function' ||
      (rule.delay !== undefined && (!Number.isFinite(rule.delay) || rule.delay < 0))
    )
      throw new Error('Invalid Mock rule');
    return Object.freeze({ ...rule });
  });
  return async (request) => {
    const rule = snapshot.find((item) => item.match(request));
    if (!rule) {
      if (options.unmatched === 'passthrough') return realTransport(request);
      throw new Error('No matching HTTP Mock rule');
    }
    if (rule.delay !== undefined) await wait(rule.delay, request.signal);
    if (request.signal?.aborted) throw new Error('Mock request aborted');
    return rule.respond(request);
  };
}
