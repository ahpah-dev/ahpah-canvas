import { test } from "node:test";
import assert from "node:assert/strict";
import { gatewayTransport, listCustomModels, listKiloModels, loadGatewayConfig, saveGatewayConfig, sendGatewayPrompt, type GatewayConfig } from "../src/utils/gateways.ts";
import { normalizeCustomProviders, normalizeProviderUrl } from "../src/utils/providerConfig.ts";

const profile = { id: "custom-1", name: "My API", baseUrl: "https://provider.example/v1/", apiKey: "fixture-private-key", model: "current-model", stream: false };
const config: GatewayConfig = { omniRouteUrl: "http://localhost:20128/v1", omniRouteKey: "", omniRouteModel: "", kiloKey: "", kiloModel: "kilo-auto/free", customProviders: [profile] };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("custom profiles validate URLs and prune malformed or duplicate saved providers", () => {
  assert.equal(normalizeProviderUrl(" https://api.example/v1/ "), "https://api.example/v1");
  for (const url of ["file:///secret", "https://user:pass@example.com/v1", "https://example.com/v1?key=secret", "https://example.com/v1#secret", "https://example.com/v1/chat/completions", "invalid"])
    assert.throws(() => normalizeProviderUrl(url));
  assert.deepEqual(normalizeCustomProviders([profile, { ...profile, name: "Duplicate" }, null, { id: "bad" }]), [{ ...profile, baseUrl: profile.baseUrl.trim() }]);
});

test("custom catalog uses its own credentials and live newest-first model IDs", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/api/gateway/custom/models");
    assert.equal((init.headers as Record<string, string>)["X-Gateway-Url"], "https://provider.example/v1");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer fixture-private-key");
    assert.equal(init.cache, "no-store");
    return response({ data: [{ id: "older", created: 1 }, { id: "latest", created: 100 }, { id: null }] });
  });
  assert.deepEqual((await listCustomModels(profile, config)).map((model) => model.id), ["latest", "older"]);
});

test("direct API mode avoids local routes and routing headers for catalogs and prompts", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests++;
    assert.ok(url.startsWith("https://provider.example/v1/") || url.startsWith("https://api.kilo.ai/api/gateway/"));
    assert.equal((init.headers as Record<string, string>)?.["X-Gateway-Url"], undefined);
    assert.equal(init.redirect, "error");
    if (url.endsWith("/models")) return response({ data: [{ id: "live-model" }] });
    const body = JSON.parse(init.body as string);
    assert.equal(body.model, "current-model");
    assert.equal(body.stream, false);
    assert.deepEqual(body.messages, [{ role: "assistant", content: "Context" }, { role: "user", content: "Hello" }]);
    return response({ model: "resolved-model", choices: [{ message: { content: "A real API shaped answer" } }], usage: { total_tokens: 10 } });
  });
  const direct = { ...config, transport: "direct" as const };
  assert.equal(gatewayTransport(direct), "direct");
  await listCustomModels(profile, direct);
  await listKiloModels(undefined, direct);
  assert.deepEqual(await sendGatewayPrompt("custom", "Hello", direct, { providerId: profile.id, messages: [{ role: "assistant", content: "Context" }] }), { text: "A real API shaped answer", model: "resolved-model", tokens: 10 });
  assert.equal(requests, 3);
});

test("custom completions support streamed answers and report the actual returned model", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    assert.equal(JSON.parse(init.body as string).stream, true);
    return new Response('data: {"model":"latest-model","choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } });
  });
  const result = await sendGatewayPrompt("custom", "Hello", { ...config, customProviders: [{ ...profile, stream: true }] }, { providerId: profile.id });
  assert.equal(result.text, "Hello");
  assert.equal(result.model, "latest-model");
});

test("hosted HTTPS pages use direct APIs and reject HTTP providers before a request", async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hostname: "ahpah-dev.github.io", protocol: "https:" } } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, "window", descriptor) : Reflect.deleteProperty(globalThis, "window"));
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    requests++;
    assert.equal(url, "https://api.kilo.ai/api/gateway/models");
    return response({ data: [{ id: "current-model" }] });
  });
  assert.equal(gatewayTransport({ ...config, transport: "bridge" }), "direct");
  await assert.rejects(listCustomModels({ ...profile, baseUrl: "http://localhost:1234/v1" }, config), /HTTPS API URL/);
  assert.equal(requests, 0);
  await listKiloModels(undefined, config);
  assert.equal(requests, 1);
});

test("deleted custom profiles fail before requests and credential-bearing errors are redacted", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return response({ error: { message: `Invalid key ${profile.apiKey}` } }, 401); });
  await assert.rejects(sendGatewayPrompt("custom", "Hello", config, { providerId: "missing" }), /no longer configured/);
  assert.equal(requests, 0);
  await assert.rejects(listCustomModels(profile, config), /Invalid key \[redacted\]/);
  await assert.rejects(sendGatewayPrompt("custom", "Hello", config, { providerId: profile.id }), /Invalid key \[redacted\]/);
  assert.equal(requests, 2);
});

test("saved custom settings remain atomic and never retain unrecognized credential metadata", (t) => {
  const values = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, "localStorage", descriptor) : Reflect.deleteProperty(globalThis, "localStorage"));
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: () => true } });
  t.after(() => windowDescriptor ? Object.defineProperty(globalThis, "window", windowDescriptor) : Reflect.deleteProperty(globalThis, "window"));
  saveGatewayConfig({ ...config, transport: "direct", customProviders: [{ ...profile, extraSecret: "do not save" } as typeof profile] });
  assert.equal(values.size, 1);
  assert.equal(loadGatewayConfig().customProviders?.[0].baseUrl, "https://provider.example/v1");
  assert.equal(loadGatewayConfig().transport, "direct");
  assert.ok(!values.get("ahpah_gateway_config")?.includes("extraSecret"));
  const saved = values.get("ahpah_gateway_config");
  assert.throws(() => saveGatewayConfig({ ...config, customProviders: [{ ...profile, baseUrl: "invalid" }] }));
  assert.equal(values.get("ahpah_gateway_config"), saved);
});
