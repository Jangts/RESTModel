/** 按需翻页辅助，不引入缓存、自动预取或新的资源终端方法。 */
import { ResourceConfigurationError } from './configuration.js';
import { ResourceList } from './results.js';

/** 可按页请求数据的资源；取消通过原引用的 with({ signal }) 传递。 */
export interface PageSource<TModel> {
  page(number: number, size: number): { list(): Promise<ResourceList<TModel> | undefined> };
}
/** 有界的逐页读取设置，不改变普通 list 的单请求行为。 */
export interface PageIterationOptions {
  /** 请求每页大小，正安全整数，默认 100；服务器仍可自行限制。 */
  readonly size?: number;
  /** 起始逻辑页码，正安全整数，默认 1。 */
  readonly start?: number;
  /** 单次遍历的最大页数，正安全整数，默认 1000；未结束则报错。 */
  readonly maxPages?: number;
}
/**
 * 按需逐页读取；不预取、不缓存、不发送额外收尾请求。
 * @param source 数据模式的 page/offset 资源引用；查询、凭据与取消信号沿用该引用。
 * @param options 每页大小、起始页及读取上限，均为正安全整数。
 * @returns 惰性异步迭代器，逐次产出 ResourceList，包括收到的最后空页。
 * @throws ResourceConfigurationError 设置无效、非数据模式或达到上限时抛出；请求失败原样传播。
 */
export async function* iteratePages<TModel>(
  source: PageSource<TModel>,
  { size = 100, start = 1, maxPages = 1000 }: PageIterationOptions = {},
): AsyncGenerator<ResourceList<TModel>, void, unknown> {
  for (const value of [size, start, maxPages])
    if (!Number.isSafeInteger(value) || value < 1)
      throw new ResourceConfigurationError('iteratePages: expected positive safe integers');
  let count = 0;
  for (let offset = 0; offset < maxPages; offset++) {
    if (!Number.isSafeInteger(start + offset))
      throw new ResourceConfigurationError('iteratePages: page number overflow');
    const result = await source.page(start + offset, size).list();
    if (result === undefined) return;
    if (!(result instanceof ResourceList))
      throw new ResourceConfigurationError('iteratePages: data-mode ResourceList required');
    count += result.items.length;
    yield result;
    if (
      !result.items.length ||
      (start === 1 && result.total !== undefined && count >= result.total)
    )
      return;
  }
  throw new ResourceConfigurationError('iteratePages: maxPages reached before completion');
}
