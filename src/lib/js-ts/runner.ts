import frameSource from './sandbox-frame.js?raw';
import workerSource from './sandbox-worker.js?raw';
import type { TestCase } from '../../data/js-ts/types';

export interface CaseResult {
  passed: boolean;
  actual: string;
  error?: string;
}

export interface RunResult {
  logs: string[];
  cases: CaseResult[];
  error?: string;
}

export const maxCodeLength = 24_000;

export function execute(code: string, tests: TestCase[] = []): Promise<RunResult> {
  return executeIsolated(workerSource, code, tests);
}

export function executeIsolated(
  source: string, code: string, tests: TestCase[],
  options: { wasm?: ArrayBuffer; timeoutMs?: number } = {},
): Promise<RunResult> {
  const errorResult = (error: string) => ({ logs: [], cases: [], error });
  if (code.length > maxCodeLength * 2) {
    return Promise.resolve(errorResult('编译后的代码过长，请缩短后再运行。'));
  }

  return new Promise(resolve => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.title = '代码运行沙箱';
    frame.setAttribute('sandbox', 'allow-scripts');
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    const timeoutMs = options.timeoutMs ?? 3000;
    const wasmPolicy = options.wasm ? " 'wasm-unsafe-eval'" : "";
    const policy = "default-src 'none'; connect-src 'none'; worker-src blob:; " +
      "script-src blob: data: 'nonce-" + nonce + "'" + wasmPolicy + "; base-uri 'none'; form-action 'none'";
    // The iframe receives only this fixed harness as HTML. Learner source travels as data.
    frame.srcdoc = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
      policy + '"><script nonce="' + nonce + '">' + frameSource + '</script>';

    const timeout = window.setTimeout(() => finish(errorResult('沙箱启动或执行超时。请检查循环和等待操作。')), timeoutMs + 3500);
    function finish(result: RunResult) {
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
      frame.remove();
      resolve(result);
    }
    function receive(event: MessageEvent) {
      if (event.source !== frame.contentWindow || event.origin !== 'null') return;
      if (event.data?.kind === 'ready') {
        frame.contentWindow?.postMessage({ kind: 'run', workerSource: source, code, tests, timeoutMs, wasm: options.wasm }, '*');
      } else if (event.data?.kind === 'result') {
        finish(event.data.result);
      }
    }
    window.addEventListener('message', receive);
    document.body.append(frame);
  });
}
