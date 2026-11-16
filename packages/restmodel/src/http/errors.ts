/** 执行阶段错误；诊断输出仅包含分类，不保存敏感请求正文。 */
import type { HttpRequest, HttpResponse } from './types.js';
/** 稳定执行错误分类。 */
export type RequestErrorKind =
  | 'unsupported-operation'
  | 'identity'
  | 'prepare'
  | 'network'
  | 'timeout'
  | 'cancel'
  | 'http'
  | 'business'
  | 'response-shape';
/** 统一错误；敏感上下文仅通过显式程序化访问提供，不参与枚举或 JSON。 */
export class RequestError extends Error {
  /** 本次请求失败的阶段。 */
  readonly kind: RequestErrorKind;
  /** 原始请求；显式访问可能包含凭据，不应用于日志。 */
  declare readonly request?: HttpRequest;
  /** 原始响应；显式访问可能包含敏感数据。 */
  declare readonly response?: HttpResponse;
  /** @returns 安全的日志/JSON 摘要，不输出原始上下文。 */
  toJSON(): { name: string; kind: RequestErrorKind; message: string } {
    return { name: this.name, kind: this.kind, message: this.message };
  }
  /** @returns Node 默认检查器的脱敏摘要，不引入 Node 依赖。 */
  [Symbol.for('nodejs.util.inspect.custom')](): unknown {
    return this.toJSON();
  }
  /**
   * 创建失败结果，不输出请求值。
   * @param kind 稳定分类。
   * @param context 可选原始上下文和原因。
   * @returns 错误实例。
   */
  constructor(
    kind: RequestErrorKind,
    context: { request?: HttpRequest; response?: HttpResponse; cause?: unknown } = {},
  ) {
    super(`RESTModel request failed: ${kind}`);
    this.name = 'RequestError';
    this.kind = kind;
    for (const [key, value] of Object.entries(context))
      Object.defineProperty(this, key, { value, enumerable: false });
  }
}
