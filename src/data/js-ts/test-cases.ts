import type { Json, TestCase } from './types';

const check = (args: Json[], expected: Json): TestCase => ({ args, expected });

export const tests: Record<string, TestCase[]> = {
  bindings: [check([3], [1, 2, 3]), check([0], []), check([1], [1])],
  values: [check([{ email: null }, 'email'], 'empty'), check([{}, 'toString'], 'missing'), check([{ active: false }, 'active'], 'present')],
  strings: [check([7, ' ready '], '任务 #7 [READY]'), check([0, ''], '任务 #0 []')],
  arrays: [check([[1, 2, 3, 4]], [4, 3, 2]), check([[]], []), check([['a']], ['a'])],
  objects: [check([{ timeout: 0 }, 'timeout', 5], 0), check([{}, 'toString', 'fallback'], 'fallback'), check([{ x: null }, 'x', 0], null)],
  destructuring: [check([{}], { delay: 500, retries: 2 }), check([{ timeout: null, retries: 0 }], { delay: null, retries: 0 })],
  spread: [check([{ limit: 2, token: 'private' }, { limit: 0 }], { limit: 0 }), check([{}, { token: 'a', debug: false }], { debug: false })],
  scope: [check([['a', 'b']], ['0:a', '1:b']), check([[]], []), check([['', 'x', 'x']], ['0:', '1:x', '2:x'])],
  functions: [check([[1, 2]], [{ id: 1, selected: false }, { id: 2, selected: false }]), check([[]], [])],
  'this-binding': [check([5], 5), check([0], 0), check([-9], -9)],
  closures: [check([[0, 1, 0, 1, 1]], [1, 1, 2, 2, 3]), check([[]], []), check([[1, 1]], [1, 2])],
  prototype: [check([{ theme: 'dark' }, {}, 'theme'], { value: 'dark', own: false }), check([{ limit: 10 }, { limit: 0 }, 'limit'], { value: 0, own: true })],
  equality: [check([[7, '7', 7], 7], 2), check([[7, '7'], '7'], 1), check([[], 0], 0)],
  copy: [
    check([{ id: 1, shipment: { status: 'ready', id: 7 } }, 'sent'], {
      original: { id: 1, shipment: { status: 'ready', id: 7 } },
      updated: { id: 1, shipment: { status: 'sent', id: 7 } },
    }),
    check([{ shipment: { status: '' }, items: [] }, 'ready'], {
      original: { shipment: { status: '' }, items: [] }, updated: { shipment: { status: 'ready' }, items: [] },
    }),
  ],
  transforms: [check([[{ paid: true, amount: 4 }, { paid: false, amount: 9 }, { paid: true, amount: 7 }]], 11), check([[]], 0)],
  modules: [check([259], 2.59), check([0], 0), check([-185], -1.85)],
  promise: [check([[{ id: 3, ok: true }, { id: 9, ok: false }, { id: 2, ok: true }]], ['ok:3', 'failed', 'ok:2']), check([[]], [])],
  await: [check([[1, 2], [3]], [1, 2, 3]), check([[], ['b']], ['b']), check([[], []], [])],
  fetch: [check([200, ['Lin']], ['Lin']), check([404, []], 'HTTP 404'), check([500, ['ignored']], 'HTTP 500')],
  'event-loop': [check(['sync'], ['sync', 'micro', 'timer']), check([''], ['', 'micro', 'timer'])],
  exceptions: [check(['oops', { fallback: true }], { fallback: true }), check(['null', 3], null), check(['false', true], false)],
  'ts-types': [check([[7, ' ready ']], '7 · ready'), check([[0, '']], '0 · ')],
  inference: [check([['lin', '']], [{ original: 'lin', upper: 'LIN' }, { original: '', upper: '' }]), check([[]], [])],
  interface: [check([{ id: 2, name: ' Lin ' }], 'Lin'), check([{ name: '' }], '')],
  union: [check([{ kind: 'ready', count: 0 }], '记录数: 0'), check([{ kind: 'loading' }], '加载中'), check([{ kind: 'error', message: '超时' }], '超时')],
  generics: [check([[{ id: 'a' }, { id: 'b' }], 'id'], ['a', 'b']), check([[], 'id'], []), check([[{ count: 0 }, { count: 1 }], 'count'], [0, 1])],
  guards: [check([[1, '3', null, 0, false, {}, -2]], [1, 0, -2]), check([[]], [])],
  utilities: [check([{ id: 7, name: 'Lin', email: 'x@example.org', internal: true }], { id: 7, name: 'Lin' }), check([{ id: 0, name: '', email: '' }], { id: 0, name: '' })],
  unknown: [check([{ title: '' }], ''), check([{ title: 0 }], null), check([null], null), check([{ name: 'a' }], null)],
  erasure: [check([{ id: 0 }], true), check([{ id: '7' }], false), check([null], false), check([{}], false)],
  dom: [check([[{ name: '<Lin>' }, { name: '  ' }, { name: ' Wei ' }]], ['<Lin>', '匿名', 'Wei']), check([[]], [])],
  events: [check([[{}, { action: 'save' }, { action: 'close' }]], 'save'), check([[{ action: '' }, {}]], null), check([[]], null)],
  json: [check(['{"users":[{"name":null},{"name":""}]}'], ['匿名', '']), check(['{"users":null}'], []), check(['{}'], [])],
  'request-state': [check([null, [1]], 'loading'), check([404, []], 'error'), check([200, []], 'empty'), check([206, [1]], 'success')],
  storage: [check(['{"version":1,"theme":"light"}'], 'light'), check(['{"version":2,"theme":"light"}'], 'dark'), check(['invalid'], 'dark'), check([null], 'dark')],
  'module-layout': [check([[{ id: 1, active: false }, { id: 2, active: true }]], [2]), check([[]], [])],
  'frontend-errors': [check([{ request: { timeout: 0 } }, 5], 0), check([null, 5], 5), check([{ request: null }, 8], 8)],
  dto: [check([{ id: '9007199254740993', displayName: null }], { key: '9007199254740993', title: '匿名' }), check([{ id: '0', displayName: '' }], { key: '0', title: '' })],
  'api-types': [check([{ ok: true, data: ['a', 'b'] }], 2), check([{ ok: true, data: [] }], 0), check([{ ok: false, error: 'DENIED' }], 'DENIED')],
  future: [check([3], 'ID-6'), check([0], 'ID-0'), check([-2], 'ID--4')],
  'api-await': [check([[{ id: 4, name: 'Lin' }, { id: 2, name: 'Yan' }], 2], 'Yan'), check([[{ id: 4, name: 'Lin' }], 1], null), check([[], 0], null)],
  grouping: [
    check([[{ team: 'B', name: 'Lin' }, { team: 'A', name: 'Z' }, { team: 'B', name: 'Wei' }]], [['B', ['Lin', 'Wei']], ['A', ['Z']]]),
    check([[{ team: '__proto__', name: 'Lin' }]], [['__proto__', ['Lin']]]),
    check([[]], []),
  ],
  'view-model': [
    check([[{ id: 4, nickname: ' Lin ', active: true }, { id: 0, active: false }]], [
      { key: '4', label: 'Lin', disabled: false }, { key: '0', label: '匿名', disabled: true },
    ]),
    check([[{ id: 2, nickname: null, active: true }]], [{ key: '2', label: '匿名', disabled: false }]),
  ],
  'user-list': [
    check([[
      { id: 3, name: 'LIN', active: true, score: 4 }, { id: 2, name: 'Li', active: false, score: 9 },
      { id: 1, name: 'Ling', active: true, score: 4 }, { id: 7, name: 'Wei', active: true, score: 20 },
    ], ' li ', true], [1, 3]),
    check([[{ id: 3, name: 'Lin', active: false, score: 1 }, { id: 6, name: 'Wei', active: true, score: 3 }], '', false], [6, 3]),
    check([[{ id: 2, name: 'Li', active: true, score: 1 }], 'unknown', false], []),
  ],
};
