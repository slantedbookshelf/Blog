function run(event) {
  if (event.source !== parent || event.data?.kind !== 'run') return;
  removeEventListener('message', run);
  const { workerSource, code, tests, timeoutMs, wasm } = event.data;
  const send = result => parent.postMessage({ kind: 'result', result }, '*');
  const fail = error => ({ logs: [], cases: [], error });
  const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  let worker;
  try {
    worker = new Worker(url);
  } catch {
    URL.revokeObjectURL(url);
    send(fail('浏览器无法在隔离环境创建 Worker。'));
    return;
  }

  const channel = new MessageChannel();
  const timeout = setTimeout(() => finish(fail('执行超过 ' + timeoutMs / 1000 + ' 秒。请检查循环或等待操作。')), timeoutMs);
  function finish(result) {
    clearTimeout(timeout);
    worker.terminate();
    channel.port1.close();
    URL.revokeObjectURL(url);
    send(result);
  }

  channel.port1.onmessage = event => finish(event.data);
  worker.onerror = event => finish(fail(event.message || 'Worker 提前退出或加载失败。'));
  const transfer = wasm ? [channel.port2, wasm] : [channel.port2];
  worker.postMessage({ code, tests, wasm, reply: channel.port2 }, transfer);
}

addEventListener('message', run);
parent.postMessage({ kind: 'ready' }, '*');
