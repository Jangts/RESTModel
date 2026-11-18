import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { createServer } from 'node:http';
import {
  createClient,
  resource,
  action,
  defineScheme,
  ResourceList,
  resourceOf,
  dataOf,
  fetchTransport,
  executeHttp,
  RequestError,
  ResourceConfigurationError,
} from '../dist/index.js';
const response = (body) => ({ status: 200, headers: {}, body });
function fixture(body = { id: 0, name: 'Ivan' }, config = {}) {
  const requests = [];
  const api = createClient({
    baseURL: '/api/v1',
    transport: async (request) => {
      requests.push(request);
      return response(body);
    },
    resources: {
      users: resource({ operations: '*' }),
      settings: resource({ kind: 'singleton', operations: '*' }),
    },
    ...config,
  });
  return { api, requests };
}

test('standard operations share final HTTP derivation and preserve zero/encoded identity', async () => {
  const { api, requests } = fixture([]);
  await api.users.list();
  await api.users.post({ name: 'x' });
  await api.users(0).get();
  await api.users('中/a').put({ id: 2 });
  await api.users(['a/b', 0]).patch({ name: 'n' });
  await api.settings.delete();
  assert.deepEqual(
    requests.map(({ method, url }) => [method, url]),
    [
      ['GET', '/api/v1/users'],
      ['POST', '/api/v1/users'],
      ['GET', '/api/v1/users/0'],
      ['PUT', '/api/v1/users/%E4%B8%AD%2Fa'],
      ['PATCH', '/api/v1/users/a%2Fb/0'],
      ['DELETE', '/api/v1/settings'],
    ],
  );
  assert.equal(requests[1].body, '{"name":"x"}');
  assert.equal(requests[1].headers['content-type'], 'application/json');
});

test('unsupported operations and absent identity fail before any preparation', async () => {
  let prepared = 0;
  const { api, requests } = fixture(undefined, {
    prepareRequest: (request) => {
      prepared++;
      return request;
    },
    resources: { users: resource({ operations: ['list', 'get'] }) },
  });
  await assert.rejects(api.users.get(), { kind: 'unsupported-operation' });
  await assert.rejects(api.users.post({}), { kind: 'unsupported-operation' });
  assert.throws(() => api.users(null), ResourceConfigurationError);
  assert.equal(prepared, 0);
  assert.equal(requests.length, 0);
});

test('query branches snapshot repeated keys, delete undefined and remain isolated', async () => {
  const { api, requests } = fixture([]);
  const input = { active: true, repeat: ['a', 'b'], removed: 1 };
  const base = api.users.query(input);
  input.repeat.push('c');
  await Promise.all([
    base.query({ removed: undefined, key: 1 }).list(),
    base.query({ key: 2 }).list(),
  ]);
  assert.equal(requests[0].url, '/api/v1/users?active=true&repeat=a&repeat=b&key=1');
  assert.equal(requests[1].url, '/api/v1/users?active=true&repeat=a&repeat=b&removed=1&key=2');
  const params = new URLSearchParams('x=1&x=2');
  const branch = api.users.query(params);
  params.append('x', '3');
  await branch.list();
  assert.equal(requests[2].url, '/api/v1/users?x=1&x=2');
});

test('service envelope, business status and page intent adapt once', async () => {
  const scheme = defineScheme({
    envelope: 'data',
    success: (body) => body.code === 0,
    pagination: {
      mode: 'page',
      parameter: 'pageIndex',
      size: 'pageSize',
      base: 0,
      items: 'items',
      total: 'total',
    },
  });
  const { api, requests } = fixture(
    { code: 0, data: { items: [{ id: 0 }], total: 0 } },
    { scheme },
  );
  const result = await api.users.page(2, 10).query({ pageIndex: 99 }).list();
  assert.ok(result instanceof ResourceList);
  assert.equal(result.total, 0);
  assert.equal(result.items[0].id, 0);
  assert.equal(requests[0].url, '/api/v1/users?pageIndex=1&pageSize=10');
  const bad = fixture({ code: 1 }, { scheme }).api;
  await assert.rejects(bad.users.list(), { kind: 'business' });
});

test('offset and cursor modes, replacement and false are explicit', async () => {
  const { api, requests } = fixture([], {
    scheme: { pagination: { mode: 'offset', parameter: 'skip' } },
    resources: {
      users: resource({ operations: '*' }),
      settings: resource({ kind: 'singleton', operations: '*' }),
    },
  });
  await api.users.page(3, 5).list();
  assert.equal(requests[0].url, '/api/v1/users?skip=10&limit=5');
  const cursor = fixture(
    { rows: [], next: 'b' },
    {
      scheme: { pagination: { mode: 'page', parameter: 'old', items: 'oldRows' } },
      resources: {
        users: resource({
          operations: ['list'],
          scheme: { pagination: { mode: 'cursor', items: 'rows', next: 'next' } },
        }),
      },
    },
  );
  const result = await cursor.api.users.cursor('a/b', 4).list();
  assert.equal(cursor.requests[0].url, '/api/v1/users?cursor=a%2Fb&limit=4');
  assert.equal(result.page.next, 'b');
  assert.equal(result.total, undefined);
  assert.throws(() => cursor.api.users.page(1, 5), ResourceConfigurationError);
  await assert.rejects(
    fixture([], { scheme: { pagination: false } })
      .api.users.page(1, 5)
      .list(),
    ResourceConfigurationError,
  );
});

test('nested children and members, relationship collisions and serialization preserve data', async () => {
  const { api, requests } = fixture(
    { id: 0, profile: 'data' },
    {
      resources: {
        users: resource({
          operations: '*',
          children: { index: resource({ kind: 'singleton', operations: '*' }) },
          members: {
            profile: resource({ kind: 'singleton', operations: '*' }),
            orders: resource({ operations: '*' }),
          },
        }),
      },
    },
  );
  const user = await api.users(0).get();
  assert.equal(user.profile, 'data');
  assert.deepEqual(Object.keys(user), ['id', 'profile']);
  assert.equal(JSON.stringify(user), '{"id":0,"profile":"data"}');
  assert.deepEqual({ ...user }, { id: 0, profile: 'data' });
  user.profile = 'local';
  assert.equal(dataOf(user).profile, 'local');
  await resourceOf(user).$.child('profile').get();
  await api.users.$.child('index').get();
  await api.users(0).$.child('orders')('a/b').get();
  assert.deepEqual(
    requests.map((r) => r.url),
    [
      '/api/v1/users/0',
      '/api/v1/users/0/profile',
      '/api/v1/users/index',
      '/api/v1/users/0/orders/a%2Fb',
    ],
  );
});

test('collection entities bind inferred identity and reject missing identity without extra HTTP', async () => {
  const { api, requests } = fixture([{ userId: 0 }, { name: 'missing' }], {
    scheme: { identity: 'userId' },
  });
  const list = await api.users.list();
  assert.deepEqual(
    [...list].map((x) => x.userId),
    [0, undefined],
  );
  await resourceOf(list.items[0]).get();
  await assert.rejects(resourceOf(list.items[1]).get(), { kind: 'identity' });
  assert.equal(requests.length, 2);
});

test('204/205, scalar/null and raw response mode do not fabricate data or refetch', async () => {
  for (const body of [null, 3, 'value']) assert.equal(await fixture(body).api.users(1).get(), body);
  let calls = 0;
  const { api } = fixture(undefined, {
    transport: async () => {
      calls++;
      return { status: 204, headers: {}, body: 'ignored' };
    },
  });
  const result = await api.users(1).with({ result: 'response' }).get();
  assert.deepEqual(result, {
    data: undefined,
    response: { status: 204, headers: {}, body: 'ignored' },
  });
  assert.equal(calls, 1);
  await assert.rejects(fixture({ wrong: [] }).api.users.list(), { kind: 'response-shape' });
});

test('actions and raw requests share preparation and preserve raw envelope', async () => {
  const { api, requests } = fixture(
    { data: 'ok' },
    {
      scheme: { envelope: 'data' },
      prepareRequest: (r) => ({ ...r, headers: { ...r.headers, authorization: 'synthetic' } }),
      actions: { login: action({ method: 'POST', path: '/auth/login' }) },
      resources: {
        users: resource({
          operations: ['get'],
          memberActions: { disable: action({ method: 'POST' }) },
        }),
      },
    },
  );
  assert.equal(await api.login({ name: 'n' }), 'ok');
  assert.equal(await api.users(0).disable({ reason: 'x' }), 'ok');
  assert.deepEqual((await api.$.request({ method: 'GET', path: '/health' })).body, { data: 'ok' });
  assert.deepEqual(
    requests.map((r) => r.url),
    ['/api/v1/auth/login', '/api/v1/users/0/disable', '/api/v1/health'],
  );
  assert.ok(requests.every((r) => r.headers.authorization === 'synthetic'));
});

test('paths, reserved keys and then cannot escape or become promise resources', async () => {
  const { api } = fixture();
  assert.equal(await Promise.resolve(api.users), api.users);
  for (const path of [
    '../escape',
    'https://evil.test/x',
    '//evil.test',
    '%2e%2e/x',
    'x?y=1',
    'a\\b',
  ])
    await assert.rejects(
      async () => api.$.request({ method: 'GET', path }),
      ResourceConfigurationError,
    );
  for (const name of ['$', 'then', 'constructor', '__proto__'])
    assert.throws(
      () =>
        createClient({
          baseURL: '/api',
          transport: async () => response([]),
          resources: { [name]: resource() },
        }),
      ResourceConfigurationError,
    );
});

test('network, http, pre-cancel and timeout classify and abort actual transport signal', async () => {
  const request = { method: 'GET', url: '/api', headers: { authorization: 'secret' } };
  const cause = new Error('underlying');
  await assert.rejects(
    executeHttp(
      {
        transport: async () => {
          throw cause;
        },
      },
      request,
    ),
    (error) => error.kind === 'network' && error.cause === cause,
  );
  await assert.rejects(
    executeHttp({ transport: async () => ({ status: 503, headers: {} }) }, request),
    { kind: 'http' },
  );
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    executeHttp(
      {
        transport: async () => {
          calls++;
          return response([]);
        },
      },
      request,
      { signal: controller.signal },
    ),
    { kind: 'cancel' },
  );
  assert.equal(calls, 0);
  let aborted = false;
  await assert.rejects(
    executeHttp(
      {
        transport: (r) =>
          new Promise(() => {
            r.signal.addEventListener('abort', () => {
              aborted = true;
            });
          }),
      },
      request,
      { timeout: 5 },
    ),
    { kind: 'timeout' },
  );
  assert.equal(aborted, true);
});

test('optional observation failure cannot change result or repeat a write', async () => {
  let calls = 0;
  const { api } = fixture(
    {},
    {
      transport: async () => {
        calls++;
        return response({ id: 1 });
      },
      observeResponse: async () => {
        throw new Error('optional');
      },
    },
  );
  assert.equal((await api.users.post({})).id, 1);
  assert.equal(calls, 1);
});

test('errors expose stable classification while default diagnostics redact raw context', () => {
  const error = new RequestError('network', {
    request: {
      method: 'POST',
      url: '/secret',
      headers: { authorization: 'TOKEN' },
      body: 'PASSWORD',
    },
    cause: new Error('TOKEN'),
  });
  assert.equal(error.request.headers.authorization, 'TOKEN');
  assert.ok(!JSON.stringify(error).includes('TOKEN'));
  assert.ok(!inspect(error).includes('TOKEN'));
});

test('default Fetch and explicit Fetch send real RESTful HTTP and refuse redirects', async (t) => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, body });
    if (req.url === '/api/redirect') {
      res.writeHead(302, { location: '/api/users' });
      res.end();
      return;
    }
    if (req.url === '/api/missing') {
      res.writeHead(404);
      res.end('missing');
      return;
    }
    res.setHeader('content-type', 'application/json');
    const record = { id: 0, path: req.url, ...(body ? JSON.parse(body) : {}) };
    res.end(JSON.stringify(req.method === 'GET' && !req.url.endsWith('/0') ? [record] : record));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  for (const override of [{}, { transport: undefined }, { transport: fetchTransport() }]) {
    const api = createClient({
      baseURL: `http://127.0.0.1:${server.address().port}/api`,
      ...override,
      resources: { users: resource({ operations: ['list', 'get', 'post', 'patch'] }) },
    });
    const list = await api.users.query({ name: '中/a' }).list();
    assert.equal(list.items[0].path, '/api/users?name=%E4%B8%AD%2Fa');
    assert.equal((await api.users(0).get()).id, 0);
    assert.equal((await api.users.post({ name: 'created' })).name, 'created');
    assert.equal((await api.users(0).patch({ name: 'updated' })).name, 'updated');
    assert.deepEqual(requests.slice(-2), [
      { method: 'POST', url: '/api/users', body: '{"name":"created"}' },
      { method: 'PATCH', url: '/api/users/0', body: '{"name":"updated"}' },
    ]);
    await assert.rejects(api.$.request({ method: 'GET', path: 'missing' }), { kind: 'http' });
    await assert.rejects(
      api.$.request({ method: 'GET', path: 'redirect' }),
      (error) => error.kind === 'http' && error.response.status === 302,
    );
    const count = requests.length;
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(api.users.with({ signal: cancelled.signal }).list(), { kind: 'cancel' });
    assert.equal(requests.length, count);
  }
});

test('operation scheme overrides reuse capabilities and do not leak between calls', async () => {
  const { api } = fixture(
    { first: { id: 1 }, second: { id: 2 } },
    {
      scheme: { envelope: 'first' },
      resources: {
        users: resource({ operations: { get: { scheme: { envelope: 'second' } }, post: true } }),
      },
    },
  );
  assert.equal((await api.users(0).get()).id, 2);
  assert.equal((await api.users.post({})).id, 1);
});
test('invalid adapter results and asynchronous synchronous hooks reject explicitly', async () => {
  await assert.rejects(
    fixture(undefined, { transport: async () => ({ headers: {} }) }).api.users.list(),
    { kind: 'response-shape' },
  );
  await assert.rejects(fixture([], { scheme: { success: async () => true } }).api.users.list(), {
    kind: 'response-shape',
  });
  await assert.rejects(fixture([], { scheme: { map: async () => [] } }).api.users.list(), {
    kind: 'response-shape',
  });
});
test('client snapshots caller settings without freezing transport services', async () => {
  let original = 0,
    replacement = 0;
  const config = {
    baseURL: '/api',
    transport: async () => {
      original++;
      return response([]);
    },
    resources: { users: resource({ operations: ['list'] }) },
  };
  const api = createClient(config);
  config.transport = async () => {
    replacement++;
    return response([]);
  };
  await api.users.list();
  assert.equal(original, 1);
  assert.equal(replacement, 0);
  assert.equal(Object.isFrozen(config.transport), false);
});

test('cancel during async preparation prevents a later transport side effect', async () => {
  let release;
  let calls = 0;
  const controller = new AbortController();
  const api = createClient({
    baseURL: '/api',
    resources: { users: resource({ operations: ['post'] }) },
    transport: async () => {
      calls++;
      return response({});
    },
    prepareRequest: (request) =>
      new Promise((resolve) => {
        release = () => resolve(request);
      }),
  });
  const pending = api.users.with({ signal: controller.signal }).post({});
  controller.abort();
  await assert.rejects(pending, { kind: 'cancel' });
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 0);
});
test('completed requests release caller abort listeners and headers are isolated', async () => {
  const controller = new AbortController();
  let added = 0,
    removed = 0;
  const add = controller.signal.addEventListener.bind(controller.signal),
    remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args) => {
    added++;
    add(...args);
  };
  controller.signal.removeEventListener = (...args) => {
    removed++;
    remove(...args);
  };
  const { api, requests } = fixture([]);
  const headers = { 'X-Trace': 'first' };
  const first = api.users.with({ headers, signal: controller.signal, timeout: 50 });
  headers['X-Trace'] = 'changed';
  await Promise.all([first.list(), api.users.with({ headers: { 'X-Trace': 'second' } }).list()]);
  assert.equal(requests[0].headers['x-trace'], 'first');
  assert.equal(requests[1].headers['x-trace'], 'second');
  assert.equal(added, removed);
});

test('preparation failures retain stage and cause without sending a request', async () => {
  const cause = new Error('credential source failed');
  let calls = 0;
  const { api } = fixture([], {
    prepareRequest: () => {
      throw cause;
    },
    transport: async () => {
      calls++;
      return response([]);
    },
  });
  await assert.rejects(api.users.list(), (e) => e.kind === 'prepare' && e.cause === cause);
  assert.equal(calls, 0);
});
test('shared HTTP decoding handles JSON media types and preserves HTTP failure priority', async () => {
  const { decodeHttpBody } = await import('../dist/index.js');
  assert.deepEqual(
    decodeHttpBody('{"ok":true}', 200, {
      'content-type': 'application/problem+json; charset=utf-8',
    }),
    { ok: true },
  );
  assert.throws(
    () => decodeHttpBody('{', 200, { 'content-type': 'application/json' }),
    (e) => e.kind === 'response-shape',
  );
  assert.equal(decodeHttpBody('{', 500, { 'content-type': 'application/json' }), '{');
  assert.equal(decodeHttpBody('text', 200, { 'content-type': 'text/plain' }), 'text');
});

test('entity snapshots preserve enumerable keys and allow local edits to frozen source', async () => {
  const input = { id: 0, name: 'source' };
  Object.defineProperty(input, 'hidden', { value: 'hidden', enumerable: false });
  Object.freeze(input);
  const entity = await fixture(input).api.users(0).get();
  assert.deepEqual(Object.keys(entity), ['id', 'name']);
  assert.equal(entity.hidden, 'hidden');
  entity.name = 'local';
  assert.equal(input.name, 'source');
  assert.equal(dataOf(entity).name, 'local');
  assert.equal(JSON.stringify(entity), '{"id":0,"name":"local"}');
});

test('prepared headers use the same lowercase normalization and invalid input fails before transport', async () => {
  const { api, requests } = fixture([], {
    prepareRequest: (r) => ({ ...r, headers: { Authorization: 'token' } }),
  });
  await api.users.list();
  assert.equal(requests[0].headers.authorization, 'token');
  assert.equal(requests[0].headers.Authorization, undefined);
  await assert.rejects(
    fixture([])
      .api.users.with({ headers: { 'X-Test': 'bad\r\nvalue' } })
      .list(),
    ResourceConfigurationError,
  );
});

test('executeHttp combines both public signals and releases all listeners', async () => {
  for (const source of ['request', 'settings']) {
    const requestSignal = new AbortController();
    const settingsSignal = new AbortController();
    let releaseCount = 0;
    for (const signal of [requestSignal.signal, settingsSignal.signal]) {
      const remove = signal.removeEventListener.bind(signal);
      signal.removeEventListener = (...args) => {
        releaseCount++;
        remove(...args);
      };
    }
    let transportSignal;
    const pending = executeHttp(
      {
        transport: (request) => {
          transportSignal = request.signal;
          return new Promise(() => {});
        },
      },
      { method: 'GET', url: '/api', headers: {}, signal: requestSignal.signal },
      { signal: settingsSignal.signal },
    );
    (source === 'request' ? requestSignal : settingsSignal).abort();
    await assert.rejects(pending, { kind: 'cancel' });
    assert.equal(transportSignal.aborted, true);
    assert.equal(releaseCount, 2);
  }
  const aborted = new AbortController();
  aborted.abort();
  let calls = 0;
  await assert.rejects(
    executeHttp(
      {
        transport: async () => {
          calls++;
          return response([]);
        },
      },
      { method: 'GET', url: '/api', headers: {}, signal: aborted.signal },
    ),
    { kind: 'cancel' },
  );
  assert.equal(calls, 0);
});

test('undefined result inherits mode; explicit data switches mode', async () => {
  const { api } = fixture({ id: 0 });
  const ref = api.users(0).with({ result: 'response' });
  assert.equal((await ref.with({ result: undefined }).get()).response.status, 200);
  assert.equal((await ref.with({ result: 'data' }).get()).id, 0);
});

test('entity followup resets completed query/page and response mode while direct chains retain them', async () => {
  const { api, requests } = fixture([{ id: 0 }]);
  const result = await api.users
    .query({ active: true })
    .page(2, 10)
    .with({ headers: { 'x-test': 'keep' }, result: 'response' })
    .list();
  await resourceOf(result.data.items[0]).get();
  assert.equal(requests[1].url, '/api/v1/users/0');
  assert.equal(requests[1].headers['x-test'], 'keep');
  await api.users.query({ locale: 'zh' })(0).get();
  assert.equal(requests[2].url, '/api/v1/users/0?locale=zh');
});

test('special response instances retain identity instead of becoming fake entities', async () => {
  for (const value of [new Date('2026-01-01'), new Map([['a', 1]]), new Blob(['x'])]) {
    const result = await fixture(value).api.users(0).get();
    assert.equal(result, value);
    assert.equal(dataOf(result), value);
    assert.throws(() => resourceOf(result), { kind: 'response-shape' });
  }
});

test('child chains inherit response mode and immutable references cannot replace terminal methods', async () => {
  const { api, requests } = fixture(
    { id: 0 },
    {
      resources: {
        users: resource({
          operations: '*',
          members: { profile: resource({ kind: 'singleton', operations: ['get'] }) },
        }),
      },
    },
  );
  const member = api.users(0).with({ result: 'response' });
  assert.throws(() => {
    member.get = () => Promise.resolve('replaced');
  }, TypeError);
  const result = await member.$.child('profile').get();
  assert.equal(result.response.status, 200);
  assert.equal(result.data.id, 0);
  assert.equal(requests[0].url, '/api/v1/users/0/profile');
});

test('request option inheritance ignores prototype result and headers', async () => {
  const originals = new Map(
    ['result', 'headers'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(Object.prototype, key),
    ]),
  );
  let result;
  let requests;
  try {
    Object.defineProperty(Object.prototype, 'result', { value: 'response', configurable: true });
    Object.defineProperty(Object.prototype, 'headers', {
      value: { authorization: 'injected' },
      configurable: true,
    });
    const fixtureResult = fixture({ id: 0 });
    requests = fixtureResult.requests;
    result = await fixtureResult.api.users(0).with({}).get();
  } finally {
    for (const [key, descriptor] of originals) {
      delete Object.prototype[key];
      if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
    }
  }
  assert.equal(result.id, 0);
  assert.equal(result.response, undefined);
  assert.equal(requests[0].headers.authorization, undefined);
});

test('identity rejects URL-normalized dot/empty segments before preparing or sending', async () => {
  let prepared = 0;
  const { api, requests } = fixture(
    {},
    {
      prepareRequest: (request) => {
        prepared++;
        return request;
      },
    },
  );
  for (const id of ['', '.', '..', ['ok', '..'], [], Array(1), NaN, Infinity, '\ud800']) {
    assert.throws(() => api.users(id), ResourceConfigurationError);
  }
  assert.equal(prepared, 0);
  assert.equal(requests.length, 0);
  await api.users(['a/b', 0, '中']).get();
  assert.equal(requests[0].url, '/api/v1/users/a%2Fb/0/%E4%B8%AD');
});

test('identity/query arrays reject holes and accessors without running caller methods', async () => {
  const { api } = fixture([]);
  let calls = 0;
  const accessor = Object.defineProperty([], '0', {
    get() {
      calls++;
      return 'x';
    },
  });
  const customized = ['x', 'y'];
  customized.map = () => {
    calls++;
    throw new Error('map must not execute');
  };
  customized[Symbol.iterator] = () => {
    calls++;
    throw new Error('iterator must not execute');
  };
  assert.throws(() => api.users(accessor), ResourceConfigurationError);
  assert.throws(() => api.users.query({ key: accessor }), ResourceConfigurationError);
  assert.throws(() => api.users.query({ key: Array(1) }), ResourceConfigurationError);
  for (const value of [NaN, Infinity, -Infinity, [1, NaN]])
    assert.throws(() => api.users.query({ key: value }), ResourceConfigurationError);
  await api.users(customized).get();
  await api.users.query({ key: customized }).list();
  assert.equal(calls, 0);
});

test('service root baseURL is usable and invalid raw paths retain configuration classification', async () => {
  const { api, requests } = fixture([], { baseURL: '/' });
  await api.users.list();
  assert.equal(requests[0].url, '/users');
  assert.throws(() => api.$.request({ method: 'GET', path: 42 }), ResourceConfigurationError);
});

test('invalid explicit transport is rejected instead of falling back to Fetch', () => {
  for (const transport of [null, false, 1, 'fetch', {}]) {
    assert.throws(
      () => createClient({ baseURL: '/api', resources: {}, transport }),
      (error) =>
        error instanceof ResourceConfigurationError && error.message.includes('client.transport'),
    );
  }
});

test('standard operation exceptions preserve RESTful siblings, entity identity and scheme', async () => {
  for (const mapping of [
    { operation: 'get', path: 'getById', queryKey: 'id' },
    { operation: 'get', path: 'getById/:id' },
  ]) {
    const { api, requests } = fixture(
      { data: { id: 0, name: 'member' } },
      {
        scheme: { envelope: 'data' },
        resources: { users: resource({ operations: ['list', 'put', 'post', mapping] }) },
      },
    );
    const entity = await api.users(0).query({ id: 'wrong', active: true }).get();
    const expected = mapping.queryKey
      ? '/api/v1/users/getById?id=0&active=true'
      : '/api/v1/users/getById/0?id=wrong&active=true';
    assert.equal(requests[0].url, expected);
    assert.equal(entity.id, 0);
    await resourceOf(entity).put({ id: 0, name: 'updated' });
    assert.equal(requests[1].url, '/api/v1/users/0');
    assert.equal(requests[1].method, 'PUT');
    await resourceOf(entity).get();
    assert.equal(
      requests[2].url,
      mapping.queryKey ? '/api/v1/users/getById?id=0' : '/api/v1/users/getById/0',
    );
    await api.users.post({ name: 'new' });
    assert.equal(requests[3].url, '/api/v1/users');
    assert.equal(requests[3].method, 'POST');
    const encoded = mapping.queryKey ? 'id=a%2Fb+%E4%B8%AD' : 'a%2Fb%20%E4%B8%AD';
    await api.users('a/b 中').get();
    assert.ok(requests[4].url.endsWith(encoded));
    await assert.rejects(api.users([1, 2]).get(), ResourceConfigurationError);
    assert.equal(requests.length, 5);
  }
});

test('nested resource exceptions remain relative to the logical resource, not a previous HTTP route', async () => {
  const { api, requests } = fixture(
    { id: 'p/q' },
    {
      resources: {
        teams: resource({
          operations: ['get'],
          members: {
            users: resource({
              operations: ['list', { operation: 'get', path: 'getById/:id' }],
              memberActions: {
                approve: action({ method: 'POST', path: 'get' }),
              },
            }),
          },
        }),
      },
    },
  );
  const users = api.teams(8).users;
  const member = await users('p/q').get();
  assert.equal(requests[0].url, '/api/v1/teams/8/users/getById/p%2Fq');
  await resourceOf(member).approve({ reason: 'yes' });
  assert.equal(requests[1].url, '/api/v1/teams/8/users/p%2Fq/get');
});

test('direct actions have one entry, use independent HTTP paths and preserve branching', async () => {
  const { api, requests } = fixture(
    { data: { count: 2 } },
    {
      scheme: { envelope: 'data' },
      actions: { login: action({ method: 'POST', path: '/get' }) },
      resources: {
        users: resource({
          operations: ['list'],
          actions: { search: action({ method: 'GET', path: 'get' }) },
          memberActions: { approve: action({ method: 'POST', path: 'put' }) },
        }),
      },
    },
  );
  assert.deepEqual(await api.users.search({ text: 'a/b' }), { count: 2 });
  assert.equal(requests[0].url, '/api/v1/users/get?text=a%2Fb');
  const wrapped = await api.users(0).with({ result: 'response' }).approve({ reason: 'yes' });
  assert.equal(wrapped.response.status, 200);
  assert.deepEqual(wrapped.data, { count: 2 });
  assert.equal(requests[1].url, '/api/v1/users/0/put');
  assert.equal(requests[1].body, '{"reason":"yes"}');
  await api.login({ name: 'Ivan' });
  assert.equal(requests[2].url, '/api/v1/get');
  assert.equal(api.users.$.actions, undefined);
  assert.equal(api.users.$.search, undefined);
  assert.equal(api.$.actions, undefined);
  assert.equal(api.users(0).search, undefined);
  assert.equal(api.users.approve, undefined);
  assert.equal(api.users.unknownAction, undefined);
});

test('direct action names conflict only with call slots and relations, not backend paths', () => {
  for (const name of [
    'get',
    'post',
    'query',
    'page',
    'cursor',
    'with',
    'then',
    'name',
    'length',
    'bind',
    '__proto__',
  ]) {
    const tree = { [name]: action({ method: 'GET', path: 'valid' }) };
    assert.throws(() => resource({ actions: tree }), ResourceConfigurationError);
    assert.throws(() => resource({ memberActions: tree }), ResourceConfigurationError);
    assert.throws(
      () => createClient({ baseURL: '/api', resources: {}, actions: tree }),
      ResourceConfigurationError,
    );
  }
  const search = action({ method: 'GET', path: 'get' });
  assert.doesNotThrow(() => resource({ actions: { search } }));
  assert.throws(
    () => resource({ actions: { search }, children: { search: resource() } }),
    ResourceConfigurationError,
  );
  assert.throws(
    () => resource({ memberActions: { search }, members: { search: resource() } }),
    ResourceConfigurationError,
  );
  assert.doesNotThrow(() => resource({ actions: { search }, members: { search: resource() } }));
  assert.throws(
    () => createClient({ baseURL: '/api', resources: { search: resource() }, actions: { search } }),
    ResourceConfigurationError,
  );
});

test('action path parameters are encoded once and removed from query/body without mutating input', async () => {
  const { api, requests } = fixture(
    { data: { done: true } },
    {
      scheme: { envelope: 'data' },
      resources: {
        users: resource({
          actions: {
            lookup: action({ method: 'GET', path: 'getById/:tenantId/:id' }),
            approve: action({ method: 'POST', path: ':id/approve' }),
            repeated: action({ method: 'GET', path: ':id/alias/:id' }),
            forceBody: action({ method: 'GET', path: ':id/check', input: 'body' }),
            forceQuery: action({ method: 'POST', path: ':id/check', input: 'query' }),
          },
        }),
      },
    },
  );
  const input = Object.freeze({ tenantId: 0, id: 'a/b 中%', detail: true });
  assert.deepEqual(await api.users.lookup(input), { done: true });
  assert.equal(requests[0].url, '/api/v1/users/getById/0/a%2Fb%20%E4%B8%AD%25?detail=true');
  assert.equal(requests[0].body, undefined);
  assert.deepEqual(Object.keys(input), ['tenantId', 'id', 'detail']);
  const wrapped = await api.users.with({ result: 'response' }).approve({ id: 123, reason: 'yes' });
  assert.equal(wrapped.response.status, 200);
  assert.deepEqual(wrapped.data, { done: true });
  assert.equal(requests[1].url, '/api/v1/users/123/approve');
  assert.equal(requests[1].body, '{"reason":"yes"}');
  await api.users.approve({ id: 0 });
  assert.equal(requests[2].body, undefined);
  await api.users.repeated({ id: 7 });
  assert.equal(requests[3].url, '/api/v1/users/7/alias/7');
  await api.users.forceBody({ id: 2, detail: true });
  assert.equal(requests[4].body, '{"detail":true}');
  await api.users.query({ stable: 1 }).forceQuery({ id: 3, detail: true });
  assert.equal(requests[5].url, '/api/v1/users/3/check?stable=1&detail=true');
  assert.equal(requests[5].body, undefined);
});

test('action templates work at service root, nested resources and member positions', async () => {
  const { api, requests } = fixture('ok', {
    actions: { lookup: action({ method: 'GET', path: '/tenants/:tenantId/users/:id' }) },
    resources: {
      teams: resource({
        members: {
          users: resource({
            actions: { lookup: action({ method: 'GET', path: ':id' }) },
            memberActions: { audit: action({ method: 'POST', path: 'audits/:auditId' }) },
          }),
        },
      }),
    },
  });
  await api.lookup({ tenantId: 0, id: 'a/b' });
  await api.teams(7).users.lookup({ id: 1 });
  await api.teams(7).users(1).audit({ auditId: 9, reason: 'yes' });
  assert.deepEqual(
    requests.map((r) => r.url),
    [
      '/api/v1/tenants/0/users/a%2Fb',
      '/api/v1/teams/7/users/1',
      '/api/v1/teams/7/users/1/audits/9',
    ],
  );
  assert.equal(requests[2].body, '{"reason":"yes"}');
});

test('invalid action path input fails before preparation and never invokes input getters', async () => {
  let preparations = 0;
  let reads = 0;
  const { api, requests } = fixture('ok', {
    prepareRequest: (request) => {
      preparations++;
      return request;
    },
    resources: {
      users: resource({ actions: { lookup: action({ method: 'GET', path: ':tenantId/:id' }) } }),
    },
  });
  for (const input of [
    undefined,
    {},
    { tenantId: 1 },
    { tenantId: 1, id: undefined },
    ...[null, false, '', '.', '..', NaN, Infinity, [], {}, '\ud800'].map((id) => ({
      tenantId: 1,
      id,
    })),
    Object.create({ tenantId: 1, id: 2 }),
    {
      tenantId: 1,
      get id() {
        reads++;
        return 2;
      },
    },
    {
      tenantId: 1,
      id: 2,
      get detail() {
        reads++;
        return true;
      },
    },
  ])
    await assert.rejects(api.users.lookup(input), ResourceConfigurationError);
  assert.equal(reads, 0);
  assert.equal(preparations, 0);
  assert.equal(requests.length, 0);
});

test('action template syntax and static path safety are validated during declaration', () => {
  for (const path of [
    ':',
    ':id?',
    'prefix-:id',
    ':a-b',
    ':1id',
    '../:id',
    '%2e%2e/:id',
    'https://elsewhere.test/:id',
    '//elsewhere/:id',
    ':id/#fragment',
  ]) {
    assert.throws(() => action({ method: 'GET', path }), ResourceConfigurationError);
  }
  assert.doesNotThrow(() => action({ method: 'GET', path: '/lookup/:id' }));
});
test('invalid Unicode in raw, resource and action paths stays a configuration error before HTTP', () => {
  const transport = async () => assert.fail('invalid path must not execute');
  const api = createClient({ baseURL: '/api', resources: {}, transport });
  for (const path of ['\uD800', 'users/\uDFFF', '%ED%A0%80']) {
    assert.throws(() => api.$.request({ method: 'GET', path }), ResourceConfigurationError);
    assert.throws(() => action({ method: 'GET', path }), ResourceConfigurationError);
    assert.throws(
      () => createClient({ baseURL: '/api', transport, resources: { users: resource({ path }) } }),
      ResourceConfigurationError,
    );
  }
});
