import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readGatewayStream, type GatewayProgress } from "../src/utils/gatewayStream.ts";
import { sendGatewayPrompt, listKiloModels } from "../src/utils/gateways.ts";
import { COMPLETION_TIMEOUT_MS, CATALOG_TIMEOUT_MS } from "../src/utils/gatewayPolicy.ts";
import { clearKiloRouteHealth } from "../src/utils/kiloRecovery.ts";
beforeEach(clearKiloRouteHealth);

const encoder = new TextEncoder();
const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const chunk = (content: string, finish_reason: string | null = null) => ({
  model: "current-model", choices: [{ index: 0, delta: { content }, finish_reason }],
});
const response = (data: string) => new Response(data, { headers: { "Content-Type": "text/event-stream" } });
const config = { omniRouteUrl: "http://localhost:20128/v1", omniRouteKey: "", omniRouteModel: "model", kiloKey: "", kiloModel: "kilo-auto/free" };

test("streamed answer, routed model, final usage and DONE are assembled", async () => {
  const result = await readGatewayStream(response(
    event(chunk("Hello ")) + event(chunk("world", "stop")) +
    event({ choices: [], usage: { total_tokens: 42 } }) + "data: [DONE]\n\n",
  ), new AbortController().signal);
  assert.equal(result.choices[0].message.content, "Hello world");
  assert.equal(result.model, "current-model");
  assert.equal(result.usage?.total_tokens, 42);
});

test("partial answers appear before the stream ends", async () => {
  let source: ReadableStreamDefaultController<Uint8Array>;
  let first!: () => void;
  const partial = new Promise<void>((resolve) => { first = resolve; });
  const progress: GatewayProgress[] = [];
  const stream = new ReadableStream<Uint8Array>({ start(controller) { source = controller; } });
  const promise = readGatewayStream(new Response(stream), new AbortController().signal, (value) => {
    progress.push(value);
    if (value.text === "First") first();
  });
  source!.enqueue(encoder.encode(event(chunk("First"))));
  await partial;
  assert.equal(progress.at(-1)?.text, "First");
  source!.enqueue(encoder.encode(event(chunk(" then last", "stop")) + "data: [DONE]\n\n"));
  source!.close();
  assert.equal((await promise).choices[0].message.content, "First then last");
});

test("split UTF-8, CRLF and multiline data events are parsed correctly", async () => {
  const data = ': keepalive\r\ndata: {"choices":\r\ndata: [{"index":0,"delta":{"content":"Hello 🌙"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n';
  const bytes = encoder.encode(data);
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } });
  const result = await readGatewayStream(new Response(stream), new AbortController().signal);
  assert.equal(result.choices[0].message.content, "Hello 🌙");
});

test("reasoning updates progress without exposing reasoning text", async () => {
  const progress: GatewayProgress[] = [];
  await readGatewayStream(response(event({ choices: [{ index: 0, delta: { reasoning: "Private thoughts" } }] }) +
    event(chunk("Final answer", "stop")) + "data: [DONE]\n\n"), new AbortController().signal, (value) => progress.push(value));
  assert.equal(progress[0].phase, "reasoning");
  assert.equal(progress[0].text, "");
  assert.ok(progress.every((value) => !value.text.includes("Private thoughts")));
});

test("a provider error preserves partial text and is never retried", async (t) => {
  let calls = 0;
  let partial = "";
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return response(event(chunk("Partial answer")) + event({ error: { message: "Provider disconnected" } }));
  });
  await assert.rejects(sendGatewayPrompt("kilo", "Hello", config, { onProgress: (value) => { partial = value.text; } }), /Provider disconnected/);
  assert.equal(partial, "Partial answer");
  assert.equal(calls, 1);
});

test("unexpected EOF and malformed events are not accepted as complete answers", async () => {
  await assert.rejects(readGatewayStream(response(event(chunk("Partial"))), new AbortController().signal), /before the answer was complete/);
  await assert.rejects(readGatewayStream(response("data: broken\n\n"), new AbortController().signal), /invalid stream event/);
});

test("a finished stream without a final blank line or DONE is accepted", async () => {
  const result = await readGatewayStream(response(event(chunk("Complete", "stop")).trimEnd()), new AbortController().signal);
  assert.equal(result.choices[0].message.content, "Complete");
});

test("Stop cancels an idle reader and preserves AbortError", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const promise = readGatewayStream(new Response(stream), controller.signal);
  controller.abort();
  await assert.rejects(promise, { name: "AbortError" });
  assert.equal(cancelled, true);
});

test("deadline during body reading preserves TimeoutError and partial text", async () => {
  const controller = new AbortController();
  let source: ReadableStreamDefaultController<Uint8Array>;
  let partial = "";
  const stream = new ReadableStream<Uint8Array>({ start(value) { source = value; } });
  const promise = readGatewayStream(new Response(stream), controller.signal, (value) => {
    partial = value.text;
    if (value.text) controller.abort(new DOMException("Deadline", "TimeoutError"));
  });
  source!.enqueue(encoder.encode(event(chunk("Partial"))));
  await assert.rejects(promise, { name: "TimeoutError" });
  assert.equal(partial, "Partial");
});

test("Kilo requests streaming, preserves JSON compatibility, and has a three-minute deadline", async (t) => {
  const deadlines: number[] = [];
  t.mock.method(AbortSignal, "timeout", (ms: number) => { deadlines.push(ms); return new AbortController().signal; });
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const payload = JSON.parse(init.body as string);
    assert.equal(payload.stream, true);
    return new Response(JSON.stringify({ choices: [{ message: { content: "JSON adapter answer" } }] }));
  });
  assert.equal((await sendGatewayPrompt("kilo", "Hello", config)).text, "JSON adapter answer");
  assert.deepEqual(deadlines, [COMPLETION_TIMEOUT_MS]);
  assert.equal(COMPLETION_TIMEOUT_MS, 180_000);
});

test("catalog requests retain a short separate deadline", async (t) => {
  const deadlines: number[] = [];
  t.mock.method(AbortSignal, "timeout", (ms: number) => { deadlines.push(ms); return new AbortController().signal; });
  t.mock.method(globalThis, "fetch", async () => new Response('{"data":[]}'));
  await listKiloModels();
  assert.deepEqual(deadlines, [CATALOG_TIMEOUT_MS]);
  assert.equal(CATALOG_TIMEOUT_MS, 15_000);
});

test("reasoning-only streaming token exhaustion retains Auto Free recovery", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    if (String(url).endsWith("/models"))
      return new Response(JSON.stringify({ data: [{ id: "current/free", pricing: { prompt: "0", completion: "0" } }] }));
    calls++;
    return response(calls === 1
      ? event({ choices: [{ index: 0, delta: { reasoning: "Thinking" }, finish_reason: "length" }] }) + "data: [DONE]\n\n"
      : event(chunk("Recovered", "stop")) + "data: [DONE]\n\n");
  });
  assert.equal((await sendGatewayPrompt("kilo", "Hello", config)).text, "Recovered");
  assert.equal(calls, 2);
});
