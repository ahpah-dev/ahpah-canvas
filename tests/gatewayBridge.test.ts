import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { gatewayMiddleware } from "../server/gatewayBridge.ts";

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

test("local gateway bridge forwards models, credentials and conversation; preserves service errors", async (t) => {
  const received: { url?: string; authorization?: string; body?: unknown }[] =
    [];
  const upstream = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received.push({
      url: request.url,
      authorization: request.headers.authorization,
      body: body ? JSON.parse(body) : undefined,
    });
    response.setHeader("Content-Type", "application/json");
    if (request.url?.includes("/models"))
      response.end(JSON.stringify({ data: [{ id: "current-model" }] }));
    else {
      response.statusCode = 429;
      response.end(
        JSON.stringify({ error: { message: "Service rate limit" } }),
      );
    }
  });
  const bridge = createServer((request, response) => {
    void gatewayMiddleware(request, response, () => {
      response.statusCode = 404;
      response.end();
    });
  });
  t.after(() => {
    upstream.closeAllConnections();
    bridge.closeAllConnections();
    upstream.close();
    bridge.close();
  });
  const target = await listen(upstream);
  const origin = await listen(bridge);
  const headers = {
    Origin: origin,
    "X-OmniRoute-Url": `${target}/v1`,
    Authorization: "Bearer fixture-key",
  };
  const catalog = await fetch(
    `${origin}/api/gateway/omniroute/models?prefix=alias`,
    { headers },
  );
  assert.equal(catalog.status, 200);
  assert.deepEqual(await catalog.json(), { data: [{ id: "current-model" }] });
  assert.equal(received[0].url, "/v1/models?prefix=alias");
  assert.equal(received[0].authorization, "Bearer fixture-key");
  const payload = {
    model: "current-model",
    messages: [{ role: "user", content: "Hello" }],
  };
  const completion = await fetch(
    `${origin}/api/gateway/omniroute/chat/completions`,
    { method: "POST", headers, body: JSON.stringify(payload) },
  );
  assert.equal(completion.status, 429);
  assert.equal((await completion.json()).error.message, "Service rate limit");
  assert.deepEqual(received[1].body, payload);

  const invalidOrigin = await fetch(`${origin}/api/gateway/omniroute/models`, {
    headers: { ...headers, Origin: "http://another-site.example" },
  });
  assert.equal(invalidOrigin.status, 403);
  const malformedOrigin = await fetch(
    `${origin}/api/gateway/omniroute/models`,
    { headers: { ...headers, Origin: "not-a-url" } },
  );
  assert.equal(malformedOrigin.status, 403);
  const wrongMethod = await fetch(`${origin}/api/gateway/kilo/models`, {
    method: "POST",
  });
  assert.equal(wrongMethod.status, 405);
  const invalidBody = await fetch(
    `${origin}/api/gateway/omniroute/chat/completions`,
    { method: "POST", headers, body: "not-json" },
  );
  assert.equal(invalidBody.status, 400);
  const invalidUrl = await fetch(`${origin}/api/gateway/omniroute/models`, {
    headers: { "X-OmniRoute-Url": "file:///private" },
  });
  assert.equal(invalidUrl.status, 400);
  const unknownRoute = await fetch(`${origin}/api/gateway/unknown/models`);
  assert.equal(unknownRoute.status, 404);
  assert.equal(
    received.length,
    2,
    "Rejected requests never contact the upstream gateway",
  );
});

test("custom bridge uses its configured API prefix and rejects credential-bearing URLs", async (t) => {
  const received: { url?: string; authorization?: string }[] = [];
  const upstream = createServer((request, response) => {
    received.push({ url: request.url, authorization: request.headers.authorization });
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ data: [{ id: "current-custom-model" }] }));
  });
  const bridge = createServer((request, response) => { void gatewayMiddleware(request, response, () => response.end()); });
  t.after(() => { upstream.closeAllConnections(); bridge.closeAllConnections(); upstream.close(); bridge.close(); });
  const target = await listen(upstream);
  const origin = await listen(bridge);
  const catalog = await fetch(`${origin}/api/gateway/custom/models`, { headers: { Origin: origin, "X-Gateway-Url": `${target}/custom/v1/`, Authorization: "Bearer custom-fixture-key" } });
  assert.equal(catalog.status, 200);
  assert.deepEqual(await catalog.json(), { data: [{ id: "current-custom-model" }] });
  assert.deepEqual(received, [{ url: "/custom/v1/models", authorization: "Bearer custom-fixture-key" }]);
  for (const invalid of ["", "https://user:secret@example.com/v1", "https://example.com/v1?api_key=secret", "https://example.com/v1/models"])
    assert.equal((await fetch(`${origin}/api/gateway/custom/models`, { headers: { "X-Gateway-Url": invalid } })).status, 400);
  assert.equal(received.length, 1);
});

test("bridge forwards SSE immediately, before upstream completion", async (t) => {
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  const upstream = createServer(async (_request, response) => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write('data: {"choices":[{"delta":{"content":"First"}}]}\n\n');
    await waiting;
    response.end('data: {"choices":[{"delta":{"content":"Last"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  const bridge = createServer((request, response) => { void gatewayMiddleware(request, response, () => response.end()); });
  t.after(() => { finish(); upstream.closeAllConnections(); bridge.closeAllConnections(); upstream.close(); bridge.close(); });
  const target = await listen(upstream);
  const origin = await listen(bridge);
  const result = await fetch(`${origin}/api/gateway/omniroute/chat/completions`, {
    method: "POST", headers: { "X-OmniRoute-Url": target }, body: '{"model":"fixture","stream":true}',
  });
  assert.match(result.headers.get("content-type")!, /text\/event-stream/);
  const reader = result.body!.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /First/);
  finish();
  let rest = "";
  while (true) { const part = await reader.read(); if (part.done) break; rest += new TextDecoder().decode(part.value); }
  assert.match(rest, /Last/);
  assert.match(rest, /\[DONE\]/);
});

test("disconnecting the client cancels the upstream stream", async (t) => {
  let disconnected!: () => void;
  const closed = new Promise<void>((resolve) => { disconnected = resolve; });
  const upstream = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n');
    response.once("close", disconnected);
  });
  const bridge = createServer((request, response) => { void gatewayMiddleware(request, response, () => response.end()); });
  t.after(() => { upstream.closeAllConnections(); bridge.closeAllConnections(); upstream.close(); bridge.close(); });
  const target = await listen(upstream);
  const origin = await listen(bridge);
  const controller = new AbortController();
  const result = await fetch(`${origin}/api/gateway/omniroute/chat/completions`, {
    signal: controller.signal, method: "POST", headers: { "X-OmniRoute-Url": target }, body: '{"stream":true}',
  });
  await result.body!.getReader().read();
  controller.abort();
  await closed;
});
