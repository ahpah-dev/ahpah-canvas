import { isAutomaticModel, isFreeModel, sortModelCatalog } from "./modelCatalog.ts";
import { AUTO_FREE_FIRST_ANSWER_MS, CATALOG_TIMEOUT_MS, COMPLETION_TIMEOUT_MS } from "./gatewayPolicy.ts";
import { readGatewayStream, type GatewayProgress } from "./gatewayStream.ts";
import { EmptyCompletionError, GatewayServiceError, NoAnswerError } from "./gatewayErrors.ts";
import { fastReasoning, hasVerifiedFreePricing, isKiloRouteHealthy, markKiloRouteUnhealthy, verifiedFreeFallbacks } from "./kiloRecovery.ts";
import { normalizeCustomProviders, normalizeOmniRouteUrl, normalizeProviderUrl, redactProviderError, type CustomProvider, type GatewayTransport } from "./providerConfig.ts";
import { omniCodingTools, omniToolActions } from './omniRouteTools.ts';
import { freeModelCandidates, omniGatewayAuthFailure, omniModelProvider, omniRouteErrorMessage, unavailableOmniProvider } from './omniRoutePolicy.ts';
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
  customProviders?: CustomProvider[];
  transport?: GatewayTransport;
};

const KILO_BASE = "/api/gateway/kilo";
const KILO_UPSTREAM = "https://api.kilo.ai/api/gateway";
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

function endpoint(provider: "omniroute" | "kilo" | "custom", config?: GatewayConfig, custom?: CustomProvider): { base: string; headers: Record<string, string> } {
  const direct = gatewayTransport(config) === "direct";
  const baseUrl = provider === "kilo" ? KILO_UPSTREAM
    : provider === 'custom' ? normalizeProviderUrl(custom?.baseUrl || '') : normalizeOmniRouteUrl(config!.omniRouteUrl);
  if (direct && typeof window !== "undefined" && window.location?.protocol === "https:" && baseUrl.startsWith("http:"))
    throw new Error("This HTTPS site needs an HTTPS API URL. For a local HTTP provider, run the app locally with npm run dev.");
  return {
    base: direct ? baseUrl : provider === "kilo" ? KILO_BASE : `/api/gateway/${provider}`,
    headers: direct || provider === "kilo" ? {} : provider === "custom"
      ? { "X-Gateway-Url": baseUrl } : { "X-OmniRoute-Url": baseUrl },
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
  };
}

export function saveGatewayConfig(config: GatewayConfig) {
  normalizeProviderUrl(config.omniRouteUrl);
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
    return sortModelCatalog(result.data.filter((model: GatewayModel | null) => model && typeof model.id === 'string' && model.id.trim()));
  } catch (error) {
    if (error instanceof Error) Object.defineProperty(error, 'message', { value: redactProviderError(error.message, [config.omniRouteKey, config.kiloKey, ...(config.customProviders || []).map(provider => provider.apiKey)]), configurable: true });
    throw error;
  }
}

export async function listKiloModels(
  signal?: AbortSignal,
  config?: GatewayConfig,
): Promise<GatewayModel[]> {
  const result = await jsonRequest(`${endpoint("kilo", config).base}/models`, {
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(CATALOG_TIMEOUT_MS)]),
    cache: "no-store",
  });
  return Array.isArray(result.data)
    ? sortModelCatalog(
        result.data.filter(
          (model: GatewayModel | null) =>
            model && typeof model.id === "string" && model.id.trim(),
        ),
      )
    : [];
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
  provider: "omniroute" | "kilo" | "custom",
  prompt: string,
  config: GatewayConfig,
  options: {
    signal?: AbortSignal;
    maxTokens?: number;
    messages?: { role: "user" | "assistant" | "system"; content: string }[];
    onProgress?: (progress: GatewayProgress) => void;
    firstAnswerTimeoutMs?: number;
    providerId?: string;
    routing?: { model?: string; excludedModels: string[]; automatic?: boolean; recoverable?: boolean };
    validateResponse?: (text: string) => void;
  } = {},
): Promise<{ text: string; model: string; tokens: number }> {
  const isKilo = provider === "kilo";
  const custom = provider === "custom" ? config.customProviders?.find((item) => item.id === options.providerId) : undefined;
  if (provider === "custom" && !custom) throw new Error("This custom provider is no longer configured. Add it in Settings or create a card for another provider.");
  const route = endpoint(provider, config, custom);
  const base = route.base;
  const model = custom ? custom.model : isKilo ? config.kiloModel : config.omniRouteModel;
  const key = custom ? custom.apiKey : isKilo ? config.kiloKey : config.omniRouteKey;
  if (!model)
    throw new Error("Choose a model in Settings before sending a prompt.");
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
  ]);
  const maxTokens = options.maxTokens ?? (isKilo ? 8192 : 2048);
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
    },
  };
  const attempts = omniAutomatic ? 6 : automatic ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    signal.throwIfAborted();
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
      detail: attempt || target.id !== model ? `Trying ${label} after a slow or unavailable free route` : `Waiting for ${custom?.name || (isKilo ? "Kilo" : "OmniRoute")}`,
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
          ...(provider === 'omniroute' && options.validateResponse ? { tools: omniCodingTools, tool_choice: 'auto' } : {}),
          ...(reasoning ? { reasoning } : {}),
        }),
      }, (progress) => {
        if (progress.model) resolvedAttemptModel = progress.model;
        if (progress.text.trim() || (options.validateResponse && progress.phase === 'answer')) {
          hasAnswer = true;
          clearTimeout(timer);
        }
        options.onProgress?.({
          ...progress,
          detail: progress.phase === "answer"
            ? `Receiving answer from ${resolvedAttemptModel}`
            : progress.phase === "reasoning"
              ? `${resolvedAttemptModel} is reasoning`
              : `Waiting for ${resolvedAttemptModel}`,
        });
      });
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
      if (
        !message || typeof message !== "object" || Array.isArray(message)
      )
        throw new Error(
          `${resolvedModel} returned an empty response without a completion message. Try again or choose another model.`,
        );
      if (
        message.content != null &&
        typeof message.content !== "string" && !Array.isArray(message.content)
      )
        throw new Error(`${resolvedModel} returned an invalid completion format.`);
      if (provider === 'omniroute' && options.validateResponse && message.tool_calls?.length && choice?.finish_reason === 'length')
        throw new EmptyCompletionError(`${resolvedModel} reached the ${maxTokens.toLocaleString()} token limit before completing its coding tools.`, resolvedModel, 'token_limit');
      const text = (provider === 'omniroute' && options.validateResponse ? omniToolActions(message.tool_calls) : undefined) ?? answerText(message?.content);
      const refusal = answerText(message?.refusal);
      if (choice?.finish_reason === "content_filter")
        throw new Error(
          `${resolvedModel} blocked this response. Rephrase the prompt and try again.`,
        );
      if (refusal.trim()) return { text: refusal, model: resolvedModel, tokens };
      if (text.trim()) {
        if (options.validateResponse && (automatic || provider === 'omniroute')) {
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
          `${resolvedModel} reached the ${maxTokens.toLocaleString("en-US")} token limit before producing an answer. Try a shorter prompt or choose a model with less reasoning.`,
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
      signal.throwIfAborted();
      const error = local.signal.aborted ? local.signal.reason : caught;
      if (provider === 'omniroute' && error instanceof Error)
        Object.defineProperty(error, 'message', { value: omniRouteErrorMessage(error.message), configurable: true });
      if (error instanceof Error && key && error.message.includes(key))
        Object.defineProperty(error, "message", { value: redactProviderError(error.message, [key]), configurable: true });
      const recoverable = error instanceof UnusableCodingResponseError || error instanceof NoAnswerError || error instanceof EmptyCompletionError ||
        (error instanceof GatewayServiceError && [404, 408, 410, 500, 502, 503, 504].includes(error.status || 0)) ||
        (omniAutomatic && error instanceof Error && !omniGatewayAuthFailure(error.message) &&
          (unavailableOmniProvider(error.message) || (error instanceof GatewayServiceError && [401, 403, 429].includes(error.status || 0))));
      if (!automatic || (hasAnswer && !(error instanceof UnusableCodingResponseError)) || !recoverable) throw error;
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
