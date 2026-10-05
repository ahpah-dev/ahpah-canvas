import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clearKiloRouteHealth, verifiedFreeFallbacks, fastReasoning, markKiloRouteUnhealthy } from "../src/utils/kiloRecovery.ts";
import { sendGatewayPrompt } from "../src/utils/gateways.ts";
import { GatewayServiceError } from "../src/utils/gatewayErrors.ts";
import { AUTO_FREE_FIRST_ANSWER_MS } from "../src/utils/gatewayPolicy.ts";
import { parseAgentActions, runEngineeringAgent } from '../src/utils/agentRuntime.ts';
import { createStarterProject } from '../src/utils/projectFiles.ts';
beforeEach(clearKiloRouteHealth);
const config = { omniRouteUrl: "http://localhost:20128/v1", omniRouteKey: "", omniRouteModel: "chosen", kiloKey: "", kiloModel: "kilo-auto/free" };
const free = (id: string, created = 1) => ({ id, created, isFree: true, pricing: { prompt: "0", completion: "0" } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const ready = (model = "current/free") => json({ model, choices: [{ message: { content: "READY" } }], usage: { total_tokens: 10 } });
const catalog = () => json({ data: [free("older/free", 1), free("current/free", 10), { id: "paid", created: 100, pricing: { prompt: "1", completion: "1" } }] });

test("fallback catalog requires explicit zero pricing, text output and a current release", () => {
  const models = [
    free("old", 1), free("new", 10), free("new", 10),
    { ...free("retired", 100), expiration_date: "2026-10-05" },
    { ...free("expired", 100), expiration_date: "2026-10-04" },
    { ...free("future", 2), expiration_date: "2026-10-06" },
    { ...free("malformed", 100), expiration_date: "not-a-date" },
    { ...free("invalid-calendar-date", 100), expiration_date: "2027-02-30" },
    { ...free("paid", 100), pricing: { prompt: "1", completion: "0" } },
    { ...free("request-cost", 100), pricing: { prompt: "0", completion: "0", request: "1" } },
    { ...free("false-free", 100), isFree: false },
    { ...free("blank", 100), pricing: { prompt: "", completion: "0" } },
    { id: "label/free", name: "Free" },
    { ...free("image", 100), architecture: { output_modalities: ["image"] } },
    free("kilo-auto/free", 100),
  ];
  assert.deepEqual(verifiedFreeFallbacks(models, new Set(["old"]), new Date("2026-10-05T10:00:00Z")).map((model) => model.id), ["new", "future"]);
});

test("failed routes are skipped until their cooldown expires", (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  markKiloRouteUnhealthy("current/free");
  assert.deepEqual(verifiedFreeFallbacks([free("current/free")]), []);
  now += 300_001;
  assert.equal(verifiedFreeFallbacks([free("current/free")]).length, 1);
});

test("fallback reasoning options come from advertised fast variants", () => {
  assert.deepEqual(fastReasoning({ id: "kilo-auto/free" }), { effort: "low" });
  assert.deepEqual(fastReasoning({ id: "ling", supported_parameters: ["reasoning"], opencode: { variants: { instant: { reasoning: { enabled: false, effort: "none" } } } } }), { enabled: false, effort: "none" });
  assert.equal(fastReasoning({ id: "unknown", opencode: { variants: { instant: { reasoning: { effort: "none" } } } } }), undefined);
  assert.equal(fastReasoning({ id: "unknown", supported_parameters: ["reasoning"], opencode: { variants: { low: { reasoning: { effort: "malicious" } } } } }), undefined);
  assert.deepEqual(fastReasoning({ id: "mixed", supported_parameters: ["reasoning"], opencode: { variants: { low: { reasoning: { effort: "malicious" } }, instant: { reasoning: { effort: "none", enabled: false } } } } }), { effort: "none", enabled: false });
  assert.deepEqual(fastReasoning({ id: "multiple", supported_parameters: ["reasoning"], opencode: { variants: { low: { reasoning: { effort: "low" } }, instant: { reasoning: { effort: "none" } } } } }), { effort: "none" });
});

test("a stalled Auto Free connection is aborted and replaced with the newest verified free route", async (t) => {
  const requests: any[] = [];
  const progress: string[] = [];
  let aborted = false;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    if (String(url).endsWith("/models")) return catalog();
    const payload = JSON.parse(init.body as string); requests.push(payload);
    if (payload.model === "kilo-auto/free")
      return new Promise<Response>((_resolve, reject) => init.signal!.addEventListener("abort", () => { aborted = true; reject(init.signal!.reason); }, { once: true }));
    return ready(payload.model);
  });
  const result = await sendGatewayPrompt("kilo", "Next", config, { firstAnswerTimeoutMs: 10, messages: [{ role: "assistant", content: "Previous" }], onProgress: (value) => { if (value.detail) progress.push(value.detail); } });
  assert.equal(aborted, true);
  assert.deepEqual(requests.map((value) => value.model), ["kilo-auto/free", "current/free"]);
  assert.deepEqual(requests[0].messages, requests[1].messages);
  assert.equal(result.model, "current/free");
  assert.ok(progress.some((detail) => detail.includes("Trying current/free")));
  assert.equal(config.kiloModel, "kilo-auto/free");
  assert.equal(AUTO_FREE_FIRST_ANSWER_MS, 30_000);
});

test("a reasoning-only stream is cancelled by the no-answer watchdog", async (t) => {
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    if (String(url).endsWith("/models")) return catalog();
    if (JSON.parse(init.body as string).model !== "kilo-auto/free") return ready();
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"model":"slow-underlying","choices":[{"index":0,"delta":{"reasoning":"Internal reasoning"}}]}\n\n'));
    }, cancel() { cancelled = true; } }), { headers: { "Content-Type": "text/event-stream" } });
  });
  assert.equal((await sendGatewayPrompt("kilo", "Hello", config, { firstAnswerTimeoutMs: 10 })).text, "READY");
  assert.equal(cancelled, true);
});

test("an answer that starts before the watchdog can continue beyond its first-answer window", async (t) => {
  let source: ReadableStreamDefaultController<Uint8Array>;
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream<Uint8Array>({ start(controller) {
    source = controller;
    controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"First"}}]}\n\n'));
  } }), { headers: { "Content-Type": "text/event-stream" } }));
  const result = sendGatewayPrompt("kilo", "Hello", config, { firstAnswerTimeoutMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  source!.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":" last"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
  source!.close();
  assert.equal((await result).text, "First last");
});

test("the next request bypasses a recently stalled Auto Free route", async (t) => {
  markKiloRouteUnhealthy("kilo-auto/free");
  const models: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    if (String(url).endsWith("/models")) return catalog();
    models.push(JSON.parse(init.body as string).model); return ready();
  });
  await sendGatewayPrompt("kilo", "Hello", config);
  assert.deepEqual(models, ["current/free"]);
});

test("all recently failed free routes fail fast instead of starting another stalled request", async (t) => {
  for (const id of ["kilo-auto/free", "current/free", "older/free"]) markKiloRouteUnhealthy(id);
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    if (String(url).endsWith("/models")) return catalog();
    attempts++; return ready();
  });
  await assert.rejects(sendGatewayPrompt("kilo", "Hello", config), /no other eligible free model/);
  assert.equal(attempts, 0);
});

test("a non-JSON temporary service error can still recover", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    if (String(url).endsWith("/models")) return catalog();
    attempts++;
    return attempts === 1 ? new Response("Service offline", { status: 503 }) : ready();
  });
  assert.equal((await sendGatewayPrompt("kilo", "Hello", config)).text, "READY");
  assert.equal(attempts, 2);
});

test("HTTP 503 recovers with a live free alternative, but auth and rate limits do not", async (t) => {
  for (const status of [503, 401, 402, 403, 429]) {
    await t.test(String(status), async (st) => {
      clearKiloRouteHealth();
      let attempts = 0;
      st.mock.method(globalThis, "fetch", async (url: unknown) => {
        if (String(url).endsWith("/models")) return catalog();
        attempts++; return attempts === 1 ? json({ error: { message: "Service error" } }, status) : ready();
      });
      if (status === 503) { assert.equal((await sendGatewayPrompt("kilo", "Hello", config)).text, "READY"); assert.equal(attempts, 2); }
      else { await assert.rejects(sendGatewayPrompt("kilo", "Hello", config), new RegExp(`HTTP ${status}`)); assert.equal(attempts, 1); }
    });
  }
});

test("a partial answer is preserved and never replaced on a provider failure", async (t) => {
  let calls = 0;
  let text = "";
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response('data: {"choices":[{"delta":{"content":"Partial answer"}}]}\n\ndata: {"error":{"message":"Provider disconnected","code":502}}\n\n', { headers: { "Content-Type": "text/event-stream" } });
  });
  await assert.rejects(sendGatewayPrompt("kilo", "Hello", config, { onProgress: (value) => { text = value.text; } }), /disconnected/);
  assert.equal(text, "Partial answer"); assert.equal(calls, 1);
});

test("Stop and the global deadline prevent fallback requests", async (t) => {
  for (const reason of [new DOMException("Stopped", "AbortError"), new DOMException("Deadline", "TimeoutError")]) {
    await t.test(reason.name, async (st) => {
      const controller = new AbortController(); let calls = 0;
      st.mock.method(globalThis, "fetch", async () => { calls++; controller.abort(reason); throw reason; });
      await assert.rejects(sendGatewayPrompt("kilo", "Hello", config, { signal: controller.signal }), { name: reason.name });
      assert.equal(calls, 1);
    });
  }
});

test("failure to load the fallback catalog preserves the original service error", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: unknown) => json({ error: { message: String(url).endsWith("/models") ? "Catalog offline" : "Provider offline" } }, 503));
  await assert.rejects(sendGatewayPrompt("kilo", "Hello", config), /Provider offline/);
});

test("manually selected models do not receive automatic reasoning overrides or failover", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    calls++; assert.equal(JSON.parse(init.body as string).reasoning, undefined);
    throw new GatewayServiceError("Unavailable", 503);
  });
  await assert.rejects(sendGatewayPrompt("kilo", "Hello", { ...config, kiloModel: "openai/gpt-6-luna" }), /Unavailable/);
  assert.equal(calls, 1);
});

test('Kilo coding runs pin a verified free route and recover a repeated inspection loop', async (t) => {
  const models: string[] = [];
  let saves = 0;
  const repeated = [{ tool: 'plan', steps: ['Inspect', 'Implement', 'Review'] }, { tool: 'read_file', path: 'app.js' }];
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    if (String(url).endsWith('/models')) return catalog();
    const payload = JSON.parse(init.body as string);
    models.push(payload.model);
    if (payload.model === 'older/free') {
      assert.match(payload.messages.at(-1).content, /Actual run state/);
      assert.match(payload.messages.at(-1).content, /previous route repeated/);
    }
    const actions = payload.model === 'older/free'
      ? [{ tool: 'write_file', path: 'app.js', content: 'const value = 2;' }, { tool: 'read_file', path: 'app.js' }, { tool: 'finish', summary: 'Updated value', review: 'Reviewed source. Tests not run.' }]
      : repeated;
    return json({ model: payload.model === 'kilo-auto/free' ? 'current/free' : payload.model, choices: [{ message: { content: JSON.stringify({ actions }) } }] });
  });
  const result = await runEngineeringAgent({
    project: { ...createStarterProject(), files: [{ path: 'app.js', content: 'const value = 1;' }] },
    goal: 'Change value to 2', providerId: 'kilo', signal: new AbortController().signal, mode: 'canvas',
    send: request => sendGatewayPrompt('kilo', request.prompt, config, request),
    syncFiles: async () => { saves++; return { saved: true, destination: 'folder/app.js' }; },
  });
  assert.equal(result.completed, true);
  assert.equal(result.error, undefined);
  assert.deepEqual(models, ['kilo-auto/free', 'current/free', 'current/free', 'older/free']);
  assert.equal(result.changeSet.changes[0].after, 'const value = 2;');
  assert.equal(saves, 1);
  assert.ok(result.activities.some(activity => activity.title === 'Recovering a repeating Kilo route'));
  assert.equal(config.kiloModel, 'kilo-auto/free');
});

test('malformed complete coding replies switch free routes with identical conversation context', async (t) => {
  const requests: { model: string; messages: unknown[] }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    if (String(url).endsWith('/models')) return catalog();
    const payload = JSON.parse(init.body as string); requests.push(payload);
    return json({ model: payload.model, choices: [{ message: { content: payload.model === 'kilo-auto/free' ? 'I have created your app.' : JSON.stringify({ actions: [{ tool: 'finish', summary: 'Ready', review: 'No files changed.' }] }) } }] });
  });
  const result = await sendGatewayPrompt('kilo', 'Next coding step', config, { messages: [{ role: 'system', content: 'Use documented coding actions.' }], validateResponse: parseAgentActions });
  assert.deepEqual(requests.map(item => item.model), ['kilo-auto/free', 'current/free']);
  assert.deepEqual(requests[0].messages, requests[1].messages);
  assert.equal(result.model, 'current/free');
});

test('manual Kilo coding routes are not silently replaced when they repeat', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    assert.equal(JSON.parse(init.body as string).model, 'chosen-model'); calls++;
    return json({ model: 'chosen-model', choices: [{ message: { content: JSON.stringify({ actions: [{ tool: 'list_files' }] }) } }] });
  });
  const result = await runEngineeringAgent({ project: createStarterProject(), goal: 'Inspect files', providerId: 'kilo', signal: new AbortController().signal, send: request => sendGatewayPrompt('kilo', request.prompt, { ...config, kiloModel: 'chosen-model' }, request) });
  assert.equal(calls, 3);
  assert.match(result.error!, /repeated actions/);
  assert.equal(result.activities.some(activity => activity.title === 'Recovering a repeating Kilo route'), false);
});
