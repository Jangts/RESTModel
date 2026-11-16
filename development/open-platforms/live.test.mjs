/** 显式运行的外部 API 集成测试：只读、无 token，不使用 Mock 或网络失败跳过。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceList, dataOf, resourceOf } from '../../packages/restmodel/dist/index.js';
import { platforms, platformClient } from './platforms.mjs';

for (const [key, platform] of Object.entries(platforms)) {
  test(platform.name, { timeout: 70000 }, async (t) => {
    const requests = [];
    const api = platformClient(key, {
      prepareRequest(request) {
        requests.push({ method: request.method, url: request.url, body: request.body });
        return request;
      },
    });
    const collection = api[platform.collection].query(platform.query);
    const prefix = `${platform.origin}/repos/${platform.owner}/${platform.repository}/${platform.collection}`;
    let first;

    await t.test('real list, pagination query and response modeling', async () => {
      const result = await collection.page(1, 2).with({ result: 'response' }).list();
      assert.equal(result.response.status, 200);
      assert.ok(result.data instanceof ResourceList);
      assert.ok(result.data.items.length > 0 && result.data.items.length <= 2);
      assert.deepEqual(result.data.items.map(dataOf), result.response.body);
      assert.equal(result.data.total, undefined);
      assert.deepEqual(result.data.page, { number: 1, size: 2 });
      const url = new URL(requests.at(-1).url);
      assert.equal(url.origin + url.pathname, prefix);
      assert.equal(url.searchParams.get('page'), '1');
      assert.equal(url.searchParams.get('per_page'), '2');
      assert.equal(url.searchParams.has('size'), false);
      first = result.data.items[0];
      assert.equal(typeof first[platform.identity], 'number');
    });

    await t.test(
      'entity followup uses the actual identity field and clears completed queries',
      async () => {
        assert.ok(first, 'No usable record returned by the live list');
        const result = await resourceOf(first).with({ result: 'response' }).get();
        assert.equal(result.response.status, 200);
        assert.equal(result.data[platform.identity], first[platform.identity]);
        assert.deepEqual(dataOf(result.data), result.response.body);
        assert.equal(requests.at(-1).url, `${prefix}/${first[platform.identity]}`);
        assert.equal(requests.at(-1).method, 'GET');
      },
    );

    await t.test('second page retains pagination metadata and list modeling', async () => {
      const page = await collection.page(2, 2).list();
      assert.ok(page instanceof ResourceList);
      assert.ok(page.items.length <= 2);
      assert.equal(page.page.number, 2);
      assert.equal(new URL(requests.at(-1).url).searchParams.get('page'), '2');
    });

    await t.test(
      'multi-parameter action fills path parameters without repeating them in query',
      async () => {
        const result = await api.repository({ owner: platform.owner, repo: platform.repository });
        assert.equal(
          result.full_name.toLowerCase(),
          `${platform.owner}/${platform.repository}`.toLowerCase(),
        );
        assert.equal(
          requests.at(-1).url,
          `${platform.origin}/repos/${platform.owner}/${platform.repository}`,
        );
        assert.equal(requests.at(-1).body, undefined);
        assert.ok(requests.every((request) => request.method === 'GET'));
      },
    );
  });
}
