import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Eye, EyeOff, LoaderCircle, PlugZap, Plus, RefreshCw, Trash2 } from "lucide-react";
import { listCustomModels, type CustomProvider, type GatewayConfig, type GatewayModel } from "../../utils/gateways";
import { redactProviderError } from "../../utils/providerConfig";
import { ModelSelector } from "./ModelSelector";

type Catalog = { models: GatewayModel[]; checking: boolean; error: string; loaded: boolean };
const emptyCatalog: Catalog = { models: [], checking: false, error: "", loaded: false };

export function CustomProvidersPanel({ providers, config, onChange, onUse }: {
  providers: CustomProvider[];
  config: GatewayConfig;
  onChange: (providers: CustomProvider[]) => void;
  onUse: (provider: CustomProvider) => void;
}) {
  const [catalogs, setCatalogs] = useState<Record<string, Catalog>>({});
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const controllers = useRef(new Map<string, AbortController>());
  const providersRef = useRef(providers);
  useLayoutEffect(() => { providersRef.current = providers; }, [providers]);
  useEffect(() => {
    const requests = controllers.current;
    return () => { for (const controller of requests.values()) controller.abort(); };
  }, []);
  const update = (id: string, patch: Partial<CustomProvider>) => {
    if (patch.baseUrl !== undefined || patch.apiKey !== undefined) {
      controllers.current.get(id)?.abort();
      controllers.current.delete(id);
      setCatalogs((previous) => ({ ...previous, [id]: emptyCatalog }));
    }
    onChange(providersRef.current.map((provider) => provider.id === id ? { ...provider, ...patch } : provider));
  };
  const load = async (provider: CustomProvider) => {
    controllers.current.get(provider.id)?.abort();
    const controller = new AbortController();
    controllers.current.set(provider.id, controller);
    setCatalogs((previous) => ({ ...previous, [provider.id]: { ...emptyCatalog, checking: true } }));
    try {
      const models = await listCustomModels(provider, config, controller.signal);
      if (controller.signal.aborted) return;
      setCatalogs((previous) => ({ ...previous, [provider.id]: { models, checking: false, loaded: true, error: models.length ? "" : "No text models were listed. Enter your model ID manually." } }));
      // Never replace an explicitly selected model or run a potentially paid probe.
      if (!providersRef.current.find((item) => item.id === provider.id)?.model && models[0]) update(provider.id, { model: models[0].id });
    } catch (error) {
      if (controller.signal.aborted) return;
      setCatalogs((previous) => ({ ...previous, [provider.id]: { ...emptyCatalog, error: redactProviderError(error instanceof Error ? error.message : "Connection failed.", [provider.apiKey]) } }));
    } finally {
      if (controllers.current.get(provider.id) === controller) controllers.current.delete(provider.id);
    }
  };
  return (
    <section className="cw-custom-providers" aria-label="Custom API providers">
      <header className="cw-custom-providers-heading">
        <span className="cw-icon-tile"><PlugZap size={18} /></span>
        <div><h3>Bring your own API</h3><p>Connect any OpenAI-compatible text API.</p></div>
        <span className="cw-provider-count">{providers.length} / 20</span>
      </header>
      {providers.length === 0 && <div className="cw-custom-provider-empty"><PlugZap size={24} /><strong>Your models, your connection.</strong><p>Add an API endpoint from a hosted provider, Ollama, LM Studio, or your own gateway.</p></div>}
      {providers.map((provider, index) => {
        const catalog = catalogs[provider.id] || emptyCatalog;
        return <fieldset className="cw-custom-provider" key={provider.id}>
          <legend>{provider.name || `Provider ${index + 1}`}</legend>
          <div className="cw-custom-provider-topline">
            <span>{catalog.checking ? <><LoaderCircle size={12} className="animate-spin" /> Loading catalog</> : catalog.loaded ? <><Check size={12} /> Live catalog loaded</> : "OpenAI-compatible API"}</span>
            <button type="button" className="cw-provider-remove" aria-label={`Remove ${provider.name || `provider ${index + 1}`}`} onClick={() => {
              controllers.current.get(provider.id)?.abort();
              controllers.current.delete(provider.id);
              onChange(providers.filter((item) => item.id !== provider.id));
            }}><Trash2 size={13} /> Remove</button>
          </div>
          <div className="cw-provider-fields">
            <label><span>Provider name</span><input value={provider.name} maxLength={80} placeholder="My API provider" onChange={(event) => update(provider.id, { name: event.target.value })} /></label>
            <label><span>API base URL</span><input value={provider.baseUrl} placeholder="https://your-provider.example/v1" type="url" onChange={(event) => update(provider.id, { baseUrl: event.target.value })} /></label>
            <label className="cw-provider-key"><span>API key · optional Bearer token</span><div><input value={provider.apiKey} type={visibleKeys[provider.id] ? "text" : "password"} autoComplete="off" placeholder="Enter your provider key" onChange={(event) => update(provider.id, { apiKey: event.target.value })} /><button type="button" aria-label={`${visibleKeys[provider.id] ? "Hide" : "Show"} ${provider.name} API key`} onClick={() => setVisibleKeys((previous) => ({ ...previous, [provider.id]: !previous[provider.id] }))}>{visibleKeys[provider.id] ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>
            <label><span>Exact model ID</span><input value={provider.model} placeholder="Load the catalog or enter a model ID" onChange={(event) => update(provider.id, { model: event.target.value })} /></label>
            {catalog.models.length > 0 && <div className="cw-provider-catalog"><ModelSelector provider={`${provider.name} ${index + 1}`} models={catalog.models} value={provider.model} onChange={(model) => update(provider.id, { model })} /></div>}
          </div>
          {catalog.error && <p role="alert" className="cw-inline-error">{catalog.error}</p>}
          <div className="cw-provider-bottomline">
            <label className="cw-provider-stream"><input type="checkbox" checked={provider.stream} onChange={(event) => update(provider.id, { stream: event.target.checked })} /><span>Stream responses</span></label>
            <div><button type="button" onClick={() => void load(provider)} disabled={catalog.checking || !provider.baseUrl.trim()} className="cw-soft-button"><RefreshCw size={12} /> Load models</button><button type="button" disabled={!provider.baseUrl.trim() || !provider.model.trim()} onClick={() => onUse(provider)} className="cw-primary-button">Save & add card <ArrowUpRight size={12} /></button></div>
          </div>
        </fieldset>;
      })}
      <button type="button" className="cw-add-provider-button" disabled={providers.length >= 20} onClick={() => onChange([...providers, { id: crypto.randomUUID(), name: `Custom API ${providers.length + 1}`, baseUrl: "", apiKey: "", model: "", stream: true }])}><Plus size={15} /> Add custom provider</button>
      <p className="cw-custom-provider-note">Loading models does not generate a paid response. If your API has no model catalog, use its exact model ID. Native Anthropic and Gemini APIs need an OpenAI-compatible adapter.</p>
    </section>
  );
}
