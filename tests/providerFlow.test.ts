import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { gatewayMiddleware } from '../server/gatewayBridge.ts';
import { listKiloModels, listOmniRouteModels, listNineRouterModels, listCustomModels, sendGatewayPrompt, type GatewayConfig } from '../src/utils/gateways.ts';
import { runEngineeringAgent } from '../src/utils/agentRuntime.ts';
import { createStarterProject } from '../src/utils/projectFiles.ts';

async function listen(server: Server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  return `http://127.0.0.1:${address.port}`;
}

test('every compatible provider connects through the real HTTP bridge and stages streamed coding tools', async t => {
  const nativeFetch = globalThis.fetch;
  const forwarded: { key?: string; saver?: string | string[]; model?: string }[] = [];
  const upstream = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url?.startsWith('/v1/models')) {
      forwarded.push({ key: request.headers.authorization });
      response.end(JSON.stringify({ data: [{ id: 'fixture/model', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] }] })); return;
    }
    let text = ''; for await (const chunk of request) text += chunk;
    const payload = JSON.parse(text);
    forwarded.push({ key: request.headers.authorization, saver: request.headers['x-9router-token-saver'], model: payload.model });
    assert.equal(payload.model, 'fixture/model');
    response.setHeader('Content-Type', 'text/event-stream');
    const calls = [
      { name: 'plan', args: { steps: ['Create connection.txt', 'Read and review staged source'] } },
      { name: 'write', args: { path: 'connection.txt', content: 'Connection verified\n' } },
      { name: 'read', args: { path: 'connection.txt' } },
      { name: 'finish', args: { summary: 'Created connection.txt', review: 'Reviewed the staged source. No commands run.' } },
    ];
    for (const [index, call] of calls.entries()) response.write(`data: ${JSON.stringify({ model: 'fixture/resolved', choices: [{ index: 0, delta: { tool_calls: [{ index, id: `call_${index}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }] } }] })}\n\n`);
    response.end('data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"total_tokens":12}}\n\ndata: [DONE]\n\n');
  });
  const bridge = createServer((request, response) => { void gatewayMiddleware(request, response, () => { response.statusCode = 404; response.end(); }); });
  t.after(() => { upstream.closeAllConnections(); bridge.closeAllConnections(); upstream.close(); bridge.close(); });
  const target = await listen(upstream), origin = await listen(bridge);
  // All requests reach real local HTTP fixtures. Hosted Kilo is redirected only
  // in this test, including the bridge's fetch; no account quota is used.
  t.mock.method(globalThis, 'fetch', (input: string | URL | Request, init?: RequestInit) => {
    let url = String(input);
    if (url.startsWith('/api/gateway/')) url = `${origin}${url}`;
    if (url.startsWith('https://api.kilo.ai/api/gateway/')) url = url.replace('https://api.kilo.ai/api/gateway', `${target}/v1`);
    return nativeFetch(url, init);
  });
  for (const transport of ['bridge', 'direct'] as const) for (const provider of ['omniroute', 'kilo', '9router', 'custom'] as const) await t.test(`${provider}/${transport}`, async () => {
    const key = ' "Bearer fixture-key" ';
    const custom = { id: 'fixture', name: 'Fixture', baseUrl: `${target}/v1`, apiKey: key, model: 'fixture/model', stream: true };
    const config: GatewayConfig = { transport, omniRouteUrl: `${target}/v1`, omniRouteKey: key, omniRouteModel: 'fixture/model', kiloKey: key, kiloModel: 'fixture/model', nineRouterUrl: `${target}/v1`, nineRouterKey: key, nineRouterModel: 'fixture/model', customProviders: [custom] };
    const catalog = provider === 'omniroute' ? await listOmniRouteModels(config, undefined, true) : provider === 'kilo' ? await listKiloModels(undefined, config, true) : provider === '9router' ? await listNineRouterModels(config) : await listCustomModels(custom, config);
    assert.equal(catalog[0].id, 'fixture/model');
    const first = forwarded.length;
    const result = await runEngineeringAgent({ project: createStarterProject(), goal: 'Create connection.txt', providerId: provider === 'custom' ? 'custom:fixture' : provider, mode: 'code', signal: new AbortController().signal, send: request => sendGatewayPrompt(provider, request.prompt, config, { ...request, providerId: provider === 'custom' ? custom.id : undefined }) });
    assert.equal(result.error, undefined); assert.equal(result.completed, true);
    assert.ok(result.changeSet.changes.some(change => change.path === 'connection.txt' && change.after === 'Connection verified\n'));
    const completions = forwarded.slice(first).filter(item => item.model);
    assert.equal(completions.length, 1);
    assert.equal(completions[0].key, 'Bearer fixture-key');
    if (provider === '9router') assert.equal(completions[0].saver, 'off');
  });
  assert.ok(forwarded.every(item => item.key === 'Bearer fixture-key'));
});
