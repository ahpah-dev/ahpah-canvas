import {
  listKiloModels,
  listOmniRouteModels,
  sendGatewayPrompt,
  type GatewayConfig,
  type GatewayModel,
} from "./gateways.ts";
import { isFreeModel, sortModelCatalog } from "./modelCatalog.ts";

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
  return [config.omniRouteKey, config.kiloKey]
    .filter(Boolean)
    .reduce((value, key) => value.split(key).join("[redacted]"), text)
    .slice(0, 500);
}

export function freeModelCandidates(
  models: GatewayModel[],
  preferred = "",
): GatewayModel[] {
  return sortModelCatalog(models)
    .filter(isFreeModel)
    .sort((a, b) => {
      const rank = (model: GatewayModel) =>
        model.id === preferred ? 3 : model.id === "auto/best-free" ? 2 : 0;
      return (b.created || 0) - (a.created || 0) || rank(b) - rank(a);
    })
    .slice(0, 6);
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
  const base = configured.href.replace(/\/+$/, "");
  const candidates = [
    base,
    ...(configured.pathname === "/" ? [`${base}/v1`] : []),
  ];
  if (["localhost", "127.0.0.1"].includes(configured.hostname)) {
    const alias = new URL(configured);
    alias.hostname =
      configured.hostname === "localhost" ? "127.0.0.1" : "localhost";
    candidates.push(alias.href.replace(/\/+$/, ""));
    if (alias.pathname === "/")
      candidates.push(`${alias.href.replace(/\/+$/, "")}/v1`);
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
      const selectedId =
        provider === "kilo" ? config.kiloModel : config.omniRouteModel;
      const existingSelection = models.find((model) => model.id === selectedId);
      if (existingSelection && !isFreeModel(existingSelection))
        throw new Error(
          `Catalog loaded. ${existingSelection.name || existingSelection.id} is not a verified free route. Your selection was kept; use your provider credentials to send prompts directly.`,
        );
      const candidates =
        provider === "kilo"
          ? models.filter(
              (model) =>
                model.id === (existingSelection?.id || "kilo-auto/free"),
            )
          : freeModelCandidates(models, config.omniRouteModel);
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
          ...(provider === "kilo"
            ? { kiloModel: model.id }
            : { omniRouteModel: model.id }),
        };
        try {
          const result = await sendGatewayPrompt(
            provider,
            "Reply with the single word READY.",
            probeConfig,
            { signal: timeout(20_000), maxTokens: 1024, firstAnswerTimeoutMs: 5_000 },
          );
          signal.throwIfAborted();
          const detail = `Verified ${result.model}. Ready for real prompts.`;
          emit({ provider, phase: "ready", detail });
          return {
            provider,
            models,
            verified: true,
            detail,
            config:
              provider === "kilo"
                ? { kiloModel: model.id, kiloKey: config.kiloKey }
                : {
                    omniRouteUrl: selected.omniRouteUrl,
                    omniRouteModel: model.id,
                    omniRouteKey: config.omniRouteKey,
                  },
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
