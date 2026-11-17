import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, resource, iteratePages, ResourceConfigurationError } from '../dist/index.js';
function client(pages, { total, signal } = {}) {
  const requests = [];
  const api = createClient({
    baseURL: '/api',
    defaults: { signal },
    scheme: { pagination: { mode: 'page', size: 'pageSize', items: 'items', total: 'total' } },
    resources: { items: resource({ operations: ['list'] }) },
    transport: async (request) => {
      requests.push(request.url);
      const page = Number(new URL(request.url, 'https://test.local').searchParams.get('page'));
      return {
        status: 200,
        headers: {},
        body: { items: pages[page - 1] ?? [], ...(total === undefined ? {} : { total }) },
      };
    },
  });
  return { source: api.items, requests };
}

test('iteratePages is lazy, follows total and adds no terminal method', async () => {
  const { source, requests } = client([[{ id: 1 }], [{ id: 2 }]], { total: 2 });
  const iterator = iteratePages(source, { size: 100 });
  assert.equal(requests.length, 0);
  const items = [];
  for await (const page of iterator) items.push(...page.items);
  assert.deepEqual(
    items.map((item) => item.id),
    [1, 2],
  );
  assert.equal(requests.length, 2);
  assert.ok(requests[0].includes('pageSize=100'));
  assert.equal(source.iteratePages, undefined);
});

test('unknown totals require an empty page, and breaking iteration sends no prefetch', async () => {
  const { source, requests } = client([[{ id: 1 }], [{ id: 2 }]]);
  let pages = 0;
  for await (const _page of iteratePages(source)) pages++;
  assert.equal(pages, 3);
  assert.equal(requests.length, 3);
  const second = client([[{ id: 1 }], [{ id: 2 }]]);
  for await (const _page of iteratePages(second.source)) break;
  assert.equal(second.requests.length, 1);
});

test('noninitial starts read to an empty page and no-content responses end without a page', async () => {
  const { source, requests } = client([[{ id: 1 }], [{ id: 2 }]], { total: 1 });
  const ids = [];
  for await (const page of iteratePages(source, { start: 2 }))
    ids.push(...page.items.map((item) => item.id));
  assert.deepEqual(ids, [2]);
  assert.equal(requests.length, 2);
  const api = createClient({
    baseURL: '/api',
    scheme: { pagination: { mode: 'offset' } },
    resources: { items: resource({ operations: ['list'] }) },
    transport: async (request) => {
      assert.equal(request.url, '/api/items?offset=20&limit=10');
      return { status: 204, headers: {} };
    },
  });
  for await (const _page of iteratePages(api.items, { start: 3, size: 10 }))
    assert.fail('204 must not yield an invented empty list');
});

test('limits are explicit and cancellation prevents the next actual HTTP request', async () => {
  const { source } = client([[{ id: 1 }], [{ id: 2 }]]);
  await assert.rejects(async () => {
    for await (const _page of iteratePages(source, { maxPages: 1 })) {
    }
  }, /maxPages/);
  await assert.rejects(async () => {
    for await (const _page of iteratePages(source, { size: 0 })) {
    }
  }, ResourceConfigurationError);
  const controller = new AbortController();
  const cancelled = client([[{ id: 1 }], [{ id: 2 }]], { signal: controller.signal });
  await assert.rejects(
    async () => {
      for await (const _page of iteratePages(cancelled.source)) controller.abort();
    },
    { kind: 'cancel' },
  );
  assert.equal(cancelled.requests.length, 1);
});
