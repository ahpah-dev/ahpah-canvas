import {
  listKiloModels,
  listOmniRouteModels,
  sendGatewayPrompt,
  type GatewayConfig,
  type GatewayModel,
} from "./gateways.ts";
import { isFreeModel } from "./modelCatalog.ts";
import { parseAgentActions } from "./agentRuntime.ts";
import { freeModelCandidates, omniGatewayAuthFailure, omniModelProvider, omniProviderHelp, unavailableOmniProvider } from './omniRoutePolicy.ts';
export { freeModelCandidates } from './omniRoutePolicy.ts';

export const KILO_CODING_PROBE = 'Coding action compatibility check: return only this JSON object, without Markdown or commentary: {"actions":[{"tool":"finish","summary":"READY","review":"No files changed. No commands run."}]}';
export function validateKiloCodingProbe(text: string): void {
  const actions = parseAgentActions(text);
  if (actions.length !== 1 || actions[0].tool !== 'finish') throw new Error('The route did not follow the read-only coding compatibility check.');
}

export type SetupProgress = {
  provider: "omniroute" | "kilo";
  phase: "discovering" | "testing" | "ready" | "attention";
  detail: string;
  attempt?: number;
  total?: number;
};
export type ProviderSetup = {
  provider: "omniroute" | "kilo";
  models: GatewayModel[];
  verified: boolean;
  detail: string;
  config: Partial<GatewayConfig>;
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Gateway request failed.";
function redact(text: string, config: GatewayConfig) {
  return [config.omniRouteKey, config.kiloKey, ...(config.customProviders || []).map(provider => provider.apiKey)]
    .filter(Boolean)
    .reduce((value, key) => value.split(key).join("[redacted]"), text)
    .slice(0, 500);
}

export async function verifyOmniRouteModels(config: GatewayConfig, models: GatewayModel[], signal: AbortSignal, onProgress: (detail: string, attempt: number, total: number) => void) {
  const candidates = freeModelCandidates(models, config.omniRouteModel);
  if (!candidates.length) throw new Error('Catalog loaded, but no concrete free text route was found. Import a free model from OmniRoute or choose a model manually.');
  const unavailable = new Set<string>();
  const failures: string[] = [];
  for (let index = 0; index < candidates.length; index++) {
    signal.throwIfAborted();
    const model = candidates[index];
    const provider = omniModelProvider(model);
    if (unavailable.has(provider)) continue;
    onProgress(`Verifying coding actions with ${model.name || model.id}…`, index + 1, candidates.length);
    try {
      const result = await sendGatewayPrompt('omniroute', KILO_CODING_PROBE, { ...config, omniRouteModel: model.id }, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]), maxTokens: 1024, validateResponse: validateKiloCodingProbe,
      });
      signal.throwIfAborted();
      validateKiloCodingProbe(result.text);
      return { model, result };
    } catch (error) {
      signal.throwIfAborted();
      const detail = redact(message(error), config);
      failures.push(`${model.id}: ${detail}`);
      const missing = unavailableOmniProvider(detail);
      if (omniGatewayAuthFailure(detail)) throw new Error(`OmniRoute rejected its gateway API key. Update it in Connections. ${detail}`);
      if (missing || /429|rate.?limit|quota|only be used from within OpenCode/i.test(detail)) unavailable.add(provider);
      if (missing) unavailable.add(missing);
      onProgress(`${model.id} is unavailable; checking the next free route. ${detail}`, index + 1, candidates.length);
    }
  }
  const help = [...unavailable].map(omniProviderHelp).join(' ');
  throw new Error(`OmniRoute is running, but coding verification did not complete. ${failures.slice(-3).join(' ')} ${help}`.trim());
}

export function discoveryCandidates(config: GatewayConfig): GatewayConfig[] {
  let configured: URL;
  try {
    configured = new URL(config.omniRouteUrl);
  } catch {
    throw new Error("Enter a valid OmniRoute HTTP or HTTPS URL.");
  }
  if (
    !["http:", "https:"].includes(configured.protocol) ||
    configured.username ||
    configured.password
  )
    throw new Error("Use an HTTP or HTTPS URL without embedded credentials.");
  configured.search = "";
  configured.hash = "";
  // A dashboard origin must resolve to its API before any auth checks.
  if (configured.pathname === '/') configured.pathname = '/v1';
  const base = configured.href.replace(/\/+$/, "");
  const candidates = [base];
  if (["localhost", "127.0.0.1"].includes(configured.hostname)) {
    const alias = new URL(configured);
    alias.hostname =
      configured.hostname === "localhost" ? "127.0.0.1" : "localhost";
    candidates.push(alias.href.replace(/\/+$/, ""));
  }
  return [...new Set(candidates)].map((url) => ({
    ...config,
    omniRouteUrl: url,
  }));
}

export async function autoConfigureGateways(
  config: GatewayConfig,
  signal: AbortSignal,
  onProgress: (progress: SetupProgress) => void,
): Promise<{ config: GatewayConfig; providers: ProviderSetup[] }> {
  const timeout = (duration: number) =>
    AbortSignal.any([signal, AbortSignal.timeout(duration)]);
  const emit = (progress: SetupProgress) => {
    if (!signal.aborted)
      onProgress({ ...progress, detail: redact(progress.detail, config) });
  };
  const run = async (
    provider: "omniroute" | "kilo",
  ): Promise<ProviderSetup> => {
    let models: GatewayModel[] = [];
    let selected = config;
    let lastError = "No models were returned by the gateway.";
    try {
      emit({
        provider,
        phase: "discovering",
        detail:
          provider === "kilo"
            ? "Loading the current Kilo catalog…"
            : "Discovering your configured gateway…",
      });
      if (provider === "kilo") models = await listKiloModels(timeout(10_000), config);
      else {
        for (const candidate of discoveryCandidates(config)) {
          signal.throwIfAborted();
          emit({
            provider,
            phase: "discovering",
            detail: `Checking ${candidate.omniRouteUrl}`,
          });
          try {
            models = await listOmniRouteModels(candidate, timeout(5_000));
            if (models.length) {
              selected = candidate;
              break;
            }
          } catch (error) {
            lastError = message(error);
            if (/401|403|unauthorized|invalid.*key/i.test(lastError)) break;
          }
        }
      }
      signal.throwIfAborted();
      if (!models.length) throw new Error(lastError);
      if (provider === 'omniroute') {
        const existing = models.find(model => model.id === config.omniRouteModel);
        if (existing && !isFreeModel(existing)) throw new Error(`Catalog loaded. ${existing.name || existing.id} is not a verified free route. Your selection was kept; use it directly or click One-click OmniRoute setup to find a free route.`);
        const { model, result } = await verifyOmniRouteModels(selected, models, signal, (detail, attempt, total) => emit({ provider, phase: 'testing', detail, attempt, total }));
        const detail = `Verified coding actions via ${result.model}. Ready for coding goals.`;
        emit({ provider, phase: 'ready', detail });
        return { provider, models, verified: true, detail, config: { omniRouteUrl: selected.omniRouteUrl, omniRouteModel: model.id, omniRouteKey: config.omniRouteKey } };
      }
      const selectedId = config.kiloModel;
      const existingSelection = models.find((model) => model.id === selectedId);
      if (existingSelection && !isFreeModel(existingSelection))
        throw new Error(
          `Catalog loaded. ${existingSelection.name || existingSelection.id} is not a verified free route. Your selection was kept; use your provider credentials to send prompts directly.`,
        );
      const candidates = models.filter(model => model.id === (existingSelection?.id || 'kilo-auto/free'));
      if (!candidates.length)
        throw new Error(
          "Catalog loaded, but no eligible free text route was found. Choose a model manually.",
        );
      for (let index = 0; index < candidates.length; index++) {
        signal.throwIfAborted();
        const model = candidates[index];
        emit({
          provider,
          phase: "testing",
          detail: `Verifying ${model.id}`,
          attempt: index + 1,
          total: candidates.length,
        });
        const probeConfig = {
          ...selected,
          kiloModel: model.id,
        };
        try {
          const result = await sendGatewayPrompt(
            provider,
            KILO_CODING_PROBE,
            probeConfig,
            { signal: timeout(20_000), maxTokens: 1024, firstAnswerTimeoutMs: 5_000, validateResponse: validateKiloCodingProbe },
          );
          signal.throwIfAborted();
          validateKiloCodingProbe(result.text);
          const detail = `Verified coding actions via ${result.model}. Ready for coding goals.`;
          emit({ provider, phase: "ready", detail });
          return {
            provider,
            models,
            verified: true,
            detail,
            config: { kiloModel: model.id, kiloKey: config.kiloKey },
          };
        } catch (error) {
          signal.throwIfAborted();
          lastError = message(error);
          emit({
            provider,
            phase: "testing",
            detail: `${model.id}: ${lastError}`,
            attempt: index + 1,
            total: candidates.length,
          });
          // Rate limits and quotas affect the service, so avoid repeated retries.
          if (
            /429|rate.?limit|too many requests|quota|credits|payment/i.test(
              lastError,
            )
          )
            break;
        }
      }
      throw new Error(`No tested free route responded. ${lastError}`);
    } catch (error) {
      signal.throwIfAborted();
      const detail = redact(message(error), config);
      emit({ provider, phase: "attention", detail });
      return { provider, models, verified: false, detail, config: {} };
    }
  };
  const providers = await Promise.all([run("omniroute"), run("kilo")]);
  signal.throwIfAborted();
  return {
    config: providers.reduce(
      (next, result) => ({ ...next, ...result.config }),
      config,
    ),
    providers,
  };
}
