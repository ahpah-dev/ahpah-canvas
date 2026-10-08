import { isAutomaticModel, isFreeModel, sortModelCatalog } from "./modelCatalog.ts";
import { AUTO_FREE_FIRST_ANSWER_MS, CATALOG_TIMEOUT_MS, COMPLETION_TIMEOUT_MS, HOSTED_CODING_MAX_REQUESTS, LOCAL_COMPLETION_TIMEOUT_MS, LOCAL_COMPLETION_TIMEOUT_MESSAGE, isLocalOllamaUrl } from "./gatewayPolicy.ts";
import { readGatewayStream, type GatewayProgress } from "./gatewayStream.ts";
import { EmptyCompletionError, GatewayServiceError, NoAnswerError } from "./gatewayErrors.ts";
import { fastReasoning, hasVerifiedFreePricing, isKiloRouteHealthy, markKiloRouteUnhealthy, verifiedFreeFallbacks } from "./kiloRecovery.ts";
import { normalizeCustomProviders, normalizeOmniRouteUrl, normalizeNineRouterUrl, normalizeNineRouterKey, normalizeProviderUrl, redactProviderError, type CustomProvider, type GatewayTransport } from "./providerConfig.ts";
import { omniCodingTools, omniToolActions, completeOmniToolPrefix } from './omniRouteTools.ts';
import { completeActionPrefix } from './codingResponse.ts';
import { LOCAL_CODING_OUTPUT_TOKENS } from './localCoding.ts';
import { freeModelCandidates, omniGatewayAuthFailure, omniModelProvider, omniRouteErrorMessage, unavailableOmniProvider } from './omniRoutePolicy.ts';
import type { AgentRoutingState } from '../types/engineering.ts';
export type { CustomProvider, GatewayTransport } from "./providerConfig.ts";

export type GatewayModel = {
  isFree?: boolean;
  id: string;
  name?: string;
  owned_by?: string;
  created?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
  architecture?: { modality?: string; output_modalities?: string[] };
  expiration_date?: string | null;
  supported_parameters?: string[];
  opencode?: { variants?: Record<string, { reasoning?: { effort?: string; enabled?: boolean } }> };
};

export type GatewayConfig = {
  omniRouteUrl: string;
  omniRouteKey: string;
  omniRouteModel: string;
  kiloKey: string;
  kiloModel: string;
  nineRouterUrl?: string;
  nineRouterKey?: string;
  nineRouterModel?: string;
  customProviders?: CustomProvider[];
  transport?: GatewayTransport;
};

const KILO_BASE = "/api/gateway/kilo";
const KILO_UPSTREAM = "https://api.kilo.ai/api/gateway";
const MODEL_CATALOG_CACHE_MS = 30_000;
const modelCatalogCache = new Map<string, { expiresAt: number; fetcher: typeof fetch; models: GatewayModel[] }>();

function cachedModels(key: string): GatewayModel[] | undefined {
  const cached = modelCatalogCache.get(key);
  if (!cached || cached.fetcher !== fetch) return undefined;
  if (cached.expiresAt <= Date.now()) { modelCatalogCache.delete(key); return undefined; }
  return cached.models.map(model => ({ ...model }));
}

function cacheModels(key: string, models: GatewayModel[]): GatewayModel[] {
  modelCatalogCache.set(key, { expiresAt: Date.now() + MODEL_CATALOG_CACHE_MS, fetcher: fetch, models: models.map(model => ({ ...model })) });
  if (modelCatalogCache.size > 8) modelCatalogCache.delete(modelCatalogCache.keys().next().value!);
  return models;
}
class UnusableCodingResponseError extends Error {
  model: string;
  constructor(message: string, model: string) { super(message); this.model = model; }
}

export function supportsLocalBridge(): boolean {
  if (import.meta.env?.VITE_GATEWAY_TRANSPORT === "direct") return false;
  if (import.meta.env?.DEV || import.meta.env?.VITE_GATEWAY_TRANSPORT === "bridge") return true;
  return typeof window === "undefined" || !window.location ||
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

export function gatewayTransport(config?: GatewayConfig): "bridge" | "direct" {
  if (!supportsLocalBridge()) return "direct";
  return config?.transport === "direct" ? "direct" : "bridge";
}

function endpoint(provider: "omniroute" | "kilo" | "custom" | "9router", config?: GatewayConfig, custom?: CustomProvider): { base: string; headers: Record<string, string> } {
  const direct = gatewayTransport(config) === "direct";
  const baseUrl = provider === "kilo" ? KILO_UPSTREAM
    : provider === '9router' ? normalizeNineRouterUrl(config?.nineRouterUrl || 'http://127.0.0.1:20128/v1')
    : provider === 'custom' ? normalizeProviderUrl(custom?.baseUrl || '') : normalizeOmniRouteUrl(config!.omniRouteUrl);
  if (direct && typeof window !== "undefined" && window.location?.protocol === "https:" && baseUrl.startsWith("http:"))
    throw new Error("This HTTPS site needs an HTTPS API URL. For a local HTTP provider, run the app locally with npm run dev.");
  return {
    base: direct ? baseUrl : provider === "kilo" ? KILO_BASE : `/api/gateway/${provider}`,
    headers: direct || provider === "kilo" ? {} : provider === "custom"
      ? { "X-Gateway-Url": baseUrl } : provider === '9router' ? { 'X-9Router-Url': baseUrl } : { "X-OmniRoute-Url": baseUrl },
  };
}

export function loadGatewayConfig(): GatewayConfig {
  try {
    const saved = JSON.parse(
      localStorage.getItem("ahpah_gateway_config") || "null",
    );
    if (
      saved &&
      [
        "omniRouteUrl",
        "omniRouteKey",
        "omniRouteModel",
        "kiloKey",
        "kiloModel",
      ].every((key) => typeof saved[key] === "string")
    )
      return {
        omniRouteUrl: saved.omniRouteUrl, omniRouteKey: saved.omniRouteKey,
        omniRouteModel: saved.omniRouteModel, kiloKey: saved.kiloKey, kiloModel: saved.kiloModel,
        ...([saved.nineRouterUrl, saved.nineRouterKey, saved.nineRouterModel].some(value => typeof value === 'string') ? {
          nineRouterUrl: typeof saved.nineRouterUrl === 'string' ? saved.nineRouterUrl : 'http://127.0.0.1:20128/v1',
          nineRouterKey: typeof saved.nineRouterKey === 'string' ? saved.nineRouterKey : '',
          nineRouterModel: typeof saved.nineRouterModel === 'string' ? saved.nineRouterModel : '',
        } : {}),
        ...(saved.customProviders ? { customProviders: normalizeCustomProviders(saved.customProviders) } : {}),
        ...(["auto", "direct", "bridge"].includes(saved.transport) ? { transport: saved.transport } : {}),
      };
  } catch {
    /* Older installations use the individual keys below. */
  }
  const savedValue = (key: string, fallback = "") => {
    try { return localStorage.getItem(key) || fallback; }
    catch { return fallback; }
  };
  return {
    omniRouteUrl:
      savedValue("ahpah_omniroute_url", "http://localhost:20128/v1"),
    omniRouteKey: savedValue("ahpah_omniroute_key"),
    omniRouteModel: savedValue("ahpah_omniroute_model"),
    kiloKey: savedValue("ahpah_kilo_key"),
    kiloModel: savedValue("ahpah_kilo_model", "kilo-auto/free"),
    nineRouterUrl: 'http://127.0.0.1:20128/v1', nineRouterKey: '', nineRouterModel: '',
  };
}

export function saveGatewayConfig(config: GatewayConfig) {
  normalizeProviderUrl(config.omniRouteUrl);
  const nineRouter = [config.nineRouterUrl, config.nineRouterKey, config.nineRouterModel].some(value => value !== undefined)
    ? { nineRouterUrl: normalizeNineRouterUrl(config.nineRouterUrl ?? 'http://127.0.0.1:20128/v1'), nineRouterKey: normalizeNineRouterKey(config.nineRouterKey || ''), nineRouterModel: (config.nineRouterModel || '').trim() }
    : {};
  const customProviders = normalizeCustomProviders(config.customProviders);
  for (const provider of customProviders) {
    if (!provider.baseUrl) throw new Error(`Enter an API base URL for ${provider.name}.`);
    provider.baseUrl = normalizeProviderUrl(provider.baseUrl);
  }
  // One write prevents partial updates if browser storage is full.
  localStorage.setItem(
    "ahpah_gateway_config",
    JSON.stringify({
      omniRouteUrl: config.omniRouteUrl.trim(), omniRouteKey: config.omniRouteKey,
      omniRouteModel: config.omniRouteModel.trim(), kiloKey: config.kiloKey, kiloModel: config.kiloModel.trim(),
      ...nineRouter,
      ...(config.customProviders ? { customProviders } : {}),
      ...(config.transport ? { transport: config.transport } : {}),
    }),
  );
  window.dispatchEvent(new Event("ahpah-gateway-config-changed"));
}

function authHeaders(key: string): Record<string, string> {
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function jsonRequest(
  url: string,
  init?: RequestInit,
  onProgress?: (progress: GatewayProgress) => void,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: init?.signal ?? AbortSignal.timeout(CATALOG_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        url.startsWith(KILO_UPSTREAM)
          ? "Could not reach Kilo from this browser. Its API may block browser access (CORS); run this app locally to use the included gateway."
          : "Could not reach the API. Check its URL, network access, and browser access (CORS). For providers without browser access, run the app locally.",
      );
    }
    throw error;
  }
  if (response.ok && response.headers.get("content-type")?.includes("text/event-stream"))
    return readGatewayStream(response, init!.signal!, onProgress);
  let body;
  try {
    body = await response.json();
  } catch (error) {
    // A disconnected or cancelled response must retain its original error.
    if (!(error instanceof SyntaxError)) throw error;
    if (response.ok)
      throw new Error("The API returned invalid or missing JSON. Check the provider base URL and connection mode in Settings.");
    throw new GatewayServiceError(`HTTP ${response.status}: Gateway request failed without a JSON error message.`, response.status);
  }
  if (!response.ok) {
    throw new GatewayServiceError(
      `HTTP ${response.status}: ${typeof body?.error === 'string' ? body.error : body?.error?.message || body?.message || "Gateway request failed."}`,
      response.status,
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("The gateway returned an invalid response format.");
  if (body.error)
    throw new GatewayServiceError(
      `Gateway error: ${typeof body.error === "string" ? body.error : body.error.message || "Provider could not complete this request."}`,
      Number(body.error.code) || undefined,
    );
  return body;
}

function answerText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  // Some OpenAI-compatible adapters return text parts. Reasoning is not an answer.
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

export async function listOmniRouteModels(
  config: GatewayConfig,
  signal?: AbortSignal,
): Promise<GatewayModel[]> {
  const route = endpoint("omniroute", config);
  const cacheKey = `omniroute:${route.base}`;
  const cached = cachedModels(cacheKey);
  if (cached) return cached;
  try {
    const result = await jsonRequest(
      `${route.base}/models?prefix=alias`,
      {
        signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(CATALOG_TIMEOUT_MS)]),
        cache: "no-store",
        headers: { ...authHeaders(config.omniRouteKey), ...route.headers },
      },
    );
    if (!Array.isArray(result.data)) throw new Error('OmniRoute did not return a model catalog. Use its API base URL ending in /v1.');
    return cacheModels(cacheKey, sortModelCatalog(result.data.filter((model: GatewayModel | null) => model && typeof model.id === 'string' && model.id.trim())));
  } catch (error) {
    if (error instanceof Error) Object.defineProperty(error, 'message', { value: redactProviderError(error.message, [config.omniRouteKey, config.kiloKey, ...(config.customProviders || []).map(provider => provider.apiKey)]), configurable: true });
    throw error;
  }
}

/** Auth runs before model resolution in 9router. Omit the model so no upstream request can run. */
export async function checkNineRouterConnection(config: GatewayConfig, signal?: AbortSignal): Promise<void> {
  const key = normalizeNineRouterKey(config.nineRouterKey || '');
  try {
    const route = endpoint('9router', config);
    await jsonRequest(`${route.base}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(CATALOG_TIMEOUT_MS)]),
      headers: { 'Content-Type': 'application/json', ...authHeaders(key), ...route.headers },
      body: JSON.stringify({ messages: [], stream: false }),
    });
    throw new Error('The endpoint did not return 9router’s expected connection-check response. Confirm the API URL and gateway version.');
  } catch (error) {
    if (error instanceof GatewayServiceError && error.status === 400 && /^HTTP 400:\s*Missing model\.?$/i.test(error.message)) return;
    if (error instanceof GatewayServiceError && error.status === 401)
      throw new GatewayServiceError('9router rejected the gateway key before contacting a model. Use an active key generated by this same 9router instance under Dashboard → API Keys, then Save changes or Use in Code. Upstream provider keys belong in 9router’s Providers page. Also confirm the API URL points to that instance.', 401);
    if (error instanceof Error) Object.defineProperty(error, 'message', { value: redactProviderError(error.message, [config.nineRouterKey || '', key]), configurable: true });
    throw error;
  }
}

/** Catalog discovery only: preserve opaque model/combination IDs without a completion probe. */
export async function listNineRouterModels(config: GatewayConfig, signal?: AbortSignal): Promise<GatewayModel[]> {
  try {
    const route = endpoint('9router', config);
    const result = await jsonRequest(`${route.base}/models`, {
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(CATALOG_TIMEOUT_MS)]),
      cache: 'no-store', headers: { ...authHeaders(normalizeNineRouterKey(config.nineRouterKey || '')), ...route.headers },
    });
    if (!Array.isArray(result.data)) throw new Error('9router did not return a model catalog. Use its API base URL ending in /v1.');
    const ids = new Set<string>();
    return sortModelCatalog(result.data.filter((model: GatewayModel | null) => {
      if (!model || typeof model.id !== 'string' || !model.id.trim() || ids.has(model.id)) return false;
      ids.add(model.id); return true;
    }));
  } catch (error) {
    if (error instanceof Error) Object.defineProperty(error, 'message', { value: redactProviderError(error.message, [config.nineRouterKey || '', normalizeNineRouterKey(config.nineRouterKey || '')]), configurable: true });
    throw error;
  }
}

export async function listKiloModels(
  signal?: AbortSignal,
  config?: GatewayConfig,
): Promise<GatewayModel[]> {
  const base = endpoint("kilo", config).base;
  const cacheKey = `kilo:${base}`;
  const cached = cachedModels(cacheKey);
  if (cached) return cached;
  const result = await jsonRequest(`${base}/models`, {
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(CATALOG_TIMEOUT_MS)]),
    cache: "no-store",
  });
  if (!Array.isArray(result.data)) throw new Error('Kilo did not return a valid model catalog. Retry loading live models in Settings.');
  return cacheModels(cacheKey, sortModelCatalog(
        result.data.filter(
          (model: GatewayModel | null) =>
            model && typeof model.id === "string" && model.id.trim(),
        ),
      ));
}

export async function listCustomModels(provider: CustomProvider, config: GatewayConfig, signal?: AbortSignal): Promise<GatewayModel[]> {
  const route = endpoint("custom", config, provider);
  try {
    const result = await jsonRequest(`${route.base}/models`, {
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(CATALOG_TIMEOUT_MS)]),
      cache: "no-store", headers: { ...route.headers, ...authHeaders(provider.apiKey) },
    });
    if (!Array.isArray(result.data)) throw new Error("The API did not return an OpenAI-compatible model catalog. Enter its exact model ID manually.");
    return sortModelCatalog(result.data.filter((model: GatewayModel | null) => model && typeof model.id === "string" && model.id.trim()));
  } catch (error) {
    if (error instanceof Error && provider.apiKey && error.message.includes(provider.apiKey))
      Object.defineProperty(error, "message", { value: redactProviderError(error.message, [provider.apiKey]), configurable: true });
    throw error;
  }
}

export async function sendGatewayPrompt(
  provider: "omniroute" | "kilo" | "custom" | "9router",
  prompt: string,
  config: GatewayConfig,
  options: {
    runId?: string;
    signal?: AbortSignal;
    maxTokens?: number;
    messages?: { role: "user" | "assistant" | "system"; content: string }[];
    onProgress?: (progress: GatewayProgress) => void;
    firstAnswerTimeoutMs?: number;
    providerId?: string;
    routing?: AgentRoutingState;
    validateResponse?: (text: string) => void;
  } = {},
): Promise<{ text: string; model: string; tokens: number; outputTruncated?: boolean; responseError?: string }> {
  const isKilo = provider === "kilo";
  const custom = provider === "custom" ? config.customProviders?.find((item) => item.id === options.providerId) : undefined;
  if (provider === "custom" && !custom) throw new Error("This custom provider is no longer configured. Add it in Settings or create a card for another provider.");
  const route = endpoint(provider, config, custom);
  const localOllama = !!custom && isLocalOllamaUrl(normalizeProviderUrl(custom.baseUrl));
  const base = route.base;
  const model = custom ? custom.model : provider === '9router' ? config.nineRouterModel || '' : isKilo ? config.kiloModel : config.omniRouteModel;
  const key = custom ? custom.apiKey : provider === '9router' ? normalizeNineRouterKey(config.nineRouterKey || '') : isKilo ? config.kiloKey : config.omniRouteKey;
  if (!model)
    throw new Error("Choose a model in Settings before sending a prompt.");
  const completionDeadline = AbortSignal.timeout(localOllama ? LOCAL_COMPLETION_TIMEOUT_MS : COMPLETION_TIMEOUT_MS);
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    completionDeadline,
  ]);
  signal.throwIfAborted();
  const nativeCoding = !!options.validateResponse && (isKilo || provider === 'omniroute' || provider === '9router' || localOllama);
  // Accept native replies without requiring installed text-only Ollama models
  // to support advertised tools. Both formats use the same validated runtime.
  const advertiseNativeTools = nativeCoding && !localOllama;
  const maxTokens = localOllama && nativeCoding ? Math.min(options.maxTokens ?? LOCAL_CODING_OUTPUT_TOKENS, LOCAL_CODING_OUTPUT_TOKENS) : options.maxTokens ?? (isKilo ? 8192 : 2048);
  const omniAutomatic = provider === 'omniroute' && isAutomaticModel({ id: model }) && isFreeModel({ id: model });
  let automatic = (isKilo && model === "kilo-auto/free") || omniAutomatic;
  if (options.routing) options.routing.automatic = automatic;
  const firstAnswerLimit = Number.isFinite(options.firstAnswerTimeoutMs)
    ? Math.max(1, Math.min(AUTO_FREE_FIRST_ANSWER_MS, options.firstAnswerTimeoutMs!))
    : AUTO_FREE_FIRST_ANSWER_MS;
  let tokens = 0;
  let target: GatewayModel = { id: model };
  let catalogModels: GatewayModel[] = [];
  let fallbackModels: GatewayModel[] | undefined;
  const excluded = new Set([model, ...(options.routing?.excludedModels || [])]);
  const unavailableProviders = new Set<string>();
  const nextFreeModel = async () => {
    if (!fallbackModels) {
      try {
        catalogModels = await (omniAutomatic ? listOmniRouteModels(config,
          AbortSignal.any([signal, AbortSignal.timeout(CATALOG_TIMEOUT_MS)])) : listKiloModels(
          AbortSignal.any([signal, AbortSignal.timeout(CATALOG_TIMEOUT_MS)]),
          config,
        ));
        fallbackModels = omniAutomatic ? freeModelCandidates(catalogModels) : verifiedFreeFallbacks(catalogModels);
      } catch (error) {
        signal.throwIfAborted();
        if (omniAutomatic) throw error;
        fallbackModels = [];
      }
    }
    return fallbackModels.find((item) => !excluded.has(item.id) && (omniAutomatic ? !unavailableProviders.has(omniModelProvider(item)) : isKiloRouteHealthy(item.id)));
  };
  if (omniAutomatic) {
    const fallback = await nextFreeModel();
    if (!fallback) throw new Error('OmniRoute Auto Free has no current concrete free text route. Load live models in Settings and connect a free provider in OmniRoute.');
    target = fallback;
  }
  if (isKilo && !automatic && options.validateResponse) {
    await nextFreeModel();
    const selected = catalogModels.find(item => item.id === model && hasVerifiedFreePricing(item));
    if (selected) target = selected;
    if (options.routing) {
      // An explicit model stays selected until the agent detects a real loop.
      // Only live zero-price evidence authorizes a run-local free fallback.
      options.routing.recoverable = !!selected;
      automatic = !!selected && options.routing.excludedModels.includes(model);
      options.routing.automatic = automatic;
    }
  }
  if (automatic && options.routing?.model && !excluded.has(options.routing.model)) {
    await nextFreeModel();
    const preferred = fallbackModels?.find(item => item.id === options.routing!.model && !excluded.has(item.id) && (omniAutomatic || isKiloRouteHealthy(item.id)));
    if (preferred) target = preferred;
  }
  if (automatic && target.id === model && (!isKiloRouteHealthy(model) || options.routing?.excludedModels.includes(model))) {
    const fallback = await nextFreeModel();
    if (!fallback)
      throw new Error(options.routing?.excludedModels.includes(model)
        ? "The previous Kilo route stopped making progress and no other eligible free model is available. Any staged source has been kept; choose another model to continue."
        : "Auto Free recently stalled and no other eligible free model is available. Check Kilo's availability or try again later.");
    target = fallback;
  }
  const request = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(key),
      ...route.headers,
      // Preserve source and coding instructions when the router has token modifiers enabled.
      ...(provider === '9router' && nativeCoding ? { 'X-9Router-Token-Saver': 'off' } : {}),
      ...(isKilo && options.runId && /^[a-zA-Z0-9_-]{1,100}$/.test(options.runId) ? { 'X-KiloCode-TaskId': options.runId } : {}),
    },
  };
  let attempts = automatic ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    signal.throwIfAborted();
    const used = options.routing?.requestsUsed ?? 0;
    const configuredLimit = options.routing?.requestLimit;
    // A profile edited during a local run must not inherit its larger compute
    // budget after switching to a hosted endpoint.
    const limit = configuredLimit === undefined ? undefined : localOllama ? configuredLimit : Math.min(configuredLimit, HOSTED_CODING_MAX_REQUESTS);
    if (limit !== undefined && used >= limit)
      throw new Error(`This run reached its ${limit}-request limit. Staged files are kept; start a new task to continue.`);
    if (limit !== undefined) {
      const nextRequest = used + 1;
      await options.routing?.beforeRequest?.(nextRequest);
      if (options.routing) options.routing.requestsUsed = nextRequest;
    }
    const local = new AbortController();
    const attemptSignal = AbortSignal.any([signal, local.signal]);
    const timer = automatic
      ? setTimeout(() => local.abort(new NoAnswerError(target.id)), firstAnswerLimit)
      : undefined;
    let hasAnswer = false;
    let resolvedAttemptModel = target.id;
    const label = target.name || target.id;
    options.onProgress?.({
      text: "",
      phase: attempt || target.id !== model ? "retrying" : "waiting",
      detail: attempt || target.id !== model ? `Trying ${label} after a slow or unavailable free route` : localOllama ? `Waiting for ${label} on this computer. The first model load can take a few minutes. Stop cancels this request.` : `Waiting for ${custom?.name || (provider === '9router' ? '9router' : isKilo ? "Kilo" : "OmniRoute")}`,
    });
    try {
      const reasoning = isKilo && (automatic || (options.validateResponse && hasVerifiedFreePricing(target))) ? fastReasoning(target) : undefined;
      const result = await jsonRequest(`${base}/chat/completions`, {
        ...request,
        signal: attemptSignal,
        body: JSON.stringify({
          model: target.id,
          messages: [
            ...(options.messages || []),
            { role: "user", content: prompt },
          ],
          stream: custom ? custom.stream : true,
          max_tokens: maxTokens,
          // Local thinking can otherwise exhaust the output budget before an answer.
          // Local coding is a JSON action conversation, including text-only
          // models. Do not leave a second, unadvertised native protocol enabled.
          ...(localOllama ? { reasoning_effort: 'none', tool_choice: 'none', ...(nativeCoding ? { response_format: { type: 'json_object' } } : {}) } : {}),
          ...(advertiseNativeTools && (!Array.isArray(target.supported_parameters) || target.supported_parameters.includes('tools')) ? { tools: omniCodingTools, tool_choice: 'auto' } : {}),
          ...(reasoning ? { reasoning } : {}),
        }),
      }, (progress) => {
        if (progress.model) resolvedAttemptModel = progress.model;
        if (progress.text.trim() || (nativeCoding && progress.phase === 'answer')) {
          // Native fragments have not been executed or shown as a user answer.
          // Stop their first-answer watchdog, while permitting safe free fallback
          // if their eventual complete arguments are invalid or truncated.
          hasAnswer ||= !!progress.text.trim();
          clearTimeout(timer);
        }
        options.onProgress?.({
          ...progress,
          detail: progress.phase === "answer"
            ? `Receiving answer from ${resolvedAttemptModel}`
            : progress.phase === "reasoning"
              ? `${resolvedAttemptModel} is reasoning`
              : localOllama ? `Waiting for ${resolvedAttemptModel} on this computer. The first model load can take a few minutes. Stop cancels this request.` : `Waiting for ${resolvedAttemptModel}`,
        });
      });
      attemptSignal.throwIfAborted();
      const choice = result.choices?.[0];
      const message = choice?.message;
      const resolvedModel =
        typeof result.model === "string" && result.model ? result.model : target.id;
      const usage = result.usage?.total_tokens;
      if (typeof usage === "number" && Number.isFinite(usage) && usage > 0)
        tokens += usage;
      if (choice?.error)
        throw new Error(
          `Gateway error: ${choice.error.message || "Provider failed to generate an answer."}`,
        );
      if (message === undefined || message === null)
        throw new EmptyCompletionError(
          `${resolvedModel} returned an empty response without a completion message. Try again or choose another model.`,
          resolvedModel,
        );
      if (typeof message !== 'object' || Array.isArray(message))
        throw new Error(`${resolvedModel} returned an invalid completion format.`);
      if (
        message.content != null &&
        typeof message.content !== "string" && !Array.isArray(message.content)
      )
        throw new Error(`${resolvedModel} returned an invalid completion format.`);
      if (nativeCoding && choice?.finish_reason === 'length') {
        if (localOllama && options.validateResponse) {
          const prefix = completeOmniToolPrefix(message.tool_calls) ?? completeActionPrefix(answerText(message.content), options.validateResponse);
          if (prefix) options.validateResponse(prefix);
          // Only the runtime can decide whether to continue within its request budget.
          // A length finish can mean context exhaustion, not max_tokens output.
          return { text: prefix, model: resolvedModel, tokens, outputTruncated: true };
        }
        throw new EmptyCompletionError(`${resolvedModel} reached its context limit or configured ${maxTokens.toLocaleString()} token limit before completing its coding response. Any staged source has been kept; no truncated actions were executed.`, resolvedModel, 'token_limit');
      }
      let nativeActions: string | undefined;
      if (nativeCoding) {
        try { nativeActions = omniToolActions(message.tool_calls); }
        catch (failure) {
          const detail = `${resolvedModel} returned unusable coding tools: ${failure instanceof Error ? failure.message : 'Invalid tool arguments'}`;
          // Let the agent correct the format within its existing repair/request
          // budget. None of this rejected native batch has executed.
          if (localOllama) return { text: '', model: resolvedModel, tokens, responseError: detail };
          throw new UnusableCodingResponseError(detail, resolvedModel);
        }
      }
      const text = nativeActions ?? answerText(message?.content);
      const refusal = answerText(message?.refusal);
      if (choice?.finish_reason === "content_filter")
        throw new Error(
          `${resolvedModel} blocked this response. Rephrase the prompt and try again.`,
        );
      if (refusal.trim()) return { text: refusal, model: resolvedModel, tokens };
      if (text.trim()) {
        if (options.validateResponse && (automatic || provider === 'omniroute' || provider === '9router')) {
          try { options.validateResponse(text); }
          catch (failure) {
            throw new UnusableCodingResponseError(`${resolvedModel} returned unusable coding actions: ${failure instanceof Error ? failure.message : 'Invalid response'}`, resolvedModel);
          }
        }
        if (automatic && options.routing) {
          await nextFreeModel();
          // Pin only catalog-confirmed free routes; a router-reported ID is not price evidence.
          const effective = fallbackModels?.find(item => item.id === resolvedModel && !excluded.has(item.id))
            || fallbackModels?.find(item => item.id === target.id && !excluded.has(item.id));
          if (effective) options.routing.model = effective.id;
        }
        return { text, model: resolvedModel, tokens };
      }
      if (choice?.finish_reason === "tool_calls" || message?.tool_calls?.length)
        throw new Error(
          `${resolvedModel} returned a tool call without an answer. This request expects text or structured coding actions in the response; choose a model that follows those instructions.`,
        );
      if (choice?.finish_reason === "error")
        throw new Error(
          `${resolvedModel} failed to generate an answer. Try again or choose another model.`,
        );

      if (choice?.finish_reason === "length")
        throw new EmptyCompletionError(
          `${resolvedModel} reached its context limit or configured ${maxTokens.toLocaleString("en-US")} token limit before producing an answer. Try a shorter prompt or choose a model with less reasoning.`,
          resolvedModel,
          'token_limit',
        );
      if (message?.reasoning || message?.reasoning_content)
        throw new EmptyCompletionError(
          `${resolvedModel} returned reasoning without an answer. Try again or choose another model.`,
          resolvedModel,
        );
      throw new EmptyCompletionError(
        `${resolvedModel} returned an empty response${choice?.finish_reason ? ` (finish reason: ${choice.finish_reason})` : ""}. Try again or choose another model.`,
        resolvedModel,
      );
    } catch (caught) {
      clearTimeout(timer);
      if (localOllama && !options.signal?.aborted && (completionDeadline.aborted || (caught instanceof Error && caught.name === 'TimeoutError')))
        throw new DOMException(LOCAL_COMPLETION_TIMEOUT_MESSAGE, 'TimeoutError');
      signal.throwIfAborted();
      const error = local.signal.aborted ? local.signal.reason : caught;
      if (provider === 'omniroute' && error instanceof Error)
        Object.defineProperty(error, 'message', { value: omniRouteErrorMessage(error.message), configurable: true });
      if (error instanceof Error && key && error.message.includes(key))
        Object.defineProperty(error, "message", { value: redactProviderError(error.message, [key]), configurable: true });
      if (isKilo && error instanceof GatewayServiceError) {
        const guidance: Record<number, string> = {
          401: key ? 'Update the Kilo API key in Settings, then retry.' : 'Add your Kilo API key in Settings, or choose an available anonymous free model.',
          402: 'This Kilo account has insufficient balance. Choose Auto Free or another verified free model, or update the account balance.',
          403: 'Check the Kilo account or organization model permissions before retrying.',
          429: 'Wait before retrying. Anonymous Kilo access has an IP rate limit; adding your Kilo API key in Settings can use your account limits.',
        };
        if (guidance[error.status || 0]) error.message += ` ${guidance[error.status || 0]}`;
      }
      if (provider === '9router' && error instanceof GatewayServiceError) {
        if (error.status === 401) {
          try {
            await checkNineRouterConnection(config, signal);
            error.message += ' The gateway connection check passed. The selected upstream provider rejected authentication; check that provider’s account or key in 9router → Providers. Changing the AhPah gateway key will not repair an upstream credential.';
          } catch (connectionError) {
            signal.throwIfAborted();
            if (connectionError instanceof GatewayServiceError && connectionError.status === 401) throw connectionError;
            error.message += ' Gateway authentication could not be confirmed. Check this instance’s API key and selected provider connection in the 9router dashboard.';
          }
        }
        const guidance: Record<number, string> = {
          403: 'Check the gateway key permissions and selected provider account in 9router.',
          404: 'Refresh the 9router catalog and select an available model or combo.',
          429: 'The route is rate limited. Wait before retrying or adjust its combo in the 9router dashboard.',
        };
        if (guidance[error.status || 0]) error.message += ` ${guidance[error.status || 0]}`;
      }
      const recoverable = error instanceof UnusableCodingResponseError || error instanceof NoAnswerError || error instanceof EmptyCompletionError ||
        (error instanceof GatewayServiceError && [404, 408, 410, 500, 502, 503, 504].includes(error.status || 0)) ||
        (omniAutomatic && error instanceof Error && !omniGatewayAuthFailure(error.message) &&
          (unavailableOmniProvider(error.message) || (error instanceof GatewayServiceError && [401, 403, 429].includes(error.status || 0))));
      // Never replace text already streamed to the user, even if the response
      // later contains invalid coding tools. Native-only proposals remain safe
      // to retry because their fragments have neither executed nor shown text.
      if (!automatic || hasAnswer || !recoverable) throw error;
      if (isKilo && error instanceof EmptyCompletionError && error.reason === 'token_limit' && target.id === model && attempt < 2) {
        await nextFreeModel();
        const instant = fallbackModels?.find(item => item.id === error.model && !excluded.has(item.id)
          && fastReasoning(item)?.enabled === false && isKiloRouteHealthy(item.id));
        if (instant) {
          // The virtual router had only generic low reasoning. Retry its effective free model
          // with the explicitly advertised disabled-thinking variant before abandoning it.
          excluded.add(target.id);
          markKiloRouteUnhealthy(target.id);
          if (options.routing) options.routing.excludedModels = [...new Set([...options.routing.excludedModels, target.id])];
          options.onProgress?.({ text: '', phase: 'retrying', detail: `${instant.name || instant.id} exhausted its reasoning budget. Retrying its advertised instant mode` });
          target = instant;
          // The advertised instant variant is a distinct, bounded recovery. Allow one
          // further fallback only if that variant also fails; the run-wide request
          // budget still caps the total number of paid/free provider calls.
          attempts = Math.max(attempts, attempt + 3);
          continue;
        }
      }
      excluded.add(target.id);
      excluded.add(error instanceof EmptyCompletionError ? error.model : resolvedAttemptModel);
      if (error instanceof UnusableCodingResponseError) excluded.add(error.model);
      if (options.routing) options.routing.excludedModels = [...new Set([...options.routing.excludedModels, ...excluded])];
      if (omniAutomatic && error instanceof Error && (unavailableOmniProvider(error.message) || /429|quota|only be used from within OpenCode/i.test(error.message))) {
        unavailableProviders.add(omniModelProvider(target));
        for (const item of fallbackModels || []) if (unavailableProviders.has(omniModelProvider(item))) excluded.add(item.id);
        if (options.routing) options.routing.excludedModels = [...new Set([...options.routing.excludedModels, ...excluded])];
      }
      if (isKilo) {
        markKiloRouteUnhealthy(target.id);
        markKiloRouteUnhealthy(error instanceof EmptyCompletionError ? error.model : resolvedAttemptModel);
        if (error instanceof UnusableCodingResponseError) markKiloRouteUnhealthy(error.model);
      }
      if (attempt >= attempts - 1) throw error;
      options.onProgress?.({ text: "", phase: "retrying", detail: `${label} could not complete this request. Finding another current free model` });
      const fallback = await nextFreeModel();
      if (!fallback) throw error;
      target = fallback;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("The gateway could not produce an answer.");
}
