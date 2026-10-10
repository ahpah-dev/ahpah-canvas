import { loadGatewayConfig, saveGatewayConfig, supportsLocalBridge, listOmniRouteModels, type GatewayConfig, type GatewayModel } from './gateways.ts';
import { discoveryCandidates, verifyOmniRouteModels } from './autoConfiguration.ts';
import { redactProviderError } from './providerConfig.ts';

export interface OmniRouteSetupResult { config: GatewayConfig; models: GatewayModel[]; model: string }
export interface OmniRouteSetupProgress { phase: string; detail: string }
export async function startLocalOmniRoute(signal: AbortSignal, onProgress: (progress: OmniRouteSetupProgress) => void) {
  const response = await fetch('/api/omniroute/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal, redirect: 'error' });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error((typeof data?.error === 'string' ? data.error : data?.error?.message) || 'Restart the local app to enable OmniRoute installation.');
  }
  if (!response.body) throw new Error('The local setup service returned no progress stream. Restart the app and retry.');
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let ready = false;
  const parse = (line: string) => {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); } catch { throw new Error('The local setup service returned invalid progress data. Restart the local app and retry.'); }
    if (!event || typeof event !== 'object') throw new Error('The local setup service returned invalid progress data.');
    if (event.error) throw new Error(event.error);
    if (event.detail) onProgress({ phase: event.phase, detail: event.detail });
    if (event.result?.baseUrl === 'http://127.0.0.1:20128/v1') ready = true;
  };
  const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read(); signal.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 32_000) throw new Error('OmniRoute setup returned oversized progress data.');
      let index: number;
      while ((index = buffer.indexOf('\n')) >= 0) { parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1); }
      if (done) { parse(buffer); break; }
    }
    if (!ready) throw new Error('OmniRoute setup ended before the gateway was ready. Retry setup.');
  } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function oneClickOmniRouteSetup(config: GatewayConfig, signal: AbortSignal, onProgress: (progress: OmniRouteSetupProgress) => void): Promise<OmniRouteSetupResult> {
  if (!supportsLocalBridge()) throw new Error('OmniRoute installation runs in the local app. Launch Start AhPah.bat on your PC, then use One-click OmniRoute setup.');
  signal.throwIfAborted();
  const current = { ...config, transport: 'bridge' as const, omniRouteUrl: config.omniRouteUrl.trim() || 'http://localhost:20128/v1' };
  const candidates = discoveryCandidates(current);
  const url = new URL(current.omniRouteUrl);
  const detail = (error: unknown) => redactProviderError(error instanceof Error ? error.message : 'Connection failed.', [config.omniRouteKey, config.kiloKey, ...(config.customProviders || []).map(provider => provider.apiKey)]);
  try {
    // Only manage the standard local service. Custom ports and remote gateways keep their existing deployment.
    if (['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '20128' && url.protocol === 'http:') await startLocalOmniRoute(signal, onProgress);
    let discovered: GatewayConfig | undefined;
    let models: GatewayModel[] = [];
    let lastError = 'No gateway was found.';
    for (const candidate of candidates) {
      signal.throwIfAborted();
      onProgress({ phase: 'discovering', detail: `Loading live models from ${candidate.omniRouteUrl}…` });
      try {
        models = await listOmniRouteModels(candidate, AbortSignal.any([signal, AbortSignal.timeout(5000)]), true);
        discovered = candidate;
        break;
      } catch (error) {
        signal.throwIfAborted(); lastError = detail(error);
        if (/401|403|unauthorized|invalid.*key/i.test(lastError)) throw new Error('OmniRoute needs its API key. Add your gateway key in Connections, then click setup again.');
      }
    }
    if (!discovered) throw new Error(`Could not connect to OmniRoute. ${lastError}`);
    if (!models.length) throw new Error('OmniRoute is running, but no connected models are available. Open its dashboard, connect a provider, then retry setup.');
    // Only probe actual catalog models. A virtual free route can still pick a
    // provider whose credentials are inactive, even when other free routes work.
    const { model, result } = await verifyOmniRouteModels(discovered, models, signal, message => onProgress({ phase: 'testing', detail: detail(new Error(message)) }));
    signal.throwIfAborted();
    // Merge the latest settings so another provider edited during installation is preserved.
    const saved = { ...loadGatewayConfig(), transport: 'bridge' as const, omniRouteUrl: discovered.omniRouteUrl, omniRouteKey: config.omniRouteKey, omniRouteModel: model.id };
    saveGatewayConfig(saved);
    onProgress({ phase: 'ready', detail: `Connected to ${result.model}. Coding actions verified and settings saved.` });
    return { config: saved, models, model: result.model };
  } catch (error) { signal.throwIfAborted(); throw new Error(detail(error)); }
}
