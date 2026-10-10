import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNineRouterConnection, listNineRouterModels, listOmniRouteModels, listKiloModels, listCustomModels, sendGatewayPrompt, type GatewayConfig } from '../src/utils/gateways.ts';
import { normalizeApiKey, redactProviderError } from '../src/utils/providerConfig.ts';
import { parseAgentActions } from '../src/utils/agentRuntime.ts';
import { GatewayServiceError } from '../src/utils/gatewayErrors.ts';
import { getCodexStatus } from '../src/utils/codexConnection.ts';

const config: GatewayConfig = { omniRouteUrl: 'http://localhost:20128/v1', omniRouteKey: '', omniRouteModel: 'selected/model', kiloKey: '', kiloModel: 'kilo-auto/free', nineRouterUrl: 'http://localhost:20129/v1', nineRouterKey: 'fixture-key', nineRouterModel: 'My coding combo' };
const profile = { id: 'fixture', name: 'Compatible', baseUrl: 'https://fixture.example/v1', apiKey: '', model: 'selected/model', stream: false };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const finish = { function: { name: 'finish', arguments: JSON.stringify({ summary: 'Done', review: 'No changes.' }) } };

test('all compatible provider catalogs use one normalized Bearer token', async t => {
  const key = ' "Bearer \'fixture-key\'" ';
  assert.equal(normalizeApiKey(key), 'fixture-key');
  assert.throws(() => normalizeApiKey('fixture key'), /spaces/);
  assert.equal(redactProviderError('Rejected fixture-key', [key]), 'Rejected [redacted]');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    calls++; assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer fixture-key');
    return json({ data: [{ id: 'selected/model' }] });
  });
  await listOmniRouteModels({ ...config, omniRouteKey: key });
  await listKiloModels(undefined, { ...config, kiloKey: key });
  await listNineRouterModels({ ...config, nineRouterKey: key });
  await listCustomModels({ ...profile, apiKey: key }, config);
  assert.equal(calls, 4);
});

test('catalog cache is scoped to the actual gateway and credentials, manual refresh bypasses it', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => json({ data: [{ id: `route-${++calls}` }] }));
  assert.equal((await listOmniRouteModels(config))[0].id, 'route-1');
  assert.equal((await listOmniRouteModels(config))[0].id, 'route-1');
  assert.equal((await listOmniRouteModels({ ...config, omniRouteUrl: 'http://localhost:20130/v1' }))[0].id, 'route-2');
  assert.equal((await listOmniRouteModels({ ...config, omniRouteKey: 'different-key' }))[0].id, 'route-3');
  assert.equal((await listOmniRouteModels(config, undefined, true))[0].id, 'route-4');
  await listKiloModels(undefined, config);
  await listKiloModels(undefined, config);
  await listKiloModels(undefined, { ...config, kiloKey: 'account-key' });
  await listKiloModels(undefined, config, true);
  assert.equal(calls, 7);
  await assert.rejects(listOmniRouteModels(config, AbortSignal.abort()), { name: 'AbortError' });
  assert.equal(calls, 7);
});

test('9router no-generation auth check distinguishes accepted, unsupported and rejected', async t => {
  for (const [status, message, expected] of [[400, 'Missing model', 'accepted'], [400, 'model is required', 'unverified'], [422, 'Validation failed', 'unverified'], [405, 'Method not supported', 'unverified']] as const) {
    await t.test(message, async st => {
      st.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        assert.equal(body.model, undefined); assert.deepEqual(body.messages, []);
        return json({ error: { message } }, status);
      });
      assert.equal(await checkNineRouterConnection(config), expected);
    });
  }
  t.mock.method(globalThis, 'fetch', async () => json({ error: { message: 'Invalid API key' } }, 401));
  await assert.rejects(checkNineRouterConnection(config), /same 9router instance/);
});

test('9router preserves combo IDs and validated native coding tools in both transport modes', async t => {
  for (const transport of ['bridge', 'direct'] as const) await t.test(transport, async st => {
    st.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
      assert.equal(url, transport === 'bridge' ? '/api/gateway/9router/chat/completions' : 'http://localhost:20129/v1/chat/completions');
      assert.equal(new Headers(init.headers).get('X-9Router-Token-Saver'), 'off');
      const body = JSON.parse(init.body as string);
      assert.equal(body.model, config.nineRouterModel); assert.equal(body.tool_choice, 'auto');
      return json({ model: 'upstream/model', choices: [{ message: { tool_calls: [finish] }, finish_reason: 'tool_calls' }] });
    });
    const result = await sendGatewayPrompt('9router', 'Work', { ...config, transport }, { validateResponse: parseAgentActions });
    assert.equal(parseAgentActions(result.text)[0].tool, 'finish');
    assert.equal(result.model, 'upstream/model');
  });
});

test('custom text APIs accept validated native replies without requiring advertised tools', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    assert.equal(JSON.parse(init.body as string).tools, undefined);
    return json({ choices: [{ message: { tool_calls: [finish] }, finish_reason: 'tool_calls' }] });
  });
  const result = await sendGatewayPrompt('custom', 'Work', { ...config, customProviders: [profile] }, { providerId: profile.id, validateResponse: parseAgentActions });
  assert.equal(parseAgentActions(result.text)[0].tool, 'finish');
});

test('embedded authentication, balance, permission and rate errors do not rotate Kilo routes', async t => {
  for (const streamed of [false, true]) for (const [code, status] of [['invalid_api_key', 401], ['insufficient_quota', 402], ['permission_error', 403], ['rate_limit_exceeded', 429]] as const) await t.test(`${streamed}/${code}`, async st => {
    let calls = 0;
    st.mock.method(globalThis, 'fetch', async () => {
      calls++; const body = { error: { code, message: 'Provider rejected request' } };
      return streamed ? new Response(`data: ${JSON.stringify(body)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }) : json(body);
    });
    await assert.rejects(sendGatewayPrompt('kilo', 'Work', config), error => error instanceof GatewayServiceError && error.status === status);
    assert.equal(calls, 1);
  });
});

test('9router upstream credentials errors give actionable guidance without generation retries', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return json({ error: { message: 'No active credentials for provider: fixture.' } }, 404); });
  await assert.rejects(sendGatewayPrompt('9router', 'Work', config), /Connect or reauthenticate/);
  assert.equal(calls, 1);
});

test('text-only authentication and rate-limit stream errors also stop route rotation', async t => {
  for (const message of ['Invalid API key', 'Rate limit exceeded', 'Insufficient balance']) await t.test(message, async st => {
    let calls = 0;
    st.mock.method(globalThis, 'fetch', async () => {
      calls++; return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, error: message }] })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    await assert.rejects(sendGatewayPrompt('kilo', 'Work', config), error => error instanceof GatewayServiceError && [401, 402, 429].includes(error.status || 0));
    assert.equal(calls, 1);
  });
});

test('9router upstream 401 gets only one model-less diagnostic, never a generation retry', async t => {
  const models: unknown[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const model = JSON.parse(init.body as string).model; models.push(model);
    return json({ error: { message: model ? 'Upstream authentication failed' : 'Missing model' } }, model ? 401 : 400);
  });
  await assert.rejects(sendGatewayPrompt('9router', 'Work', config), /selected upstream provider/);
  assert.deepEqual(models, [config.nineRouterModel, undefined]);
});

test('Codex reports a missing local bridge instead of a JSON parser error', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    assert.equal(init.cache, 'no-store'); return new Response('<html>Static site</html>');
  });
  await assert.rejects(getCodexStatus(), /Launch Start AhPah.bat/);
});
