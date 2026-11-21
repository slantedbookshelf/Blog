const stringify = JSON.stringify.bind(JSON);
const keys = Object.keys;
const hasOwn = Object.hasOwn;
const isArray = Array.isArray;
const same = Object.is;
const getPrototype = Object.getPrototypeOf;
const objectPrototype = Object.prototype;

function show(value) {
  if (typeof value === 'string') return value.slice(0, 1500);
  try {
    const json = stringify(value, (_, item) => {
      if (typeof item === 'bigint') return String(item) + 'n';
      if (typeof item === 'number' && !Number.isFinite(item)) return String(item);
      return item;
    });
    return (json ?? String(value)).slice(0, 1500);
  } catch {
    return '[无法序列化的值]';
  }
}

function equal(actual, expected) {
  if (same(actual, expected)) return true;
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') return false;
  if (isArray(expected)) {
    if (!isArray(actual) || actual.length !== expected.length) return false;
    for (let i = 0; i < expected.length; i++) {
      if (!hasOwn(actual, i) || !equal(actual[i], expected[i])) return false;
    }
    return true;
  }
  const prototype = getPrototype(actual);
  if (prototype !== objectPrototype && prototype !== null) return false;
  const fields = keys(expected);
  return keys(actual).length === fields.length &&
    fields.every(key => hasOwn(actual, key) && equal(actual[key], expected[key]));
}

function describe(error) {
  return error instanceof Error ? show(error.name + ': ' + error.message) : show(error);
}

addEventListener('message', async event => {
  const { code, tests, reply } = event.data;
  const send = reply.postMessage.bind(reply);
  const logs = [];
  const cases = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    console[method] = (...args) => {
      if (logs.length === 100) logs.push('（输出达到 100 行，后续省略）');
      if (logs.length < 100) {
        const line = args.slice(0, 16).map(show).join(' ');
        logs.push((method === 'log' ? line : '[' + method + '] ' + line).slice(0, 1800));
      }
    };
  }

  addEventListener('unhandledrejection', event => {
    event.preventDefault();
    send({ logs, cases, error: describe(event.reason) });
  });
  addEventListener('error', event => {
    event.preventDefault();
    send({ logs, cases, error: describe(event.error ?? event.message) });
  });

  // A local ECMAScript module also supports top-level await, without eval.
  const source = tests.length ? code + '\nexport { solve as __courseSolve };' : code;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    const module = await import(url);
    if (tests.length && typeof module.__courseSolve !== 'function') {
      throw new TypeError('请保留 solve 函数。');
    }
    for (const { args, expected } of tests) {
      try {
        const result = await module.__courseSolve(...args);
        const actual = typeof result === 'string' ? stringify(result.slice(0, 1500)) : show(result);
        cases.push({ passed: equal(result, expected), actual });
      } catch (error) {
        cases.push({ passed: false, actual: '—', error: describe(error) });
      }
    }
    // Give pending rejection events a turn. Async work should be awaited by the snippet.
    await new Promise(resolve => setTimeout(resolve, 0));
    send({ logs, cases });
  } catch (error) {
    send({ logs, cases, error: describe(error) });
  } finally {
    URL.revokeObjectURL(url);
  }
}, { once: true });
