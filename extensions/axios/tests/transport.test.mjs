import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import axios from 'axios';
import { createClient, resource } from '@restmodel/restmodel';
import { axiosTransport } from '../dist/index.js';
test('Axios performs real HTTP, preserves non-2xx, bodies, cancellation and redirects', async (t) => {
  let calls = 0;
  const server = createServer((req, res) => {
    calls++;
    if (req.url === '/api/fail') {
      res.writeHead(422, { 'content-type': 'application/json' });
      res.end('{"error":"bad"}');
      return;
    }
    if (req.url === '/api/redirect') {
      res.writeHead(302, { location: '/api/users' });
      res.end();
      return;
    }
    if (req.url === '/api/slow') {
      setTimeout(() => res.end('{}'), 50);
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 0, body, auth: req.headers.authorization }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const api = createClient({
    baseURL: `http://127.0.0.1:${server.address().port}/api`,
    transport: axiosTransport(axios.create({ proxy: false })),
    prepareRequest: (r) => ({ ...r, headers: { ...r.headers, authorization: 'synthetic' } }),
    resources: { users: resource({ operations: '*' }) },
  });
  const result = await api.users.post({ name: '中' });
  assert.equal(result.body, '{"name":"中"}');
  assert.equal(result.auth, 'synthetic');
  await assert.rejects(
    api.$.request({ method: 'GET', path: 'fail' }),
    (e) => e.kind === 'http' && e.response.status === 422 && e.response.body.error === 'bad',
  );
  const before = calls;
  await assert.rejects(
    api.$.request({ method: 'GET', path: 'redirect' }),
    (e) => e.kind === 'http' && e.response.status === 302,
  );
  assert.equal(calls, before + 1);
  await assert.rejects(api.$.request({ method: 'GET', path: 'slow', options: { timeout: 5 } }), {
    kind: 'timeout',
  });
  const controller = new AbortController();
  const pending = api.$.request({
    method: 'GET',
    path: 'slow',
    options: { signal: controller.signal },
  });
  controller.abort();
  await assert.rejects(pending, { kind: 'cancel' });
});

test('Axios instance baseURL never prefixes the final RESTModel URL twice', async () => {
  let resolved;
  const instance = axios.create({
    baseURL: '/api',
    allowAbsoluteUrls: false,
    adapter: async (config) => {
      resolved = axios.getUri(config);
      return {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config,
        data: '{"id":0}',
      };
    },
  });
  const api = createClient({
    baseURL: '/api',
    transport: axiosTransport(instance),
    resources: { users: resource({ operations: ['get'] }) },
  });
  assert.equal((await api.users(0).get()).id, 0);
  assert.equal(resolved, '/api/users/0');
  assert.equal(instance.defaults.baseURL, '/api');
});

test('Axios defaults preserve timeout classification and non-2xx errors reach core lifecycle', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/api/slow') {
      setTimeout(() => res.end('{}'), 50);
      return;
    }
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end('{"reason":"expired"}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  let axiosFailures = 0;
  const errors = [];
  const instance = axios.create({ timeout: 10, proxy: false, baseURL: '/ignored' });
  instance.interceptors.response.use(undefined, (error) => {
    axiosFailures++;
    throw error;
  });
  const api = createClient({
    baseURL: `http://127.0.0.1:${server.address().port}/api`,
    transport: axiosTransport(instance),
    resources: {},
    onError: (error) => {
      errors.push(error.kind);
    },
  });
  await assert.rejects(api.$.request({ method: 'GET', path: 'slow' }), { kind: 'timeout' });
  await assert.rejects(
    api.$.request({ method: 'GET', path: 'slow', options: { credentials: 'omit' } }),
    { kind: 'timeout' },
  );
  await assert.rejects(
    api.$.request({ method: 'GET', path: 'auth' }),
    (error) => error.kind === 'http' && error.response.status === 401,
  );
  assert.deepEqual(errors, ['timeout', 'timeout', 'http']);
  assert.equal(axiosFailures, 2);
});

test('explicit credentials reach the Axios Fetch Request unchanged in Node', async () => {
  const seen = [];
  const instance = axios.create({
    env: {
      fetch: async (request) => {
        seen.push(request.credentials);
        return new Response('{"id":0}', { headers: { 'content-type': 'application/json' } });
      },
    },
  });
  const api = createClient({
    baseURL: 'https://example.test/api',
    transport: axiosTransport(instance),
    resources: { users: resource({ operations: ['get'] }) },
  });
  for (const credentials of ['omit', 'same-origin', 'include'])
    await api.users(0).with({ credentials }).get();
  assert.deepEqual(seen, ['omit', 'same-origin', 'include']);
});
