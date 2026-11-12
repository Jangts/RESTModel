import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resource,
  defineResourcePreset,
  standardOperations,
  ResourceConfigurationError,
} from '../dist/index.js';
const keys = (value) => Object.keys(value.operations).sort();

test('omission grants no operations', () => assert.deepEqual(keys(resource()), []));
test('explicit list distinguishes collection and member GET', () => {
  const r = resource({ operations: ['list', 'get'] });
  assert.deepEqual(r.operations, {
    list: { method: 'GET', target: 'collection' },
    get: { method: 'GET', target: 'member' },
  });
});
test('collection wildcard expands all catalog operations', () =>
  assert.deepEqual(keys(resource({ operations: '*' })), Object.keys(standardOperations).sort()));
test('singleton wildcard includes only applicable operations', () => {
  const r = resource({ kind: 'singleton', operations: '*' });
  assert.deepEqual(keys(r), ['delete', 'get', 'patch', 'put']);
  for (const op of Object.values(r.operations)) assert.equal(op.target, 'singleton');
});
test('wildcard expands before exclusions regardless of key order', () => {
  const r = resource({ operations: { delete: false, patch: { method: 'PUT' }, '*': true } });
  assert.equal(r.operations.delete, undefined);
  assert.equal(r.operations.patch.method, 'PUT');
  assert.equal(r.operations.post.method, 'POST');
});
test('omitted child declaration inherits the preset', () => {
  const p = defineResourcePreset({ operations: ['list', 'get'] });
  assert.deepEqual(keys(resource({ extends: p })), ['get', 'list']);
});
test('child can add, disable, and override inherited capabilities', () => {
  const p = defineResourcePreset({ operations: ['list', 'get', 'patch'] });
  const r = resource({
    extends: p,
    operations: { get: false, post: true, patch: { method: 'PUT' } },
  });
  assert.deepEqual(keys(r), ['list', 'patch', 'post']);
  assert.equal(r.operations.patch.method, 'PUT');
  assert.deepEqual(keys(resource({ extends: p })), ['get', 'list', 'patch']);
});
test('array declarations add capabilities rather than resetting inheritance', () => {
  const p = defineResourcePreset({ operations: ['get'] });
  assert.deepEqual(keys(resource({ extends: p, operations: ['post'] })), ['get', 'post']);
});
test('wildcard preserves inherited method overrides; explicit false still wins', () => {
  const p = defineResourcePreset({ operations: { patch: { method: 'PUT' }, get: false } });
  const r = resource({ extends: p, operations: { '*': true, post: false } });
  assert.equal(r.operations.patch.method, 'PUT');
  assert.ok(r.operations.get);
  assert.equal(r.operations.post, undefined);
});
test('preset wildcard resolves against the consuming resource kind', () => {
  const p = defineResourcePreset({ operations: '*' });
  assert.deepEqual(keys(resource({ kind: 'singleton', extends: p })), [
    'delete',
    'get',
    'patch',
    'put',
  ]);
});
test('empty explicit list preserves inheritance; false entries remove it', () => {
  const p = defineResourcePreset({ operations: ['get'] });
  assert.deepEqual(keys(resource({ extends: p, operations: [] })), ['get']);
  assert.deepEqual(keys(resource({ extends: p, operations: { get: false } })), []);
});
test('configuration is snapshotted and resolved definitions are immutable', () => {
  const input = { operations: { patch: { method: 'PUT' } } };
  const p = defineResourcePreset(input);
  input.operations.patch.method = 'POST';
  const r = resource({ extends: p });
  assert.equal(r.operations.patch.method, 'PUT');
  assert.throws(() => {
    r.operations.patch.method = 'DELETE';
  }, TypeError);
  assert.throws(() => {
    r.operations.get = {};
  }, TypeError);
});
test('invalid and special action names never silently grant capabilities', () => {
  for (const operations of [
    ['login'],
    { login: true },
    { '*': false },
    { get: { method: 'get' } },
    { get: { path: '/x' } },
    null,
    true,
    ['*'],
  ]) {
    assert.throws(() => resource({ operations }), ResourceConfigurationError);
  }
});
test('invalid singleton operations fail; disabled inapplicable entries are harmless', () => {
  assert.throws(
    () => resource({ kind: 'singleton', operations: ['list'] }),
    ResourceConfigurationError,
  );
  assert.deepEqual(keys(resource({ kind: 'singleton', operations: { list: false, get: true } })), [
    'get',
  ]);
});
test('circular presets and dangerous keys fail before resolution', () => {
  const p = {};
  p.extends = p;
  assert.throws(() => resource({ extends: p }), ResourceConfigurationError);
  assert.throws(
    () => resource({ operations: JSON.parse('{"__proto__":true}') }),
    ResourceConfigurationError,
  );
  assert.throws(() => resource({ kind: 'other' }), ResourceConfigurationError);
});

test('prototype configuration cannot grant inherited capabilities', () => {
  for (const field of [
    { operations: '*' },
    { extends: { operations: '*' } },
    { kind: 'singleton' },
  ]) {
    assert.throws(() => resource(Object.create(field)), ResourceConfigurationError);
  }
  const config = Object.assign(Object.create(null), { operations: ['get'] });
  assert.deepEqual(keys(resource(config)), ['get']);
});

test('accessors are rejected without invocation at every declaration boundary', () => {
  let calls = 0;
  const accessor = (key) =>
    Object.defineProperty({}, key, {
      get() {
        calls++;
        throw new Error('must not execute');
      },
    });
  const array = [];
  Object.defineProperty(array, '0', {
    get() {
      calls++;
      return 'get';
    },
  });
  for (const config of [
    accessor('operations'),
    accessor('extends'),
    accessor('kind'),
    { extends: accessor('operations') },
    { operations: accessor('get') },
    { operations: { get: accessor('method') } },
    { operations: array },
  ]) {
    assert.throws(() => resource(config), ResourceConfigurationError);
    assert.throws(() => defineResourcePreset(config), ResourceConfigurationError);
  }
  assert.equal(calls, 0);
});

test('deep acyclic presets remain usable and cyclic chains still fail', () => {
  let preset = { operations: ['get'] };
  for (let index = 0; index < 10000; index++) preset = { extends: preset };
  assert.deepEqual(keys(resource({ extends: preset })), ['get']);
  assert.deepEqual(keys(resource({ extends: defineResourcePreset(preset) })), ['get']);
  const cyclic = { extends: preset };
  preset.extends = cyclic;
  assert.throws(() => resource(cyclic), ResourceConfigurationError);
});

test('invalid root objects and sparse arrays fail with configuration errors', () => {
  for (const input of [null, [], new Date(), true]) {
    assert.throws(() => resource(input), ResourceConfigurationError);
    assert.throws(() => defineResourcePreset(input), ResourceConfigurationError);
  }
  assert.throws(() => defineResourcePreset(undefined), ResourceConfigurationError);
  assert.throws(() => resource({ operations: Array(1) }), ResourceConfigurationError);
});

test('nonenumerable method overrides are validated and preserved', () => {
  const override = Object.defineProperty({}, 'method', { value: 'POST' });
  assert.equal(resource({ operations: { get: override } }).operations.get.method, 'POST');
});

test('root and preset schemas reject unknown fields at their source', () => {
  for (const [run, path] of [
    [() => resource({ operation: ['get'] }), 'resource.operation'],
    [() => defineResourcePreset({ kind: 'collection' }), 'preset.kind'],
    [() => resource({ extends: { kind: 'singleton' } }), 'resource.extends(depth=1).kind'],
    [
      () => resource({ extends: { extends: { secret: 'sensitive' } } }),
      'resource.extends(depth=2).secret',
    ],
    [
      () => resource(Object.defineProperty({}, 'unexpected', { value: true })),
      'resource.unexpected',
    ],
  ]) {
    assert.throws(
      run,
      (error) => error instanceof ResourceConfigurationError && error.message.includes(path),
    );
  }
});

test('missing and explicit undefined inherit while null is rejected', () => {
  const preset = defineResourcePreset({ operations: ['get'] });
  assert.deepEqual(keys(resource({ extends: preset, operations: undefined, kind: undefined })), [
    'get',
  ]);
  assert.deepEqual(
    resource({ extends: undefined, operations: undefined, kind: undefined }),
    resource(),
  );
  assert.deepEqual(
    defineResourcePreset({ extends: undefined, operations: undefined }),
    defineResourcePreset({}),
  );
  for (const field of ['extends', 'operations', 'kind']) {
    assert.throws(() => resource({ [field]: null }), ResourceConfigurationError);
  }
  for (const field of ['extends', 'operations']) {
    assert.throws(() => defineResourcePreset({ [field]: null }), ResourceConfigurationError);
  }
  assert.throws(
    () => resource({ operations: { get: { method: undefined } } }),
    ResourceConfigurationError,
  );
});

test('prototype data cannot grant wildcard, override methods or supply preset fields', () => {
  const fields = {
    '*': true,
    method: 'POST',
    operations: '*',
    extends: { operations: '*' },
    kind: 'singleton',
    get: { method: 'DELETE' },
  };
  const originals = new Map(
    Object.keys(fields).map((name) => [
      name,
      Object.getOwnPropertyDescriptor(Object.prototype, name),
    ]),
  );
  let empty;
  let enabled;
  let preset;
  try {
    for (const [name, value] of Object.entries(fields)) {
      Object.defineProperty(Object.prototype, name, { value, configurable: true, writable: true });
    }
    empty = resource({ operations: {} });
    enabled = resource({ operations: { get: {} } });
    preset = defineResourcePreset({});
  } finally {
    for (const name of Object.keys(fields)) {
      delete Object.prototype[name];
      const original = originals.get(name);
      if (original) Object.defineProperty(Object.prototype, name, original);
    }
  }
  assert.deepEqual(keys(empty), []);
  assert.equal(empty.kind, 'collection');
  assert.deepEqual(enabled.operations, { get: { method: 'GET', target: 'member' } });
  assert.deepEqual(keys(resource({ extends: preset })), []);
});

test('invalid declarations report the field path without coercing sensitive values', () => {
  let coercions = 0;
  const secret = {
    toString() {
      coercions++;
      throw new Error('sensitive');
    },
  };
  for (const [config, path] of [
    [{ kind: secret }, 'resource.kind'],
    [{ operations: [secret] }, 'resource.operations[0]'],
    [
      { extends: { operations: { get: { method: secret } } } },
      'resource.extends(depth=1).operations.get.method',
    ],
  ]) {
    assert.throws(
      () => resource(config),
      (error) =>
        error instanceof ResourceConfigurationError &&
        error.message.includes(path) &&
        !error.message.includes('sensitive'),
    );
  }
  assert.equal(coercions, 0);
});
