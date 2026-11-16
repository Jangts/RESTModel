/** 两个真实开放平台的公开只读合同；Demo 和 live 测试共用配置，不替换 HTTP。 */
import { createClient, resource, action } from '../../packages/restmodel/dist/index.js';

export const platforms = Object.freeze({
  gitee: Object.freeze({
    name: 'Gitee · Releases',
    note: 'Real public releases; the API uses id for member addresses.',
    origin: 'https://gitee.com/api/v5',
    owner: 'mindspore',
    repository: 'mindspore',
    collection: 'releases',
    identity: 'id',
    query: Object.freeze({}),
    docs: 'https://gitee.com/api/v5/swagger#/Repositories/getV5ReposOwnerRepoReleases',
  }),
  github: Object.freeze({
    name: 'GitHub · Issues',
    note: 'GitHub Issues includes pull requests; member addresses use number, not the global id.',
    origin: 'https://api.github.com',
    owner: 'octocat',
    repository: 'Hello-World',
    collection: 'issues',
    identity: 'number',
    query: Object.freeze({ state: 'all', sort: 'created', direction: 'asc' }),
    docs: 'https://docs.github.com/en/rest/issues/issues#list-repository-issues',
  }),
});

/** 配置真实服务；钩子仅观测最终请求/响应，不提供伪响应。 */
export function platformClient(key, { prepareRequest, observeResponse } = {}) {
  const platform = Object.hasOwn(platforms, key) ? platforms[key] : undefined;
  if (!platform) throw new Error(`Unknown platform: ${key}`);
  return createClient({
    baseURL: platform.origin,
    defaults: { timeout: 15000, headers: { accept: 'application/json' } },
    scheme: { identity: platform.identity, pagination: { mode: 'page', size: 'per_page' } },
    resources: {
      [platform.collection]: resource({
        path: `repos/${platform.owner}/${platform.repository}/${platform.collection}`,
        operations: ['list', 'get'],
      }),
    },
    actions: {
      repository: action({ method: 'GET', path: '/repos/:owner/:repo' }),
    },
    prepareRequest,
    observeResponse,
  });
}
