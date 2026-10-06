// Shared by the browser and local bridge so slow completions have the same budget.
export const COMPLETION_TIMEOUT_MS = 180_000;
export const LOCAL_COMPLETION_TIMEOUT_MS = 600_000;
export const CATALOG_TIMEOUT_MS = 15_000;
export const AUTO_FREE_FIRST_ANSWER_MS = 30_000;
export const HOSTED_CODING_MAX_REQUESTS = 12;
export const COMPLETION_TIMEOUT_MESSAGE =
  "The model did not finish within 3 minutes. Try a shorter prompt or choose another model. Any partial answer has been kept.";
export const LOCAL_COMPLETION_TIMEOUT_MESSAGE =
  "The local model did not finish within 10 minutes. Keep Ollama running, try a shorter prompt or a smaller installed model, and retry. Any partial answer has been kept.";

/** Only the app's canonical local Ollama connection receives the local compute budget. */
export function isLocalOllamaUrl(normalizedBaseUrl: string): boolean {
  return normalizedBaseUrl === 'http://127.0.0.1:11434/v1';
}
