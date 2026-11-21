import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const moduleDir = fileURLToPath(new URL('../tools/go-runner/', import.meta.url));
const outputDir = fileURLToPath(new URL('../public/practice-runtime/go/', import.meta.url));
const goRoot = execFileSync('go', ['env', 'GOROOT'], { cwd: moduleDir, encoding: 'utf8' }).trim();

mkdirSync(outputDir, { recursive: true });
execFileSync('go', [
  'build', '-trimpath', '-ldflags=-s -w', '-o', join(outputDir, 'runner.wasm'), '.',
], { cwd: moduleDir, env: { ...process.env, GOOS: 'js', GOARCH: 'wasm', CGO_ENABLED: '0' }, stdio: 'inherit' });
copyFileSync(join(goRoot, 'lib', 'wasm', 'wasm_exec.js'), join(outputDir, 'wasm_exec.js'));
copyFileSync(join(goRoot, 'LICENSE'), join(outputDir, 'GO-LICENSE.txt'));
const interpDir = execFileSync('go', ['list', '-f', '{{.Dir}}', 'github.com/traefik/yaegi/interp'], {
  cwd: moduleDir, encoding: 'utf8',
}).trim();
copyFileSync(join(dirname(interpDir), 'LICENSE'), join(outputDir, 'YAEGI-LICENSE.txt'));
