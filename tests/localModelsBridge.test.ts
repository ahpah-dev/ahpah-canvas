import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { EventEmitter, once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { createLocalModelsMiddleware, createLocalModelsService, createOllamaRuntime } from '../server/localModelsBridge.ts';

const json = (data: unknown) => new Response(JSON.stringify(data));
const installed = { name: 'actual:local', model: 'actual:local', size: 1234567, capabilities: ['completion', 'tools'] };
const status = { available: true, version: '0.35.1', models: [{ id: 'actual:local', name: 'actual:local', size: 1234567, isLocal: true, capabilities: ['completion', 'tools'] }] };
const neverRuntime = () => ({ async find() { throw new Error('unexpected runtime lookup'); }, async install() { throw new Error('unexpected installation'); }, async start() { throw new Error('unexpected launch'); }, close() {} });
const inventory = (models: unknown[] = [installed]) => (async (url: unknown) => String(url).endsWith('/api/version') ? json({ version: '0.35.1' }) : json({ models })) as typeof fetch;
function fakeProcess(pid: number): ChildProcess {
  return Object.assign(new EventEmitter(), { pid, exitCode: null, killed: false, kill() { this.killed = true; return true; }, unref() {} }) as unknown as ChildProcess;
}

test('runtime installs only the exact official WinGet package and starts on loopback with cloud disabled', async () => {
  const calls: { file: string; args: string[]; options: Record<string, unknown> }[] = [];
  const runtime = createOllamaRuntime({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\fixture', PATH: '', OLLAMA_HOST: '0.0.0.0:9999', OLLAMA_NO_CLOUD: '0' }, exists: async path => path.endsWith('winget.exe') || path.endsWith('ollama.exe'), launch(file, args, options) {
    calls.push({ file, args, options });
    const child = fakeProcess(calls.length);
    queueMicrotask(() => { child.emit('spawn'); if (args[0] === 'install') { child.exitCode = 0; child.emit('exit', 0); } });
    return child;
  } });
  await runtime.install(new AbortController().signal);
  assert.deepEqual(calls[0].args, ['install', '--id', 'Ollama.Ollama', '--exact', '--source', 'winget', '--scope', 'user', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity', '--no-upgrade']);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.windowsHide, true);
  assert.ok(!calls[0].args.some(argument => /ignore.*security|force/.test(argument)));
  const executable = await runtime.find(); assert.ok(executable?.endsWith('ollama.exe'));
  await runtime.start(executable!);
  assert.deepEqual(calls[1].args, ['serve']);
  assert.equal((calls[1].options.env as Record<string, unknown>).OLLAMA_HOST, '127.0.0.1:11434');
  assert.equal((calls[1].options.env as Record<string, unknown>).OLLAMA_NO_CLOUD, '1');
  runtime.close();
  assert.deepEqual(calls[2].args, ['/PID', '2', '/T', '/F']);
});

test('cancelling an installer terminates its process tree and does not continue setup', async () => {
  const calls: string[][] = [];
  const runtime = createOllamaRuntime({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\fixture', PATH: '' }, exists: async path => path.endsWith('winget.exe'), launch(_file, args) { calls.push(args); return fakeProcess(calls.length); } });
  const controller = new AbortController();
  const operation = runtime.install(controller.signal);
  await new Promise(resolve => setTimeout(resolve, 0));
  controller.abort();
  await assert.rejects(operation, { name: 'AbortError' });
  assert.deepEqual(calls[1], ['/PID', '1', '/T', '/F']);
  runtime.close();
});

test('missing WinGet gives the official installer next step without executing remote scripts', async () => {
  const runtime = createOllamaRuntime({ platform: 'win32', env: { PATH: '' }, exists: async () => false, launch() { throw new Error('unexpected launch'); } });
  await assert.rejects(runtime.install(new AbortController().signal), /ollama.com\/download\/windows/);
  const unix = createOllamaRuntime({ platform: 'linux', env: { PATH: '' }, launch() { throw new Error('unexpected launch'); } });
  await assert.rejects(unix.install(new AbortController().signal), /Automatic runtime installation is available on Windows/);
});

test('discovery returns the actual installed models and excludes remote or cloud inventory entries', async () => {
  const service = createLocalModelsService({ runtime: neverRuntime(), fetch: inventory([
    installed, installed, { ...installed, model: 'remote:latest', remote_host: 'https://ollama.com' },
    { ...installed, model: 'remote-alias:latest', remote_model: 'actual' }, { ...installed, model: 'some:cloud' },
    { ...installed, model: 'some:8b-cloud' }, { ...installed, model: 'invalid:tag', size: -1 }, { ...installed, model: 'zero:tag', size: 0 },
    { ...installed, model: 'https://arbitrary.example/model' },
  ]) });
  assert.deepEqual(await service.discover(), status);
});

test('discovery never marks a foreign service or incomplete Ollama inventory as available', async () => {
  const service = createLocalModelsService({ runtime: neverRuntime(), fetch: (async () => json({ models: [installed], version: 'unknown-server' })) as typeof fetch });
  assert.equal((await service.discover()).available, false);
  const empty = createLocalModelsService({ runtime: neverRuntime(), fetch: inventory([]) });
  const result = await empty.discover();
  assert.equal(result.available, true); assert.equal(result.models.length, 0);
  assert.match(result.error!, /no downloaded local models/);
});

test('setup reuses a running service and never pulls a model without an explicit selection', async () => {
  const service = createLocalModelsService({ runtime: neverRuntime(), fetch: inventory() });
  assert.deepEqual(await service.setup({}, new AbortController().signal, () => {}), status);
  const empty = createLocalModelsService({ runtime: neverRuntime(), fetch: inventory([]) });
  const events: string[] = [];
  assert.equal((await empty.setup({}, new AbortController().signal, event => events.push(event.phase))).models.length, 0);
  assert.ok(events.includes('no-models')); assert.ok(!events.includes('ready'));
});

test('setup installs a missing runtime, starts it once, and confirms the live inventory', async () => {
  let installedRuntime = false; let running = false; const operations: string[] = [];
  const service = createLocalModelsService({ runtime: {
    async find() { operations.push('find'); return installedRuntime ? 'fixture-ollama' : undefined; },
    async install() { operations.push('install'); installedRuntime = true; },
    async start(file) { assert.equal(file, 'fixture-ollama'); operations.push('start'); running = true; }, close() {},
  }, fetch: (async url => { if (!running) throw new TypeError('not running'); return inventory()(url); }) as typeof fetch });
  assert.deepEqual(await service.setup({}, new AbortController().signal, () => {}), status);
  assert.deepEqual(operations, ['find', 'install', 'find', 'start']);
});

test('setup rechecks service after installation and reuses the Windows tray service', async () => {
  let running = false; let installs = 0;
  const service = createLocalModelsService({ runtime: {
    async find() { return running ? 'fixture-ollama' : undefined; }, async install() { installs++; running = true; }, async start() { throw new Error('unexpected duplicate service'); }, close() {},
  }, fetch: (async url => { if (!running) throw new TypeError('not running'); return inventory()(url); }) as typeof fetch });
  assert.deepEqual(await service.setup({}, new AbortController().signal, () => {}), status);
  assert.equal(installs, 1);
});

test('explicit model pull streams progress and confirms the downloaded model in the inventory', async () => {
  let downloaded = false; let pulls = 0; const events: { percent?: number }[] = [];
  const digest = `sha256:${'a'.repeat(64)}`;
  const service = createLocalModelsService({ runtime: neverRuntime(), fetch: (async (url, init) => {
    if (String(url).endsWith('/api/pull')) {
      pulls++; assert.deepEqual(JSON.parse(init!.body as string), { model: 'actual:local', stream: true });
      assert.equal(init?.redirect, 'error'); assert.equal(init?.credentials, 'omit');
      downloaded = true;
      const text = [JSON.stringify({ status: 'pulling manifest' }), JSON.stringify({ status: 'pulling layer', digest, total: 100, completed: 50 }), JSON.stringify({ status: 'success' })].join('\n');
      return new Response(new ReadableStream({ start(controller) { for (const part of [text.slice(0, 37), text.slice(37, 70), text.slice(70)]) controller.enqueue(new TextEncoder().encode(part)); controller.close(); } }));
    }
    return inventory(downloaded ? [installed] : [])(url);
  }) as typeof fetch });
  assert.deepEqual(await service.setup({ model: 'actual:local' }, new AbortController().signal, event => events.push(event)), status);
  assert.ok(events.some(event => event.percent === 50));
  assert.equal(pulls, 1);
  await service.setup({ model: 'actual:local' }, new AbortController().signal, () => {});
  assert.equal(pulls, 1);
});

test('pull failures, advertised download limits, and unconfirmed success never produce a ready model', async () => {
  for (const progress of [
    { error: 'model was not found' }, { status: 'pulling', digest: `sha256:${'a'.repeat(64)}`, total: 33 * 1024 ** 3 },
    { status: 'success' }, { status: 'pulling manifest' },
  ]) {
    const service = createLocalModelsService({ runtime: neverRuntime(), fetch: (async url => String(url).endsWith('/api/pull') ? new Response(JSON.stringify(progress)) : inventory([])(url)) as typeof fetch });
    await assert.rejects(service.setup({ model: 'some:tag' }, new AbortController().signal, () => {}), /could not download|safety limit|not in its installed|before Ollama confirmed/);
  }
});

test('local setup rejects cloud names, paths, alternate registries, and command strings before any operation', async () => {
  const service = createLocalModelsService({ runtime: neverRuntime(), fetch: (async () => { throw new Error('unexpected fetch'); }) as typeof fetch });
  for (const model of ['gemma4:cloud', 'name:8b-cloud', 'https://evil.example/m', 'registry.example/user/model', '../model', 'name; calc.exe', 'name $(command)', 'name:tag:extra', '']) {
    await assert.rejects(service.setup({ model }, new AbortController().signal, () => {}), /local model name/);
  }
});

test('cancelling an idle model download cancels its stream and allows a later setup', async () => {
  let cancelled = false;
  const service = createLocalModelsService({ runtime: neverRuntime(), fetch: (async url => String(url).endsWith('/api/pull') ? new Response(new ReadableStream({ cancel() { cancelled = true; } })) : inventory([])(url)) as typeof fetch });
  const controller = new AbortController();
  const operation = service.setup({ model: 'some:tag' }, controller.signal, () => {});
  await new Promise(resolve => setTimeout(resolve, 10));
  await assert.rejects(service.setup({}, new AbortController().signal, () => {}), /already running/);
  controller.abort();
  await assert.rejects(operation, { name: 'AbortError' });
  assert.equal(cancelled, true);
  assert.equal((await service.setup({}, new AbortController().signal, () => {})).available, true);
});

test('discovery cancellation and stalled upstream bodies are bounded', async () => {
  let cancelled = 0;
  const service = createLocalModelsService({ runtime: neverRuntime(), requestTimeoutMs: 20, fetch: (async () => new Response(new ReadableStream({ cancel() { cancelled++; } }))) as typeof fetch });
  const controller = new AbortController(); const operation = service.discover(controller.signal);
  controller.abort(); await assert.rejects(operation, { name: 'AbortError' });
  const keepAlive = setTimeout(() => {}, 50);
  assert.equal((await service.discover()).available, false); clearTimeout(keepAlive);
  assert.ok(cancelled >= 2);
});

test('middleware requires a loopback binding and exact same origin before accepting installation or pulls', async t => {
  let setups = 0; let allowedBinding = true;
  const middleware = createLocalModelsMiddleware({ async discover() { return status; }, async setup(input, _signal, emit) { setups++; assert.deepEqual(input, {}); emit({ phase: 'ready', detail: 'Installed inventory confirmed' }); return status; } }, () => allowedBinding);
  const server = createServer((request, response) => { void middleware(request, response, () => { response.statusCode = 404; response.end(); }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  assert.deepEqual(await (await fetch(`${origin}/api/local-models/status`)).json(), status);
  const headers = { 'Content-Type': 'application/json', Origin: origin };
  for (const override of [{ Origin: '' }, { Origin: 'https://attacker.example' }, { Origin: origin.replace('http:', 'https:') }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await fetch(`${origin}/api/local-models/setup`, { method: 'POST', headers: { ...headers, ...override }, body: '{}' })).status, 403, JSON.stringify(override));
  }
  // Node fetch replaces Host; use an actual HTTP request to exercise DNS rebinding protection.
  const rebound = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(`${origin}/api/local-models/setup`, { method: 'POST', headers: { ...headers, Host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end('{}');
  });
  assert.equal(rebound, 403);
  allowedBinding = false;
  assert.equal((await fetch(`${origin}/api/local-models/setup`, { method: 'POST', headers, body: '{}' })).status, 403);
  allowedBinding = true;
  assert.equal(setups, 0);
  for (const body of ['{"model":"https://attacker.example/model"}', '{"model":"some:cloud"}', '{"executable":"calc.exe"}', '[]', '{invalid', JSON.stringify({ model: 'a'.repeat(1200) })]) {
    assert.equal((await fetch(`${origin}/api/local-models/setup`, { method: 'POST', headers, body })).status, 400);
  }
  assert.equal((await fetch(`${origin}/api/local-models/setup`, { method: 'POST', headers: { Origin: origin }, body: '{}' })).status, 400);
  assert.equal((await fetch(`${origin}/api/local-models/setup`, { headers })).status, 405);
  const response = await fetch(`${origin}/api/local-models/setup`, { method: 'POST', headers, body: '{}' });
  assert.equal(response.headers.get('content-type'), 'application/x-ndjson');
  assert.match(await response.text(), /"result":\{"available":true/);
  assert.equal(setups, 1);
});

test('middleware aborts a setup operation when the browser disconnects', async t => {
  let disconnected!: () => void; const stopped = new Promise<void>(resolve => { disconnected = resolve; });
  const middleware = createLocalModelsMiddleware({ async discover() { return status; }, async setup(_input, signal, emit) { emit({ phase: 'installing', detail: 'Installing' }); await new Promise<void>(resolve => signal.addEventListener('abort', () => { disconnected(); resolve(); }, { once: true })); signal.throwIfAborted(); return status; } });
  const server = createServer((request, response) => { void middleware(request, response, () => response.end()); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const response = await fetch(`${origin}/api/local-models/setup`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
  await response.body!.cancel();
  await stopped;
});
