/** 标准操作的局部 HTTP 映射；保留资源逻辑身份，不把例外接口变成 action。 */
import { ResourceConfigurationError } from './configuration.js';
import { pathSegments } from './request.js';
import type { OperationOverride, ResolvedOperation } from './operations.js';

/** 校验已合并的路径与身份传递规则。 */
export function validateOperationRoute(
  operation: OperationOverride,
  target: ResolvedOperation['target'],
  label: string,
): void {
  const path = Object.hasOwn(operation, 'path') ? operation.path : undefined;
  const queryKey = Object.hasOwn(operation, 'queryKey') ? operation.queryKey : undefined;
  if (path !== undefined) {
    if (typeof path !== 'string' || !path || path.startsWith('/'))
      throw new ResourceConfigurationError(`${label}.path: expected a resource-relative path`);
    pathSegments(path);
    if (path.split('/').some((segment) => segment.includes(':') && segment !== ':id'))
      throw new ResourceConfigurationError(`${label}.path: only the :id segment is supported`);
  }
  if (queryKey !== undefined && (typeof queryKey !== 'string' || !queryKey.trim()))
    throw new ResourceConfigurationError(`${label}.queryKey: expected a nonempty string`);
  const placeholders = path?.split('/').filter((segment) => segment === ':id').length ?? 0;
  if (placeholders > 1 || (placeholders && queryKey !== undefined))
    throw new ResourceConfigurationError(`${label}: choose one identity location`);
  if ((placeholders || queryKey !== undefined) && target !== 'member')
    throw new ResourceConfigurationError(`${label}: identity mapping requires a collection member`);
  if (target === 'member' && path !== undefined && !placeholders && queryKey === undefined)
    throw new ResourceConfigurationError(`${label}: member path requires :id or queryKey`);
}

/** 生成最终操作地址，身份查询优先于用户同名 query，不改变后续实体引用。 */
export function operationRoute(
  operation: ResolvedOperation,
  resource: readonly string[],
  current: readonly string[],
  identity: readonly string[] | undefined,
  query: URLSearchParams,
): { segments: readonly string[]; query: URLSearchParams } {
  const path = Object.hasOwn(operation, 'path') ? operation.path : undefined;
  const queryKey = Object.hasOwn(operation, 'queryKey') ? operation.queryKey : undefined;
  if (path === undefined && queryKey === undefined) return { segments: current, query };
  if (operation.target === 'member' && identity?.length !== 1)
    throw new ResourceConfigurationError(
      'operation route: custom identity mapping requires one identity segment',
    );
  const segments =
    path === undefined
      ? [...resource]
      : [
          ...resource,
          ...path
            .split('/')
            .filter(Boolean)
            .flatMap((segment) => (segment === ':id' ? [identity![0]!] : pathSegments(segment))),
        ];
  if (queryKey !== undefined) {
    query = new URLSearchParams(query);
    query.set(queryKey, decodeURIComponent(identity![0]!));
  }
  return { segments, query };
}
