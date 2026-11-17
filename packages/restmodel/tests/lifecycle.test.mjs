import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { createClient, resource, action, executeHttp, RequestError } from '../dist/index.js';
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('resource, action and raw HTTP share a private stable context and awaited response processing', async () => {
  const key = Symbol('private');
  const contexts = [];
  const order = [];
  const api = createClient({
    baseURL: '/api',
    resources: { users: resource({ operations: ['get'] }) },
    actions: { ping: action({ method: 'GET' }) },
    prepareRequest(request, context) {
      context.state.set(key, 'secret');
      contexts.push(context);
      assert.equal(context.request, request);
      return { ...request, headers: { authorization: 'synthetic' } };
    },
    transport: async (request) => {
      assert.equal(contexts.at(-1).request, request);
      assert.equal(JSON.stringify(contexts.at(-1)), '{}');
      assert.equal(inspect(contexts.at(-1)).includes('secret'), false);
      assert.equal(Object.keys(request).includes('state'), false);
      order.push('http');
      return { status: 200, headers: {}, body: { id: 0 } };
    },
    async processResponse(response, context) {
      assert.equal(context.state.get(key), 'secret');
      await tick();
      order.push('processed');
      response.body.registered = true;
    },
    observeResponse: () => {
      order.push('observed');
    },
  });
  assert.equal((await api.users(0).get()).registered, true);
  assert.equal((await api.ping()).registered, true);
  assert.equal((await api.$.request({ method: 'GET', path: 'raw' })).body.registered, true);
  assert.equal(new Set(contexts).size, 3);
  assert.ok(contexts.every((context) => context.state.size === 0));
  assert.deepEqual(
    order,
    Array.from({ length: 3 }, () => ['http', 'processed', 'observed']).flat(),
  );
});

test('concurrent 401 handling compares per-request user and token snapshots', async () => {
  for (const next of [
    { user: 'new-user', token: 'new-token' },
    { user: 'old-user', token: 'new-token' },
    { user: 'new-user', token: 'old-token' },
  ]) {
    const key = Symbol();
    let current = { user: 'old-user', token: 'old-token' };
    const delayed = deferred();
    const entered = deferred();
    let notifications = 0;
    const api = createClient({
      baseURL: '/api',
      resources: { users: resource({ operations: ['get'] }) },
      prepareRequest(request, context) {
        context.state.set(key, { ...current });
        return { ...request, headers: { authorization: current.token } };
      },
      transport: async () => {
        entered.resolve();
        return delayed.promise;
      },
      onError(error, context) {
        notifications++;
        const captured = context.state.get(key);
        if (
          error.kind === 'http' &&
          error.response.status === 401 &&
          captured.user === current.user &&
          captured.token === current.token
        )
          current = { user: null, token: null };
      },
    });
    const pending = api.users(0).get();
    await entered.promise;
    current = { ...next };
    delayed.resolve({ status: 401, headers: {} });
    await assert.rejects(pending, { kind: 'http' });
    assert.deepEqual(current, next);
    assert.equal(notifications, 1);
    await assert.rejects(api.users(0).get(), { kind: 'http' });
    assert.deepEqual(current, { user: null, token: null });
    assert.equal(notifications, 2);
  }
});

test('preparation, network and malformed responses preserve context and the primary failure', async () => {
  for (const kind of ['prepare', 'network', 'response-shape']) {
    const key = Symbol();
    const cause = new Error('primary');
    let context;
    let notified;
    let calls = 0;
    await assert.rejects(
      executeHttp(
        {
          prepareRequest(request, ctx) {
            context = ctx;
            ctx.state.set(key, 'snapshot');
            if (kind === 'prepare') throw cause;
            return { ...request };
          },
          transport: async () => {
            calls++;
            if (kind === 'network') throw cause;
            return { status: 0, headers: {} };
          },
          async onError(error, ctx) {
            assert.equal(ctx, context);
            assert.equal(ctx.state.get(key), 'snapshot');
            notified = error;
            throw new Error('secondary');
          },
        },
        { method: 'GET', url: '/api', headers: {} },
      ),
      (error) =>
        error === notified &&
        error.kind === kind &&
        (kind === 'response-shape' || error.cause === cause),
    );
    assert.equal(calls, kind === 'prepare' ? 0 : 1);
    assert.equal(context.state.size, 0);
  }
});

test('processing and business failures are classified and notify once without losing the primary error', async () => {
  const cause = new Error('processing failed');
  let observed = 0;
  let errors = [];
  const api = createClient({
    baseURL: '/api',
    resources: { users: resource({ operations: ['get'] }) },
    transport: async () => ({ status: 200, headers: {}, body: { id: 0 } }),
    processResponse: () => {
      throw cause;
    },
    onError(error, context) {
      errors.push(error);
      assert.equal(context.request.url, '/api/users/0');
      throw new Error('secondary');
    },
    observeResponse: () => {
      observed++;
    },
  });
  await assert.rejects(
    api.users(0).get(),
    (error) => error.kind === 'process' && error.cause === cause && errors[0] === error,
  );
  assert.equal(errors.length, 1);
  assert.equal(observed, 0);
  errors = [];
  const failedBusiness = createClient({
    baseURL: '/api',
    scheme: { success: () => false },
    resources: { users: resource({ operations: ['get'] }) },
    actions: { ping: action({ method: 'GET' }) },
    transport: async () => ({ status: 200, headers: {}, body: {} }),
    onError: (error) => {
      errors.push(error.kind);
    },
  });
  await assert.rejects(failedBusiness.users(0).get(), { kind: 'business' });
  await assert.rejects(failedBusiness.ping(), { kind: 'business' });
  assert.deepEqual(errors, ['business', 'business']);
});

test('cancel during foreground processing returns promptly and prevents late observation', async () => {
  const gate = deferred();
  const entered = deferred();
  const controller = new AbortController();
  let observed = 0;
  let notifications = 0;
  let context;
  const pending = executeHttp(
    {
      transport: async () => ({ status: 200, headers: {}, body: {} }),
      async processResponse(_response, ctx) {
        context = ctx;
        entered.resolve();
        await gate.promise;
      },
      onError: () => {
        notifications++;
        return new Promise(() => {});
      },
      observeResponse: () => {
        observed++;
      },
    },
    { method: 'GET', url: '/api', headers: {} },
    { signal: controller.signal },
  );
  await entered.promise;
  controller.abort();
  await assert.rejects(pending, { kind: 'cancel' });
  assert.equal(context.signal.aborted, true);
  assert.equal(context.state.size, 0);
  gate.resolve();
  await tick();
  assert.equal(observed, 0);
  assert.equal(notifications, 1);
});

test('late transport responses after timeout never process data or notify errors again', async () => {
  const gate = deferred();
  let processing = 0;
  let failures = 0;
  const pending = executeHttp(
    {
      transport: () => gate.promise,
      processResponse: () => {
        processing++;
      },
      onError: () => {
        failures++;
      },
    },
    { method: 'GET', url: '/api', headers: {} },
    { timeout: 5 },
  );
  await assert.rejects(pending, { kind: 'timeout' });
  gate.resolve({ status: 200, headers: {}, body: {} });
  await tick();
  assert.equal(processing, 0);
  assert.equal(failures, 1);
});

test('abort while awaiting an error handler preserves the original HTTP error and cleans context', async () => {
  const controller = new AbortController();
  const entered = deferred();
  let context;
  const pending = executeHttp(
    {
      transport: async () => ({ status: 401, headers: {} }),
      onError(_error, ctx) {
        context = ctx;
        ctx.state.set(Symbol(), 'private');
        entered.resolve();
        return new Promise(() => {});
      },
    },
    { method: 'GET', url: '/api', headers: {} },
    { signal: controller.signal },
  );
  await entered.promise;
  controller.abort();
  await assert.rejects(pending, { kind: 'http' });
  assert.equal(context.state.size, 0);
});

test('credentials inherit, override and survive preparation without leaking lifecycle state', async () => {
  const seen = [];
  const api = createClient({
    baseURL: '/api',
    defaults: { credentials: 'omit' },
    resources: { users: resource({ operations: ['get'] }) },
    transport: async (request) => {
      seen.push(request.credentials);
      return { status: 200, headers: {}, body: {} };
    },
  });
  await api.users(0).get();
  await api.users(0).with({ credentials: 'include' }).with({ credentials: undefined }).get();
  await api.users(0).get();
  assert.deepEqual(seen, ['omit', 'include', 'omit']);
  assert.throws(() => api.users(0).with({ credentials: 'invalid' }), /credentials/);
  await assert.rejects(
    executeHttp(
      { transport: async () => ({ status: 200, headers: {} }) },
      { method: 'GET', url: '/api', headers: {}, credentials: 'invalid' },
    ),
    /credentials/,
  );
});
