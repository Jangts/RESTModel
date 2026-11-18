import assert from 'node:assert/strict';
import {
  createClient,
  resource,
  resourceOf,
  fetchTransport,
  action,
  iteratePages,
  decodeHttpBody,
} from '@restmodel/restmodel';
import { axiosTransport } from '@restmodel/axios';
import { withMock } from '@restmodel/mock';
import { defineResourceStore } from '@restmodel/pinia';
import { createPinia } from 'pinia';
const api = createClient({
  baseURL: '/api',
  transport: withMock(fetchTransport(), [
    {
      match: (r) => r.url === '/api/users',
      respond: () => ({ status: 200, headers: {}, body: [{ id: 0, name: 'package' }] }),
    },
    {
      match: (r) => r.url.startsWith('/api/users?'),
      respond: () => ({ status: 200, headers: {}, body: [] }),
    },
  ]),
  resources: {
    users: resource({
      operations: '*',
      actions: { search: action({ method: 'GET', path: '' }) },
    }).typed(),
  },
});
const list = await api.users.list();
assert.equal((await api.users.search())[0].name, 'package');
assert.equal(api.users.$.actions, undefined);
assert.equal(list.items[0].name, 'package');
assert.equal(typeof resourceOf(list.items[0]), 'function');
let pages = 0;
for await (const page of iteratePages(api.users)) {
  assert.equal(page.items.length, 0);
  pages++;
}
assert.equal(pages, 1);
const useStore = defineResourceStore('package', (_, signal) => api.users.with({ signal }).list());
const store = useStore(createPinia());
await store.run();
assert.equal(store.data.items[0].id, 0);
store.$dispose();
assert.equal(typeof axiosTransport(), 'function');
assert.deepEqual(decodeHttpBody('{"value":1}', 200, {}, 'json'), { value: 1 });
let fetched = 0;
const injected = createClient({
  baseURL: '/api',
  resources: {},
  transport: fetchTransport({
    fetch: async (url, init) => {
      fetched++;
      assert.equal(url, '/api/value');
      assert.equal(init.cache, 'no-store');
      assert.equal(init.keepalive, false);
      return new Response('{"value":1}', { headers: { 'content-type': 'text/plain' } });
    },
  }),
});
const decoded = await injected.$.request({
  method: 'GET',
  path: 'value',
  options: { responseType: 'json', cache: 'no-store', keepalive: false },
});
assert.equal(decoded.body.value, 1);
assert.equal(decoded.headers['content-type'], 'text/plain');
assert.equal(fetched, 1);
await assert.rejects(import('@restmodel/restmodel/src/client.js'), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
});
console.log('Public ESM imports, request/state pipeline and internal export boundary passed');
