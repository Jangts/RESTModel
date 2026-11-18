import { createClient, resource, resourceOf } from '../src/index.js';
type User = { id: string; name: string; createdAt: number };
const definition = resource({ operations: ['list', 'get', 'post', 'put', 'patch'] }).typed<
  User,
  {
    post: { name: string };
    put: { revision: number; name: string };
    patch: { revision: number; name?: string };
  }
>();
const api = createClient({ baseURL: '/api', resources: { users: definition } });
api.users.post({ name: 'new' });
api.users('one').put({ revision: 1, name: 'saved' });
api
  .users('one')
  .query({ key: 1 })
  .with({ responseType: 'json' })
  .put({ revision: 1, name: 'saved' });
api.users('one').patch({ revision: 1 });
// @ts-expect-error Explicit create input keeps required fields.
api.users.post({});
// @ts-expect-error Read model fields cannot substitute the write contract.
api.users('one').put({ id: 'one', name: 'saved', createdAt: 1 });
// @ts-expect-error Derived references retain required write input fields.
api.users('one').with({ result: 'response' }).put({ name: 'missing revision' });
// @ts-expect-error Patch contract can require optimistic concurrency.
api.users('one').patch({ name: 'missing revision' });
api
  .users('one')
  .get()
  .then((user) => {
    if (!user) return;
    const stamp: number = user.createdAt;
    void stamp;
    resourceOf(user).put({ revision: 2, name: 'saved' });
    // @ts-expect-error Entity references retain the separate write contract.
    resourceOf(user).put({ name: 'missing revision' });
  });
// @ts-expect-error Input types cannot add unknown operation names.
resource({ operations: ['get'] }).typed<User, { put: { name: string }; typo: string }>();
const readOnly = createClient({
  baseURL: '/api',
  resources: { users: resource({ operations: ['get'] }).typed<User, { put: { name: string } }>() },
});
// @ts-expect-error Supplying an input contract does not grant the operation.
readOnly.users('one').put({ name: 'no' });
