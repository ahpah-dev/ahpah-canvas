import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendGatewayPrompt, listOmniRouteModels } from '../src/utils/gateways.ts';
import { parseAgentActions } from '../src/utils/agentRuntime.ts';
import { unavailableOmniProvider, freeModelCandidates } from '../src/utils/omniRoutePolicy.ts';
const config = { omniRouteUrl: 'http://localhost:20128/v1', omniRouteKey: 'private-gateway-key', omniRouteModel: 'oc/model-free', kiloKey: '', kiloModel: '' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test('native streamed tool arguments are reconstructed and passed through existing action validation', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const payload = JSON.parse(init.body as string);
    assert.equal(payload.stream, true);
    assert.equal(payload.tool_choice, 'auto');
    for (const name of ['read', 'glob', 'grep', 'edit', 'write', 'bash']) assert.ok(payload.tools.some((tool: { function: { name: string } }) => tool.function.name === name));
    const chunks = [
      { index: 0, function: { name: 'write', arguments: '{"path":"index.html",' } },
      { index: 0, function: { arguments: '"content":"<html>actual source</html>"}' } },
    ];
    const events = chunks.map(call => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [call] } }] })}\n\n`).join('');
    return new Response(events + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  });
  const result = await sendGatewayPrompt('omniroute', 'Create a page', config, { validateResponse: text => { parseAgentActions(text); } });
  assert.deepEqual(parseAgentActions(result.text), [{ tool: 'write_file', path: 'index.html', content: '<html>actual source</html>' }]);
});

test('native tools cannot bypass path validation or inject an alternative action name', async t => {
  t.mock.method(globalThis, 'fetch', async () => json({ choices: [{ message: { tool_calls: [{ function: { name: 'write', arguments: '{"path":"../outside.html","content":"bad","tool":"finish"}' } }] }, finish_reason: 'tool_calls' }] }));
  await assert.rejects(sendGatewayPrompt('omniroute', 'Create', config, { validateResponse: text => { parseAgentActions(text); } }), /path|relative|traversal/i);
});

test('Auto Free routes concrete free models and skips unavailable provider siblings', async t => {
  const calls: string[] = []; const routing = { excludedModels: [] as string[], model: undefined as string | undefined };
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    if (String(url).includes('/models')) return json({ data: [
      { id: 'oc/latest-free', created: 30 }, { id: 'opencode/older-free', created: 20 },
      { id: 'other/model-free', created: 10 }, { id: 'expensive/newest', created: 50, pricing: { prompt: 1, completion: 1 } },
    ] });
    const model = JSON.parse(init.body as string).model; calls.push(model);
    return model.startsWith('oc/') ? json({ error: { message: 'No active credentials for provider: opencode.' } }, 401)
      : json({ model, choices: [{ message: { content: 'Working route' } }] });
  });
  const result = await sendGatewayPrompt('omniroute', 'Build', { ...config, omniRouteModel: 'auto/coding:free' }, { routing });
  assert.equal(result.text, 'Working route');
  assert.deepEqual(calls, ['oc/latest-free', 'other/model-free']);
  assert.equal(routing.model, 'other/model-free');
  assert.ok(routing.excludedModels.includes('opencode/older-free'));
});

test('exact imported models stay selected and upstream errors redact the gateway key', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    calls++; assert.equal(JSON.parse(init.body as string).model, 'my-provider/custom-model');
    return json({ error: `Unavailable: ${config.omniRouteKey}` }, 401);
  });
  await assert.rejects(sendGatewayPrompt('omniroute', 'Build', { ...config, omniRouteModel: 'my-provider/custom-model' }), error => error instanceof Error && error.message.includes('[redacted]') && !error.message.includes(config.omniRouteKey));
  assert.equal(calls, 1);
});

test('missing gateway authentication halts Auto Free without hitting more providers', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: unknown) => String(url).includes('/models') ? json({ data: [{ id: 'first/free' }, { id: 'second/free' }] })
    : (calls++, json({ error: { message: 'Invalid API key' } }, 401)));
  await assert.rejects(sendGatewayPrompt('omniroute', 'Build', { ...config, omniRouteModel: 'auto/best-free' }), /Invalid API key/);
  assert.equal(calls, 1);
});

test('malformed catalogs are an error, rather than a successful empty catalog', async t => {
  t.mock.method(globalThis, 'fetch', async () => json({ dashboard: true }));
  await assert.rejects(listOmniRouteModels(config), /API base URL/);
});
test('dashboard-origin URLs normalize to /v1 and catalog errors redact credentials', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    assert.equal((init.headers as Record<string, string>)['X-OmniRoute-Url'], 'http://localhost:20128/v1');
    return json({ error: { message: `Invalid API key ${config.omniRouteKey}` } }, 401);
  });
  await assert.rejects(listOmniRouteModels({ ...config, omniRouteUrl: 'http://localhost:20128/' }), error => error instanceof Error && !error.message.includes(config.omniRouteKey) && error.message.includes('[redacted]'));
});

test('provider identity excludes sentence punctuation and automatic models are never probes', () => {
  assert.equal(unavailableOmniProvider('No active credentials for provider: opencode.'), 'opencode');
  assert.equal(unavailableOmniProvider('No active credentials for provider: oc.'), 'opencode');
  assert.deepEqual(freeModelCandidates([{ id: 'auto', isFree: true }, { id: 'auto/best-free' }, { id: 'real/free' }]).map(model => model.id), ['real/free']);
});
test('free setup prefers the newest live family version when release dates are unavailable', () => {
  const models = [{ id: 'oc/glm-5.1-free', isFree: true }, { id: 'oc/glm-5.3', isFree: true }, { id: 'oc/glm-5.1', isFree: true }];
  assert.equal(freeModelCandidates(models, 'oc/glm-5.1')[0].id, 'oc/glm-5.3');
});
