import type { GatewayProgress } from "./gatewayStream.ts";

export type CodexStatus = { installed: boolean; connected: boolean; plan?: string; pending?: boolean; error?: string; authUrl?: string; models: { id: string; name: string; isDefault: boolean }[] };
export function codexModel(): string {
  try { return localStorage.getItem("ahpah_codex_model") || ""; } catch { return ""; }
}
export function selectCodexModel(model: string) {
  localStorage.setItem("ahpah_codex_model", model);
  window.dispatchEvent(new Event("ahpah-gateway-config-changed"));
}
async function request(path: string, method = "GET", signal?: AbortSignal): Promise<CodexStatus> {
  const response = await fetch(`/api/codex/${path}`, { method, signal: signal ?? AbortSignal.timeout(150_000), redirect: "error" });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Could not reach local Codex. Start the app using Start AhPah.bat.");
  return value;
}
export const getCodexStatus = (signal?: AbortSignal) => request("status", "GET", signal);
export const connectCodex = () => request("connect", "POST");
export const cancelCodexLogin = () => request("cancel", "POST");
export async function sendCodexPrompt(prompt: string, options: { signal?: AbortSignal; messages?: { role: string; content: string }[]; onProgress?: (progress: GatewayProgress) => void } = {}) {
  const signal = AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(610_000)]);
  const model = codexModel();
  if (!model) throw new Error("Connect Codex with ChatGPT in Settings first.");
  const response = await fetch("/api/codex/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: options.messages?.length ? options.messages : [{ role: "user", content: prompt }] }), signal, redirect: "error" });
  if (!response.ok) { const value = await response.json(); throw new Error(value.error || "Codex request failed."); }
  if (!response.body) throw new Error("Codex returned no response stream.");
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
  let result: { text: string; model: string; tokens: number } | undefined;
  const parse = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.error) throw new Error(event.error);
    if (event.result) result = event.result;
    else options.onProgress?.({ text: event.text || "", phase: event.phase || "waiting", model });
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) { parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
      if (done) { parse(buffer); break; }
      if (buffer.length > 2_000_000) throw new Error("Codex response exceeded the output limit.");
    }
    if (!result?.text?.trim()) throw new Error("Codex did not return a completed answer.");
    return result;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
