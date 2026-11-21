addEventListener('message', async event => {
  const { code, tests, wasm, reply } = event.data;
  const send = reply.postMessage.bind(reply);
  try {
    const go = new globalThis.Go();
    const { instance } = await WebAssembly.instantiate(wasm, go.importObject);
    let result;
    globalThis.__goPracticeInput = JSON.stringify({ code, tests });
    globalThis.__goPracticeOutput = response => { result = JSON.parse(response); };
    await go.run(instance);
    if (!result) throw new Error('Go 运行器提前退出。');
    send(result);
  } catch (error) {
    send({ logs: [], cases: [], error: error instanceof Error ? error.message : String(error) });
  }
}, { once: true });
