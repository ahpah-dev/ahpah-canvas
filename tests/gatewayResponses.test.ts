import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sendGatewayPrompt } from "../src/utils/gateways.ts";
import { clearKiloRouteHealth } from "../src/utils/kiloRecovery.ts";
beforeEach(clearKiloRouteHealth);
const catalog = () => json({ data: [{ id: "new/free", created: 10, pricing: { prompt: "0", completion: "0" } }, { id: "older/free", created: 5, pricing: { prompt: "0", completion: "0" } }] });

const config = {
  omniRouteUrl: "http://localhost:20128/v1",
  omniRouteKey: "",
  omniRouteModel: "selected-model",
  kiloKey: "",
  kiloModel: "kilo-auto/free",
};
const json = (body: unknown) => new Response(JSON.stringify(body));
const completion = (content: unknown, finish_reason = "stop") => ({
  model: "current-free-model",
  choices: [{ message: { content }, finish_reason }],
  usage: { total_tokens: 100 },
});

test("Kilo's default leaves room for reasoning and final output", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    assert.equal(JSON.parse(init.body as string).max_tokens, 8192);
    return json(completion("An answer"));
  });
  assert.equal((await sendGatewayPrompt("kilo", "Hello", config)).text, "An answer");
});

test("Auto Free recovers from reasoning exhaustion using a current verified free model and the same context", async (t) => {
  const requests: { model: string; max_tokens: number; messages: unknown[] }[] = [];
  const signals: AbortSignal[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    if (String(url).endsWith("/models")) return catalog();
    requests.push(JSON.parse(init.body as string));
    signals.push(init.signal!);
    if (requests.length === 1)
      return json({
        ...completion(null, "length"),
        choices: [{ message: { content: null, reasoning: "Internal reasoning" }, finish_reason: "length" }],
      });
    return json(completion("Recovered answer"));
  });
  const result = await sendGatewayPrompt("kilo", "Next step", config, {
    messages: [{ role: "assistant", content: "Previous answer" }],
  });
  assert.deepEqual(result, { text: "Recovered answer", model: "current-free-model", tokens: 200 });
  assert.deepEqual(requests.map((request) => request.max_tokens), [8192, 8192]);
  assert.deepEqual(requests.map((request) => request.model), ["kilo-auto/free", "new/free"]);
  assert.deepEqual(requests[0].messages, requests[1].messages);
  assert.ok(signals.every((signal) => !signal.aborted));
});

test("empty Auto Free responses try at most two distinct verified routes", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    if (String(url).endsWith("/models")) return catalog();
    calls++;
    return json(completion("", "length"));
  });
  await assert.rejects(sendGatewayPrompt("kilo", "Hello", config), /8,192 token limit/);
  assert.equal(calls, 2);
});

test("the per-run request budget persists across turns and is saved before provider calls", async (t) => {
  const providerModels: string[] = [];
  const checkpoints: number[] = [];
  const routing = {
    excludedModels: [],
    requestLimit: 2,
    requestsUsed: 1,
    beforeRequest: async (used: number) => { checkpoints.push(used); },
  };
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    if (String(url).endsWith("/models")) return catalog();
    providerModels.push(JSON.parse(init.body as string).model);
    return json(completion("Ready"));
  });
  await sendGatewayPrompt("kilo", "Continue", config, { routing });
  assert.equal(routing.requestsUsed, 2);
  await assert.rejects(sendGatewayPrompt("kilo", "One more step", config, { routing }), /2-request limit/);
  assert.equal(providerModels.length, 1);
  assert.deepEqual(checkpoints, [2]);
});

test("Auto Free probes preserve their token ceiling and cannot leak reasoning as an answer", async (t) => {
  const budgets: number[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    if (String(url).endsWith("/models")) return catalog();
    budgets.push(JSON.parse(init.body as string).max_tokens);
    return json({
      choices: [{ message: { content: null, reasoning_content: "Private thoughts" }, finish_reason: "length" }],
    });
  });
  await assert.rejects(sendGatewayPrompt("kilo", "READY", config, { maxTokens: 16 }), /16 token limit/);
  assert.deepEqual(budgets, [16, 16]);
});

test("paid and manually selected routes are not retried or replaced", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return json(completion(null, "length"));
  });
  await assert.rejects(sendGatewayPrompt("kilo", "Hello", { ...config, kiloModel: "openai/gpt-6-luna" }), /token limit/);
  await assert.rejects(sendGatewayPrompt("omniroute", "Hello", config), /token limit/);
  assert.equal(calls, 2);
});

test("Stop cancels between recovery attempts", async (t) => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    controller.abort();
    return json(completion(null, "length"));
  });
  await assert.rejects(sendGatewayPrompt("kilo", "Hello", config, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("text parts are combined without including reasoning or images", async (t) => {
  t.mock.method(globalThis, "fetch", async () => json(completion([
    { type: "reasoning", text: "Hidden" },
    { type: "text", text: "Hello " },
    { type: "image_url", image_url: { url: "example" } },
    { type: "text", text: "world" },
    null,
  ])));
  assert.equal((await sendGatewayPrompt("kilo", "Hello", config)).text, "Hello world");
});

test("provider errors in HTTP 200 responses are surfaced without retries", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return json({ error: { message: "Provider unavailable" } });
  });
  await assert.rejects(sendGatewayPrompt("kilo", "Hello", config), /Provider unavailable/);
  assert.equal(calls, 1);
});

test("malformed JSON is diagnosed instead of reported as an empty answer", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Server page</html>"));
  await assert.rejects(sendGatewayPrompt("kilo", "Hello", config), /invalid or missing JSON/);
});

test("invalid response bodies do not crash the parser", async (t) => {
  for (const value of [null, [], "wrong"])
    await t.test(JSON.stringify(value), async (st) => {
      st.mock.method(globalThis, "fetch", async () => json(value));
      await assert.rejects(sendGatewayPrompt("kilo", "Hello", config), /invalid response format/);
    });
});

test("filtering and tool-only responses have specific errors without retries", async (t) => {
  const cases = [
    { body: completion(null, "content_filter"), error: /blocked this response/ },
    { body: completion(null, "tool_calls"), error: /tool call without an answer/ },
    { body: completion(null, "error"), error: /failed to generate an answer/ },
  ];
  for (const { body, error } of cases)
    await t.test(String(error), async (st) => {
      let calls = 0;
      st.mock.method(globalThis, "fetch", async () => { calls++; return json(body); });
      await assert.rejects(sendGatewayPrompt("kilo", "Hello", config), error);
      assert.equal(calls, 1);
    });
});

test("an explicit refusal is displayed without retry", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return json({ choices: [{ message: { content: null, refusal: "I cannot help with that." } }] });
  });
  assert.equal((await sendGatewayPrompt("kilo", "Hello", config)).text, "I cannot help with that.");
  assert.equal(calls, 1);
});

test("invalid completion messages are not retried", async (t) => {
  for (const message of ["invalid", { content: 42 }])
    await t.test(JSON.stringify(message), async (st) => {
      let calls = 0;
      st.mock.method(globalThis, "fetch", async () => {
        calls++;
        return json({ choices: [{ message, finish_reason: "stop" }] });
      });
      await assert.rejects(sendGatewayPrompt("kilo", "Hello", config), /completion/);
      assert.equal(calls, 1);
    });
});

test("a body read abort is preserved", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    const response = new Response();
    response.json = async () => { throw new DOMException("Stopped", "AbortError"); };
    return response;
  });
  await assert.rejects(sendGatewayPrompt("kilo", "Hello", config), { name: "AbortError" });
});
