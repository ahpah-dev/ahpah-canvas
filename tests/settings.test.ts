import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clearKiloRouteHealth } from '../src/utils/kiloRecovery.ts';
beforeEach(clearKiloRouteHealth);
import {
  autoConfigureGateways,
  KILO_CODING_PROBE,
  discoveryCandidates,
  freeModelCandidates,
  type SetupProgress,
} from "../src/utils/autoConfiguration.ts";
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
} from "../src/utils/appearance.ts";
import {
  loadGatewayConfig,
  saveGatewayConfig,
  type GatewayConfig,
} from "../src/utils/gateways.ts";

const config: GatewayConfig = {
  omniRouteUrl: "http://localhost:20128/v1",
  omniRouteKey: "private-omni-key",
  omniRouteModel: "saved-model",
  kiloKey: "private-kilo-key",
  kiloModel: "kilo-auto/free",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const ready = () =>
  json({
    model: "resolved-current-model",
    choices: [{ message: { content: JSON.stringify({ actions: [{ tool: 'finish', summary: 'READY', review: 'No files changed. No commands run.' }] }) } }],
  });

test("discovery normalizes root URLs and tries only equivalent loopback addresses", () => {
  const candidates = discoveryCandidates({
    ...config,
    omniRouteUrl: "http://localhost:20128/?ignore=yes#fragment",
  });
  assert.deepEqual(
    candidates.map((candidate) => candidate.omniRouteUrl),
    [
      "http://localhost:20128/v1",
      "http://127.0.0.1:20128/v1",
    ],
  );
  assert.ok(
    candidates.every(
      (candidate) => candidate.omniRouteKey === config.omniRouteKey,
    ),
  );
  assert.deepEqual(
    discoveryCandidates({
      ...config,
      omniRouteUrl: "https://gateway.example/v1/",
    }).map((candidate) => candidate.omniRouteUrl),
    ["https://gateway.example/v1"],
  );
  assert.throws(
    () =>
      discoveryCandidates({
        ...config,
        omniRouteUrl: "https://user:password@example.com/v1",
      }),
    /credentials/,
  );
  assert.throws(
    () => discoveryCandidates({ ...config, omniRouteUrl: "file:///tmp" }),
    /HTTP/,
  );
});

test("auto setup considers only free text routes, deduplicates IDs and orders newest fallbacks", () => {
  assert.deepEqual(
    freeModelCandidates(
      [
        { id: "paid/free", pricing: { prompt: "0.2", completion: 0 } },
        { id: "image/free", architecture: { output_modalities: ["image"] } },
        { id: "audio/free", architecture: { modality: "text->audio" } },
        { id: "old/free", created: 1 },
        { id: "new/free", created: 10 },
        { id: "new/free", created: 10 },
        { id: "auto/best-free" },
        { id: "preferred/free" },
        { id: "zero-cost", pricing: { prompt: 0, completion: "0" } },
        { id: "no-price-proof" },
      ],
      "preferred/free",
    ).map((model) => model.id),
    ["new/free", "old/free", "preferred/free", "zero-cost"],
  );
  assert.equal(
    freeModelCandidates(
      Array.from({ length: 20 }, (_, i) => ({ id: `${i}/free` })),
    ).length,
    6,
  );
});

test("setup tries a fallback, verifies both providers, and leaves room for reasoning in isolated probes", async (t) => {
  const attempts: string[] = [];
  const progress: SetupProgress[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url.includes("/models"))
      return json({
        data: url.includes("/kilo/")
          ? [{ id: "kilo-auto/free" }]
          : [{ id: "first/free", created: 20 }, { id: "current/free", created: 10 }],
      });
    const payload = JSON.parse(init.body as string);
    attempts.push(payload.model);
    assert.equal(payload.max_tokens, 1024);
    assert.deepEqual(payload.messages, [
      { role: "user", content: KILO_CODING_PROBE },
    ]);
    return payload.model === "first/free"
      ? json({ error: { message: "Model unavailable" } }, 404)
      : ready();
  });
  const result = await autoConfigureGateways(
    config,
    new AbortController().signal,
    (entry) => progress.push(entry),
  );
  assert.ok(result.providers.every((provider) => provider.verified));
  assert.equal(result.config.omniRouteModel, "current/free");
  assert.equal(result.config.kiloModel, "kilo-auto/free");
  assert.ok(progress.some((entry) => entry.detail.includes("HTTP 404")));
  assert.ok(
    progress.some(
      (entry) =>
        entry.phase === "ready" &&
        entry.detail.includes("resolved-current-model"),
    ),
  );
  assert.ok(attempts.includes("current/free"));
});

test("partial setup preserves failed provider settings and never promotes a catalog to verified", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) =>
    url.includes("/models")
      ? json({
          data: url.includes("/kilo/")
            ? [{ id: "kilo-auto/free" }]
            : [{ id: "paid/model", pricing: { prompt: 1, completion: 1 } }],
        })
      : ready(),
  );
  const result = await autoConfigureGateways(
    config,
    new AbortController().signal,
    () => {},
  );
  assert.equal(result.providers[0].verified, false);
  assert.deepEqual(result.providers[0].config, {});
  assert.equal(result.config.omniRouteModel, config.omniRouteModel);
  assert.equal(result.providers[1].verified, true);
});

test('Kilo setup rejects a plain READY reply that cannot produce coding actions', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string) => url.includes('/models')
    ? json({ data: url.includes('/kilo/') ? [{ id: 'kilo-auto/free' }] : [] })
    : json({ model: 'broken/free', choices: [{ message: { content: 'READY' } }] }));
  const result = await autoConfigureGateways(config, new AbortController().signal, () => {});
  const kilo = result.providers.find(provider => provider.provider === 'kilo')!;
  assert.equal(kilo.verified, false);
  assert.deepEqual(kilo.config, {});
  assert.match(kilo.detail, /coding actions/);
  assert.equal(result.config.kiloModel, config.kiloModel);
});

test("OmniRoute provider rate limits do not stop independent provider probes", async (t) => {
  let omniProbes = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/models"))
      return json({
        data: url.includes("/kilo/")
          ? [{ id: "kilo-auto/free" }]
          : [{ id: "first/free" }, { id: "second/free" }],
      });
    if (url.includes("/omniroute/")) {
      omniProbes++;
      return json({ error: { message: "Slow down" } }, 429);
    }
    return ready();
  });
  const result = await autoConfigureGateways(
    config,
    new AbortController().signal,
    () => {},
  );
  assert.equal(omniProbes, 2);
  assert.match(result.providers[0].detail, /HTTP 429/);
});

test("diagnostics redact credentials returned in service errors", async (t) => {
  const progress: SetupProgress[] = [];
  t.mock.method(globalThis, "fetch", async () =>
    json(
      {
        error: {
          message: `Invalid key ${config.omniRouteKey} ${config.kiloKey}`,
        },
      },
      401,
    ),
  );
  const result = await autoConfigureGateways(
    config,
    new AbortController().signal,
    (entry) => progress.push(entry),
  );
  const diagnosticText = JSON.stringify([
    ...progress,
    ...result.providers.map((provider) => provider.detail),
  ]);
  assert.ok(!diagnosticText.includes(config.omniRouteKey));
  assert.ok(!diagnosticText.includes(config.kiloKey));
  assert.match(diagnosticText, /redacted/);
});

test("cancellation rejects setup and stops discovery without returning a saveable result", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => {
    controller.abort();
    throw new DOMException("Stopped", "AbortError");
  });
  await assert.rejects(
    autoConfigureGateways(config, controller.signal, () => {}),
    { name: "AbortError" },
  );
});

test("appearance normalization keeps valid choices and repairs malformed saved preferences", () => {
  assert.deepEqual(
    normalizeAppearance({
      surface: "daylight",
      accent: "#AB12ef",
      motion: "none",
      grid: "lines",
    }),
    { surface: "daylight", accent: "#AB12ef", motion: "none", grid: "lines" },
  );
  assert.deepEqual(
    normalizeAppearance({
      surface: "bad",
      accent: "url(evil)",
      motion: false,
      grid: "bad",
    }),
    DEFAULT_APPEARANCE,
  );
  assert.deepEqual(normalizeAppearance(null), DEFAULT_APPEARANCE);
});

test("gateway settings migrate old keys and save atomically without partial updates", (t) => {
  const values = new Map<string, string>([
    ["ahpah_omniroute_model", "legacy-model"],
  ]);
  let writes = 0;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes++;
      values.set(key, value);
    },
  };
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { dispatchEvent: () => true },
  });
  t.after(() => {
    if (originalStorage)
      Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
    if (originalWindow)
      Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  assert.equal(loadGatewayConfig().omniRouteModel, "legacy-model");
  saveGatewayConfig(config);
  assert.equal(writes, 1);
  assert.deepEqual(loadGatewayConfig(), config);
  t.mock.method(storage, "setItem", () => {
    throw new Error("Storage full");
  });
  assert.throws(
    () => saveGatewayConfig({ ...config, omniRouteModel: "different" }),
    /Storage full/,
  );
  assert.deepEqual(loadGatewayConfig(), config);
});
