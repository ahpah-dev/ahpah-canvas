import type { GatewayModel } from "./gateways.ts";

export function isTextModel(model: GatewayModel) {
  const outputs = model.architecture?.output_modalities;
  if (Array.isArray(outputs) && outputs.length && !outputs.includes("text"))
    return false;
  const modality = model.architecture?.modality;
  return (
    typeof modality !== "string" ||
    !modality.includes("->") ||
    modality.split("->")[1].includes("text")
  );
}

const priceAmount = (price: unknown) => {
  if (
    (typeof price !== "number" && typeof price !== "string") ||
    (typeof price === "string" && !price.trim())
  )
    return undefined;
  const amount = Number(price);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
};

const chargedPrices = (model: GatewayModel) =>
  Object.entries(model.pricing || {}).filter(([key]) => key !== "discount");

export function isPaidModel(model: GatewayModel) {
  return (
    model.isFree === false ||
    chargedPrices(model).some(([, price]) => (priceAmount(price) || 0) > 0)
  );
}

export function isFreeModel(model: GatewayModel) {
  if (
    isPaidModel(model) ||
    chargedPrices(model).some(([, price]) => priceAmount(price) === undefined)
  )
    return false;
  return (
    model.isFree === true ||
    (priceAmount(model.pricing?.prompt) === 0 &&
      priceAmount(model.pricing?.completion) === 0) ||
    /(^|[\s/:_-])free($|[\s/:_-])/i.test(`${model.id} ${model.name || ""}`)
  );
}

// A provider's retirement date is authoritative, even if the route still appears
// in its catalogue. Invalid retirement metadata must not become a recommendation.
export function isModelAvailable(model: GatewayModel, now = new Date()) {
  const expiration = model.expiration_date;
  if (expiration === undefined || expiration === null || expiration === "")
    return true;
  if (typeof expiration !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expiration))
    return false;
  const expirationTime = Date.parse(`${expiration}T00:00:00Z`);
  return (
    Number.isFinite(expirationTime) &&
    new Date(expirationTime).toISOString().slice(0, 10) === expiration &&
    expiration > now.toISOString().slice(0, 10)
  );
}

export const isAutomaticModel = (model: GatewayModel) =>
  /^(?:kilo-auto\/|auto\/)/i.test(model.id);
const release = (model: GatewayModel) =>
  typeof model.created === "number" && Number.isFinite(model.created)
    ? model.created
    : 0;

// Catalog timestamps determine freshness; response ordering and saved choices do not.
export function sortModelCatalog(models: GatewayModel[], now = new Date()) {
  const seen = new Set<string>();
  return models
    .filter((model) =>
      model &&
      typeof model.id === "string" &&
      !!model.id.trim() &&
      isTextModel(model) &&
      isModelAvailable(model, now),
    )
    .sort(
      (a, b) =>
        release(b) - release(a) ||
        (a.name || a.id).localeCompare(b.name || b.id),
    )
    .filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    });
}

// Exact catalog matches only: never manufacture an unavailable provider/model ID.
export function currentModelRecommendations(models: GatewayModel[], now = new Date()) {
  const sorted = sortModelCatalog(models, now).filter(
    (model) => !isAutomaticModel(model),
  );
  const requested = [
    /^gpt-\d+(?:\.\d+)*-luna(?::free)?$/,
    /^glm-\d+(?:\.\d+)*(?::free)?$/,
  ].flatMap((family) => {
    const match = sorted.find((model) =>
      family.test(model.id.split("/").at(-1) || ""),
    );
    return match ? [match] : [];
  });
  const seen = new Set(requested.map((model) => model.id));
  return [
    ...requested,
    ...sorted.filter((model) => !seen.has(model.id) && release(model) > 0),
  ].slice(0, 6);
}

export function catalogModelLabel(model: GatewayModel) {
  return `${model.name || model.id}${isFreeModel(model) ? " · Free" : isPaidModel(model) ? " · Paid" : ""}`;
}
