export const LOCAL_MODELS_BASE_URL = 'http://127.0.0.1:11434/v1';

export interface LocalModel { id: string; name: string; size: number; isLocal?: boolean; capabilities?: string[] }
export interface LocalModelsStatus { available: boolean; models: LocalModel[]; version?: string; error?: string }
export interface LocalModelsProgress { phase: string; detail: string; completed?: number; total?: number; percent?: number }

const localOnlyMessage = 'Local AI runs in the local app. Launch Start AhPah.bat on your computer to connect Ollama.';
const cloudTag = /(?:^|[._-])cloud(?:$|[._-])/i;

/** Pull names are plain references from ollama.com/library, never URLs or alternate registries. */
export function validLocalModelPullName(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 128 || !/^[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)?$/i.test(value)) return false;
  return !cloudTag.test(value.split(':')[1] || '');
}

function statusValue(value: unknown): LocalModelsStatus {
  if (!value || typeof value !== 'object') throw new Error('Local AI returned invalid connection data. Restart the app and retry.');
  const data = value as Record<string, unknown>;
  if (typeof data.available !== 'boolean' || !Array.isArray(data.models) || data.models.length > 1000) throw new Error('Local AI returned invalid model data.');
  const models = data.models.map((value: unknown): LocalModel => {
    if (!value || typeof value !== 'object') throw new Error('Local AI returned invalid model data.');
    const model = value as Record<string, unknown>;
    if (typeof model.id !== 'string' || !model.id || model.id.length > 256 || typeof model.name !== 'string' || model.name.length > 256 || typeof model.size !== 'number' || !Number.isSafeInteger(model.size) || model.size < 0) throw new Error('Local AI returned invalid model data.');
    return { id: model.id, name: model.name, size: model.size, ...(model.isLocal === true ? { isLocal: true } : {}), ...(Array.isArray(model.capabilities) ? { capabilities: model.capabilities.filter((capability): capability is string => typeof capability === 'string' && capability.length <= 64).slice(0, 32) } : {}) };
  });
  return { available: data.available, models, ...(typeof data.version === 'string' ? { version: data.version.slice(0, 64) } : {}), ...(typeof data.error === 'string' ? { error: data.error.slice(0, 600) } : {}) };
}

async function boundedJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error(localOnlyMessage);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = ''; let bytes = 0;
  const cancel = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (value) bytes += value.byteLength;
      if (bytes > 1024 * 1024) throw new Error('Local AI returned oversized connection data.');
      text += decoder.decode(value, { stream: !done });
      if (done) break;
    }
    try { return JSON.parse(text); } catch { throw new Error(localOnlyMessage); }
  } finally { signal?.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function discoverLocalModels(signal?: AbortSignal): Promise<LocalModelsStatus> {
  signal?.throwIfAborted();
  const operationSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000);
  try {
    const response = await fetch('/api/local-models/status', { signal: operationSignal, redirect: 'error', cache: 'no-store' });
    if (!response.ok) return { available: false, models: [], error: localOnlyMessage };
    return statusValue(await boundedJson(response, operationSignal));
  } catch (error) {
    signal?.throwIfAborted();
    return { available: false, models: [], error: error instanceof Error && /Local AI returned/.test(error.message) ? error.message : localOnlyMessage };
  }
}

/** Installation and downloads happen only after this explicit setup request. */
export async function setupLocalModels(options: { model?: string } = {}, onProgress?: (progress: LocalModelsProgress) => void, signal?: AbortSignal): Promise<LocalModelsStatus> {
  signal?.throwIfAborted();
  if (options.model !== undefined && !validLocalModelPullName(options.model)) throw new Error('Enter a local model name from ollama.com/library, such as model:tag. Cloud models and URLs are not supported.');
  const operationSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(35 * 60_000)]) : AbortSignal.timeout(35 * 60_000);
  const response = await fetch('/api/local-models/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.model ? { model: options.model } : {}), signal: operationSignal, redirect: 'error' });
  if (!response.ok) {
    const data = await boundedJson(response, operationSignal).catch(() => null) as { error?: unknown } | null;
    operationSignal.throwIfAborted();
    throw new Error(typeof data?.error === 'string' ? data.error.slice(0, 600) : localOnlyMessage);
  }
  if (!response.body) throw new Error('Local AI returned no setup progress. Restart the app and retry.');
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let buffer = ''; let bytes = 0; let result: LocalModelsStatus | undefined;
  const parse = (line: string) => {
    if (!line.trim()) return;
    let value: unknown;
    try { value = JSON.parse(line); } catch { throw new Error('Local AI returned invalid setup progress.'); }
    if (!value || typeof value !== 'object') throw new Error('Local AI returned invalid setup progress.');
    const event = value as Record<string, unknown>;
    if (typeof event.error === 'string') throw new Error(event.error.slice(0, 600));
    if (event.result !== undefined) { result = statusValue(event.result); return; }
    if (typeof event.phase === 'string' && typeof event.detail === 'string') {
      const progress: LocalModelsProgress = { phase: event.phase.slice(0, 64), detail: event.detail.slice(0, 600) };
      for (const key of ['completed', 'total', 'percent'] as const) if (typeof event[key] === 'number' && Number.isFinite(event[key]) && event[key] >= 0) progress[key] = key === 'percent' ? Math.min(100, event[key]) : event[key];
      onProgress?.(progress);
    }
  };
  const cancel = () => { void reader.cancel(operationSignal.reason).catch(() => {}); };
  operationSignal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      operationSignal.throwIfAborted();
      const { value, done } = await reader.read(); operationSignal.throwIfAborted();
      if (value) bytes += value.byteLength;
      if (bytes > 8 * 1024 * 1024) throw new Error('Local AI returned too much setup progress. Retry to resume your download.');
      buffer += decoder.decode(value, { stream: !done });
      let index: number;
      while ((index = buffer.indexOf('\n')) >= 0) { if (index > 1024 * 1024) throw new Error('Local AI returned oversized setup progress.'); parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1); }
      if (buffer.length > 1024 * 1024) throw new Error('Local AI returned oversized setup progress.');
      if (done) { parse(buffer); break; }
    }
    if (!result) throw new Error('Local AI setup ended before the connection was confirmed. Retry setup.');
    return result;
  } finally { operationSignal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
