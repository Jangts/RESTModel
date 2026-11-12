/** 与具体请求库无关的 HTTP 公共契约。 */
import type { HttpMethod } from '../operations.js';
/** 编码完成的请求；Transport 必须监听 signal，且不自动跟随重定向。 */
export interface HttpRequest {
  /** 大写 HTTP 方法。 */
  readonly method: HttpMethod;
  /** 已编码查询的 URL。 */
  readonly url: string;
  /** 小写名称的头快照。 */
  readonly headers: Readonly<Record<string, string>>;
  /** 已编码 body，未提供时不发送。 */
  readonly body?: string | FormData | Blob | ArrayBuffer | undefined;
  /** 请求自身的取消信号；与 RequestOptions.signal 任一取消均生效，不代表服务端撤销。 */
  readonly signal?: AbortSignal | undefined;
}
/** 正常 HTTP 响应，非 2xx 也必须返回此结构。 */
export interface HttpResponse {
  /** HTTP 状态码。 */
  readonly status: number;
  /** 小写头名。 */
  readonly headers: Readonly<Record<string, string>>;
  /** 解码后的响应值。 */
  readonly body?: unknown;
}
/** 只执行最终 HTTP，不读取资源或 scheme；网络失败拒绝 Promise。 */
export type Transport = (request: HttpRequest) => Promise<HttpResponse>;
/** 单次执行设置。 */
export interface RequestOptions {
  /** 请求头补丁，undefined 删除已有头。 */
  readonly headers?: Readonly<Record<string, string | undefined>> | undefined;
  /** 调用方拥有的取消信号。 */
  readonly signal?: AbortSignal | undefined;
  /** 等待预算（毫秒），同时向 Transport 发送 abort。 */
  readonly timeout?: number | undefined;
  /** response 模式同时提供适配数据和原始 HTTP 响应；undefined 继承前一层模式。 */
  readonly result?: 'data' | 'response' | undefined;
}
/** 公共 HTTP 管线设置。 */
export interface HttpOptions {
  /** 唯一请求执行器。 */
  readonly transport: Transport;
  /** 最终快照之前准备请求；每次请求仅调用一次。 */
  readonly prepareRequest?:
    | ((request: HttpRequest) => HttpRequest | Promise<HttpRequest>)
    | undefined;
  /** 只读成功观测，失败被隔离，不重发。 */
  readonly observeResponse?: ((response: HttpResponse) => void | Promise<void>) | undefined;
}
