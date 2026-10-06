import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Cpu, Download, ExternalLink, LoaderCircle, RefreshCw, Square } from 'lucide-react';
import { supportsLocalBridge, type CustomProvider } from '../../utils/gateways';
import { discoverLocalModels, LOCAL_MODELS_BASE_URL, setupLocalModels, validLocalModelPullName, type LocalModelsProgress, type LocalModelsStatus } from '../../utils/localModels';
import './localModels.css';

interface Props {
  active: boolean;
  disabled: boolean;
  providers: CustomProvider[];
  onUse: (provider: CustomProvider, destination: 'code' | 'canvas') => void;
}

export function LocalModelsPanel({ active, disabled, providers, onUse }: Props) {
  const local = supportsLocalBridge();
  const saved = providers.find(provider => provider.baseUrl === LOCAL_MODELS_BASE_URL);
  const [status, setStatus] = useState<LocalModelsStatus | null>(null);
  const [selected, setSelected] = useState(saved?.model ?? '');
  const [download, setDownload] = useState('qwen3.5:4b');
  const [busy, setBusy] = useState<'discover' | 'setup' | null>(null);
  const [progress, setProgress] = useState<LocalModelsProgress | null>(null);
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  const model = status?.models.find(model => model.id === selected) ?? status?.models[0];

  useEffect(() => {
    if (!active || !local) return;
    const request = new AbortController();
    controller.current = request;
    void discoverLocalModels(request.signal).then(result => {
      if (!request.signal.aborted) setStatus(result);
    }).catch(() => {}).finally(() => {
      if (controller.current === request) controller.current = null;
    });
    return () => { request.abort(); controller.current?.abort(); };
  }, [active, local]);

  const run = async (operation: 'discover' | 'setup', modelName?: string) => {
    if (busy || disabled || !local) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(operation); setMessage(''); setProgress(null);
    try {
      const result = operation === 'discover'
        ? await discoverLocalModels(request.signal)
        : await setupLocalModels(modelName ? { model: modelName } : {}, setProgress, request.signal);
      request.signal.throwIfAborted();
      setStatus(result);
      if (modelName && result.models.some(model => model.id === modelName)) setSelected(modelName);
      setMessage(result.available ? result.models.length ? 'Ready. Choose an installed model below.' : 'Ollama is ready. Download a model to start coding.' : result.error || 'Ollama is not running yet. Use setup to start it.');
    } catch (error) {
      if (active) setMessage(request.signal.aborted ? 'Setup stopped. Completed model downloads are kept.' : error instanceof Error ? error.message : 'Setup could not finish. Try again.');
    } finally {
      if (controller.current === request) { controller.current = null; setBusy(null); }
    }
  };

  const connectModel = (destination: 'code' | 'canvas') => {
    if (!model || !status?.available) return;
    onUse({ id: saved?.id ?? 'local-ollama', name: 'Local · Ollama', baseUrl: LOCAL_MODELS_BASE_URL, apiKey: '', model: model.id, stream: true }, destination);
  };

  return <section className="cw-local-models" aria-labelledby="local-ai-title">
    <header><span className="cw-local-icon"><Cpu size={21} /></span><div><span className="cw-local-eyebrow">YOUR COMPUTER · YOUR MODELS</span><h3 id="local-ai-title">Local AI. No API quotas.</h3></div><span className="cw-local-badge">Free runtime</span></header>
    <p>Run coding agents on your own hardware. No API key, subscription, or per-token charge. Speed and model size depend on your computer.</p>
    {!local ? <div className="cw-local-browser-note"><strong>Start the local app to use your PC’s models.</strong><p>Clone or download the repository, then double-click <b>Start AhPah.bat</b>. Open the local app and return to these settings.</p><a href="https://github.com/ahpah-dev/ahpah-canvas#start-locally" target="_blank" rel="noreferrer">Local setup instructions <ExternalLink size={13} /></a><a href="http://127.0.0.1:5173/" target="_blank" rel="noreferrer">Open running local app <ArrowRight size={13} /></a></div> : <>
      <div className="cw-local-runtime"><span className={status?.available ? 'is-ready' : ''}>{status?.available ? <Check size={13} /> : <Cpu size={13} />}{status === null ? 'Looking for Ollama…' : status.available ? `Ollama connected${status.version ? ` · ${status.version}` : ''}` : 'Ollama not connected'}</span><button type="button" aria-label="Refresh local models" disabled={!!busy || disabled} onClick={() => void run('discover')}><RefreshCw size={13} className={busy === 'discover' ? 'animate-spin' : ''} />Refresh</button></div>
      {status?.available && !!status.models.length && <div className="cw-local-selection"><label htmlFor="installed-local-model">Installed model <small>{status.models.length} available · live from your PC</small></label><select id="installed-local-model" value={model?.id ?? ''} disabled={!!busy || disabled} onChange={event => setSelected(event.target.value)}>{status.models.map(model => <option key={model.id} value={model.id}>{model.name}{model.size ? ` · ${(model.size / 1e9).toFixed(1)} GB` : ''}</option>)}</select><div className="cw-local-actions"><button type="button" className="cw-local-primary" disabled={!!busy || disabled} onClick={() => connectModel('code')}>Use in Code <ArrowRight size={14} /></button><button type="button" disabled={!!busy || disabled} onClick={() => connectModel('canvas')}>Add Canvas agent</button></div></div>}
      {status !== null && !status.available && <div className="cw-local-install"><button type="button" className="cw-local-primary" disabled={!!busy || disabled} onClick={() => void run('setup')}>{busy === 'setup' ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}Set up Ollama</button><small>Installs the official Windows runtime if needed and starts it. Model downloads are a separate choice.</small></div>}
      <details className="cw-local-download"><summary>Download another local model <Download size={13} /></summary><p>Choose a model that fits your memory. Downloads can be large; none start automatically.</p><div className="cw-local-recommendations"><a href="https://ollama.com/library/qwen3.5:4b" target="_blank" rel="noreferrer"><b>Qwen3.5 · 4B</b><span>Compact starter · about 3.4 GB</span><ExternalLink size={12} /></a><a href="https://ollama.com/library/qwen3.6" target="_blank" rel="noreferrer"><b>Qwen3.6 · 27B</b><span>Advanced coding · about 19 GB</span><ExternalLink size={12} /></a></div><label htmlFor="local-download-name">Model name from <a href="https://ollama.com/library" target="_blank" rel="noreferrer">Ollama’s library</a></label><div className="cw-local-download-row"><input id="local-download-name" value={download} disabled={!!busy || disabled} onChange={event => setDownload(event.target.value)} placeholder="model:tag" autoComplete="off" spellCheck={false} /><button type="button" disabled={!!busy || disabled || !validLocalModelPullName(download.trim())} onClick={() => void run('setup', download.trim())}><Download size={13} />Download</button></div><small>Cloud models are excluded from this local setup. Larger models require more RAM or VRAM than their download size.</small></details>
      {busy === 'setup' && <div className="cw-local-progress" role="status"><div><LoaderCircle size={13} className="animate-spin" /><span>{progress?.detail || 'Preparing local AI…'}</span><button type="button" onClick={() => controller.current?.abort()}><Square size={11} />Stop</button></div>{progress?.percent !== undefined && <progress aria-label="Model download progress" value={progress.percent} max={100} />}</div>}
      {message && <p className="cw-local-message" role="status">{message}</p>}
    </>}
    <footer>Local requests stay on this PC. Downloading models needs internet access. Hosted providers still have their own quotas.</footer>
  </section>;
}
