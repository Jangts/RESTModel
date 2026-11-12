import { resource, defineResourcePreset } from '../src/index.js';
resource<{ id: number }>({ operations: ['list', 'get'] });
resource({
  extends: defineResourcePreset({ operations: '*' }),
  operations: { delete: false, patch: { method: 'PUT' } },
});
// @ts-expect-error unknown standard operation
resource({ operations: ['login'] });
// @ts-expect-error wildcard map only accepts true
resource({ operations: { '*': false } });
// @ts-expect-error HTTP methods are uppercase
resource({ operations: { get: { method: 'get' } } });
// @ts-expect-error no unimplemented override fields
resource({ operations: { get: { path: '/users' } } });

resource({ kind: undefined, operations: undefined, extends: undefined });
defineResourcePreset({ operations: undefined, extends: undefined });
// @ts-expect-error unknown resource configuration field
resource({ operation: ['get'] });
// @ts-expect-error presets do not fix the resource kind
defineResourcePreset({ kind: 'singleton' });
// @ts-expect-error null is not a resource kind
resource({ kind: null });
// @ts-expect-error null does not mean inherited operations
resource({ operations: null });
// @ts-expect-error null is not a parent preset
defineResourcePreset({ extends: null });
// @ts-expect-error explicit undefined is not an HTTP method override
resource({ operations: { get: { method: undefined } } });
