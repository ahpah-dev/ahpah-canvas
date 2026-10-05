export type CustomProvider = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  stream: boolean;
};

export type GatewayTransport = "auto" | "bridge" | "direct";

/** A base URL includes the provider's API prefix, e.g. /v1, not /chat/completions. */
export function normalizeProviderUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a complete HTTP or HTTPS API base URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Use an HTTP or HTTPS API URL without embedded credentials.");
  if (url.search || url.hash)
    throw new Error("The API base URL cannot include query parameters or a fragment.");
  if (/\/(chat\/completions|models)\/?$/.test(url.pathname))
    throw new Error("Enter the API base URL, without /models or /chat/completions.");
  return url.href.replace(/\/+$/, "");
}

export function normalizeCustomProviders(value: unknown): CustomProvider[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" ||
      !["id", "name", "baseUrl", "apiKey", "model"].every((key) => typeof item[key] === "string") ||
      !item.id.trim() || ids.has(item.id)) return [];
    ids.add(item.id);
    return [{
      id: item.id,
      name: item.name.trim().slice(0, 80) || "Custom API",
      baseUrl: item.baseUrl.trim(),
      apiKey: item.apiKey,
      model: item.model.trim(),
      stream: item.stream !== false,
    }];
  }).slice(0, 20);
}

export function redactProviderError(message: string, keys: string[]): string {
  return keys.filter(Boolean).reduce((text, key) => text.split(key).join("[redacted]"), message).slice(0, 1000);
}
