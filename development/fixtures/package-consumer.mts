import {
  createClient,
  resource,
  fetchTransport,
  action,
  type ResourceList,
  type OperationDeclaration,
  iteratePages,
  type RequestContext,
  type CredentialsMode,
  type FetchTransportOptions,
  type ResourceInputs,
  resourceOf,
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

const credentials: CredentialsMode = 'omit';
const precise = createClient({
  baseURL: '/api',
  defaults: { credentials },
  prepareRequest(request, context: RequestContext) {
    context.state.set(Symbol(), 'private');
    return request;
  },
  resources: {
    users: resource({
      operations: ['list', 'get', 'patch'],
      members: { profile: resource({ kind: 'singleton', operations: ['get'] }).typed<User>() },
      actions: { lookup: action({ method: 'GET', path: ':tenantId/:id' }) },
    }).typed<User>(),
  },
});
const preciseUser: Promise<User | undefined> = precise.users(0).get();
const preciseProfile: Promise<User | undefined> = precise.users(0).$.child('profile').get();
async function consumePages() {
  for await (const page of iteratePages(precise.users, { size: 10 })) {
    const users: User[] = page.items;
    void users;
  }
}
void preciseUser;
void preciseProfile;
void consumePages;
// @ts-expect-error model binding preserves capability restrictions
precise.users(0).delete();
// @ts-expect-error model binding preserves action path inference
precise.users.lookup({ id: 1 });
// @ts-expect-error model inputs retain their field types
precise.users(0).patch({ name: 123 });
// @ts-expect-error pagination helper expects data-mode results
iteratePages(precise.users.with({ result: 'response' }));

const fetchOptions: FetchTransportOptions = {
  fetch: globalThis.fetch,
  responseType: 'json',
  cache: 'no-store',
  keepalive: false,
};
const writable = createClient({
  baseURL: '/api',
  transport: fetchTransport(fetchOptions),
  resources: {
    users: resource({ operations: ['get', 'put'] }).typed<
      User,
      {
        put: { revision: number; name: string };
      }
    >(),
  },
});
writable.users(0).with({ responseType: 'none' }).put({ revision: 1, name: 'saved' });
writable
  .users(0)
  .get()
  .then((user) => {
    if (!user) return;
    resourceOf(user).put({ revision: 2, name: 'saved' });
    // @ts-expect-error tarball entities retain independent write contracts
    resourceOf(user).put({ name: 'missing revision' });
  });
const inputs: ResourceInputs = { put: { revision: 1 } };
void inputs;
// @ts-expect-error tarball transport options reject unknown policies
writable.users(0).with({ responseType: 'xml' });
// @ts-expect-error read fields do not satisfy the independent write contract
writable.users(0).put({ id: 0, name: 'missing revision' });
