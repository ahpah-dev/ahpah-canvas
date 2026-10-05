import type { GatewayModel } from "./gateways.ts";
import { isAutomaticModel, sortModelCatalog } from "./modelCatalog.ts";

const unhealthyUntil = new Map<string, number>();
export const clearKiloRouteHealth = () => unhealthyUntil.clear();
export const markKiloRouteUnhealthy = (id: string) => unhealthyUntil.set(id, Date.now() + 300_000);
export const isKiloRouteHealthy = (id: string) => (unhealthyUntil.get(id) || 0) <= Date.now();

// Automatic fallback requires explicit price evidence, not a "free" name.
export function verifiedFreeFallbacks(models: GatewayModel[], excluded: Set<string> = new Set(), now = new Date()) {
  return sortModelCatalog(models, now).filter((model) => {
    const pricing = model.pricing;
    const zero = (price: unknown) =>
      (typeof price === "number" || (typeof price === "string" && !!price.trim())) && Number(price) === 0;
    if (!pricing || !zero(pricing.prompt) || !zero(pricing.completion)) return false;
    if (model.isFree === false || Object.entries(pricing).some(([key, price]) => key !== "discount" && !zero(price))) return false;
    return !isAutomaticModel(model) && !excluded.has(model.id) && isKiloRouteHealthy(model.id);
  });
}

export function fastReasoning(model: GatewayModel) {
  if (model.id === "kilo-auto/free") return { effort: "low" };
  if (!Array.isArray(model.supported_parameters) || !model.supported_parameters.includes("reasoning")) return undefined;
  const variants = model.opencode?.variants;
  const value = ["instant", "none", "minimal", "low"]
    .map((variant) => variants?.[variant]?.reasoning)
    .find((reasoning) => reasoning && ["none", "minimal", "low"].includes(reasoning.effort || ""));
  if (!value) return undefined;
  return {
    effort: value.effort,
    ...(typeof value.enabled === "boolean" ? { enabled: value.enabled } : {}),
  };
}
