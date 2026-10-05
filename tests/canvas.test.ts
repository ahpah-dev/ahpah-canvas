import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arrangeCards,
  fitCamera,
  zoomCamera,
  clampScale,
} from "../src/utils/canvasGeometry.ts";
import {
  validateCards,
  validateWorkspace,
} from "../src/utils/workspaceValidation.ts";
import {
  sendGatewayPrompt,
  listOmniRouteModels,
  listKiloModels,
} from "../src/utils/gateways.ts";

const card = {
  id: "test",
  type: "agent",
  title: "Test agent",
  x: -200,
  y: -50,
  width: 500,
  height: 500,
  history: [],
  currentPrompt: "",
  tokensUsed: 0,
  cpuPercent: 0,
};
test("fit keeps all cards within the available viewport", () => {
  const cards = [card, { ...card, x: 650, y: 180, width: 700, height: 620 }];
  const camera = fitCamera(cards, 1280, 800);
  for (const item of cards) {
    assert.ok(item.x * camera.scale + camera.x >= 0);
    assert.ok((item.x + item.width) * camera.scale + camera.x <= 1280);
    assert.ok(item.y * camera.scale + camera.y >= 60);
    assert.ok((item.y + item.height) * camera.scale + camera.y <= 700);
  }
});
test("fit handles an empty workspace", () =>
  assert.deepEqual(fitCamera([], 800, 600), { x: 40, y: 80, scale: 1 }));
test("zoom keeps the world point under the cursor stationary", () => {
  const before = { x: 40, y: 80, scale: 0.7 };
  const after = zoomCamera(before, 1.3, 333, 444);
  assert.equal((333 - before.x) / before.scale, (333 - after.x) / after.scale);
  assert.ok(
    Math.abs((444 - before.y) / before.scale - (444 - after.y) / after.scale) <
      1e-9,
  );
});
test("zoom limits prevent zero or excessive scales", () => {
  assert.equal(clampScale(0), 0.15);
  assert.equal(clampScale(100), 2);
});
test("arrangement uses the largest dimensions without overlaps", () => {
  const arranged = arrangeCards(
    [card, { ...card, width: 900, height: 750 }, { ...card }],
    2,
  );
  assert.ok(arranged[1].x >= arranged[0].x + arranged[0].width);
  assert.ok(arranged[2].y >= arranged[1].y + arranged[1].height);
});
test("workspace validation accepts a clean exported workspace", () =>
  assert.deepEqual(
    validateWorkspace({ cards: [card], connections: [], memory: [] }).cards,
    [card],
  ));
test("workspace validation rejects duplicate IDs", () =>
  assert.throws(() => validateCards([card, card]), /duplicate/));
test("workspace validation rejects non-finite positions", () =>
  assert.throws(() => validateCards([{ ...card, x: Infinity }]), /invalid/));
test("workspace validation rejects malformed history", () =>
  assert.throws(
    () =>
      validateCards([
        { ...card, history: [{ id: "bad", text: 42, type: "output" }] },
      ]),
    /invalid/,
  ));
test("workspace validation rejects dangling connections", () =>
  assert.throws(
    () =>
      validateWorkspace({
        cards: [card],
        connections: [{ id: "bad", fromCardId: "test", toCardId: "missing" }],
        memory: [],
      }),
    /connection/,
  ));
test("workspace validation rejects invalid memory", () =>
  assert.throws(
    () => validateWorkspace({ cards: [card], memory: [{ key: "x" }] }),
    /memory/,
  ));

const config = {
  omniRouteUrl: "http://localhost:20128/v1/",
  omniRouteKey: "test-key",
  omniRouteModel: "test-model",
  kiloKey: "",
  kiloModel: "kilo-auto/free",
};
test("workspace validation rejects tool content that would crash rendering", () => {
  assert.throws(
    () => validateCards([{ ...card, type: "note", noteContent: 42 }]),
    /invalid/,
  );
  assert.throws(
    () =>
      validateCards([
        {
          ...card,
          history: [
            { id: "bad", text: "Hello", type: "output", timestamp: {} },
          ],
        },
      ]),
    /invalid/,
  );
});
test("gateway sends auth, prior conversation and current prompt; uses returned model and usage", async (t) => {
  let payload: any;
  let endpoint = "";
  let headers: any;
  t.mock.method(globalThis, "fetch", async (url: any, init: any) => {
    endpoint = String(url);
    payload = JSON.parse(init.body);
    headers = init.headers;
    return new Response(
      JSON.stringify({
        model: "resolved-model",
        choices: [{ message: { content: "Real shaped response" } }],
        usage: { total_tokens: 31 },
      }),
    );
  });
  const result = await sendGatewayPrompt("omniroute", "Next step", config, {
    messages: [{ role: "assistant", content: "Prior response" }],
  });
  assert.equal(endpoint, "/api/gateway/omniroute/chat/completions");
  assert.equal(headers["X-OmniRoute-Url"], config.omniRouteUrl.replace(/\/+$/, ""));
  assert.equal(headers.Authorization, "Bearer test-key");
  assert.equal(payload.messages.length, 2);
  assert.equal(payload.messages[1].content, "Next step");
  assert.deepEqual(result, {
    text: "Real shaped response",
    model: "resolved-model",
    tokens: 31,
  });
});
test("Kilo uses its actual route and omits auth when key is absent", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: any, init: any) => {
    assert.equal(url, "/api/gateway/kilo/chat/completions");
    assert.equal(init.headers.Authorization, undefined);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "Hello" } }] }),
    );
  });
  assert.equal(
    (await sendGatewayPrompt("kilo", "Hello", config)).model,
    "kilo-auto/free",
  );
});
test("gateway errors preserve the service error message", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({ error: { message: "Rate limit reached" } }),
        { status: 429 },
      ),
  );
  await assert.rejects(
    sendGatewayPrompt("kilo", "Hello", config),
    /Rate limit reached/,
  );
});
test("empty gateway responses are rejected", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify({ choices: [] })),
  );
  await assert.rejects(
    sendGatewayPrompt("kilo", "Hello", config),
    /empty response/,
  );
});
test("missing OmniRoute model fails before fetching", async () =>
  await assert.rejects(
    sendGatewayPrompt("omniroute", "Hello", { ...config, omniRouteModel: "" }),
    /Choose a model/,
  ));
test("request cancellation is passed through to fetch", async (t) => {
  const controller = new AbortController();
  controller.abort();
  t.mock.method(globalThis, "fetch", async (_url: any, init: any) => {
    assert.ok(init.signal.aborted);
    throw new DOMException("Stopped", "AbortError");
  });
  await assert.rejects(
    sendGatewayPrompt("kilo", "Hello", config, { signal: controller.signal }),
    { name: "AbortError" },
  );
});
test("model catalogs use the provider endpoint and filter invalid entries", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: any) => {
    assert.ok(
      String(url).endsWith("/models?prefix=alias") ||
        String(url).endsWith("/models"),
    );
    return new Response(
      JSON.stringify({ data: [{ id: "current-model" }, { name: "invalid" }] }),
    );
  });
  assert.deepEqual(await listOmniRouteModels(config), [
    { id: "current-model" },
  ]);
  assert.deepEqual(await listKiloModels(), [{ id: "current-model" }]);
});
