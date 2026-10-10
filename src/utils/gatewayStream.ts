import { GatewayServiceError, gatewayErrorStatus } from "./gatewayErrors.ts";

export type GatewayProgress = {
  text: string;
  phase: "waiting" | "reasoning" | "answer" | "retrying";
  detail?: string;
  model?: string;
};

/** Read OpenAI-compatible SSE without retaining or displaying reasoning text. */
export async function readGatewayStream(
  response: Response,
  signal: AbortSignal,
  onProgress?: (progress: GatewayProgress) => void,
) {
  if (!response.body) throw new Error("The gateway returned no response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventLines: string[] = [];
  let text = "";
  let refusal = "";
  let model: string | undefined;
  let usage: { total_tokens?: number } | undefined;
  let finishReason: string | null = null;
  let hasChoice = false;
  let hasReasoning = false;
  const tools = new Map<number, { id: string; type: string; function: { name: string; arguments: string } }>();
  let done = false;
  let lastUpdate = 0;
  let lastPhase = "";
  let lastText = "";
  const emit = (force = false) => {
    const phase = text || tools.size ? "answer" : hasReasoning ? "reasoning" : "waiting";
    if (force || phase !== lastPhase || (text !== lastText && Date.now() - lastUpdate >= 100)) {
      onProgress?.({ text, phase, model });
      lastUpdate = Date.now();
      lastPhase = phase;
      lastText = text;
    }
  };
  const dispatch = () => {
    if (!eventLines.length) return;
    const data = eventLines.join("\n");
    eventLines = [];
    if (data.length > 1_000_000) throw new Error("The gateway sent an oversized stream event.");
    if (data.trim() === "[DONE]") { done = true; return; }
    let chunk;
    try { chunk = JSON.parse(data); }
    catch { throw new Error("The gateway sent an invalid stream event. Any partial answer has been kept."); }
    if (!chunk || typeof chunk !== "object")
      throw new Error("The gateway sent an invalid stream event.");
    if (chunk.error)
      throw new GatewayServiceError(`Gateway error: ${typeof chunk.error === "string" ? chunk.error : chunk.error.message || "Provider disconnected."}`, gatewayErrorStatus(chunk.error));
    if (typeof chunk.model === "string") model = chunk.model;
    if (chunk.usage) usage = chunk.usage;
    if (chunk.choices !== undefined && !Array.isArray(chunk.choices))
      throw new Error("The gateway sent an invalid stream event.");
    const choice = chunk.choices?.find((item: { index?: number } | null) => item && (item.index === 0 || item.index === undefined));
    if (!choice) return; // Usage-only final chunks have no choices.
    hasChoice = true;
    if (choice.error || choice.finish_reason === "error")
      throw new GatewayServiceError(`Gateway error: ${typeof choice.error === 'string' ? choice.error : choice.error?.message || "Provider disconnected before completing the answer."}`, gatewayErrorStatus(choice.error));
    const delta = choice.delta || choice.message || {};
    if (typeof delta.content === "string") text += delta.content;
    if (typeof delta.refusal === "string") refusal += delta.refusal;
    hasReasoning ||= !!(delta.reasoning || delta.reasoning_content || delta.reasoning_details?.length);
    if (Array.isArray(delta.tool_calls)) {
      for (const [position, part] of delta.tool_calls.entries()) {
        const index = part?.index ?? position;
        if (!Number.isSafeInteger(index) || index < 0 || index >= 8) throw new Error('The gateway returned too many coding tools.');
        const call = tools.get(index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
        if (typeof part.id === 'string') call.id = part.id;
        if (typeof part.function?.name === 'string') {
          const name = part.function.name;
          // Some compatible servers repeat the full name or send a cumulative
          // snapshot. OpenAI-style fragments still concatenate normally.
          if (!choice.delta || name.startsWith(call.function.name)) call.function.name = name;
          else call.function.name += name;
        }
        if (typeof part.function?.arguments === 'string') {
          if (!choice.delta) call.function.arguments = part.function.arguments;
          else call.function.arguments += part.function.arguments;
        } else if (part.function?.arguments && typeof part.function.arguments === 'object' && !Array.isArray(part.function.arguments)) {
          const argumentsJson = JSON.stringify(part.function.arguments);
          if (call.function.arguments && call.function.arguments !== argumentsJson) throw new Error('The gateway mixed incompatible coding argument fragments.');
          call.function.arguments = argumentsJson;
        }
        if (call.function.arguments.length > 280_000 || call.function.name.length > 100) throw new Error('The gateway returned oversized coding tools.');
        tools.set(index, call);
      }
    }
    if (typeof choice.finish_reason === "string") finishReason = choice.finish_reason;
    emit();
  };
  const line = (value: string) => {
    if (!value) dispatch();
    else if (value.startsWith("data:")) eventLines.push(value.slice(5).replace(/^ /, ""));
  };
  const consume = (final = false) => {
    // Handle CRLF, LF, and CR delimiters, including CRLF split across reads.
    let start = 0;
    for (let index = 0; index < buffer.length; index++) {
      if (buffer[index] !== "\n" && buffer[index] !== "\r") continue;
      if (buffer[index] === "\r" && index === buffer.length - 1 && !final) break;
      line(buffer.slice(start, index));
      if (buffer[index] === "\r" && buffer[index + 1] === "\n") index++;
      start = index + 1;
      if (done) break;
    }
    buffer = buffer.slice(start);
    if (final && !done) { if (buffer) line(buffer); buffer = ""; dispatch(); }
    if (buffer.length > 1_000_000)
      throw new Error("The gateway sent an oversized stream event.");
  };
  const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (!done) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      buffer += decoder.decode(part.value, { stream: !part.done });
      consume(part.done);
      // Progress callbacks can request Stop while this chunk also contains DONE.
      // Honour cancellation before returning or accepting any completed actions.
      signal.throwIfAborted();
      if (part.done) break;
    }
    if (!done && !finishReason)
      throw new GatewayServiceError("The gateway stream ended before the answer was complete. Any partial answer has been kept. Try again.", 502);
    return {
      model,
      usage,
      choices: hasChoice ? [{
        message: { content: text, refusal, reasoning: hasReasoning, tool_calls: [...tools.entries()].sort(([a], [b]) => a - b).map(([, call]) => call) },
        finish_reason: finishReason,
      }] : [],
    };
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    // Flush text even when a later provider event fails.
    emit(true);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
