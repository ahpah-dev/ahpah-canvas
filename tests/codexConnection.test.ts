import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { createCodexMiddleware, type createCodexService } from "../server/codexBridge.ts";
import { sendCodexPrompt } from "../src/utils/codexConnection.ts";

async function fixture(t: { after: (fn: () => Promise<void>) => void }, binding = true) {
  let connections = 0;
  const service = {
    async status() { return { installed: true, connected: true, models: [{ id: "catalog-model", name: "Catalog model", isDefault: true }] }; },
    async connect() { connections++; return this.status(); },
    async cancelLogin() { return { cancelled: true }; },
    async complete(_body: unknown, _signal: AbortSignal, emit: (value: unknown) => void) { emit({ result: { text: "Working", model: "catalog-model", tokens: 12 } }); },
    close() {},
  } as ReturnType<typeof createCodexService>;
  const middleware = createCodexMiddleware(service, () => binding);
  const server: Server = createServer((request, response) => { void middleware(request, response, () => { response.statusCode = 404; response.end(); }); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing port");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(finish => server.close(() => finish())); });
  return { origin, connections: () => connections };
}

test("Codex only accepts same-origin local mutations", async t => {
  const { origin, connections } = await fixture(t);
  for (const headers of [{}, { Origin: "https://attacker.example" }, { Origin: origin, "Sec-Fetch-Site": "cross-site" }]) {
    assert.equal((await fetch(`${origin}/api/codex/connect`, { method: "POST", headers })).status, 403);
  }
  assert.equal(connections(), 0);
  assert.equal((await fetch(`${origin}/api/codex/connect`, { method: "POST", headers: { Origin: origin } })).status, 200);
  assert.equal(connections(), 1);
  const publicBinding = await fixture(t, false);
  assert.equal((await fetch(`${publicBinding.origin}/api/codex/status`)).status, 403);
});

test("Codex routes validate methods, bounded requests, and stream complete answers", async t => {
  const { origin } = await fixture(t);
  assert.equal((await fetch(`${origin}/api/codex/nope`)).status, 404);
  assert.equal((await fetch(`${origin}/api/codex/connect`)).status, 405);
  const post = (body: string) => fetch(`${origin}/api/codex/complete`, { method: "POST", headers: { Origin: origin }, body });
  assert.equal((await post("x".repeat(700001))).status, 413);
  assert.equal((await post("null")).status, 400);
  const invalid = await post("SECRET_invalid_json");
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "Invalid Codex request JSON." });
  const response = await post("{}");
  assert.match(response.headers.get("content-type") || "", /ndjson/);
  assert.deepEqual(JSON.parse((await response.text()).trim()).result, { text: "Working", model: "catalog-model", tokens: 12 });
});

test("Codex client reads split events, final results and provider failures", async t => {
  const oldFetch = globalThis.fetch;
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "catalog-model" } });
  t.after(() => { globalThis.fetch = oldFetch; if (oldStorage) Object.defineProperty(globalThis, "localStorage", oldStorage); else Reflect.deleteProperty(globalThis, "localStorage"); });
  const stream = (chunks: string[]) => new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }));
  globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(init?.body as string).model, "catalog-model");
    return stream(['{"phase":"wait', 'ing","text":""}\n{"result":{"text":"OK","model":"catalog-model","tokens":5}}']);
  };
  assert.deepEqual(await sendCodexPrompt("hello"), { text: "OK", model: "catalog-model", tokens: 5 });
  globalThis.fetch = async () => stream(['{"error":"Plan limit reached"}\n']);
  await assert.rejects(sendCodexPrompt("hello"), /Plan limit reached/);
  globalThis.fetch = async () => stream(['{"phase":"waiting"}\n']);
  await assert.rejects(sendCodexPrompt("hello"), /completed answer/);
});
