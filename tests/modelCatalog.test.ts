import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sortModelCatalog,
  currentModelRecommendations,
  catalogModelLabel,
  isModelAvailable,
  isFreeModel,
  isPaidModel,
} from "../src/utils/modelCatalog.ts";
import {
  autoConfigureGateways,
  freeModelCandidates,
} from "../src/utils/autoConfiguration.ts";
import { listKiloModels } from "../src/utils/gateways.ts";

const models = [
  {
    id: "openai/gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    created: 1773748178,
    pricing: { prompt: 1, completion: 1 },
  },
  {
    id: "z-ai/glm-5.3",
    name: "GLM-5.3",
    created: 1787086655,
    pricing: { prompt: 1, completion: 1 },
  },
  {
    id: "openai/gpt-6-luna",
    name: "GPT-6 Luna",
    created: 1790100786,
    pricing: { prompt: 1, completion: 1 },
  },
  { id: "openai/gpt-6.1-sol", name: "GPT-6.1 Sol", created: 1790600786 },
  { id: "kilo-auto/free", isFree: true },
];

test("catalogs order releases newest first instead of trusting provider order", () => {
  assert.deepEqual(
    sortModelCatalog(models).map((model) => model.id),
    [
      "openai/gpt-6.1-sol",
      "openai/gpt-6-luna",
      "z-ai/glm-5.3",
      "openai/gpt-5.4-mini",
      "kilo-auto/free",
    ],
  );
});
test("current recommendations feature real Luna and GLM catalog IDs", () => {
  assert.deepEqual(
    currentModelRecommendations(models)
      .slice(0, 3)
      .map((model) => model.id),
    ["openai/gpt-6-luna", "z-ai/glm-5.3", "openai/gpt-6.1-sol"],
  );
  assert.deepEqual(
    currentModelRecommendations([{ id: "other/current", created: 123 }]),
    [{ id: "other/current", created: 123 }],
  );
  assert.deepEqual(currentModelRecommendations([]), []);
  assert.equal(
    currentModelRecommendations([
      ...models,
      { id: "openai/gpt-7-luna", created: 2000000000 },
    ])[0].id,
    "openai/gpt-7-luna",
  );
});
test("text picker removes duplicates and models that only generate images", () => {
  assert.deepEqual(
    sortModelCatalog([
      { id: "image-model", architecture: { output_modalities: ["image"] } },
      { id: "text-model" },
      { id: "text-model" },
    ]),
    [{ id: "text-model" }],
  );
});
test('recommendations use the newest advertised family version when dates are absent', () => {
  assert.deepEqual(currentModelRecommendations([
    { id: 'route/glm-5.1' }, { id: 'route/glm-5.3' }, { id: 'route/glm-5.10' },
    { id: 'route/gpt-5-luna' }, { id: 'route/gpt-6-luna' },
  ]).map(model => model.id), ['route/gpt-6-luna', 'route/glm-5.10']);
});
test("retired and malformed-expiration models cannot be selected or recommended", () => {
  const today = new Date("2026-10-05T14:00:00Z");
  const catalog = [
    { id: "openai/gpt-9-luna", created: 999, expiration_date: "2026-10-05" },
    { id: "z-ai/glm-9", created: 998, expiration_date: "2026-10-04" },
    { id: "invalid/date", created: 997, expiration_date: "2026-02-30" },
    { id: "invalid/month", created: 996, expiration_date: "2026-99-99" },
    { id: "invalid/format", created: 995, expiration_date: "later" },
    { id: "valid/next", created: 10, expiration_date: "2026-10-06" },
    { id: "valid/current", created: 9, expiration_date: null },
  ];
  assert.deepEqual(sortModelCatalog(catalog, today).map((model) => model.id), ["valid/next", "valid/current"]);
  assert.deepEqual(currentModelRecommendations(catalog, today).map((model) => model.id), ["valid/next", "valid/current"]);
  assert.equal(isModelAvailable({ id: "no-expiration" }, today), true);
  assert.equal(isModelAvailable({ id: "empty-expiration", expiration_date: "" }, today), true);
});
test("duplicate catalog routes keep the most recent valid metadata", () => {
  assert.deepEqual(sortModelCatalog([
    { id: "route", created: 1, name: "Old metadata" },
    { id: "route", created: 10, name: "Current metadata" },
  ]), [{ id: "route", created: 10, name: "Current metadata" }]);
});
test("free labels never override paid or invalid price metadata", () => {
  for (const model of [
    { id: "paid/free", isFree: false },
    { id: "paid/free", isFree: true, pricing: { prompt: "1", completion: "0" } },
    { id: "paid/free", isFree: true, pricing: { prompt: "0", completion: "0", request: "0.01" } },
  ]) {
    assert.equal(isFreeModel(model), false);
    assert.equal(isPaidModel(model), true);
    assert.match(catalogModelLabel(model), /Paid/);
  }
  for (const pricing of [
    { prompt: "", completion: "0" },
    { prompt: "not-a-number", completion: "0" },
    { prompt: -1, completion: 0 },
  ]) {
    assert.equal(isFreeModel({ id: "invalid/free", isFree: true, pricing }), false);
  }
  assert.equal(isFreeModel({ id: "zero", pricing: { prompt: "0", completion: 0 } }), true);
  assert.equal(isFreeModel({ id: "explicit-free", isFree: true }), true);
  assert.equal(isFreeModel({ id: "auto/best-free" }), true);
});
test("free setup upgrades old selections and excludes virtual routers", () => {
  assert.deepEqual(
    freeModelCandidates(
      [
        { id: "old/free", created: 1 },
        { id: "current/free", created: 10 },
        { id: "auto/best-free" },
      ],
      "old/free",
    ).map((model) => model.id),
    ["current/free", "old/free"],
  );
  assert.match(catalogModelLabel(models[1]), /Paid/);
  assert.match(catalogModelLabel(models[4]), /Free/);
  assert.equal(freeModelCandidates(models).length, 0);
});
test("model catalogs bypass browser cache and expose current live releases", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      assert.equal(init.cache, "no-store");
      return new Response(JSON.stringify({ data: models }));
    },
  );
  assert.equal((await listKiloModels())[0].id, "openai/gpt-6.1-sol");
});
test("auto configuration preserves an explicit paid selection without charging or downgrading", async (t) => {
  let probes = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (!url.includes("/models")) {
      probes++;
      throw new Error("Paid probe should not run");
    }
    return new Response(JSON.stringify({ data: models }));
  });
  const config = {
    omniRouteUrl: "http://localhost:20128/v1",
    omniRouteModel: "z-ai/glm-5.3",
    omniRouteKey: "",
    kiloModel: "openai/gpt-6-luna",
    kiloKey: "",
  };
  const result = await autoConfigureGateways(
    config,
    new AbortController().signal,
    () => {},
  );
  assert.equal(probes, 0);
  assert.deepEqual(result.config, config);
  assert.ok(result.providers.every((provider) => !provider.verified));
});
