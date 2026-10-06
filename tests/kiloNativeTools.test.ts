import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { sendGatewayPrompt, listKiloModels } from '../src/utils/gateways.ts';
import { clearKiloRouteHealth } from '../src/utils/kiloRecovery.ts';
import { parseAgentActions, runEngineeringAgent } from '../src/utils/agentRuntime.ts';
import { createStarterProject } from '../src/utils/projectFiles.ts';
import { sendEngineeringStep } from '../src/utils/engineeringGateway.ts';

beforeEach(clearKiloRouteHealth);
const config = { omniRouteUrl: 'http://localhost:20128/v1', omniRouteKey: '', omniRouteModel: '', kiloKey: '', kiloModel: 'kilo-auto/free' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const free = { id: 'current/free', created: 10, pricing: { prompt: '0', completion: '0' } };
const finish = { tool: 'finish', summary: 'Ready', review: 'No changes. Tests not run.' };
const ready = (model = free.id) => json({ model, choices: [{ message: { content: JSON.stringify({ actions: [finish] }) }, finish_reason: 'stop' }] });
const nativeStream = (calls: { name: string; args: object }[], model = free.id, finishReason = 'tool_calls') => {
  const events = calls.flatMap((call, index) => {
    const args = JSON.stringify(call.args), split = Math.floor(args.length / 2);
    return [{ index, id: `call_${index}`, type: 'function', function: { name: call.name, arguments: args.slice(0, split) } }, { index, function: { arguments: args.slice(split) } }].map(tool => `data: ${JSON.stringify({ model, choices: [{ index: 0, delta: { tool_calls: [tool] } }] })}\n\n`);
  });
  return new Response(events.join('') + `data: ${JSON.stringify({ model, choices: [{ index: 0, delta: {}, finish_reason: finishReason }], usage: { total_tokens: 20 } })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
};

test('Kilo native streamed tools complete a real coding run with review and one actual folder delivery', async t => {
  const models: string[] = [], taskIds: string[] = [];
  let saved = 0;
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    if (String(url).endsWith('/models')) return json({ data: [free] });
    const payload = JSON.parse(init.body as string); models.push(payload.model);
    const taskId = (init.headers as Record<string, string>)['X-KiloCode-TaskId'];
    assert.ok(taskId); taskIds.push(taskId);
    assert.equal(payload.tool_choice, 'auto');
    assert.ok(payload.tools.some((item: { function: { name: string } }) => item.function.name === 'write'));
    if (models.length === 1) return nativeStream([{ name: 'plan', args: { steps: ['Read source', 'Implement', 'Review'] } }, { name: 'read', args: { path: 'app.js' } }]);
    assert.match(payload.messages.at(-1).content, /Real tool results/);
    assert.match(payload.messages.at(-1).content, /const value = 1/);
    return nativeStream([{ name: 'write', args: { path: 'app.js', content: 'const value = 2;' } }, { name: 'read', args: { path: 'app.js' } }, { name: 'finish', args: { summary: 'Updated value', review: 'Reviewed the actual source. Tests not run.' } }]);
  });
  const result = await runEngineeringAgent({ project: { ...createStarterProject(), files: [{ path: 'app.js', content: 'const value = 1;' }] }, goal: 'Change value to 2', providerId: 'kilo', signal: new AbortController().signal, mode: 'canvas', send: request => sendGatewayPrompt('kilo', request.prompt, config, request), syncFiles: async files => { saved++; assert.equal(files[0].content, 'const value = 2;'); return { saved: true, destination: 'folder/app.js' }; } });
  assert.equal(result.completed, true); assert.equal(result.error, undefined);
  assert.equal(saved, 1); assert.equal(result.changeSet.changes[0].after, 'const value = 2;');
  assert.deepEqual(models, ['kilo-auto/free', free.id]);
  assert.equal(new Set(taskIds).size, 1);
  assert.equal(config.kiloModel, 'kilo-auto/free');
});

test('Auto Free recovers missing completion choices, DONE-only streams, malformed tools and truncated structured text', async t => {
  const failures = [() => json({ choices: [] }), () => new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } }), () => nativeStream([{ name: 'unknown_tool', args: {} }]), () => json({ model: free.id, choices: [{ message: { content: '{"actions":[{"tool":"write_file"' }, finish_reason: 'length' }] })];
  for (const [index, failure] of failures.entries()) await t.test(String(index), async st => {
    clearKiloRouteHealth(); const models: string[] = [];
    st.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
      if (String(url).endsWith('/models')) return json({ data: [free, { ...free, id: 'alternative/free', created: 1 }] });
      models.push(JSON.parse(init.body as string).model);
      return models.length === 1 ? failure() : ready(models.at(-1));
    });
    const result = await sendGatewayPrompt('kilo', 'Continue', config, { validateResponse: parseAgentActions });
    assert.equal(parseAgentActions(result.text)[0].tool, 'finish');
    assert.deepEqual(models, ['kilo-auto/free', index < 2 ? free.id : 'alternative/free']);
  });
});

test('truncated native tool proposals never execute and can switch to a verified free route', async t => {
  const models: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    if (String(url).endsWith('/models')) return json({ data: [free, { ...free, id: 'alternative/free', created: 1 }] });
    models.push(JSON.parse(init.body as string).model);
    return models.length === 1 ? nativeStream([{ name: 'write', args: { path: 'app.js', content: 'truncated proposal' } }], free.id, 'length') : ready(models.at(-1));
  });
  const result = await sendGatewayPrompt('kilo', 'Continue', config, { validateResponse: parseAgentActions });
  assert.deepEqual(parseAgentActions(result.text), [finish]);
  assert.equal(result.tokens, 20);
  assert.deepEqual(models, ['kilo-auto/free', 'alternative/free']);
});

test('visible partial text is preserved without failover when later native tools are malformed or truncated', async t => {
  for (const finishReason of ['tool_calls', 'length']) await t.test(finishReason, async st => {
    clearKiloRouteHealth(); let calls = 0, partial = '';
    st.mock.method(globalThis, 'fetch', async () => {
      calls++;
      const text = `data: ${JSON.stringify({ model: free.id, choices: [{ index: 0, delta: { content: 'Keep this visible explanation.' } }] })}\n\n`;
      const tool = `data: ${JSON.stringify({ model: free.id, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: 'write', arguments: '{"path":"app.js","content":' } }] }, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`;
      return new Response(text + tool, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    await assert.rejects(sendGatewayPrompt('kilo', 'Continue', config, { validateResponse: parseAgentActions, onProgress: progress => { partial = progress.text; } }), /incomplete JSON|token limit/);
    assert.equal(partial, 'Keep this visible explanation.');
    assert.equal(calls, 1, 'no retry or catalog request can replace already visible text');
  });
});

test('explicit paid coding models keep their selection and reject unsafe or truncated native calls', async t => {
  for (const mode of ['unsafe', 'truncated']) await t.test(mode, async st => {
    const models: string[] = [];
    st.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
      if (String(url).endsWith('/models')) return json({ data: [{ id: 'selected/paid', pricing: { prompt: '1', completion: '1' } }, free] });
      models.push(JSON.parse(init.body as string).model);
      return nativeStream([{ name: 'write', args: { path: mode === 'unsafe' ? '../outside.js' : 'app.js', content: 'proposal' } }], 'selected/paid', mode === 'unsafe' ? 'tool_calls' : 'length');
    });
    await assert.rejects(sendGatewayPrompt('kilo', 'Implement', { ...config, kiloModel: 'selected/paid' }, { validateResponse: parseAgentActions }), /path|relative|traversal|token limit/i);
    assert.deepEqual(models, ['selected/paid']);
  });
});

test('auth and rate limits remain terminal, redact credentials and explain the next action', async t => {
  for (const status of [401, 402, 403, 429]) await t.test(String(status), async st => {
    let requests = 0;
    st.mock.method(globalThis, 'fetch', async () => { requests++; return json({ error: { message: 'Rejected fixture-secret', code: status } }, status); });
    await assert.rejects(sendGatewayPrompt('kilo', 'Hello', { ...config, kiloKey: 'fixture-secret' }), failure => failure instanceof Error && !failure.message.includes('fixture-secret') && /Settings|balance|permissions|Wait/.test(failure.message));
    assert.equal(requests, 1);
  });
});

test('Stop prevents catalog fetches before a request and aborts JSON completions before acceptance', async t => {
  const stopped = new AbortController(); stopped.abort();
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('Should not fetch'); });
  await assert.rejects(sendGatewayPrompt('kilo', 'Hello', { ...config, kiloModel: free.id }, { signal: stopped.signal, validateResponse: parseAgentActions }), { name: 'AbortError' });
  assert.equal(requests, 0);
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => {
    requests++; const response = ready();
    const readJson = response.json.bind(response);
    response.json = async () => { const body = await readJson(); controller.abort(); return body; };
    return response;
  });
  await assert.rejects(sendGatewayPrompt('kilo', 'Hello', config, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(requests, 1);
});

test('live Kilo catalog errors are explicit and text-only fallback routes omit unsupported native tools', async t => {
  t.mock.method(globalThis, 'fetch', async () => json({ dashboard: true }));
  await assert.rejects(listKiloModels(), /valid model catalog/);
  clearKiloRouteHealth(); let completions = 0;
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    if (String(url).endsWith('/models')) return json({ data: [{ ...free, supported_parameters: ['max_tokens'] }] });
    completions++; const payload = JSON.parse(init.body as string);
    if (completions === 1) return json({ choices: [] });
    assert.equal(payload.tools, undefined); assert.equal(payload.tool_choice, undefined);
    return ready();
  });
  assert.equal((await sendGatewayPrompt('kilo', 'Continue', config, { validateResponse: parseAgentActions })).model, free.id);
});

test('the Code sender propagates the stable Kilo task ID and credentials', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => key === 'ahpah_gateway_config' ? JSON.stringify({ ...config, kiloKey: 'fixture-key' }) : null } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    assert.equal((init.headers as Record<string, string>)['X-KiloCode-TaskId'], 'coding-run-123');
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer fixture-key');
    return ready();
  });
  await sendEngineeringStep({ providerId: 'kilo', runId: 'coding-run-123', prompt: 'Explain the project', messages: [], signal: new AbortController().signal });
});
