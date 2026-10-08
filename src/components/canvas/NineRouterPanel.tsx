import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, Radio, RefreshCw } from 'lucide-react';
import { listNineRouterModels, type GatewayConfig, type GatewayModel } from '../../utils/gateways';
import { normalizeNineRouterUrl } from '../../utils/providerConfig';
import { ModelSelector } from './ModelSelector';

export type NineRouterConnection = Required<Pick<GatewayConfig, 'nineRouterUrl' | 'nineRouterKey' | 'nineRouterModel'>>;

export function NineRouterPanel({ config, active, disabled, onChange, onUse }: {
  config: GatewayConfig; active: boolean; disabled: boolean;
  onChange: (update: Partial<NineRouterConnection>) => void;
  onUse: (destination: 'code' | 'canvas') => void;
}) {
  const url = config.nineRouterUrl ?? 'http://127.0.0.1:20128/v1';
  const key = config.nineRouterKey || '';
  const model = config.nineRouterModel || '';
  const scope = JSON.stringify([url, key, config.transport]);
  const controller = useRef<AbortController | null>(null);
  const [catalog, setCatalog] = useState<{ scope: string; models: GatewayModel[]; busy: boolean; loaded: boolean; error: string }>({ scope: '', models: [], busy: false, loaded: false, error: '' });
  const current = catalog.scope === scope ? catalog : undefined;
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, [active, url, key, config.transport]);

  let dashboard = '';
  let urlError = '';
  try { dashboard = new URL('/dashboard', normalizeNineRouterUrl(url)).href; }
  catch (error) { urlError = error instanceof Error ? error.message : 'Enter the 9router API URL.'; }

  const refresh = async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setCatalog({ scope, models: current?.models || [], busy: true, loaded: false, error: '' });
    try {
      const models = await listNineRouterModels(config, request.signal);
      if (request.signal.aborted || controller.current !== request) return;
      setCatalog({ scope, models, busy: false, loaded: true, error: models.length ? '' : 'The catalog is empty. Connect a provider or create a combo in the 9router dashboard, then refresh.' });
    } catch (error) {
      if (request.signal.aborted || controller.current !== request) return;
      setCatalog({ scope, models: [], busy: false, loaded: false, error: error instanceof Error ? error.message : 'Could not load the 9router catalog.' });
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setCatalog(previous => previous.scope === scope && previous.busy ? { ...previous, busy: false } : previous);
      }
    }
  };

  return <section className="cw-nine-router" aria-labelledby="nine-router-heading">
    <header><span className="cw-nine-router-mark"><Radio size={19} /></span><div><h3 id="nine-router-heading">9router</h3><p>One connection. Your models and routing combos.</p></div><span className="cw-nine-router-badge">Native gateway</span></header>
    <div className="cw-nine-router-fields">
      <label><span>API base URL</span><input type="url" value={url} onChange={event => onChange({ nineRouterUrl: event.target.value })} placeholder="http://127.0.0.1:20128/v1" disabled={disabled} spellCheck={false} /></label>
      <label><span>Gateway API key</span><input type="password" value={key} onChange={event => onChange({ nineRouterKey: event.target.value })} placeholder="Key from the 9router dashboard" disabled={disabled} autoComplete="off" spellCheck={false} /></label>
    </div>
    {urlError && <p className="cw-nine-router-error" role="alert">{urlError}</p>}
    <div className="cw-nine-router-model"><div><strong>Model or combo</strong><small>Exact IDs from your live catalog. Choose the route you want to use.</small></div><ModelSelector provider="9router" models={current?.models || []} value={model} onChange={nineRouterModel => onChange({ nineRouterModel })} onRefresh={refresh} refreshing={!!current?.busy} disabled={disabled || !!urlError} /></div>
    <div className="cw-nine-router-actions"><button type="button" className="cw-soft-button" onClick={refresh} disabled={disabled || !!current?.busy || !!urlError}><RefreshCw size={13} className={current?.busy ? 'animate-spin' : ''} />{current?.busy ? 'Loading catalog…' : current?.loaded ? 'Refresh models' : 'Load models'}</button>{dashboard && <a href={dashboard} target="_blank" rel="noreferrer">Open dashboard <ExternalLink size={12} /></a>}<span>{current?.loaded && `${current.models.length} routes available`}</span></div>
    {current?.error && <p className="cw-nine-router-error" role="alert">{current.error}</p>}
    <details className="cw-nine-router-guide"><summary>Connect 9router</summary><ol><li>Install the official package with <code>npm install -g 9router</code>, then run <code>9router</code>.</li><li>Open its dashboard, connect your upstream providers, and copy a gateway API key.</li><li>Enter the URL and key here, load models, and select a model or combo.</li></ol><p>9router and OmniRoute both default to port 20128. If you run both, give them different ports and enter the correct URL here. Local HTTP gateways need the local AhPah app; the published site needs an HTTPS endpoint with browser access.</p><a href="https://github.com/decolua/9router" target="_blank" rel="noreferrer">Official setup documentation <ExternalLink size={12} /></a></details>
    <footer><span>Catalog refreshes use no completion tokens. Provider limits still apply.</span><div><button type="button" className="cw-soft-button" disabled={disabled || !model.trim() || !!urlError || !!current?.busy} onClick={() => onUse('canvas')}>Add to Canvas</button><button type="button" className="cw-primary-button" disabled={disabled || !model.trim() || !!urlError || !!current?.busy} onClick={() => onUse('code')}>Use in Code <ArrowRight size={13} /></button></div></footer>
  </section>;
}
