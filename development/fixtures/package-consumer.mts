import {
  createClient,
  resource,
  fetchTransport,
  action,
  type ResourceList,
  type OperationDeclaration,
} from '@restmodel/restmodel';
import { axiosTransport } from '@restmodel/axios';
import { withMock } from '@restmodel/mock';
import { defineResourceStore } from '@restmodel/pinia';
interface User {
  id: number;
  name: string;
}
const api = createClient({
  baseURL: '/api',
  transport: axiosTransport(),
  resources: { users: resource<User>({ operations: '*' }) },
});
const result: Promise<User | undefined> = api.users(0).get();
const list: Promise<ResourceList<User> | undefined> = api.users.list();
const useStore = defineResourceStore('typed', (_: void, signal) =>
  api.users.with({ signal }).list(),
);
withMock(fetchTransport(), []);
// @ts-expect-error model input must retain field types
api.users(0).patch({ name: 123 });
void result;
void list;
void useStore;
const exact = createClient({
  baseURL: '/api',
  transport: fetchTransport(),
  resources: {
    read: resource({
      operations: ['get'],
      members: { profile: resource<User>({ kind: 'singleton', operations: ['get'] }) },
    }),
  },
});
// @ts-expect-error tarball preserves literal capability restrictions
exact.read.list();
// @ts-expect-error tarball preserves member position restrictions
exact.read(0).post({});
const related: Promise<User | undefined> = exact.read(0).$.child('profile').get();
const relatedWrapped = exact.read(0).with({ result: 'response' }).$.child('profile').get();
relatedWrapped.then((value) => {
  const status: number = value.response.status;
  void status;
});
void related;

const lookup = {
  operation: 'get',
  path: 'getById',
  queryKey: 'id',
} as const satisfies OperationDeclaration;
const flexible = createClient({
  baseURL: '/api',
  resources: {
    users: resource({
      operations: ['list', lookup],
      actions: {
        search: action<{ name: string }, { count: number }>({ method: 'GET', path: 'get' }),
      },
    }),
  },
});
flexible.users(0).get();
const count: Promise<{ count: number }> = flexible.users.search({ name: 'x' });
void count;
// @ts-expect-error action input is checked across the tarball boundary
flexible.users.search({ name: 1 });
// @ts-expect-error only one action invocation entry exists
flexible.users.$.actions.search({ name: 'x' });
// @ts-expect-error operation object does not grant undeclared writes
flexible.users(0).delete();

const actionPaths = createClient({
  baseURL: '/api',
  resources: {
    users: resource({
      actions: {
        lookup: action({ method: 'GET', path: ':tenantId/:id' }),
      },
    }),
  },
});
actionPaths.users.lookup({ tenantId: 0, id: 'a/b', detail: true });
// @ts-expect-error placeholder inference survives published declaration boundaries
actionPaths.users.lookup({ id: 1 });
