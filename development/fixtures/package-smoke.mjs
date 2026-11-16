import assert from 'node:assert/strict';
import { createClient, resource, resourceOf, fetchTransport, action } from '@restmodel/restmodel';
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
  ]),
  resources: {
    users: resource({ operations: '*', actions: { search: action({ method: 'GET', path: '' }) } }),
  },
});
const list = await api.users.list();
assert.equal((await api.users.search())[0].name, 'package');
assert.equal(api.users.$.actions, undefined);
assert.equal(list.items[0].name, 'package');
assert.equal(typeof resourceOf(list.items[0]), 'function');
const useStore = defineResourceStore('package', (_, signal) => api.users.with({ signal }).list());
const store = useStore(createPinia());
await store.run();
assert.equal(store.data.items[0].id, 0);
store.$dispose();
assert.equal(typeof axiosTransport(), 'function');
await assert.rejects(import('@restmodel/restmodel/src/client.js'), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
});
console.log('Public ESM imports, request/state pipeline and internal export boundary passed');
