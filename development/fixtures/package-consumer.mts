import { createClient, resource, fetchTransport, type ResourceList } from '@restmodel/core';
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
