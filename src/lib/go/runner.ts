import { withBase } from '../site';
import { executeIsolated, type RunResult } from '../js-ts/runner';
import type { TestCase } from '../../data/js-ts/types';
import workerSource from './sandbox-worker.js?raw';

const runtimeURL = withBase('/practice-runtime/go/');
let runtime: Promise<{ assets: ArrayBuffer; source: string }> | undefined;

async function loadAsset(filename: string) {
  const response = await fetch(runtimeURL + filename, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error('Go 运行器加载失败（HTTP ' + response.status + '）。本地开发请先运行 npm run go:build。');
  return response;
}

export async function executeGo(code: string, tests: TestCase[]): Promise<RunResult> {
  runtime ??= Promise.all([loadAsset('runner.wasm'), loadAsset('wasm_exec.js')])
    .then(async ([binary, script]) => ({ assets: await binary.arrayBuffer(), source: await script.text() }))
    .catch(error => {
      runtime = undefined;
      throw error;
    });
  const { assets, source } = await runtime;
  return executeIsolated(source + '\n' + workerSource, code, tests, { wasm: assets, timeoutMs: 8000 });
}
