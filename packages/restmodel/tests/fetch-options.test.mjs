import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createClient,
  resource,
  fetchTransport,
  RequestError,
  decodeHttpBody,
} from '../dist/index.js';

test('injected Fetch shares final encoding, option inheritance and immutable per-request overrides', async () => {
  const calls = [];
  const options = {
    fetch: async (url, init) => {
      calls.push({ url, init });
      return Response.json({ id: 1 });
    },
    cache: 'reload',
    keepalive: true,
  };
  const transport = fetchTransport(options);
  options.cache = 'no-cache';
  const api = createClient({
    baseURL: '/api',
    transport,
    defaults: { cache: 'no-store', credentials: 'omit', responseType: 'json' },
    resources: { users: resource({ operations: ['get', 'put'] }) },
  });
  const reference = api
    .users('a/b')
    .with({ keepalive: false })
    .with({ cache: undefined, keepalive: undefined });
  await reference.put({ name: '测试' });
  assert.equal(calls[0].url, '/api/users/a%2Fb');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].init.keepalive, false);
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].init.body, '{"name":"测试"}');
  await api.users(2).get();
  assert.equal(calls[1].init.keepalive, true);
  const raw = await transport({ method: 'GET', url: '/raw', headers: {} });
  assert.equal(raw.status, 200);
  assert.equal(calls[2].init.cache, 'reload');
});

test('none cancels successful bodies promptly but still decodes HTTP failures and preserves headers', async () => {
  let cancelled = 0;
  const transport = fetchTransport({
    fetch: async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled++;
          },
        }),
        { headers: { 'x-source': 'real' } },
      ),
  });
  const api = createClient({
    baseURL: '/api',
    transport,
    resources: { users: resource({ operations: ['delete'] }) },
  });
  assert.equal(await api.users(1).with({ responseType: 'none', timeout: 500 }).delete(), undefined);
  assert.equal(cancelled, 1);
  const failing = createClient({
    baseURL: '/api',
    transport: fetchTransport({
      fetch: async () => Response.json({ reason: 'denied' }, { status: 403 }),
    }),
    resources: {},
  });
  await assert.rejects(
    failing.$.request({ method: 'DELETE', path: 'users/1', options: { responseType: 'none' } }),
    (e) => e.kind === 'http' && e.response.body.reason === 'denied',
  );
});

test('json/text policies preserve actual Content-Type and auto decoding remains compatible', async () => {
  const headers = { 'content-type': 'text/plain' };
  assert.deepEqual(decodeHttpBody('{"value":1}', 200, headers, 'json'), { value: 1 });
  assert.equal(decodeHttpBody('{"value":1}', 200, headers), '{"value":1}');
  assert.equal(
    decodeHttpBody('{"value":1}', 200, { 'content-type': 'application/json' }, 'text'),
    '{"value":1}',
  );
  const api = createClient({
    baseURL: '/api',
    transport: fetchTransport({
      fetch: async () => new Response('<html>bad proxy</html>', { headers }),
    }),
    resources: {},
  });
  await assert.rejects(
    api.$.request({ method: 'GET', path: 'data', options: { responseType: 'json' } }),
    (e) => {
      assert.equal(e.kind, 'response-shape');
      assert.equal(e.response.headers['content-type'], 'text/plain');
      assert.ok(e.cause instanceof SyntaxError);
      return true;
    },
  );
});

test('transport cancellation retains causes and invalid settings are rejected before side effects', async () => {
  for (const name of ['TimeoutError', 'AbortError']) {
    const cause = new DOMException('stopped', name);
    const api = createClient({
      baseURL: '/api',
      transport: fetchTransport({
        fetch: async () => {
          throw cause;
        },
      }),
      resources: {},
    });
    await assert.rejects(
      api.$.request({ method: 'GET', path: 'data' }),
      (e) =>
        e instanceof RequestError &&
        e.kind === (name === 'TimeoutError' ? 'timeout' : 'cancel') &&
        e.cause === cause,
    );
  }
  assert.throws(() => fetchTransport({ fetch: 1 }), /fetch/);
  assert.throws(() => fetchTransport({ keepalive: 'yes' }), /keepalive/);
  assert.throws(() => fetchTransport({ method: 'DELETE' }), /unknown field/);
  const api = createClient({
    baseURL: '/api',
    transport: async () => assert.fail('must reject before executing'),
    resources: { users: resource({ operations: ['get'] }) },
  });
  for (const options of [{ responseType: 'xml' }, { cache: 'bad' }, { keepalive: 1 }])
    assert.throws(() => api.users(1).with(options), /transport setting/);
});
