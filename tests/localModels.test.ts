import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverLocalModels, setupLocalModels, validLocalModelPullName } from '../src/utils/localModels.ts';

const status = { available: true, version: '0.35.1', models: [{ id: 'actual:local', name: 'actual:local', size: 1234567, isLocal: true, capabilities: ['completion', 'tools'] }] };
const stream = (text: string) => new Response(new ReadableStream({ start(controller) { for (const part of [text.slice(0, 17), text.slice(17, 30), text.slice(30)]) controller.enqueue(new TextEncoder().encode(part)); controller.close(); } }));

test('client discovers the live model list and retains verified local capabilities', async t => {
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    assert.equal(url, '/api/local-models/status'); assert.equal(init?.cache, 'no-store');
    return new Response(JSON.stringify(status));
  });
  assert.deepEqual(await discoverLocalModels(), status);
});

test('published pages and malformed discovery give a useful local app next step', async t => {
  let response = new Response('<html>static page</html>');
  t.mock.method(globalThis, 'fetch', async () => response);
  let result = await discoverLocalModels();
  assert.equal(result.available, false); assert.match(result.error!, /Start AhPah.bat/);
  response = new Response(JSON.stringify({ available: true, models: [{ id: 'bad', name: 'bad', size: -1 }] }));
  result = await discoverLocalModels(); assert.equal(result.available, false); assert.match(result.error!, /invalid model data/);
  response = new Response('{}', { status: 404 });
  result = await discoverLocalModels(); assert.match(result.error!, /Start AhPah.bat/);
});

test('client setup streams explicit selected model progress and requires a final confirmed result', async t => {
  const progress: number[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    assert.equal(url, '/api/local-models/setup'); assert.equal(init?.method, 'POST'); assert.deepEqual(JSON.parse(init!.body as string), { model: 'actual:local' });
    return stream(JSON.stringify({ phase: 'downloading', detail: 'Downloading model', total: 100, completed: 50, percent: 50 }) + '\n' + JSON.stringify({ result: status }) + '\n');
  });
  assert.deepEqual(await setupLocalModels({ model: 'actual:local' }, event => { if (event.percent !== undefined) progress.push(event.percent); }), status);
  assert.deepEqual(progress, [50]);
});

test('client never supplies a default model for installation', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    assert.equal(init?.body, '{}');
    return stream(JSON.stringify({ result: { available: true, models: [], error: 'Choose a downloaded local model.' } }));
  });
  assert.equal((await setupLocalModels()).models.length, 0);
});

test('client validates registry names and rejects cloud references before sending a request', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network request'); });
  for (const value of ['some', 'some:0.8b', 'a-model:tag_q4']) assert.equal(validLocalModelPullName(value), true);
  for (const value of ['some:cloud', 'some:8b-cloud', 'https://evil.example/model', 'user/model', '..\\model', 'some;command', 'some:tag:bad', 'some name', '']) {
    assert.equal(validLocalModelPullName(value), false);
    await assert.rejects(setupLocalModels({ model: value }), /local model name/);
  }
});

test('client surfaces setup errors and rejects partial or oversized progress', async t => {
  let body = '{"error":"Exact model not found"}\n';
  t.mock.method(globalThis, 'fetch', async () => new Response(body));
  await assert.rejects(setupLocalModels(), /Exact model not found/);
  body = '{"phase":"starting","detail":"Starting Ollama"}\n';
  await assert.rejects(setupLocalModels(), /before the connection was confirmed/);
  body = 'a'.repeat(1024 * 1024 + 1);
  await assert.rejects(setupLocalModels(), /oversized setup progress/);
  body = '{invalid}\n'; await assert.rejects(setupLocalModels(), /invalid setup progress/);
});

test('client cancellation immediately stops an idle setup stream', async t => {
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  const controller = new AbortController(); const operation = setupLocalModels({}, () => {}, controller.signal);
  await new Promise(resolve => setTimeout(resolve, 0)); controller.abort();
  await assert.rejects(operation, { name: 'AbortError' }); assert.equal(cancelled, true);
  await assert.rejects(discoverLocalModels(controller.signal), { name: 'AbortError' });
});

test('client cancellation stops a stalled discovery response body', async t => {
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  const controller = new AbortController(); const operation = discoverLocalModels(controller.signal);
  await new Promise(resolve => setTimeout(resolve, 0)); controller.abort();
  await assert.rejects(operation, { name: 'AbortError' }); assert.equal(cancelled, true);
});
