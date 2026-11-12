import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { defineResourceStore } from '../dist/index.js';
test('late responses cannot overwrite new state even when loader ignores cancellation', async () => {
  const pending = [];
  const useStore = defineResourceStore(
    'late',
    (input, signal) =>
      new Promise((resolve, reject) => pending.push({ input, signal, resolve, reject })),
  );
  const store = useStore(createPinia());
  const first = store.run(1);
  const second = store.run(2);
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve('new');
  await second;
  pending[0].resolve('old');
  await first;
  assert.equal(store.data, 'new');
  assert.equal(store.pending, false);
});
test('subscriber release cancels only at last release; dispose rejects reuse and ignores late errors', async () => {
  let signal, reject;
  const store = defineResourceStore('dispose', (_, s) => {
    signal = s;
    return new Promise((resolve, r) => {
      reject = r;
    });
  })(createPinia());
  const a = store.subscribe(),
    b = store.subscribe();
  const pending = store.run(null);
  a();
  a();
  assert.equal(signal.aborted, false);
  b();
  assert.equal(signal.aborted, true);
  assert.equal(store.pending, false);
  store.$dispose();
  reject(new Error('late'));
  await assert.rejects(pending);
  assert.equal(store.error, undefined);
  await assert.rejects(store.run(null), /disposed/);
  assert.throws(() => store.subscribe(), /disposed/);
});
test('current loader failures are exposed and subsequent requests recover', async () => {
  const store = defineResourceStore('recover', async (input) => {
    if (input === 0) throw new Error('failed');
    return input;
  })(createPinia());
  await assert.rejects(store.run(0));
  assert.equal(store.error.message, 'failed');
  assert.equal(store.pending, false);
  await store.run(2);
  assert.equal(store.data, 2);
  assert.equal(store.error, undefined);
});
