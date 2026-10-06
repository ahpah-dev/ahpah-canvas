import type { AgentSender, EngineeringProvider } from "../types/engineering.ts";
import { loadGatewayConfig, sendGatewayPrompt, supportsLocalBridge, type GatewayConfig } from "./gateways.ts";
import { codexModel, sendCodexPrompt } from "./codexConnection.ts";

/** Coding uses the user's current provider configuration and the same live routes as canvas cards. */
export function engineeringProviders(config: GatewayConfig): EngineeringProvider[] {
  const providers: EngineeringProvider[] = [];
  if (supportsLocalBridge() && codexModel()) providers.push({ id: "codex", label: "Codex · ChatGPT", model: codexModel() });
  if (supportsLocalBridge() && config.kiloModel.trim())
    providers.push({ id: "kilo", label: config.kiloModel === "kilo-auto/free" ? "Kilo Auto Free" : "Kilo Gateway", model: config.kiloModel });
  if (config.omniRouteModel.trim())
    providers.push({ id: "omniroute", label: "OmniRoute", model: config.omniRouteModel });
  for (const provider of config.customProviders || []) {
    if (provider.model.trim())
      providers.push({ id: `custom:${provider.id}`, label: provider.name, model: provider.model });
  }
  return providers;
}

export const sendEngineeringStep: AgentSender = async (request) => {
  if (request.providerId === "codex") return sendCodexPrompt(request.prompt, request);
  const config = loadGatewayConfig();
  const custom = request.providerId.startsWith("custom:");
  if (!custom && !["kilo", "omniroute"].includes(request.providerId))
    throw new Error("Choose a configured coding provider in Settings.");
  return sendGatewayPrompt(custom ? "custom" : request.providerId as "kilo" | "omniroute", request.prompt, config, {
    runId: request.runId,
    signal: request.signal,
    messages: request.messages,
    maxTokens: 8192,
    providerId: custom ? request.providerId.slice("custom:".length) : undefined,
    onProgress: request.onProgress,
    routing: request.routing,
    validateResponse: request.validateResponse,
  });
};
