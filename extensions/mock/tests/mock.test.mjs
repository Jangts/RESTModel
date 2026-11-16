import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, resource } from '@restmodel/restmodel';
import { withMock } from '../dist/index.js';
test('Mock matches final prepared HTTP and uses common scheme adaptation', async () => {
  let real = 0,
    prepared = 0;
  const transport = withMock(
    async () => {
      real++;
      return { status: 200, headers: {}, body: [] };
    },
    [
      {
        match: (r) =>
          r.method === 'POST' &&
          r.url === '/api/users' &&
          r.headers.authorization === 'token' &&
          r.body === '{"name":"x"}',
        respond: () => ({ status: 201, headers: {}, body: { data: { id: 0 } } }),
      },
    ],
    { unmatched: 'passthrough' },
  );
  const api = createClient({
    baseURL: '/api',
    transport,
    scheme: { envelope: 'data' },
    prepareRequest: (r) => {
      prepared++;
      return { ...r, headers: { authorization: 'token' } };
    },
    resources: { users: resource({ operations: '*' }) },
  });
  assert.equal((await api.users.post({ name: 'x' })).id, 0);
  assert.equal(prepared, 1);
  assert.equal(real, 0);
  await api.$.request({ method: 'GET', path: 'unknown' });
  assert.equal(real, 1);
});
test('Mock unmatched, network failure, HTTP error and delayed abort preserve classification', async () => {
  const never = async () => {
    throw new Error('must not run');
  };
  const client = (transport) =>
    createClient({
      baseURL: '/api',
      transport,
      resources: { users: resource({ operations: '*' }) },
    });
  await assert.rejects(client(withMock(never, [])).users.list(), { kind: 'network' });
  await assert.rejects(
    client(
      withMock(never, [
        {
          match: () => true,
          respond: () => {
            throw new Error('offline');
          },
        },
      ]),
    ).users.list(),
    { kind: 'network' },
  );
  await assert.rejects(
    client(
      withMock(never, [{ match: () => true, respond: () => ({ status: 403, headers: {} }) }]),
    ).users.list(),
    { kind: 'http' },
  );
  await assert.rejects(
    client(
      withMock(never, [
        { match: () => true, delay: 100, respond: () => ({ status: 200, headers: {}, body: [] }) },
      ]),
    )
      .users.with({ timeout: 5 })
      .list(),
    { kind: 'timeout' },
  );
});
