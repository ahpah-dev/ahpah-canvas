import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOmniRouteMiddleware, createOmniRouteService } from '../server/omniRouteBridge.ts';
import { oneClickOmniRouteSetup, startLocalOmniRoute } from '../src/utils/omniRouteSetup.ts';
const config = { omniRouteUrl: 'http://localhost:20128/v1', omniRouteKey: '', omniRouteModel: '', kiloKey: 'keep-kilo-key', kiloModel: 'kilo-auto/free' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const started = () => new Response(JSON.stringify({ phase: 'starting', detail: 'Starting gateway' }) + '\n' + JSON.stringify({ result: { baseUrl: 'http://127.0.0.1:20128/v1', reused: true } }) + '\n');
const ready = () => json({ model: 'live-model', choices: [{ message: { content: JSON.stringify({ actions: [{ tool: 'finish', summary: 'READY', review: 'No files changed.' }] }) } }] });
function storage(t: { after: (fn: () => void) => void }) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const values = new Map([['ahpah_gateway_config', JSON.stringify(config)]]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => true } });
  t.after(() => { if (old) Object.defineProperty(globalThis, 'localStorage', old); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  t.after(() => { if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window'); });
  return values;
}

test('one-click setup installs/starts, checks coding actions, and preserves other saved providers', async t => {
  const values = storage(t); const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    calls.push(String(url));
    if (url === '/api/omniroute/start') return started();
    if (String(url).includes('/models')) return json({ data: [
      { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini', pricing: { prompt: 1, completion: 1 } },
      { id: 'auto/coding:free', name: 'Auto Coding · Free' },
      { id: 'oc/current-free', name: 'Current coding model', isFree: true },
    ] });
    assert.equal(JSON.parse(init!.body as string).model, 'oc/current-free');
    assert.ok(JSON.parse(init!.body as string).tools.some((tool: { function: { name: string } }) => tool.function.name === 'write'));
    assert.equal(JSON.parse(init!.body as string).max_tokens, 1024);
    return ready();
  });
  const result = await oneClickOmniRouteSetup({ ...config, omniRouteModel: 'openai/gpt-5.4-mini' }, new AbortController().signal, () => {});
  assert.equal(calls[0], '/api/omniroute/start');
  assert.equal(result.model, 'live-model');
  const saved = JSON.parse(values.get('ahpah_gateway_config')!);
  assert.equal(saved.omniRouteModel, 'oc/current-free');
  assert.equal(saved.kiloKey, 'keep-kilo-key');
  assert.equal(saved.transport, 'bridge');
});

test('verification failure and cancellation leave saved configuration unchanged', async t => {
  const values = storage(t); const before = values.get('ahpah_gateway_config');
  t.mock.method(globalThis, 'fetch', async (url: unknown) => url === '/api/omniroute/start' ? started()
    : String(url).includes('/models') ? json({ data: [{ id: 'oc/current-free', isFree: true }] })
      : json({ model: 'live-model', choices: [{ message: { content: 'I am ready' } }] }));
  await assert.rejects(oneClickOmniRouteSetup(config, new AbortController().signal, () => {}), /verification did not complete/);
  assert.equal(values.get('ahpah_gateway_config'), before);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(oneClickOmniRouteSetup(config, controller.signal, () => {}), { name: 'AbortError' });
  assert.equal(values.get('ahpah_gateway_config'), before);
});

test('provider credential errors with punctuation skip aliases and still reach other free providers', async t => {
  const values = storage(t); const attempts: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    if (url === '/api/omniroute/start') return started();
    if (String(url).includes('/models')) return json({ data: [
      { id: 'oc/new-free', created: 40 }, { id: 'opencode/other-free', created: 30 },
      { id: 'oc/older-free', created: 20 }, { id: 'another/current-free', created: 10 },
      { id: 'paid/new', created: 50, pricing: { prompt: 1, completion: 1 } },
    ] });
    const model = JSON.parse(init!.body as string).model; attempts.push(model);
    return model.startsWith('oc/') ? json({ error: 'No active credentials for provider: opencode.' }, 401) : ready();
  });
  await oneClickOmniRouteSetup(config, new AbortController().signal, () => {});
  assert.deepEqual(attempts, ['oc/new-free', 'another/current-free']);
  assert.equal(JSON.parse(values.get('ahpah_gateway_config')!).omniRouteModel, 'another/current-free');
});

test('OpenCode failures explain its no-key prerequisites and never save a broken route', async t => {
  const values = storage(t); const before = values.get('ahpah_gateway_config');
  t.mock.method(globalThis, 'fetch', async (url: unknown) => url === '/api/omniroute/start' ? started() : String(url).includes('/models')
    ? json({ data: [{ id: 'oc/current-free' }] }) : json({ error: { message: 'No active credentials for provider: opencode.' } }, 401));
  await assert.rejects(oneClickOmniRouteSetup(config, new AbortController().signal, () => {}), /does not require an account key/);
  assert.equal(values.get('ahpah_gateway_config'), before);
});

test('cancelling an idle installer stream cancels its reader', async t => {
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  const controller = new AbortController();
  const operation = startLocalOmniRoute(controller.signal, () => {});
  await new Promise(resolve => setTimeout(resolve, 0)); controller.abort();
  await assert.rejects(operation, { name: 'AbortError' });
  assert.equal(cancelled, true);
});

test('remote gateways never invoke the local installer and keys are redacted from errors', async t => {
  storage(t); const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown) => { calls.push(String(url)); return json({ error: { message: 'Invalid secret-example key' } }, 401); });
  await assert.rejects(oneClickOmniRouteSetup({ ...config, omniRouteUrl: 'https://gateway.example/v1', omniRouteKey: 'secret-example' }, new AbortController().signal, () => {}), /needs its API key/);
  assert.equal(calls.includes('/api/omniroute/start'), false);
});

test('missing providers give a real next step without saving a fake working connection', async t => {
  const values = storage(t); const before = values.get('ahpah_gateway_config');
  t.mock.method(globalThis, 'fetch', async (url: unknown) => url === '/api/omniroute/start' ? started() : json({ data: [] }));
  await assert.rejects(oneClickOmniRouteSetup(config, new AbortController().signal, () => {}), /connect a provider/);
  assert.equal(values.get('ahpah_gateway_config'), before);
});

test('setup streams require a confirmed gateway and surface installer failures', async t => {
  let body = '{"error":"Installation failed"}\n';
  t.mock.method(globalThis, 'fetch', async () => new Response(body));
  await assert.rejects(startLocalOmniRoute(new AbortController().signal, () => {}), /Installation failed/);
  body = '{"phase":"starting"}\n';
  await assert.rejects(startLocalOmniRoute(new AbortController().signal, () => {}), /before the gateway was ready/);
});

test('an already running OmniRoute is reused without installation or launch', async t => {
  t.mock.method(globalThis, 'fetch', async () => json({ data: [] }));
  const service = createOmniRouteService(process.cwd());
  assert.deepEqual(await service.start(new AbortController().signal, () => {}), { baseUrl: 'http://127.0.0.1:20128/v1', reused: true });
  service.close();
});
test('authenticated gateways are recognized by their public health endpoint', async t => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown) => {
    calls.push(String(url));
    return String(url).endsWith('/api/health') ? json({ status: 'ok' }) : json({ error: 'API key required' }, 401);
  });
  const service = createOmniRouteService(process.cwd());
  assert.equal((await service.start(new AbortController().signal, () => {})).reused, true);
  assert.deepEqual(calls, ['http://127.0.0.1:20128/api/health']);
  service.close();
});

test('local installation accepts only same-origin loopback POST requests', async t => {
  let starts = 0;
  const middleware = createOmniRouteMiddleware({ async start(_signal, emit) { starts++; emit({ phase: 'starting', detail: 'Starting' }); return { baseUrl: 'http://127.0.0.1:20128/v1', reused: false }; } });
  const server = createServer((request, response) => { void middleware(request, response, () => { response.statusCode = 404; response.end(); }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(finish => server.close(() => finish())); });
  for (const headers of [{}, { Origin: 'https://attacker.example' }, { Origin: origin, 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await fetch(`${origin}/api/omniroute/start`, { method: 'POST', headers })).status, 403);
  }
  assert.equal(starts, 0);
  assert.equal((await fetch(`${origin}/api/omniroute/start`, { headers: { Origin: origin } })).status, 405);
  const response = await fetch(`${origin}/api/omniroute/start`, { method: 'POST', headers: { Origin: origin } });
  assert.match(await response.text(), /"baseUrl":"http:\/\/127.0.0.1:20128\/v1"/);
  assert.equal(starts, 1);
});
