import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { gatewayMiddleware } from '../server/gatewayBridge.ts';
import { sendGatewayPrompt, type GatewayConfig } from '../src/utils/gateways.ts';
import { CATALOG_TIMEOUT_MS, COMPLETION_TIMEOUT_MS, COMPLETION_TIMEOUT_MESSAGE, LOCAL_COMPLETION_TIMEOUT_MS, LOCAL_COMPLETION_TIMEOUT_MESSAGE, isLocalOllamaUrl } from '../src/utils/gatewayPolicy.ts';

const local = { id: 'local-ollama', name: 'Local Ollama', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', model: 'installed:local', stream: true };
const config: GatewayConfig = { omniRouteUrl: 'http://localhost:20128/v1', omniRouteKey: '', omniRouteModel: 'installed:local', kiloKey: '', kiloModel: 'concrete-model', customProviders: [local] };
const answer = () => new Response(JSON.stringify({ choices: [{ message: { content: 'Fixture answer' } }] }), { headers: { 'Content-Type': 'application/json' } });

test('the extended completion window matches only the canonical local Ollama base URL', () => {
  assert.equal(LOCAL_COMPLETION_TIMEOUT_MS, 10 * 60_000);
  assert.equal(COMPLETION_TIMEOUT_MS, 3 * 60_000);
  assert.equal(isLocalOllamaUrl(local.baseUrl), true);
  for (const url of ['https://provider.example/v1', 'http://localhost:11434/v1', 'http://127.0.0.1:20128/v1', 'http://127.0.0.1:11434/other/v1', 'https://127.0.0.1:11434/v1']) assert.equal(isLocalOllamaUrl(url), false);
});

test('browser local requests receive ten minutes and truthful first load feedback', async t => {
  const deadlines: number[] = []; const details: string[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { deadlines.push(ms); return new AbortController().signal; });
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.equal(body.reasoning_effort, 'none');
    return answer();
  });
  assert.equal((await sendGatewayPrompt('custom', 'Fixture prompt', config, { providerId: local.id, onProgress: event => details.push(event.detail || '') })).text, 'Fixture answer');
  assert.deepEqual(deadlines, [LOCAL_COMPLETION_TIMEOUT_MS]);
  assert.ok(details.some(detail => /first model load can take a few minutes.*Stop cancels/i.test(detail)));
});

test('ordinary browser custom, Kilo, and OmniRoute requests retain their three minute window', async t => {
  const deadlines: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { deadlines.push(ms); return new AbortController().signal; });
  t.mock.method(globalThis, 'fetch', async () => answer());
  for (const baseUrl of ['https://provider.example/v1', 'http://localhost:11434/v1', 'http://127.0.0.1:11435/v1']) await sendGatewayPrompt('custom', 'Fixture prompt', { ...config, customProviders: [{ ...local, baseUrl }] }, { providerId: local.id });
  await sendGatewayPrompt('kilo', 'Fixture prompt', config);
  // Choosing Ollama's URL on an OmniRoute profile does not broaden the scoped exception.
  await sendGatewayPrompt('omniroute', 'Fixture prompt', { ...config, omniRouteUrl: local.baseUrl });
  assert.deepEqual(deadlines, Array(5).fill(COMPLETION_TIMEOUT_MS));
});

test('local browser deadline errors give actionable ten minute guidance', async t => {
  const deadline = new AbortController();
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { assert.equal(ms, LOCAL_COMPLETION_TIMEOUT_MS); return deadline.signal; });
  t.mock.method(globalThis, 'fetch', async () => { deadline.abort(new DOMException('Native deadline', 'TimeoutError')); throw deadline.signal.reason; });
  await assert.rejects(sendGatewayPrompt('custom', 'Fixture prompt', config, { providerId: local.id }), { name: 'TimeoutError', message: LOCAL_COMPLETION_TIMEOUT_MESSAGE });
});

test('local browser Stop cancels an idle SSE reader and preserves the original cancellation', async t => {
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream' } }));
  const controller = new AbortController();
  const operation = sendGatewayPrompt('custom', 'Fixture prompt', config, { providerId: local.id, signal: controller.signal });
  await new Promise(resolve => setTimeout(resolve, 0));
  controller.abort(new DOMException('User stopped local request', 'AbortError'));
  await assert.rejects(operation, { name: 'AbortError', message: 'User stopped local request' });
  assert.equal(cancelled, true);
});

test('browser caller deadlines retain their original reason', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => { controller.abort(new DOMException('Task deadline', 'TimeoutError')); throw controller.signal.reason; });
  await assert.rejects(sendGatewayPrompt('custom', 'Fixture prompt', config, { providerId: local.id, signal: controller.signal }), { name: 'TimeoutError', message: 'Task deadline' });
});

test('gateway bridge selects the same local window and leaves provider and catalog windows unchanged', async t => {
  const originalFetch = globalThis.fetch;
  const deadlines: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { deadlines.push(ms); return new AbortController().signal; });
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => String(url).startsWith(origin) ? originalFetch(url as string, init) : answer());
  const server = createServer((request, response) => { void gatewayMiddleware(request, response, () => response.end()); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(() => { server.closeAllConnections(); server.close(); });
  const cases = [
    { provider: 'custom', base: local.baseUrl, method: 'POST', expected: LOCAL_COMPLETION_TIMEOUT_MS },
    { provider: 'custom', base: local.baseUrl + '/', method: 'POST', expected: LOCAL_COMPLETION_TIMEOUT_MS },
    { provider: 'custom', base: 'https://provider.example/v1', method: 'POST', expected: COMPLETION_TIMEOUT_MS },
    { provider: 'custom', base: 'http://localhost:11434/v1', method: 'POST', expected: COMPLETION_TIMEOUT_MS },
    { provider: 'omniroute', base: local.baseUrl, method: 'POST', expected: COMPLETION_TIMEOUT_MS },
    { provider: 'kilo', base: '', method: 'POST', expected: COMPLETION_TIMEOUT_MS },
    { provider: 'custom', base: local.baseUrl, method: 'GET', expected: CATALOG_TIMEOUT_MS },
  ];
  for (const item of cases) {
    const response = await fetch(`${origin}/api/gateway/${item.provider}/${item.method === 'POST' ? 'chat/completions' : 'models'}`, { method: item.method, headers: { Origin: origin, 'X-Gateway-Url': item.base, 'X-OmniRoute-Url': item.base }, ...(item.method === 'POST' ? { body: '{"model":"fixture-model"}' } : {}) });
    assert.equal(response.status, 200); await response.json();
  }
  assert.deepEqual(deadlines, cases.map(item => item.expected));
});

test('gateway bridge timeout errors use local guidance only for the scoped Ollama route', async t => {
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    if (String(url).startsWith(origin)) return originalFetch(url as string, init);
    throw new DOMException('Fixture deadline', 'TimeoutError');
  });
  const server = createServer((request, response) => { void gatewayMiddleware(request, response, () => response.end()); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
  t.after(() => { server.closeAllConnections(); server.close(); });
  for (const [base, message] of [[local.baseUrl, LOCAL_COMPLETION_TIMEOUT_MESSAGE], ['https://provider.example/v1', COMPLETION_TIMEOUT_MESSAGE]]) {
    const response = await fetch(`${origin}/api/gateway/custom/chat/completions`, { method: 'POST', headers: { Origin: origin, 'X-Gateway-Url': base }, body: '{}' });
    assert.equal(response.status, 502); assert.equal((await response.json()).error.message, message);
  }
});

test('disconnecting a local Ollama bridge client immediately aborts its upstream request', async t => {
  const originalFetch = globalThis.fetch;
  let aborted!: () => void; const stopped = new Promise<void>(resolve => { aborted = resolve; });
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    if (String(url).startsWith(origin)) return originalFetch(url as string, init);
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(controller) { source = controller; controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Fixture"}}]}\n\n')); } });
    init!.signal!.addEventListener('abort', () => { source.error(init!.signal!.reason); aborted(); }, { once: true });
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
  });
  const server = createServer((request, response) => { void gatewayMiddleware(request, response, () => response.end()); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
  t.after(() => { server.closeAllConnections(); server.close(); });
  const controller = new AbortController();
  const response = await fetch(`${origin}/api/gateway/custom/chat/completions`, { method: 'POST', signal: controller.signal, headers: { Origin: origin, 'X-Gateway-Url': local.baseUrl }, body: '{}' });
  await response.body!.getReader().read(); controller.abort();
  await stopped;
});
