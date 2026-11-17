import {
  createClient,
  resource,
  fetchTransport,
  ResourceList,
  action,
  defineScheme,
} from '../src/index.js';
interface User {
  id: number;
  name: string;
}
const api = createClient({
  baseURL: '/api',
  transport: fetchTransport(),
  resources: { users: resource<User>({ operations: '*' }) },
});
const one: Promise<User | undefined> = api.users(0).get();
const list: Promise<ResourceList<User> | undefined> = api.users.list();
const raw = api.users(0).with({ result: 'response' }).get();
raw.then((result) => {
  const user: User | undefined = result.data;
  const status: number = result.response.status;
  void user;
  void status;
});
api.users.post({ name: 'new' });
// @ts-expect-error wrong model field type
api.users.patch({ name: 123 });
// @ts-expect-error undeclared resource
api.orders.list();
// @ts-expect-error invalid identity type
api.users(null);
// @ts-expect-error unknown with option
api.users.with({ scheme: {} });
// @ts-expect-error invalid pagination mode
const invalid = defineScheme({ pagination: { mode: 'unknown' } });
// @ts-expect-error action requires HTTP method
const missing = action({ path: '/login' });
void one;
void list;
void invalid;
void missing;
const auth = createClient({
  baseURL: '/api',
  transport: fetchTransport(),
  resources: {},
  actions: { login: action<{ name: string }, { token: string }>({ method: 'POST' }) },
});
const token: Promise<{ token: string }> = auth.login({ name: 'Ivan' });
// @ts-expect-error wrong action input
auth.login({ name: 123 });
// @ts-expect-error undeclared action
auth.logout();
void token;
api.users.post(new FormData());

import {
  defineResourcePreset,
  resourceOf,
  type HttpResponse,
  type RequestOptions,
  type ResourceConfig,
} from '../src/index.js';
const options: RequestOptions = { result: Math.random() > 0.5 ? 'data' : 'response' };
const inheritedMode = api.users(0).with({ result: 'response' }).with({ result: undefined }).get();
const inheritedResponse: Promise<{ data: User | undefined; response: HttpResponse }> =
  inheritedMode;
const dynamicMode: Promise<User | undefined | { data: User | undefined; response: HttpResponse }> =
  api.users(0).with(options).get();
// @ts-expect-error dynamic options cannot promise only wrapped results
const dishonestMode: Promise<{ data: User | undefined; response: HttpResponse }> = api
  .users(0)
  .with(options)
  .get();
// @ts-expect-error collection cannot call a member operation
api.users.get();
// @ts-expect-error bound member cannot call a collection operation
api.users(0).list();
// @ts-expect-error member identity cannot be bound twice
api.users(0)(1);

const readPreset = defineResourcePreset({ operations: ['list', 'get'] });
const refined = createClient({
  baseURL: '/api',
  transport: fetchTransport(),
  resources: {
    empty: resource(),
    read: resource({ operations: ['get'] }),
    excluded: resource({ operations: { '*': true, delete: false } }),
    inherited: resource({ extends: readPreset, operations: { list: false } }),
    singleton: resource<User>({ kind: 'singleton', operations: '*' }),
    users: resource({
      operations: '*',
      members: {
        profile: resource<User>({ kind: 'singleton', operations: ['get'] }),
      },
      memberActions: { disable: action<{ reason: string }, { done: boolean }>({ method: 'POST' }) },
    }),
  },
});
// @ts-expect-error omission grants no methods
refined.empty.list();
// @ts-expect-error declaration does not grant list
refined.read.list();
refined.read(0).get();
// @ts-expect-error explicit false removes delete
refined.excluded(0).delete();
// @ts-expect-error child false removes inherited list
refined.inherited.list();
refined.inherited(0).get();
refined.singleton.get();
// @ts-expect-error singleton is not callable
refined.singleton(0);
// @ts-expect-error singleton cannot list
refined.singleton.list();
const profile: Promise<User | undefined> = refined.users(0).$.child('profile').get();
// @ts-expect-error exact relationship names are preserved
refined.users(0).$.child('missing');
// @ts-expect-error member actions do not appear on collection
refined.users.disable({ reason: 'x' });
const disabled: Promise<{ done: boolean }> = refined.users(0).disable({ reason: 'x' });
// @ts-expect-error member action input is checked
refined.users(0).disable({ reason: 1 });
const disabledResponse: Promise<{ data: { done: boolean }; response: HttpResponse }> = refined
  .users(0)
  .with({ result: 'response' })
  .disable({ reason: 'x' });

const fullConfig = {
  operations: ['list', 'get'],
  members: { profile: resource<User>({ kind: 'singleton', operations: ['get'] }) },
} as const;
const typed = createClient({
  baseURL: '/api',
  transport: fetchTransport(),
  resources: { users: resource<User, typeof fullConfig>(fullConfig) },
});
// @ts-expect-error exact second configuration type retains capability rejection
typed.users.post({ name: 'x' });
typed.users.list().then((list) => {
  if (list?.items[0]) {
    const entity = list.items[0];
    const related: Promise<User | undefined> = resourceOf(entity).$.child('profile').get();
    // @ts-expect-error entity-derived member retains declared capabilities
    resourceOf(entity).delete();
    void related;
  }
});
const broad: ResourceConfig = { operations: '*' };
createClient({
  baseURL: '/api',
  transport: fetchTransport(),
  resources: { dynamic: resource(broad) },
})
  .dynamic(0)
  .get();
void inheritedResponse;
void dynamicMode;
void dishonestMode;
void profile;
void disabled;
void disabledResponse;
const relatedResponse: Promise<{ data: User | undefined; response: HttpResponse }> = refined
  .users(0)
  .with({ result: 'response' })
  .$.child('profile')
  .get();
const relatedShorthand: Promise<User | undefined> = refined.users(0).profile.get();
void relatedResponse;
void relatedShorthand;
typed.users.list().then((list) => {
  if (list?.items[0]) {
    const directRelation: Promise<User | undefined> = list.items[0].profile.get();
    void directRelation;
  }
});

import type { ResourceEntity } from '../src/index.js';
declare const arrayResult: ResourceEntity<readonly User[], typeof fullConfig>;
const unchangedArray: readonly User[] = arrayResult;
// @ts-expect-error arrays are not entity proxies and gain no relationship fields
arrayResult.profile.get();
void unchangedArray;

const defaultHttp = createClient({
  baseURL: '/api',
  resources: { users: resource<{ id: number; name: string }>({ operations: ['list', 'get'] }) },
});
const defaultHttpUser: Promise<{ id: number; name: string } | undefined> = defaultHttp
  .users(0)
  .get();
void defaultHttpUser;
createClient({ baseURL: '/api', resources: {}, transport: undefined });
// @ts-expect-error null must not silently select the default Transport
createClient({ baseURL: '/api', resources: {}, transport: null });

const mapped = createClient({
  baseURL: '/api',
  resources: {
    users: resource({
      operations: ['list', 'put', 'post', { operation: 'get', path: 'getById', queryKey: 'id' }],
      actions: {
        search: action<{ text: string }, { count: number }>({ method: 'GET', path: 'get' }),
      },
      memberActions: {
        approve: action<{ reason: string }, { approved: boolean }>({ method: 'POST' }),
      },
    }),
  },
});
mapped.users(0).get();
mapped.users.search({ text: 'test' });
const approved: Promise<{ approved: boolean }> = mapped.users(0).approve({ reason: 'valid' });
void approved;
// @ts-expect-error operation object retains member position
mapped.users.get();
// @ts-expect-error undeclared standard operation stays unavailable
mapped.users(0).delete();
// @ts-expect-error collection action is not a member action
mapped.users(0).search({ text: 'test' });
// @ts-expect-error direct action input remains checked
mapped.users.search({ text: 1 });
// @ts-expect-error action aliases are not installed on the control object
mapped.users.$.search({ text: 'test' });
// @ts-expect-error old nested action entry is removed
mapped.users.$.actions.search({ text: 'test' });

const pathActions = createClient({
  baseURL: '/api',
  resources: {
    users: resource({
      actions: {
        lookup: action({ method: 'GET', path: 'getById/:tenantId/:id' }),
        approve: action<{ id: number; reason: string }, { done: boolean }>({
          method: 'POST',
          path: ':id/approve',
        }),
        noParameters: action({ method: 'GET', path: 'search' }),
      },
    }),
  },
});
pathActions.users.lookup({ tenantId: 0, id: 'a/b', detail: true });
pathActions.users.noParameters();
// @ts-expect-error path placeholders make the input required
pathActions.users.lookup();
// @ts-expect-error every inferred path placeholder is required
pathActions.users.lookup({ id: 1 });
// @ts-expect-error path parameters must be strings or numbers
pathActions.users.lookup({ tenantId: 1, id: [] });
const approvedPathAction: Promise<{ done: boolean }> = pathActions.users.approve({
  id: 1,
  reason: 'yes',
});
void approvedPathAction;
// @ts-expect-error explicit business input types remain checked
pathActions.users.approve({ id: 1, reason: 123 });

const precise = resource({
  operations: ['list', 'get', 'post', 'patch'],
  members: { profile: resource({ kind: 'singleton', operations: ['get'] }).typed<User>() },
  actions: { search: action({ method: 'GET', path: ':tenantId/:id' }) },
  memberActions: { approve: action<{ reason: string }, { done: boolean }>({ method: 'POST' }) },
}).typed<User>();
const preciseApi = createClient({
  baseURL: '/api',
  resources: { users: precise },
  defaults: { credentials: 'omit' },
  prepareRequest(request, context) {
    context.state.set(Symbol(), 'opaque');
    return request;
  },
  processResponse(_response, context) {
    const url: string = context.request.url;
    void url;
  },
  onError(error, context) {
    const signal: AbortSignal = context.signal;
    void error;
    void signal;
  },
});
const preciseUser: Promise<User | undefined> = preciseApi.users(0).get();
const preciseProfile: Promise<User | undefined> = preciseApi.users(0).profile.get();
const preciseAction: Promise<{ done: boolean }> = preciseApi.users(0).approve({ reason: 'yes' });
void preciseUser;
void preciseProfile;
void preciseAction;
preciseApi.users.search({ tenantId: 1, id: 2 });
// @ts-expect-error typed models do not reopen undeclared operations
preciseApi.users(0).delete();
// @ts-expect-error inferred relations are not widened
preciseApi.users(0).missing.get();
// @ts-expect-error inferred action path input remains required
preciseApi.users.search({ id: 2 });
// @ts-expect-error model input remains checked after binding
preciseApi.users.post({ name: 123 });
// @ts-expect-error credentials use a bounded public policy
preciseApi.users.with({ credentials: 'whatever' });
