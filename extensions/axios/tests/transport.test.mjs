import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import axios from 'axios';
import { createClient, resource } from '@restmodel/core';
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
