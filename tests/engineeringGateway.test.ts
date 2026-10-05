import assert from "node:assert/strict";
import { test } from "node:test";
import { engineeringProviders, sendEngineeringStep } from "../src/utils/engineeringGateway.ts";
import { loadGatewayConfig, type GatewayConfig } from "../src/utils/gateways.ts";

const config: GatewayConfig = {
  omniRouteUrl: "http://localhost:20128/v1", omniRouteKey: "", omniRouteModel: "current-coding-model",
  kiloKey: "", kiloModel: "kilo-auto/free", customProviders: [
    { id: "coding-provider", name: "My coding API", baseUrl: "https://api.example.com/v1", apiKey: "private-key", model: "my-new-model", stream: false },
  ],
};

function replaceGlobal(key: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, value });
  return () => { if (previous) Object.defineProperty(globalThis, key, previous); else Reflect.deleteProperty(globalThis, key); };
}

test("coding provider options use configured model IDs and expose no credentials", () => {
  const options = engineeringProviders(config);
  assert.deepEqual(options.map((item) => item.id), ["kilo", "omniroute", "custom:coding-provider"]);
  assert.equal(options[2].model, "my-new-model");
  assert.ok(!JSON.stringify(options).includes("private-key"));
  assert.equal(engineeringProviders({ ...config, omniRouteModel: "", customProviders: [] }).length, 1);
});

test("published coding workspace offers configured browser APIs and omits the local-only Kilo route", () => {
  const restore = replaceGlobal("window", { location: { hostname: "ahpah-dev.github.io", protocol: "https:" } });
  try { assert.deepEqual(engineeringProviders(config).map((item) => item.id), ["omniroute", "custom:coding-provider"]); }
  finally { restore(); }
});

test("coding requests preserve structured tool context, cancellation, selected provider and actual model identity", async () => {
  const restore = replaceGlobal("localStorage", { getItem: (key: string) => key === "ahpah_gateway_config" ? JSON.stringify(config) : null });
  const restoreFetch = replaceGlobal("fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/api/gateway/custom/chat/completions");
    assert.ok(init.signal);
    const body = JSON.parse(init.body as string);
    assert.equal(body.model, "my-new-model");
    assert.equal(body.max_tokens, 8192);
    assert.deepEqual(body.messages, [{ role: "system", content: "Use project tools." }, { role: "user", content: "Read index.html" }]);
    return new Response(JSON.stringify({ model: "resolved-coding-model", choices: [{ message: { content: '{"tool":"read_file","path":"index.html"}' } }], usage: { total_tokens: 34 } }), { headers: { "content-type": "application/json" } });
  });
  try {
    const result = await sendEngineeringStep({ providerId: "custom:coding-provider", prompt: "Read index.html", messages: [{ role: "system", content: "Use project tools." }], signal: new AbortController().signal });
    assert.equal(result.model, "resolved-coding-model");
    assert.equal(result.tokens, 34);
    assert.ok(result.text.includes("read_file"));
    await assert.rejects(sendEngineeringStep({ providerId: "missing", prompt: "Build", messages: [], signal: new AbortController().signal }), /configured coding provider/);
  } finally { restoreFetch(); restore(); }
});

test("unavailable browser storage keeps provider setup accessible with safe defaults", () => {
  const restore = replaceGlobal("localStorage", { getItem: () => { throw new Error("Storage blocked"); } });
  try {
    const defaults = loadGatewayConfig();
    assert.equal(defaults.kiloModel, "kilo-auto/free");
    assert.equal(defaults.omniRouteKey, "");
  } finally { restore(); }
});
